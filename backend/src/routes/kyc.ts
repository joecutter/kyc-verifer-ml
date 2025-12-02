import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { KYCController } from '../controllers/KYCController';
import { upload, uploadErrorHandler } from '../middleware/upload';
import { validateRequest } from '../middleware/validation';
import { rateLimitByIP } from '../middleware/rateLimit';

const router = Router();
const kycController = new KYCController();

// Upload selfie route
router.post(
  '/upload-selfie',
  rateLimitByIP('upload_selfie', 5, 15 * 60), // 5 attempts per 15 minutes
  upload.single('selfie'),
  [
    body('userId').isString().notEmpty().withMessage('User ID is required'),
    body('deviceMetadata').isObject().withMessage('Device metadata is required'),
    body('challengeType').optional().isIn(['blink', 'head_turn', 'smile']),
  ],
  validateRequest,
  uploadErrorHandler,
  kycController.uploadSelfie.bind(kycController)
);

// Upload ID route
router.post(
  '/upload-id',
  rateLimitByIP('upload_id', 5, 15 * 60), // 5 attempts per 15 minutes
  upload.single('id'),
  [
    body('userId').isString().notEmpty().withMessage('User ID is required'),
    body('attemptId').isString().notEmpty().withMessage('Attempt ID is required'),
    body('side').isIn(['front', 'back']).withMessage('Side must be front or back'),
  ],
  validateRequest,
  uploadErrorHandler,
  kycController.uploadId.bind(kycController)
);

// Get KYC status
router.get(
  '/status/:userId',
  rateLimitByIP('status_check', 30, 60), // 30 requests per minute
  [
    param('userId').isString().notEmpty().withMessage('User ID is required'),
  ],
  validateRequest,
  kycController.getKYCStatus.bind(kycController)
);

// Retry KYC
router.post(
  '/retry/:attemptId',
  rateLimitByIP('kyc_retry', 3, 60 * 60), // 3 retries per hour
  [
    param('attemptId').isString().notEmpty().withMessage('Attempt ID is required'),
  ],
  validateRequest,
  kycController.retryKYC.bind(kycController)
);

// Get analytics (admin only)
router.get(
  '/analytics',
  rateLimitByIP('analytics', 10, 60), // 10 requests per minute
  [
    query('timeframe').optional().isIn(['day', 'week', 'month']),
    query('userId').optional().isString(),
  ],
  validateRequest,
  kycController.getAnalytics.bind(kycController)
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'kyc-backend',
    version: process.env.npm_package_version || '1.0.0',
  });
});

export default router;