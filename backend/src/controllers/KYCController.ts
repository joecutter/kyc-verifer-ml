import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { StorageService } from '../services/StorageService';
import { MLService } from '../services/MLService';
import { User } from '../models/User';
import { KYCAttempt } from '../models/KYCAttempt';
import { DeviceFingerprint } from '../models/DeviceFingerprint';
import { logger } from '../utils/logger';
import { sendWebhook } from '../utils/webhook';

export class KYCController {
  private readonly storageService: StorageService;
  private readonly mlService: MLService;

  constructor() {
    this.storageService = new StorageService();
    this.mlService = new MLService();
  }

  // Upload selfie with liveness check
  async uploadSelfie(req: Request, res: Response) {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[${transactionId}] Starting selfie upload`);
      
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn(`[${transactionId}] Validation errors:`, errors.array());
        return res.status(400).json({
          success: false,
          transactionId,
          errors: errors.array(),
        });
      }

      const { userId, deviceMetadata, challengeType } = req.body;
      const file = req.file;

      if (!file) {
        logger.warn(`[${transactionId}] No file uploaded for user ${userId}`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'No file uploaded',
        });
      }

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'User not found',
        });
      }

      // Increment KYC attempts
      await User.incrementKYCAttempts(userId);

      // Upload selfie to storage
      logger.debug(`[${transactionId}] Uploading selfie for user ${userId}`);
      const uploadResult = await this.storageService.uploadFile(
        file,
        userId,
        'selfie'
      );

      // Create KYC attempt record
      logger.debug(`[${transactionId}] Creating KYC attempt record`);
      const kycAttempt = await KYCAttempt.create({
        user_id: userId,
        selfie_key: uploadResult.key,
        device_metadata: deviceMetadata,
        ip_address: req.ip,
        status: 'pending',
      });

      // Store device fingerprint
      if (deviceMetadata) {
        await DeviceFingerprint.createOrUpdate(userId, {
          ...deviceMetadata,
          fingerprint_hash: req.deviceFingerprint,
          ip_address: req.ip,
        });
      }

      // Call ML service for liveness detection
      logger.debug(`[${transactionId}] Calling ML service for liveness detection`);
      const signedUrl = await this.storageService.getSignedUrl(uploadResult.key);
      
      const livenessResponse = await this.mlService.detectLiveness({
        image_url: signedUrl,
        attempt_id: kycAttempt.id!,
        challenge_type: challengeType,
      });

      // Update KYC attempt with liveness results
      await KYCAttempt.update(kycAttempt.id!, {
        liveness_score: livenessResponse.liveness_score,
        ml_response: {
          liveness: livenessResponse,
        },
        status: livenessResponse.is_live ? 'processing' : 'failed',
        ...(livenessResponse.is_live ? {} : {
          failure_reason: 'Liveness check failed',
        }),
      });

      // Send webhook if configured
      if (process.env.WEBHOOK_URL) {
        await sendWebhook('selfie_uploaded', {
          userId,
          attemptId: kycAttempt.id,
          livenessScore: livenessResponse.liveness_score,
          isLive: livenessResponse.is_live,
          transactionId,
        });
      }

      logger.info(`[${transactionId}] Selfie upload completed for user ${userId}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          attemptId: kycAttempt.id,
          imageUrl: uploadResult.url,
          livenessScore: livenessResponse.liveness_score,
          isLive: livenessResponse.is_live,
          confidence: livenessResponse.confidence,
          nextStep: livenessResponse.is_live ? 'id_upload' : 'retry',
          retryAllowed: true,
          estimatedCompletion: Date.now() + 5 * 60 * 1000, // 5 minutes from now
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Selfie upload error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to upload selfie',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      });
    }
  }

  // Upload ID document
  async uploadId(req: Request, res: Response) {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[${transactionId}] Starting ID upload`);
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn(`[${transactionId}] Validation errors:`, errors.array());
        return res.status(400).json({
          success: false,
          transactionId,
          errors: errors.array(),
        });
      }

      const { userId, attemptId, side } = req.body;
      const file = req.file;

      if (!file) {
        logger.warn(`[${transactionId}] No file uploaded`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'No file uploaded',
        });
      }

      // Validate KYC attempt
      const kycAttempt = await KYCAttempt.findById(attemptId);
      if (!kycAttempt || kycAttempt.user_id !== userId) {
        logger.warn(`[${transactionId}] Invalid KYC attempt: ${attemptId} for user ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'KYC attempt not found',
        });
      }

      // Upload ID to storage
      const fileType = side === 'front' ? 'id_front' : 'id_back';
      logger.debug(`[${transactionId}] Uploading ${side} ID for attempt ${attemptId}`);
      
      const uploadResult = await this.storageService.uploadFile(
        file,
        userId,
        fileType,
        {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 90,
        }
      );

      // Update KYC attempt
      const updateData = side === 'front' 
        ? { id_front_key: uploadResult.key }
        : { id_back_key: uploadResult.key };
      
      await KYCAttempt.update(attemptId, updateData);

      // If both sides uploaded, trigger verification
      const updatedAttempt = await KYCAttempt.findById(attemptId);
      if (side === 'back' && updatedAttempt?.id_front_key && updatedAttempt.id_back_key) {
        logger.debug(`[${transactionId}] Both ID sides uploaded, triggering verification`);
        this.triggerVerification(attemptId).catch((err) => {
          logger.error(`[${transactionId}] Verification trigger error:`, err);
        });
      }

      // Send webhook
      if (process.env.WEBHOOK_URL) {
        await sendWebhook('id_uploaded', {
          userId,
          attemptId,
          side,
          documentType: fileType,
          transactionId,
        });
      }

      logger.info(`[${transactionId}] ID ${side} upload completed for attempt ${attemptId}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          attemptId,
          imageUrl: uploadResult.url,
          side,
          documentType: fileType,
          qualityScore: uploadResult.dimensions ? 0.9 : 0.7,
          nextStep: side === 'front' ? 'id_back' : 'verification',
          verificationInProgress: side === 'back',
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] ID upload error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to upload ID',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      });
    }
  }

  // Trigger verification process
  private async triggerVerification(attemptId: string) {
    const transactionId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[${transactionId}] Starting KYC verification for attempt ${attemptId}`);
      
      const attempt = await KYCAttempt.findById(attemptId);
      if (!attempt) {
        logger.error(`[${transactionId}] Attempt not found: ${attemptId}`);
        return;
      }

      // Update status to processing
      await KYCAttempt.updateStatus(attemptId, 'processing');

      // Get signed URLs for ML service
      const [selfieUrl, idFrontUrl, idBackUrl] = await Promise.all([
        this.storageService.getSignedUrl(attempt.selfie_key!),
        attempt.id_front_key ? this.storageService.getSignedUrl(attempt.id_front_key) : null,
        attempt.id_back_key ? this.storageService.getSignedUrl(attempt.id_back_key) : null,
      ]);

      // Call ML service for KYC verification
      logger.debug(`[${transactionId}] Calling ML service for KYC verification`);
      const mlResponse = await this.mlService.verifyKYC({
        attempt_id: attemptId,
        selfie_url: selfieUrl,
        id_front_url: idFrontUrl!,
        id_back_url: idBackUrl || undefined,
        metadata: {
          ...attempt.device_metadata,
          attemptCreatedAt: attempt.created_at,
        },
      });

      // Update KYC attempt with results
      await KYCAttempt.updateStatus(
        attemptId,
        mlResponse.status === 'approved' ? 'completed' : 
        mlResponse.status === 'rejected' ? 'failed' : 'manual_review',
        {
          liveness_score: mlResponse.liveness_score,
          match_score: mlResponse.match_score,
          fraud_score: mlResponse.fraud_score,
          document_quality_score: mlResponse.document_quality_score,
        },
        mlResponse
      );

      // Update user KYC status
      const userStatus = mlResponse.status === 'approved' ? 'approved' :
                        mlResponse.status === 'rejected' ? 'rejected' : 'under_review';
      
      await User.updateKYCStatus(attempt.user_id, userStatus);

      // Send webhooks
      if (process.env.WEBHOOK_URL) {
        await sendWebhook('kyc_completed', {
          userId: attempt.user_id,
          attemptId,
          status: mlResponse.status,
          scores: {
            liveness: mlResponse.liveness_score,
            match: mlResponse.match_score,
            fraud: mlResponse.fraud_score,
            document_quality: mlResponse.document_quality_score,
            overall: mlResponse.overall_score,
          },
          transactionId,
        });
      }

      logger.info(`[${transactionId}] KYC verification completed for attempt ${attemptId}: ${mlResponse.status}`);
    } catch (error) {
      logger.error(`[${transactionId}] KYC verification error:`, error);
      
      // Mark attempt as failed
      await KYCAttempt.markAsFailed(attemptId, 'Verification process failed');
      
      // Send failure webhook
      if (process.env.WEBHOOK_URL) {
        await sendWebhook('kyc_failed', {
          attemptId,
          error: error.message,
          transactionId,
        });
      }
    }
  }

  // Check KYC status
  async getKYCStatus(req: Request, res: Response) {
    const transactionId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { userId } = req.params;
      
      logger.debug(`[${transactionId}] Getting KYC status for user ${userId}`);
      
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'User not found',
        });
      }

      // Get latest KYC attempt
      const latestAttempt = await KYCAttempt.findByUserId(userId, 1);
      
      const response: any = {
        success: true,
        transactionId,
        data: {
          userId,
          kycStatus: user.kyc_status,
          kycAttempts: user.kyc_attempts,
          lastKycAttempt: user.last_kyc_attempt_at,
          kycApprovedAt: user.kyc_approved_at,
        },
      };

      if (latestAttempt.length > 0) {
        const attempt = latestAttempt[0];
        response.data.latestAttempt = {
          id: attempt.id,
          status: attempt.status,
          scores: {
            liveness: attempt.liveness_score,
            match: attempt.match_score,
            fraud: attempt.fraud_score,
            documentQuality: attempt.document_quality_score,
          },
          createdAt: attempt.created_at,
          updatedAt: attempt.updated_at,
          failureReason: attempt.failure_reason,
        };

        // Check if retry is allowed
        const canRetry = this.canRetryKYC(attempt);
        response.data.canRetry = canRetry;
        
        if (canRetry) {
          response.data.retryAfter = this.getRetryAfter(attempt);
        }
      }

      logger.debug(`[${transactionId}] Status retrieved for user ${userId}`);
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`[${transactionId}] Status check error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to get KYC status',
      });
    }
  }

  // Retry failed KYC
  async retryKYC(req: Request, res: Response) {
    const transactionId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { attemptId } = req.params;
      
      logger.info(`[${transactionId}] Retrying KYC attempt ${attemptId}`);
      
      const attempt = await KYCAttempt.findById(attemptId);
      if (!attempt) {
        logger.warn(`[${transactionId}] Attempt not found: ${attemptId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'KYC attempt not found',
        });
      }

      // Check if retry is allowed
      if (!this.canRetryKYC(attempt)) {
        const retryAfter = this.getRetryAfter(attempt);
        logger.warn(`[${transactionId}] Retry not allowed for attempt ${attemptId}`);
        
        return res.status(429).json({
          success: false,
          transactionId,
          error: 'Retry not allowed yet',
          retryAfter,
          message: `Please try again after ${retryAfter} minutes`,
        });
      }

      // Create new attempt based on previous
      const newAttempt = await KYCAttempt.create({
        user_id: attempt.user_id,
        device_metadata: attempt.device_metadata,
        ip_address: attempt.ip_address,
        geolocation: attempt.geolocation,
        status: 'pending',
      });

      logger.info(`[${transactionId}] New KYC attempt created: ${newAttempt.id}`);
      
      // Send webhook
      if (process.env.WEBHOOK_URL) {
        await sendWebhook('kyc_retry', {
          userId: attempt.user_id,
          oldAttemptId: attemptId,
          newAttemptId: newAttempt.id,
          transactionId,
        });
      }

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          newAttemptId: newAttempt.id,
          previousAttemptId: attemptId,
          message: 'New KYC attempt created',
          nextStep: 'upload_selfie',
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Retry error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to retry KYC',
      });
    }
  }

  // Get KYC analytics
  async getAnalytics(req: Request, res: Response) {
    const transactionId = `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug(`[${transactionId}] Getting KYC analytics`);
      
      const { timeframe = 'day' } = req.query;
      
      // Validate timeframe
      const validTimeframes = ['day', 'week', 'month'];
      if (!validTimeframes.includes(timeframe as string)) {
        return res.status(400).json({
          success: false,
          transactionId,
          error: `Invalid timeframe. Valid: ${validTimeframes.join(', ')}`,
        });
      }

      // Get analytics
      const [userStats, attemptStats] = await Promise.all([
        User.getKYCStatistics(),
        KYCAttempt.getAnalytics(timeframe as any),
      ]);

      // Get recent attempts for timeline
      const recentAttempts = await KYCAttempt.findByUserId('*', 20);

      const response = {
        success: true,
        transactionId,
        data: {
          timeframe,
          userStatistics: userStats,
          attemptStatistics: attemptStats,
          recentAttempts: recentAttempts.map(attempt => ({
            id: attempt.id,
            userId: attempt.user_id,
            status: attempt.status,
            scores: {
              liveness: attempt.liveness_score,
              match: attempt.match_score,
            },
            createdAt: attempt.created_at,
          })),
          mlServiceHealth: await this.mlService.getHealth(),
          systemMetrics: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
          },
        },
      };

      logger.debug(`[${transactionId}] Analytics retrieved`);
      return res.status(200).json(response);
    } catch (error) {
      logger.error(`[${transactionId}] Analytics error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to get analytics',
      });
    }
  }

  // Helper methods
  private canRetryKYC(attempt: any): boolean {
    if (!attempt || attempt.status !== 'failed') {
      return false;
    }

    const now = new Date();
    const lastAttempt = new Date(attempt.created_at);
    const hoursSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60);

    // Allow retry after 1 hour
    return hoursSinceLastAttempt >= 1;
  }

  private getRetryAfter(attempt: any): number {
    const now = new Date();
    const lastAttempt = new Date(attempt.created_at);
    const hoursSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60);
    
    // Return minutes until retry is allowed
    return Math.max(0, Math.ceil((1 - hoursSinceLastAttempt) * 60));
  }
}