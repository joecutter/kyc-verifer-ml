import { Router } from 'express';
import { body, param } from 'express-validator';
import { AuthController } from '../controllers/AuthController';
import { validateRequest } from '../middleware/validation';
import { rateLimitByIP } from '../middleware/rateLimit';

const router = Router();
const authController = new AuthController();

// User registration
router.post(
  '/register',
  rateLimitByIP('register', 5, 60 * 60), // 5 registrations per hour
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').notEmpty().trim().escape(),
    body('lastName').notEmpty().trim().escape(),
    body('phone').optional().isMobilePhone('any'),
    body('dateOfBirth').optional().isDate(),
  ],
  validateRequest,
  authController.register.bind(authController)
);

// User login
router.post(
  '/login',
  rateLimitByIP('login', 10, 15 * 60), // 10 attempts per 15 minutes
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validateRequest,
  authController.login.bind(authController)
);

// Refresh token
router.post(
  '/refresh',
  rateLimitByIP('refresh', 20, 60), // 20 requests per minute
  [
    body('refreshToken').notEmpty(),
  ],
  validateRequest,
  authController.refreshToken.bind(authController)
);

// Logout
router.post(
  '/logout',
  rateLimitByIP('logout', 30, 60), // 30 requests per minute
  [
    body('refreshToken').notEmpty(),
  ],
  validateRequest,
  authController.logout.bind(authController)
);

// Forgot password
router.post(
  '/forgot-password',
  rateLimitByIP('forgot_password', 5, 60 * 60), // 5 requests per hour
  [
    body('email').isEmail().normalizeEmail(),
  ],
  validateRequest,
  authController.forgotPassword.bind(authController)
);

// Reset password
router.post(
  '/reset-password',
  rateLimitByIP('reset_password', 5, 60 * 60), // 5 requests per hour
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  ],
  validateRequest,
  authController.resetPassword.bind(authController)
);

// Get user profile
router.get(
  '/profile/:userId',
  rateLimitByIP('profile', 30, 60), // 30 requests per minute
  [
    param('userId').isString().notEmpty(),
  ],
  validateRequest,
  authController.getProfile.bind(authController)
);

// Update user profile
router.put(
  '/profile/:userId',
  rateLimitByIP('update_profile', 10, 60), // 10 requests per minute
  [
    param('userId').isString().notEmpty(),
    body('firstName').optional().trim().escape(),
    body('lastName').optional().trim().escape(),
    body('phone').optional().isMobilePhone('any'),
    body('dateOfBirth').optional().isDate(),
  ],
  validateRequest,
  authController.updateProfile.bind(authController)
);

// Change password
router.post(
  '/change-password/:userId',
  rateLimitByIP('change_password', 5, 60 * 60), // 5 requests per hour
  [
    param('userId').isString().notEmpty(),
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  ],
  validateRequest,
  authController.changePassword.bind(authController)
);

// Verify email
router.get(
  '/verify-email/:token',
  rateLimitByIP('verify_email', 30, 60), // 30 requests per minute
  [
    param('token').notEmpty(),
  ],
  validateRequest,
  authController.verifyEmail.bind(authController)
);

// Health check for auth service
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'auth',
    timestamp: new Date().toISOString(),
  });
});

export default router;