import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface DeviceFingerprintData {
  id?: string;
  user_id: string;
  fingerprint_hash: string;
  user_agent?: string;
  browser_name?: string;
  browser_version?: string;
  os?: string;
  device_type?: string;
  screen_resolution?: string;
  language?: string;
  timezone?: string;
  is_mobile?: boolean;
  is_tablet?: boolean;
  is_desktop?: boolean;
  plugins?: string[];
  fonts?: string[];
  ip_address?: string;
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    lat?: number;
    lon?: number;
  };
  created_at?: Date;
  updated_at?: Date;
}

export interface DeviceMetadata {
  userAgent?: string;
  browserName?: string;
  browserVersion?: string;
  os?: string;
  deviceType?: string;
  screenResolution?: string;
  language?: string;
  timezone?: string;
  isMobile?: boolean;
  isTablet?: boolean;
  isDesktop?: boolean;
  plugins?: string[];
  fonts?: string[];
  ipAddress?: string;
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    lat?: number;
    lon?: number;
  };
}

export class DeviceFingerprint {
  static async createOrUpdate(
    userId: string,
    deviceData: DeviceMetadata
  ): Promise<DeviceFingerprintData> {
    try {
      // Generate fingerprint hash
      const fingerprintHash = this.generateFingerprintHash(deviceData);

      // Check if fingerprint already exists for user
      const existing = await this.findByFingerprint(userId, fingerprintHash);

      if (existing) {
        // Update existing fingerprint
        const [updated] = await db('device_fingerprints')
          .where({ id: existing.id })
          .update({
            ...deviceData,
            updated_at: new Date(),
          })
          .returning('*');

        logger.info(`Device fingerprint updated: ${updated.id} for user ${userId}`);
        return updated;
      } else {
        // Create new fingerprint
        const fingerprintData: DeviceFingerprintData = {
          id: uuidv4(),
          user_id: userId,
          fingerprint_hash: fingerprintHash,
          user_agent: deviceData.userAgent,
          browser_name: deviceData.browserName,
          browser_version: deviceData.browserVersion,
          os: deviceData.os,
          device_type: deviceData.deviceType,
          screen_resolution: deviceData.screenResolution,
          language: deviceData.language,
          timezone: deviceData.timezone,
          is_mobile: deviceData.isMobile,
          is_tablet: deviceData.isTablet,
          is_desktop: deviceData.isDesktop,
          plugins: deviceData.plugins ? JSON.stringify(deviceData.plugins) : null,
          fonts: deviceData.fonts ? JSON.stringify(deviceData.fonts) : null,
          ip_address: deviceData.ipAddress,
          geolocation: deviceData.geolocation ? JSON.stringify(deviceData.geolocation) : null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const [created] = await db('device_fingerprints')
          .insert(fingerprintData)
          .returning('*');

        logger.info(`Device fingerprint created: ${created.id} for user ${userId}`);
        return created;
      }
    } catch (error) {
      logger.error('Error creating/updating device fingerprint:', error);
      throw error;
    }
  }

  static async findByFingerprint(
    userId: string,
    fingerprintHash: string
  ): Promise<DeviceFingerprintData | null> {
    try {
      const fingerprint = await db('device_fingerprints')
        .where({
          user_id: userId,
          fingerprint_hash: fingerprintHash,
        })
        .first();

      return fingerprint || null;
    } catch (error) {
      logger.error('Error finding device fingerprint:', error);
      throw error;
    }
  }

  static async findByUserId(userId: string): Promise<DeviceFingerprintData[]> {
    try {
      const fingerprints = await db('device_fingerprints')
        .where({ user_id: userId })
        .orderBy('updated_at', 'desc');

      return fingerprints;
    } catch (error) {
      logger.error('Error finding device fingerprints by user:', error);
      throw error;
    }
  }

  static async getSuspiciousDevices(userId: string, threshold: number = 2): Promise<{
    suspicious: boolean;
    deviceCount: number;
    devices: Array<{
      id: string;
      browser: string;
      os: string;
      lastUsed: Date;
      location?: string;
    }>;
  }> {
    try {
      const fingerprints = await this.findByUserId(userId);
      
      const devices = fingerprints.map(fp => ({
        id: fp.id!,
        browser: `${fp.browser_name} ${fp.browser_version}`,
        os: fp.os || 'Unknown',
        lastUsed: fp.updated_at!,
        location: fp.geolocation ? 
          `${(fp.geolocation as any).city}, ${(fp.geolocation as any).country}` : 
          undefined,
      }));

      return {
        suspicious: fingerprints.length > threshold,
        deviceCount: fingerprints.length,
        devices: devices.slice(0, 10), // Return top 10 most recent
      };
    } catch (error) {
      logger.error('Error checking suspicious devices:', error);
      throw error;
    }
  }

  static async logAccess(
    userId: string,
    deviceData: DeviceMetadata,
    action: string
  ): Promise<void> {
    try {
      await this.createOrUpdate(userId, deviceData);
      
      logger.info(`Device access logged: ${action}`, {
        userId,
        device: deviceData.browserName,
        os: deviceData.os,
        ip: deviceData.ipAddress,
      });
    } catch (error) {
      logger.error('Error logging device access:', error);
    }
  }

  static generateFingerprintHash(deviceData: DeviceMetadata): string {
    const components = [
      deviceData.userAgent,
      deviceData.browserName,
      deviceData.browserVersion,
      deviceData.os,
      deviceData.screenResolution,
      deviceData.language,
      deviceData.timezone,
      deviceData.isMobile ? 'mobile' : '',
      deviceData.isTablet ? 'tablet' : '',
      deviceData.isDesktop ? 'desktop' : '',
      (deviceData.plugins || []).join(','),
      (deviceData.fonts || []).join(','),
    ].filter(Boolean).join('|');

    return crypto
      .createHash('sha256')
      .update(components)
      .digest('hex');
  }

  static async analyzeDevicePatterns(userId: string): Promise<{
    uniqueDevices: number;
    frequentLocations: Array<{ location: string; count: number }>;
    commonBrowser: string;
    riskScore: number;
  }> {
    try {
      const fingerprints = await this.findByUserId(userId);

      if (fingerprints.length === 0) {
        return {
          uniqueDevices: 0,
          frequentLocations: [],
          commonBrowser: 'Unknown',
          riskScore: 0,
        };
      }

      // Count unique browsers
      const browserCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};

      fingerprints.forEach(fp => {
        const browser = `${fp.browser_name} ${fp.browser_version}`;
        browserCounts[browser] = (browserCounts[browser] || 0) + 1;

        if (fp.geolocation) {
          const geo = fp.geolocation as any;
          const location = geo.city && geo.country ? 
            `${geo.city}, ${geo.country}` : 
            geo.country || 'Unknown';
          locationCounts[location] = (locationCounts[location] || 0) + 1;
        }
      });

      // Find most common browser
      const commonBrowser = Object.entries(browserCounts)
        .sort(([, a], [, b]) => b - a)[0][0];

      // Calculate risk score
      let riskScore = 0;
      if (fingerprints.length > 3) riskScore += 20;
      if (Object.keys(locationCounts).length > 2) riskScore += 30;
      if (Object.keys(browserCounts).length > 2) riskScore += 30;

      // Get top 3 frequent locations
      const frequentLocations = Object.entries(locationCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([location, count]) => ({ location, count }));

      return {
        uniqueDevices: fingerprints.length,
        frequentLocations,
        commonBrowser,
        riskScore: Math.min(riskScore, 100),
      };
    } catch (error) {
      logger.error('Error analyzing device patterns:', error);
      throw error;
    }
  }

  static async cleanupOldFingerprints(days: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await db('device_fingerprints')
        .where('updated_at', '<', cutoffDate)
        .del();

      logger.info(`Cleaned up ${result} old device fingerprints`);
      return result;
    } catch (error) {
      logger.error('Error cleaning up device fingerprints:', error);
      throw error;
    }
  }
}