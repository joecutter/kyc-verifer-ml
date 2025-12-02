import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import { User } from '../models/User';
import { logger } from '../utils/logger';
import { sendWebhook } from '../utils/webhook';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthController {
  // User registration
  async register(req: Request, res: Response) {
    const transactionId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[${transactionId}] Starting user registration`);
      
      const { email, password, firstName, lastName, phone, dateOfBirth } = req.body;

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        logger.warn(`[${transactionId}] User already exists: ${email}`);
        return res.status(409).json({
          success: false,
          transactionId,
          error: 'User already exists',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await User.create({
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        date_of_birth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        metadata: {
          password_hash: hashedPassword,
          email_verified: false,
          registration_ip: req.ip,
          registration_device: req.headers['user-agent'],
        },
      });

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store verification token (you would typically store this in a separate table)
      await User.update(user.id!, {
        metadata: {
          ...user.metadata,
          verification_token: verificationToken,
          verification_expires: verificationExpires,
        },
      });

      // Generate auth tokens
      const tokens = this.generateTokens(user.id!, user.email);

      // Log device fingerprint
      if (req.deviceFingerprint) {
        // You would call DeviceFingerprint.createOrUpdate here
      }

      // Send webhook
      await sendWebhook('user.created', {
        userId: user.id,
        email: user.email,
        transactionId,
      });

      // Send verification email (in production, you would integrate with an email service)
      // await sendVerificationEmail(user.email, verificationToken);

      logger.info(`[${transactionId}] User registered successfully: ${user.id}`);

      return res.status(201).json({
        success: true,
        transactionId,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            kycStatus: user.kyc_status,
          },
          tokens,
          verificationRequired: true,
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Registration error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Registration failed',
      });
    }
  }

  // User login
  async login(req: Request, res: Response) {
    const transactionId = `login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[${transactionId}] Starting user login`);
      
      const { email, password } = req.body;

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${email}`);
        return res.status(401).json({
          success: false,
          transactionId,
          error: 'Invalid credentials',
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
        password,
        user.metadata?.password_hash || ''
      );

      if (!isValidPassword) {
        logger.warn(`[${transactionId}] Invalid password for user: ${email}`);
        return res.status(401).json({
          success: false,
          transactionId,
          error: 'Invalid credentials',
        });
      }

      // Check if email is verified
      const emailVerified = user.metadata?.email_verified || false;
      if (!emailVerified) {
        logger.warn(`[${transactionId}] Email not verified for user: ${email}`);
        return res.status(403).json({
          success: false,
          transactionId,
          error: 'Email verification required',
        });
      }

      // Generate auth tokens
      const tokens = this.generateTokens(user.id!, user.email);

      // Log device access
      if (req.deviceFingerprint) {
        // You would call DeviceFingerprint.logAccess here
      }

      // Update last login
      await User.update(user.id!, {
        metadata: {
          ...user.metadata,
          last_login: new Date(),
          last_login_ip: req.ip,
        },
      });

      // Send webhook
      await sendWebhook('user.login', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        transactionId,
      });

      logger.info(`[${transactionId}] User logged in successfully: ${user.id}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            kycStatus: user.kyc_status,
          },
          tokens,
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Login error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Login failed',
      });
    }
  }

  // Refresh token
  async refreshToken(req: Request, res: Response) {
    const transactionId = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug(`[${transactionId}] Refreshing token`);
      
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.JWT.SECRET) as {
        userId: string;
        email: string;
        type: string;
      };

      if (decoded.type !== 'refresh') {
        logger.warn(`[${transactionId}] Invalid token type`);
        return res.status(401).json({
          success: false,
          transactionId,
          error: 'Invalid token',
        });
      }

      // Check if user exists
      const user = await User.findById(decoded.userId);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${decoded.userId}`);
        return res.status(401).json({
          success: false,
          transactionId,
          error: 'Invalid token',
        });
      }

      // Generate new tokens
      const tokens = this.generateTokens(user.id!, user.email);

      logger.debug(`[${transactionId}] Token refreshed for user: ${user.id}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          tokens,
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Token refresh error:`, error);
      
      return res.status(401).json({
        success: false,
        transactionId,
        error: 'Invalid refresh token',
      });
    }
  }

  // Logout
  async logout(req: Request, res: Response) {
    const transactionId = `logout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { refreshToken } = req.body;

      // Verify refresh token to get user ID
      try {
        const decoded = jwt.verify(refreshToken, config.JWT.SECRET) as {
          userId: string;
          type: string;
        };

        if (decoded.type === 'refresh') {
          // In production, you would add the token to a blacklist
          // stored in Redis or database

          // Send webhook
          await sendWebhook('user.logout', {
            userId: decoded.userId,
            transactionId,
          });

          logger.info(`[${transactionId}] User logged out: ${decoded.userId}`);
        }
      } catch (error) {
        // Token might be expired, still consider logout successful
        logger.debug(`[${transactionId}] Token expired during logout`);
      }

      return res.status(200).json({
        success: true,
        transactionId,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error(`[${transactionId}] Logout error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Logout failed',
      });
    }
  }

  // Forgot password
  async forgotPassword(req: Request, res: Response) {
    const transactionId = `forgot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { email } = req.body;

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        // Don't reveal that user doesn't exist
        logger.debug(`[${transactionId}] Password reset requested for non-existent email: ${email}`);
        return res.status(200).json({
          success: true,
          transactionId,
          message: 'If an account exists, a reset email will be sent',
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

      // Store reset token
      await User.update(user.id!, {
        metadata: {
          ...user.metadata,
          reset_token: resetToken,
          reset_expires: resetExpires,
        },
      });

      // Send reset email (in production)
      // await sendResetEmail(user.email, resetToken);

      // Send webhook
      await sendWebhook('user.password_reset_requested', {
        userId: user.id,
        email: user.email,
        transactionId,
      });

      logger.info(`[${transactionId}] Password reset requested for user: ${user.id}`);

      return res.status(200).json({
        success: true,
        transactionId,
        message: 'If an account exists, a reset email will be sent',
      });
    } catch (error) {
      logger.error(`[${transactionId}] Forgot password error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Password reset request failed',
      });
    }
  }

  // Reset password
  async resetPassword(req: Request, res: Response) {
    const transactionId = `reset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { token, password } = req.body;

      // Find user by reset token
      // Note: In production, you would have a separate table for reset tokens
      // This is a simplified implementation
      const users = await User.findByResetToken(token);
      
      if (!users || users.length === 0) {
        logger.warn(`[${transactionId}] Invalid reset token`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'Invalid or expired reset token',
        });
      }

      const user = users[0];
      const resetExpires = user.metadata?.reset_expires;

      // Check if token is expired
      if (!resetExpires || new Date(resetExpires) < new Date()) {
        logger.warn(`[${transactionId}] Expired reset token for user: ${user.id}`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'Invalid or expired reset token',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update user password and clear reset token
      await User.update(user.id!, {
        metadata: {
          ...user.metadata,
          password_hash: hashedPassword,
          reset_token: null,
          reset_expires: null,
          last_password_change: new Date(),
        },
      });

      // Invalidate all existing tokens (optional)
      // You would typically blacklist all existing tokens for this user

      // Send webhook
      await sendWebhook('user.password_reset', {
        userId: user.id,
        email: user.email,
        transactionId,
      });

      logger.info(`[${transactionId}] Password reset for user: ${user.id}`);

      return res.status(200).json({
        success: true,
        transactionId,
        message: 'Password reset successful',
      });
    } catch (error) {
      logger.error(`[${transactionId}] Reset password error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Password reset failed',
      });
    }
  }

  // Get user profile
  async getProfile(req: Request, res: Response) {
    const transactionId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'User not found',
        });
      }

      // Remove sensitive data
      const { metadata, ...userData } = user;
      const safeUser = {
        ...userData,
        emailVerified: metadata?.email_verified || false,
      };

      logger.debug(`[${transactionId}] Profile retrieved for user: ${userId}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          user: safeUser,
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Get profile error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to get profile',
      });
    }
  }

  // Update user profile
  async updateProfile(req: Request, res: Response) {
    const transactionId = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { userId } = req.params;
      const { firstName, lastName, phone, dateOfBirth } = req.body;

      // Verify user exists
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        logger.warn(`[${transactionId}] User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'User not found',
        });
      }

      // Update user
      const updateData: any = {};
      if (firstName) updateData.first_name = firstName;
      if (lastName) updateData.last_name = lastName;
      if (phone) updateData.phone = phone;
      if (dateOfBirth) updateData.date_of_birth = new Date(dateOfBirth);

      const user = await User.update(userId, updateData);

      if (!user) {
        throw new Error('Failed to update user');
      }

      // Send webhook
      await sendWebhook('user.updated', {
        userId,
        fields: Object.keys(updateData),
        transactionId,
      });

      logger.info(`[${transactionId}] Profile updated for user: ${userId}`);

      return res.status(200).json({
        success: true,
        transactionId,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phone: user.phone,
            dateOfBirth: user.date_of_birth,
            kycStatus: user.kyc_status,
          },
        },
      });
    } catch (error) {
      logger.error(`[${transactionId}] Update profile error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to update profile',
      });
    }
  }

  // Change password
  async changePassword(req: Request, res: Response) {
    const transactionId = `chpass_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`[${transactionId}] User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          transactionId,
          error: 'User not found',
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user.metadata?.password_hash || ''
      );

      if (!isValidPassword) {
        logger.warn(`[${transactionId}] Invalid current password for user: ${userId}`);
        return res.status(401).json({
          success: false,
          transactionId,
          error: 'Current password is incorrect',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await User.update(userId, {
        metadata: {
          ...user.metadata,
          password_hash: hashedPassword,
          last_password_change: new Date(),
        },
      });

      // Send webhook
      await sendWebhook('user.password_changed', {
        userId,
        transactionId,
      });

      logger.info(`[${transactionId}] Password changed for user: ${userId}`);

      return res.status(200).json({
        success: true,
        transactionId,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error(`[${transactionId}] Change password error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Failed to change password',
      });
    }
  }

  // Verify email
  async verifyEmail(req: Request, res: Response) {
    const transactionId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { token } = req.params;

      // Find user by verification token
      // Note: In production, you would have a separate table for verification tokens
      const users = await User.findByVerificationToken(token);
      
      if (!users || users.length === 0) {
        logger.warn(`[${transactionId}] Invalid verification token`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'Invalid or expired verification token',
        });
      }

      const user = users[0];
      const verificationExpires = user.metadata?.verification_expires;

      // Check if token is expired
      if (!verificationExpires || new Date(verificationExpires) < new Date()) {
        logger.warn(`[${transactionId}] Expired verification token for user: ${user.id}`);
        return res.status(400).json({
          success: false,
          transactionId,
          error: 'Invalid or expired verification token',
        });
      }

      // Mark email as verified
      await User.update(user.id!, {
        metadata: {
          ...user.metadata,
          email_verified: true,
          verification_token: null,
          verification_expires: null,
          email_verified_at: new Date(),
        },
      });

      // Send webhook
      await sendWebhook('user.email_verified', {
        userId: user.id,
        email: user.email,
        transactionId,
      });

      logger.info(`[${transactionId}] Email verified for user: ${user.id}`);

      return res.status(200).json({
        success: true,
        transactionId,
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error(`[${transactionId}] Verify email error:`, error);
      
      return res.status(500).json({
        success: false,
        transactionId,
        error: 'Email verification failed',
      });
    }
  }

  // Helper method to generate tokens
  private generateTokens(userId: string, email: string): AuthTokens {
    const accessToken = jwt.sign(
      {
        userId,
        email,
        type: 'access',
      },
      config.JWT.SECRET,
      {
        expiresIn: config.JWT.EXPIRES_IN,
        issuer: 'kyc-backend',
        audience: 'kyc-frontend',
      }
    );

    const refreshToken = jwt.sign(
      {
        userId,
        email,
        type: 'refresh',
      },
      config.JWT.SECRET,
      {
        expiresIn: config.JWT.REFRESH_EXPIRES_IN,
        issuer: 'kyc-backend',
        audience: 'kyc-frontend',
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getExpiryInSeconds(config.JWT.EXPIRES_IN),
    };
  }

  private getExpiryInSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const [, value, unit] = match;
    const numValue = parseInt(value);

    switch (unit) {
      case 's': return numValue;
      case 'm': return numValue * 60;
      case 'h': return numValue * 3600;
      case 'd': return numValue * 86400;
      default: return 3600;
    }
  }
}