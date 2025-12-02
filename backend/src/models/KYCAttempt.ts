import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface KYCAttemptData {
  id?: string;
  user_id: string;
  selfie_key?: string;
  id_front_key?: string;
  id_back_key?: string;
  embeddings?: {
    selfie?: number[];
    id_photo?: number[];
  };
  liveness_score?: number;
  match_score?: number;
  fraud_score?: number;
  document_quality_score?: number;
  ml_response?: Record<string, any>;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'manual_review';
  failure_reason?: string;
  device_metadata?: Record<string, any>;
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    lat?: number;
    lon?: number;
  };
  ip_address?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class KYCAttempt {
  static async create(data: KYCAttemptData): Promise<KYCAttemptData> {
    const attemptData = {
      id: uuidv4(),
      status: 'pending',
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };

    try {
      const [attempt] = await db('kyc_attempts')
        .insert(attemptData)
        .returning('*');
      
      logger.info(`KYC attempt created: ${attempt.id} for user ${data.user_id}`);
      return attempt;
    } catch (error) {
      logger.error('Error creating KYC attempt:', error);
      throw error;
    }
  }

  static async findById(id: string): Promise<KYCAttemptData | null> {
    try {
      const attempt = await db('kyc_attempts')
        .where({ id })
        .first();
      
      return attempt || null;
    } catch (error) {
      logger.error('Error finding KYC attempt:', error);
      throw error;
    }
  }

  static async findByUserId(userId: string, limit: number = 10): Promise<KYCAttemptData[]> {
    try {
      const attempts = await db('kyc_attempts')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .limit(limit);
      
      return attempts;
    } catch (error) {
      logger.error('Error finding KYC attempts by user:', error);
      throw error;
    }
  }

  static async update(id: string, data: Partial<KYCAttemptData>): Promise<KYCAttemptData | null> {
    try {
      const updateData = {
        ...data,
        updated_at: new Date()
      };

      const [attempt] = await db('kyc_attempts')
        .where({ id })
        .update(updateData)
        .returning('*');
      
      logger.info(`KYC attempt updated: ${id}`);
      return attempt || null;
    } catch (error) {
      logger.error('Error updating KYC attempt:', error);
      throw error;
    }
  }

  static async updateStatus(
    id: string, 
    status: KYCAttemptData['status'],
    scores?: {
      liveness_score?: number;
      match_score?: number;
      fraud_score?: number;
      document_quality_score?: number;
    },
    mlResponse?: Record<string, any>
  ): Promise<KYCAttemptData | null> {
    const updateData: Partial<KYCAttemptData> = {
      status,
      updated_at: new Date()
    };

    if (scores) {
      updateData.liveness_score = scores.liveness_score;
      updateData.match_score = scores.match_score;
      updateData.fraud_score = scores.fraud_score;
      updateData.document_quality_score = scores.document_quality_score;
    }

    if (mlResponse) {
      updateData.ml_response = mlResponse;
    }

    try {
      const [attempt] = await db('kyc_attempts')
        .where({ id })
        .update(updateData)
        .returning('*');
      
      logger.info(`KYC attempt status updated: ${id} -> ${status}`);
      return attempt || null;
    } catch (error) {
      logger.error('Error updating KYC attempt status:', error);
      throw error;
    }
  }

  static async markAsFailed(id: string, reason: string): Promise<KYCAttemptData | null> {
    try {
      const [attempt] = await db('kyc_attempts')
        .where({ id })
        .update({
          status: 'failed',
          failure_reason: reason,
          updated_at: new Date()
        })
        .returning('*');
      
      logger.info(`KYC attempt marked as failed: ${id} - ${reason}`);
      return attempt || null;
    } catch (error) {
      logger.error('Error marking KYC attempt as failed:', error);
      throw error;
    }
  }

  static async getAnalytics(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    avg_liveness_score: number;
    avg_match_score: number;
    avg_processing_time: number;
  }> {
    try {
      let dateFilter = new Date();
      
      switch (timeframe) {
        case 'day':
          dateFilter.setDate(dateFilter.getDate() - 1);
          break;
        case 'week':
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case 'month':
          dateFilter.setMonth(dateFilter.getMonth() - 1);
          break;
      }

      const result = await db('kyc_attempts')
        .select('status')
        .count('* as count')
        .avg('liveness_score as avg_liveness')
        .avg('match_score as avg_match')
        .where('created_at', '>=', dateFilter)
        .groupBy('status');

      const stats = {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        avg_liveness_score: 0,
        avg_match_score: 0,
        avg_processing_time: 0
      };

      result.forEach((row: any) => {
        const count = parseInt(row.count);
        stats.total += count;

        if (row.status === 'completed') {
          stats.completed = count;
          stats.avg_liveness_score = parseFloat(row.avg_liveness) || 0;
          stats.avg_match_score = parseFloat(row.avg_match) || 0;
        } else if (row.status === 'failed') {
          stats.failed = count;
        } else if (row.status === 'pending' || row.status === 'processing') {
          stats.pending += count;
        }
      });

      // Calculate average processing time for completed attempts
      const processingTimes = await db('kyc_attempts')
        .select(db.raw('EXTRACT(EPOCH FROM (updated_at - created_at)) as processing_time'))
        .where('status', 'completed')
        .where('created_at', '>=', dateFilter);

      if (processingTimes.length > 0) {
        const totalTime = processingTimes.reduce((sum: number, row: any) => 
          sum + parseFloat(row.processing_time), 0
        );
        stats.avg_processing_time = totalTime / processingTimes.length;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting KYC analytics:', error);
      throw error;
    }
  }
}