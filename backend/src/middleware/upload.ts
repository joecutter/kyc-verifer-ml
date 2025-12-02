import multer from 'multer';
import { Request } from 'express';
import { config } from '../config/env';
import { logger } from '../utils/logger';

// Configure storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Allow only images
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.STORAGE.MAX_FILE_SIZE,
    files: 1, // Max 1 file per request
  },
});

// Upload error handler
export const uploadErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Max size: ${config.STORAGE.MAX_FILE_SIZE / (1024 * 1024)}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
    }
    
    logger.warn('Multer error:', { error: err.code, message });
    
    return res.status(400).json({
      success: false,
      error: message,
    });
  }
  
  if (err) {
    logger.error('Upload error:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'File upload failed',
    });
  }
  
  next();
};