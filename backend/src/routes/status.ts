import { Router } from 'express';
import { param, query } from 'express-validator';
import { StatusController } from '../controllers/StatusController';
import { validateRequest } from '../middleware/validation';
import { 
  rateLimitByIP, 
  rateLimitAnalytics,
  globalRateLimit 
} from '../middleware/rateLimit';

const router = Router();
const statusController = new StatusController();

// Apply analytics middleware to all status routes
router.use(rateLimitAnalytics);

// Get system status
router.get(
  '/system',
  rateLimitByIP('system_status', 30, 60), // 30 requests per minute
  statusController.getSystemStatus.bind(statusController)
);

// Get service health
router.get(
  '/health',
  rateLimitByIP('health', 60, 60), // 60 requests per minute (more frequent for health checks)
  statusController.getHealth.bind(statusController)
);

// Get API status
router.get(
  '/api',
  rateLimitByIP('api_status', 30, 60), // 30 requests per minute
  statusController.getApiStatus.bind(statusController)
);

// Get KYC statistics
router.get(
  '/kyc-stats',
  globalRateLimit, // Apply global rate limit for sensitive endpoint
  [
    query('timeframe')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Timeframe must be one of: day, week, month, year'),
    query('userId')
      .optional()
      .isString()
      .withMessage('User ID must be a string')
      .isLength({ min: 1, max: 100 })
      .withMessage('User ID must be between 1 and 100 characters'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a positive integer'),
  ],
  validateRequest,
  statusController.getKYCStats.bind(statusController)
);

// Get user KYC history
router.get(
  '/history/:userId',
  rateLimitByIP('kyc_history', 30, 60), // 30 requests per minute
  [
    param('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('User ID must be between 1 and 100 characters'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a positive integer'),
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'manual_review'])
      .withMessage('Invalid status value'),
  ],
  validateRequest,
  statusController.getKYCHistory.bind(statusController)
);

// Get performance metrics
router.get(
  '/metrics',
  rateLimitByIP('metrics', 10, 60), // 10 requests per minute
  [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in ISO 8601 format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be in ISO 8601 format'),
  ],
  validateRequest,
  statusController.getMetrics.bind(statusController)
);

// Get error logs (admin only)
router.get(
  '/errors',
  rateLimitByIP('errors', 10, 60), // 10 requests per minute
  [
    query('level')
      .optional()
      .isIn(['error', 'warn', 'info', 'debug'])
      .withMessage('Level must be one of: error, warn, info, debug'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validateRequest,
  statusController.getErrorLogs.bind(statusController)
);

// Clear cache endpoint (admin only)
router.post(
  '/clear-cache',
  rateLimitByIP('clear_cache', 5, 60 * 60), // 5 requests per hour
  [
    query('pattern')
      .optional()
      .isString()
      .withMessage('Pattern must be a string'),
  ],
  validateRequest,
  statusController.clearCache.bind(statusController)
);

// Get rate limit status for current IP
router.get(
  '/rate-limit-status',
  rateLimitByIP('rate_limit_status', 30, 60), // 30 requests per minute
  statusController.getRateLimitStatus.bind(statusController)
);

// Export router
export default router;