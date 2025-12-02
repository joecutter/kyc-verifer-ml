import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface UserData {
  id?: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  date_of_birth?: Date;
  kyc_status?: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'under_review';
  kyc_attempts?: number;
  metadata?: Record<string, any>;
  last_kyc_attempt_at?: Date;
  kyc_approved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class User {
  static async create(data: UserData): Promise<UserData> {
    const userData = {
      id: uuidv4(),
      kyc_status: 'pending',
      kyc_attempts: 0,
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };

    try {
      const [user] = await db('users')
        .insert(userData)
        .returning('*');
      
      logger.info(`User created: ${user.id}`);
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  static async findById(id: string): Promise<UserData | null> {
    try {
      const user = await db('users')
        .where({ id })
        .first();
      
      return user || null;
    } catch (error) {
      logger.error('Error finding user:', error);
      throw error;
    }
  }

  static async findByEmail(email: string): Promise<UserData | null> {
    try {
      const user = await db('users')
        .where({ email })
        .first();
      
      return user || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async update(id: string, data: Partial<UserData>): Promise<UserData | null> {
    try {
      const updateData = {
        ...data,
        updated_at: new Date()
      };

      const [user] = await db('users')
        .where({ id })
        .update(updateData)
        .returning('*');
      
      logger.info(`User updated: ${id}`);
      return user || null;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  static async updateKYCStatus(
    id: string, 
    status: UserData['kyc_status']
  ): Promise<UserData | null> {
    const updateData: Partial<UserData> = {
      kyc_status: status,
      updated_at: new Date()
    };

    if (status === 'approved') {
      updateData.kyc_approved_at = new Date();
    }

    try {
      const [user] = await db('users')
        .where({ id })
        .update(updateData)
        .returning('*');
      
      logger.info(`User KYC status updated: ${id} -> ${status}`);
      return user || null;
    } catch (error) {
      logger.error('Error updating KYC status:', error);
      throw error;
    }
  }

  static async incrementKYCAttempts(id: string): Promise<UserData | null> {
    try {
      const [user] = await db('users')
        .where({ id })
        .increment('kyc_attempts', 1)
        .update({
          last_kyc_attempt_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      logger.info(`User KYC attempts incremented: ${id}`);
      return user || null;
    } catch (error) {
      logger.error('Error incrementing KYC attempts:', error);
      throw error;
    }
  }

  static async getKYCStatistics(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    under_review: number;
  }> {
    try {
      const result = await db('users')
        .select('kyc_status')
        .count('* as count')
        .groupBy('kyc_status');

      const stats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        under_review: 0
      };

      result.forEach((row: any) => {
        const status = row.kyc_status;
        const count = parseInt(row.count);
        
        if (status in stats) {
          (stats as any)[status] = count;
        }
        stats.total += count;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting KYC statistics:', error);
      throw error;
    }
  }
}