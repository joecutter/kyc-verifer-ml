import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface LivenessDetectionRequest {
  image_url: string;
  attempt_id: string;
  challenge_type?: 'blink' | 'head_turn' | 'smile';
}

export interface LivenessDetectionResponse {
  liveness_score: number;
  is_live: boolean;
  confidence: number;
  spoof_type?: string;
  metadata: Record<string, any>;
}

export interface FaceMatchRequest {
  selfie_url: string;
  id_photo_url: string;
  attempt_id: string;
}

export interface FaceMatchResponse {
  match_score: number;
  is_match: boolean;
  confidence: number;
  distance: number;
  embeddings: {
    selfie: number[];
    id_photo: number[];
  };
}

export interface DocumentVerificationRequest {
  front_url: string;
  back_url?: string;
  attempt_id: string;
  document_type?: 'passport' | 'driver_license' | 'id_card';
}

export interface DocumentVerificationResponse {
  is_valid: boolean;
  document_type: string;
  extracted_data: {
    name?: string;
    date_of_birth?: string;
    document_number?: string;
    expiry_date?: string;
    nationality?: string;
    address?: string;
  };
  quality_score: number;
  fraud_indicators: string[];
  metadata: Record<string, any>;
}

export interface KYCVerificationRequest {
  attempt_id: string;
  selfie_url: string;
  id_front_url: string;
  id_back_url?: string;
  metadata: Record<string, any>;
}

export interface KYCVerificationResponse {
  liveness_score: number;
  match_score: number;
  fraud_score: number;
  document_quality_score: number;
  overall_score: number;
  status: 'approved' | 'rejected' | 'manual_review';
  reasons: string[];
  confidence: number;
  processing_time: number;
  metadata: Record<string, any>;
}

export class MLService {
  private client: AxiosInstance;
  private timeout: number;

  constructor() {
    this.client = axios.create({
      baseURL: config.ML_SERVICE.URL,
      timeout: config.ML_SERVICE.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ML_API_KEY || ''
      }
    });

    this.timeout = config.ML_SERVICE.TIMEOUT;

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (requestConfig) => {
        logger.debug(`ML Service Request: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`);
        return requestConfig;
      },
      (error) => {
        logger.error('ML Service Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('ML Service Response Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message
        });
        
        // Return a fallback response if ML service is down
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          return this.getFallbackResponse(error.config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  async detectLiveness(
    request: LivenessDetectionRequest
  ): Promise<LivenessDetectionResponse> {
    try {
      const response = await this.client.post<LivenessDetectionResponse>(
        '/detect-liveness',
        request,
        { timeout: this.timeout }
      );

      logger.info(`Liveness detection completed for attempt ${request.attempt_id}: ${response.data.liveness_score}`);
      return response.data;
    } catch (error) {
      logger.error('Liveness detection failed:', error);
      // Return fallback response
      return {
        liveness_score: 0.5,
        is_live: false,
        confidence: 0.5,
        metadata: { error: 'ML service unavailable', fallback: true }
      };
    }
  }

  async verifyFaceMatch(
    request: FaceMatchRequest
  ): Promise<FaceMatchResponse> {
    try {
      const response = await this.client.post<FaceMatchResponse>(
        '/verify-face-match',
        request,
        { timeout: this.timeout }
      );

      logger.info(`Face match verification completed for attempt ${request.attempt_id}: ${response.data.match_score}`);
      return response.data;
    } catch (error) {
      logger.error('Face match verification failed:', error);
      // Return fallback response
      return {
        match_score: 0.5,
        is_match: false,
        confidence: 0.5,
        distance: 1.0,
        embeddings: { selfie: [], id_photo: [] },
        ...(error as any).response?.data
      };
    }
  }

  async verifyDocument(
    request: DocumentVerificationRequest
  ): Promise<DocumentVerificationResponse> {
    try {
      const response = await this.client.post<DocumentVerificationResponse>(
        '/verify-document',
        request,
        { timeout: this.timeout }
      );

      logger.info(`Document verification completed for attempt ${request.attempt_id}: ${response.data.is_valid}`);
      return response.data;
    } catch (error) {
      logger.error('Document verification failed:', error);
      // Return fallback response
      return {
        is_valid: false,
        document_type: 'unknown',
        extracted_data: {},
        quality_score: 0.5,
        fraud_indicators: ['ML service unavailable'],
        metadata: { error: 'ML service unavailable', fallback: true }
      };
    }
  }

  async verifyKYC(
    request: KYCVerificationRequest
  ): Promise<KYCVerificationResponse> {
    try {
      const response = await this.client.post<KYCVerificationResponse>(
        '/verify-kyc',
        request,
        { timeout: this.timeout * 2 } // Give more time for full KYC verification
      );

      logger.info(`KYC verification completed for attempt ${request.attempt_id}: ${response.data.status}`);
      return response.data;
    } catch (error) {
      logger.error('KYC verification failed:', error);
      // Return fallback response requiring manual review
      return {
        liveness_score: 0.5,
        match_score: 0.5,
        fraud_score: 0.7,
        document_quality_score: 0.5,
        overall_score: 0.5,
        status: 'manual_review',
        reasons: ['ML service unavailable - manual review required'],
        confidence: 0.3,
        processing_time: 0,
        metadata: { error: 'ML service unavailable', fallback: true }
      };
    }
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    version?: string;
    uptime?: number;
    services?: Record<string, any>;
  }> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.data;
    } catch (error) {
      logger.warn('ML Service health check failed:', error);
      return {
        status: 'unhealthy',
        services: {
          liveness_detection: 'offline',
          face_matching: 'offline',
          document_verification: 'offline'
        }
      };
    }
  }

  private getFallbackResponse(config: AxiosRequestConfig): any {
    const endpoint = config.url || '';
    
    if (endpoint.includes('detect-liveness')) {
      return {
        data: {
          liveness_score: 0.5,
          is_live: true,
          confidence: 0.5,
          metadata: { fallback: true, timestamp: new Date().toISOString() }
        }
      };
    }
    
    if (endpoint.includes('verify-face-match')) {
      return {
        data: {
          match_score: 0.5,
          is_match: true,
          confidence: 0.5,
          distance: 0.5,
          embeddings: { selfie: [], id_photo: [] },
          metadata: { fallback: true, timestamp: new Date().toISOString() }
        }
      };
    }
    
    if (endpoint.includes('verify-document')) {
      return {
        data: {
          is_valid: true,
          document_type: 'unknown',
          extracted_data: {},
          quality_score: 0.5,
          fraud_indicators: [],
          metadata: { fallback: true, timestamp: new Date().toISOString() }
        }
      };
    }
    
    if (endpoint.includes('verify-kyc')) {
      return {
        data: {
          liveness_score: 0.5,
          match_score: 0.5,
          fraud_score: 0.3,
          document_quality_score: 0.5,
          overall_score: 0.5,
          status: 'manual_review',
          reasons: ['Fallback mode - requires manual review'],
          confidence: 0.5,
          processing_time: 0,
          metadata: { fallback: true, timestamp: new Date().toISOString() }
        }
      };
    }
    
    return { data: { fallback: true, error: 'Service unavailable' } };
  }
}