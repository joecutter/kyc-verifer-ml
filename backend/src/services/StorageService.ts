import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import sharp from 'sharp';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
  dimensions?: {
    width: number;
    height: number;
  };
  checksum: string;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  optimize?: boolean;
}

export class StorageService {
  private s3: AWS.S3 | null = null;
  private readonly useS3: boolean;
  private readonly localStoragePath: string;
  private readonly maxFileSize: number;

  constructor() {
    this.useS3 = config.STORAGE.USE_S3;
    this.localStoragePath = config.STORAGE.LOCAL_PATH;
    this.maxFileSize = config.STORAGE.MAX_FILE_SIZE;

    if (this.useS3) {
      this.s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || config.STORAGE.S3_BUCKET.split('-')[1],
        ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {})
      });
    }

    // Ensure local storage directory exists
    if (!fs.existsSync(this.localStoragePath)) {
      mkdirAsync(this.localStoragePath, { recursive: true }).catch(console.error);
    }
  }

  private generateKey(
    filename: string, 
    userId: string, 
    fileType: 'selfie' | 'id_front' | 'id_back' | 'document'
  ): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(filename).toLowerCase() || '.jpg';
    const safeUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    return `kyc/${safeUserId}/${fileType}/${timestamp}-${random}${ext}`;
  }

  private async processImage(
    buffer: Buffer, 
    options: ImageProcessingOptions = {}
  ): Promise<{
    buffer: Buffer;
    mimetype: string;
    dimensions?: { width: number; height: number };
  }> {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 85,
      format = 'jpeg',
      optimize = true
    } = options;

    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      
      let processedImage = image;
      
      // Resize if needed
      if (metadata.width && metadata.height && 
          (metadata.width > maxWidth || metadata.height > maxHeight)) {
        processedImage = processedImage.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Optimize based on format
      if (format === 'jpeg') {
        processedImage = processedImage.jpeg({ quality, progressive: optimize });
      } else if (format === 'png') {
        processedImage = processedImage.png({ compressionLevel: optimize ? 9 : 0 });
      } else if (format === 'webp') {
        processedImage = processedImage.webp({ quality });
      }
      
      const processedBuffer = await processedImage.toBuffer();
      const newMetadata = await sharp(processedBuffer).metadata();
      
      return {
        buffer: processedBuffer,
        mimetype: `image/${format}`,
        dimensions: newMetadata.width && newMetadata.height ? {
          width: newMetadata.width,
          height: newMetadata.height
        } : undefined
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      // Return original if processing fails
      return {
        buffer,
        mimetype: 'image/jpeg',
        dimensions: undefined
      };
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    fileType: 'selfie' | 'id_front' | 'id_back',
    options?: ImageProcessingOptions
  ): Promise<UploadResult> {
    try {
      // Validate file size
      if (file.size > this.maxFileSize) {
        throw new Error(`File size exceeds limit of ${this.maxFileSize / (1024 * 1024)}MB`);
      }

      // Validate MIME type
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedMimes.includes(file.mimetype)) {
        throw new Error(`Invalid file type. Allowed: ${allowedMimes.join(', ')}`);
      }

      // Process image
      const processed = await this.processImage(file.buffer, {
        maxWidth: fileType === 'selfie' ? 1080 : 1920,
        maxHeight: fileType === 'selfie' ? 1080 : 1080,
        quality: 90,
        format: 'jpeg',
        optimize: true,
        ...options
      });

      const key = this.generateKey(file.originalname, userId, fileType);
      const checksum = crypto.createHash('sha256').update(processed.buffer).digest('hex');

      let url: string;
      
      if (this.useS3 && this.s3) {
        // Upload to S3
        const params: AWS.S3.PutObjectRequest = {
          Bucket: config.STORAGE.S3_BUCKET,
          Key: key,
          Body: processed.buffer,
          ContentType: processed.mimetype,
          ContentLength: processed.buffer.length,
          ACL: 'private',
          Metadata: {
            userId,
            fileType,
            checksum,
            uploadedAt: new Date().toISOString(),
            dimensions: processed.dimensions ? 
              `${processed.dimensions.width}x${processed.dimensions.height}` : 'unknown'
          },
          StorageClass: 'STANDARD_IA' // Infrequent Access for cost savings
        };

        const result = await this.s3.upload(params).promise();
        url = result.Location;
      } else {
        // Store locally
        const filePath = path.join(this.localStoragePath, key);
        const dirPath = path.dirname(filePath);
        
        await mkdirAsync(dirPath, { recursive: true });
        await writeFileAsync(filePath, processed.buffer);
        
        url = `/uploads/${key}`;
      }

      logger.info(`File uploaded: ${key} for user ${userId}`);

      return {
        url,
        key,
        size: processed.buffer.length,
        mimetype: processed.mimetype,
        dimensions: processed.dimensions,
        checksum
      };
    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      if (this.useS3 && this.s3) {
        await this.s3.deleteObject({
          Bucket: config.STORAGE.S3_BUCKET,
          Key: key
        }).promise();
      } else {
        const filePath = path.join(this.localStoragePath, key);
        if (fs.existsSync(filePath)) {
          await unlinkAsync(filePath);
        }
      }
      
      logger.info(`File deleted: ${key}`);
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  async getSignedUrl(
    key: string, 
    expiresIn: number = 3600,
    operation: 'getObject' | 'putObject' = 'getObject'
  ): Promise<string> {
    try {
      if (this.useS3 && this.s3) {
        return this.s3.getSignedUrlPromise(operation, {
          Bucket: config.STORAGE.S3_BUCKET,
          Key: key,
          Expires: expiresIn
        });
      } else {
        return `/uploads/${key}`;
      }
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      throw error;
    }
  }

  async getFileMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata?: Record<string, string>;
  } | null> {
    try {
      if (this.useS3 && this.s3) {
        const data = await this.s3.headObject({
          Bucket: config.STORAGE.S3_BUCKET,
          Key: key
        }).promise();
        
        return {
          size: data.ContentLength || 0,
          lastModified: data.LastModified || new Date(),
          contentType: data.ContentType || 'application/octet-stream',
          metadata: data.Metadata
        };
      } else {
        const filePath = path.join(this.localStoragePath, key);
        const stats = await fs.promises.stat(filePath);
        
        return {
          size: stats.size,
          lastModified: stats.mtime,
          contentType: 'image/jpeg', // Assume JPEG for local storage
          metadata: {}
        };
      }
    } catch (error) {
      logger.error('Failed to get file metadata:', error);
      return null;
    }
  }

  async cleanupOldFiles(days: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let deletedCount = 0;

      if (this.useS3 && this.s3) {
        // S3 cleanup would require listing objects and checking metadata
        // This is a simplified version - in production, you'd use S3 Lifecycle policies
        logger.warn('S3 cleanup should be handled via lifecycle policies');
        return 0;
      } else {
        // Local files cleanup
        const files = await this.listLocalFiles();
        
        for (const file of files) {
          const stats = await fs.promises.stat(file.path);
          if (stats.mtime < cutoffDate) {
            await unlinkAsync(file.path);
            deletedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${deletedCount} old files`);
      return deletedCount;
    } catch (error) {
      logger.error('Cleanup failed:', error);
      throw error;
    }
  }

  private async listLocalFiles(): Promise<{ path: string; key: string }[]> {
    const files: { path: string; key: string }[] = [];

    const walk = async (dir: string, baseDir: string = this.localStoragePath) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath, baseDir);
        } else {
          const relativePath = path.relative(baseDir, fullPath);
          files.push({
            path: fullPath,
            key: relativePath.replace(/\\/g, '/') // Convert to forward slashes
          });
        }
      }
    };

    await walk(this.localStoragePath);
    return files;
  }
}