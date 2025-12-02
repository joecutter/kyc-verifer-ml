import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001'),
  API_PREFIX: process.env.API_PREFIX || '/api',
  
  // Database
  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseInt(process.env.DB_PORT || '5432'),
    USER: process.env.DB_USER || 'kyc_user',
    PASSWORD: process.env.DB_PASSWORD || 'kyc_password',
    NAME: process.env.DB_NAME || 'kyc_database',
    SSL: process.env.DB_SSL === 'true',
    POOL: {
      MIN: 2,
      MAX: 10
    }
  },
  
  // Redis
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT || '6379'),
    PASSWORD: process.env.REDIS_PASSWORD || undefined,
    TTL: 3600 // 1 hour
  },
  
  // JWT
  JWT: {
    SECRET: process.env.JWT_SECRET || 'your-jwt-secret',
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  
  // Storage
  STORAGE: {
    USE_S3: process.env.USE_S3 === 'true',
    S3_BUCKET: process.env.S3_BUCKET_NAME || 'kyc-documents',
    LOCAL_PATH: process.env.LOCAL_STORAGE_PATH || './uploads',
    MAX_FILE_SIZE: parseInt(process.env.UPLOAD_LIMIT_MB || '10') * 1024 * 1024
  },
  
  // ML Service
  ML_SERVICE: {
    URL: process.env.ML_SERVICE_URL || 'http://localhost:5000',
    TIMEOUT: parseInt(process.env.ML_SERVICE_TIMEOUT || '30000')
  },
  
  // Security
  SECURITY: {
    RATE_LIMIT: {
      WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
      MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
    },
    SESSION_SECRET: process.env.SESSION_SECRET || 'session-secret'
  },
  
  // Encryption
  ENCRYPTION: {
    KEY: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key',
    IV: process.env.ENCRYPTION_IV || 'your-16-character-iv'
  },
  
  // Logging
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FILE_PATH: process.env.LOG_FILE_PATH || './logs'
  }
} as const;

export type Config = typeof config;