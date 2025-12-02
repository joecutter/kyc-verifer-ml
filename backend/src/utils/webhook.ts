import axios from 'axios';
import crypto from 'crypto';
import { logger } from './logger';

export interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
  signature?: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  timeout?: number;
  retries?: number;
  events?: string[];
}

export class WebhookService {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = {
      timeout: 5000,
      retries: 3,
      events: ['*'],
      ...config,
    };
  }

  async send(event: string, data: Record<string, any>): Promise<boolean> {
    try {
      // Check if event is allowed
      if (!this.isEventAllowed(event)) {
        logger.debug(`Webhook event "${event}" not allowed, skipping`);
        return false;
      }

      const payload: WebhookPayload = {
        event,
        data,
        timestamp: new Date().toISOString(),
      };

      // Sign payload if secret is provided
      if (this.config.secret) {
        payload.signature = this.generateSignature(payload);
      }

      let lastError: Error | null = null;

      // Retry logic
      for (let attempt = 1; attempt <= this.config.retries!; attempt++) {
        try {
          await axios.post(this.config.url, payload, {
            timeout: this.config.timeout,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'KYC-Backend-Webhook/1.0',
              ...(this.config.secret && {
                'X-Webhook-Signature': payload.signature,
              }),
            },
          });

          logger.info(`Webhook sent successfully: ${event}`, {
            url: this.config.url,
            event,
            attempt,
          });

          return true;
        } catch (error: any) {
          lastError = error;

          // Don't retry on 4xx errors (except 429)
          if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
            logger.warn(`Webhook rejected (${error.response.status}): ${event}`);
            break;
          }

          // Exponential backoff
          if (attempt < this.config.retries!) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
            logger.warn(`Webhook attempt ${attempt} failed, retrying in ${delay}ms:`, {
              event,
              error: error.message,
            });
            await this.sleep(delay);
          }
        }
      }

      logger.error(`Webhook failed after ${this.config.retries} attempts:`, {
        event,
        url: this.config.url,
        error: lastError?.message,
      });

      return false;
    } catch (error) {
      logger.error('Unexpected webhook error:', {
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private isEventAllowed(event: string): boolean {
    if (!this.config.events || this.config.events.length === 0) {
      return true;
    }

    return this.config.events.includes('*') || this.config.events.includes(event);
  }

  private generateSignature(payload: WebhookPayload): string {
    if (!this.config.secret) {
      throw new Error('Webhook secret is required for signing');
    }

    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.config.secret)
      .update(payloadString)
      .digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static verifySignature(payload: any, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      return false;
    }
  }
}

// Global webhook instance
let globalWebhook: WebhookService | null = null;

export const initializeWebhook = (config: WebhookConfig): void => {
  globalWebhook = new WebhookService(config);
  logger.info('Webhook service initialized', { url: config.url });
};

export const sendWebhook = async (
  event: string,
  data: Record<string, any>
): Promise<boolean> => {
  if (!globalWebhook) {
    // Check if webhook URL is configured
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      logger.debug('Webhook URL not configured, skipping');
      return false;
    }

    // Initialize with default config
    initializeWebhook({
      url: webhookUrl,
      secret: process.env.WEBHOOK_SECRET,
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000'),
      retries: parseInt(process.env.WEBHOOK_RETRIES || '3'),
      events: process.env.WEBHOOK_EVENTS?.split(','),
    });
  }

  return globalWebhook!.send(event, data);
};

// Predefined webhook events
export const WebhookEvents = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_VERIFIED: 'user.verified',
  
  // KYC events
  KYC_STARTED: 'kyc.started',
  KYC_SELFIE_UPLOADED: 'kyc.selfie_uploaded',
  KYC_ID_UPLOADED: 'kyc.id_uploaded',
  KYC_VERIFICATION_STARTED: 'kyc.verification_started',
  KYC_VERIFICATION_COMPLETED: 'kyc.verification_completed',
  KYC_VERIFICATION_FAILED: 'kyc.verification_failed',
  KYC_MANUAL_REVIEW: 'kyc.manual_review',
  KYC_RETRY: 'kyc.retry',
  
  // Document events
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VERIFIED: 'document.verified',
  DOCUMENT_REJECTED: 'document.rejected',
  
  // Security events
  SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
  MULTIPLE_DEVICES: 'security.multiple_devices',
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
  
  // System events
  SYSTEM_HEALTH: 'system.health',
  SYSTEM_ERROR: 'system.error',
} as const;