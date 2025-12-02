import { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/redis";
import { config } from "../config/env";
import { logger } from "../utils/logger";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

// Default rate limit configuration
const defaultConfig: RateLimitConfig = {
  windowMs: config.SECURITY.RATE_LIMIT.WINDOW_MS,
  maxRequests: config.SECURITY.RATE_LIMIT.MAX_REQUESTS,
  message: "Too many requests, please try again later.",
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Use IP + user agent + endpoint for rate limiting
    return `${req.ip}-${req.headers["user-agent"]}-${req.path}`;
  },
};

// Main rate limiter middleware
export const rateLimit = (customConfig?: Partial<RateLimitConfig>) => {
  const config: RateLimitConfig = { ...defaultConfig, ...customConfig };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = config.keyGenerator!(req);
      const rateLimitKey = `rate-limit:${key}`;

      const result = await redisClient.rateLimit(
        rateLimitKey,
        config.windowMs,
        config.maxRequests
      );

      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.reset / 1000));

      if (!result.allowed) {
        logger.warn("Rate limit exceeded:", {
          ip: req.ip,
          path: req.path,
          key,
          remaining: result.remaining,
          reset: new Date(result.reset).toISOString(),
        });

        return res.status(429).json({
          success: false,
          error: config.message,
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
          transactionId: req.transactionId,
        });
      }

      // Skip logging successful requests if configured
      if (!config.skipSuccessfulRequests) {
        logger.debug("Rate limit check passed:", {
          ip: req.ip,
          path: req.path,
          remaining: result.remaining,
        });
      }

      next();
    } catch (error) {
      logger.error("Rate limiter error:", error);
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
};

// IP-based rate limiting
export const rateLimitByIP = (
  prefix: string,
  maxRequests: number,
  windowMs: number = 15 * 60 * 1000 // 15 minutes default
) => {
  return rateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      return `${prefix}:${req.ip}`;
    },
    message: `Too many requests from your IP. Please try again in ${Math.ceil(windowMs / (60 * 1000))} minutes.`,
  });
};

// User-based rate limiting (requires authentication)
export const rateLimitByUser = (
  prefix: string,
  maxRequests: number,
  windowMs: number = 15 * 60 * 1000
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return next(); // Skip user-based rate limiting for unauthenticated requests
    }

    const key = `${prefix}:user:${req.user.id}`;

    try {
      const result = await redisClient.rateLimit(key, windowMs, maxRequests);

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.reset / 1000));

      if (!result.allowed) {
        logger.warn("User rate limit exceeded:", {
          userId: req.user.id,
          prefix,
          remaining: result.remaining,
        });

        return res.status(429).json({
          success: false,
          error: `Too many requests. Please try again in ${Math.ceil((result.reset - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
          transactionId: req.transactionId,
        });
      }

      next();
    } catch (error) {
      logger.error("User rate limiter error:", error);
      next(); // Fail open
    }
  };
};

// Endpoint-specific rate limiting
export const rateLimitByEndpoint = (
  endpoint: string,
  maxRequests: number,
  windowMs: number = 15 * 60 * 1000
) => {
  return rateLimit({
    windowMs,
    maxRequests,
    keyGenerator: (req) => {
      return `endpoint:${endpoint}:${req.ip}`;
    },
    message: `Too many requests to ${endpoint}. Please try again later.`,
  });
};

// Global rate limiting for sensitive endpoints
export const globalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 1000, // 1000 requests per hour globally
  keyGenerator: (req) => {
    return `global:${req.ip}`;
  },
  message: "Global rate limit exceeded. Please try again in an hour.",
});

// Upload-specific rate limiting
export const uploadRateLimit = rateLimitByIP("upload", 10, 60 * 60 * 1000); // 10 uploads per hour

// Login attempt rate limiting
export const loginRateLimit = rateLimitByIP("login", 5, 15 * 60 * 1000); // 5 attempts per 15 minutes

// Registration rate limiting
export const registrationRateLimit = rateLimitByIP(
  "register",
  3,
  60 * 60 * 1000
); // 3 registrations per hour

// KYC-specific rate limiting
export const kycRateLimit = rateLimitByIP("kyc", 20, 60 * 60 * 1000); // 20 KYC attempts per hour

// API key rate limiting (for external API consumers)
export const apiKeyRateLimit = (apiKey: string) => {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 1000, // 1000 requests per hour per API key
    keyGenerator: () => {
      return `apikey:${apiKey}`;
    },
    message:
      "API rate limit exceeded. Please upgrade your plan or contact support.",
  });
};

// Dynamic rate limiting based on user tier
export const tieredRateLimit = (
  tier: "free" | "basic" | "premium" | "enterprise"
) => {
  const limits = {
    free: { windowMs: 60 * 60 * 1000, maxRequests: 100 },
    basic: { windowMs: 60 * 60 * 1000, maxRequests: 1000 },
    premium: { windowMs: 60 * 60 * 1000, maxRequests: 10000 },
    enterprise: { windowMs: 60 * 60 * 1000, maxRequests: 100000 },
  };

  return rateLimit(limits[tier]);
};

// Rate limit for specific HTTP methods
export const methodRateLimit = (
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  maxRequests: number,
  windowMs: number = 15 * 60 * 1000
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === method) {
      return rateLimitByIP(
        `method:${method.toLowerCase()}`,
        maxRequests,
        windowMs
      )(req, res, next);
    }
    next();
  };
};

// Adaptive rate limiting based on server load
export const adaptiveRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check server load (simplified example)
    const memoryUsage = process.memoryUsage();
    const memoryPercentage =
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // Adjust rate limits based on memory usage
    let maxRequests = defaultConfig.maxRequests;

    if (memoryPercentage > 80) {
      maxRequests = Math.floor(defaultConfig.maxRequests * 0.5); // Reduce by 50%
    } else if (memoryPercentage > 60) {
      maxRequests = Math.floor(defaultConfig.maxRequests * 0.75); // Reduce by 25%
    }

    return rateLimit({ maxRequests })(req, res, next);
  } catch (error) {
    logger.error("Adaptive rate limit error:", error);
    next(); // Fall back to default rate limiting
  }
};

// Whitelist middleware to bypass rate limiting
export const rateLimitWhitelist = (whitelist: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if IP is in whitelist
    if (whitelist.includes(req.ip)) {
      logger.debug(`Rate limiting bypassed for whitelisted IP: ${req.ip}`);
      return next();
    }

    // Check for API key in whitelist
    const apiKey = req.headers["x-api-key"] as string;
    if (apiKey && whitelist.includes(apiKey)) {
      logger.debug(`Rate limiting bypassed for whitelisted API key: ${apiKey}`);
      return next();
    }

    // Not in whitelist, apply rate limiting
    rateLimit()(req, res, next);
  };
};

// Rate limit analytics middleware
export const rateLimitAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  // Add analytics on response finish
  res.on("finish", async () => {
    try {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Track request metrics
      const metricsKey = `analytics:requests:${new Date().toISOString().split("T")[0]}`;

      const metrics = {
        path: req.path,
        method: req.method,
        statusCode,
        duration,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      };

      // Store in Redis with 7-day expiry
      await redisClient.set(
        `${metricsKey}:${Date.now()}`,
        metrics,
        7 * 24 * 60 * 60 // 7 days
      );

      // Increment counters
      await redisClient.incr(`analytics:total:requests`);
      await redisClient.incr(`analytics:path:${req.path}:requests`);

      if (statusCode >= 400) {
        await redisClient.incr(`analytics:errors:${statusCode}`);
      }

      logger.debug("Request analytics recorded:", {
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
      });
    } catch (error) {
      logger.error("Rate limit analytics error:", error);
    }
  });

  next();
};
