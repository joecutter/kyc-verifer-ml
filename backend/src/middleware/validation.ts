import { Request, Response, NextFunction } from "express";
import { validationResult, ValidationChain } from "express-validator";
import { logger } from "../utils/logger";

// Generic request validator
export const validateRequest = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => ({
        field: error.type === "field" ? error.path : "unknown",
        message: error.msg,
        value: error.type === "field" ? error.value : undefined,
      }));

      logger.warn("Validation failed:", {
        url: req.url,
        method: req.method,
        errors: errorMessages,
        ip: req.ip,
      });

      return res.status(400).json({
        success: false,
        error: "Validation failed",
        errors: errorMessages,
        transactionId: req.transactionId || `val_${Date.now()}`,
      });
    }

    next();
  };
};

// File validation middleware
export const validateFile = (
  allowedTypes: string[] = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ],
  maxSize: number = 10 * 1024 * 1024 // 10MB default
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
        transactionId: req.transactionId,
      });
    }

    // Check file type
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
        transactionId: req.transactionId,
      });
    }

    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `File too large. Max size: ${maxSize / (1024 * 1024)}MB`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// Query parameter validation
export const validateQueryParams = (requiredParams: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingParams: string[] = [];

    for (const param of requiredParams) {
      if (!req.query[param]) {
        missingParams.push(param);
      }
    }

    if (missingParams.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing query parameters: ${missingParams.join(", ")}`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// Request body validation
export const validateRequestBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// UUID validation middleware
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${paramName}. Must be a valid UUID.`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// Email validation middleware
export const validateEmail = (fieldName: string = "email") => {
  return (req: Request, res: Response, next: NextFunction) => {
    const email = req.body[fieldName];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email && !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: `Invalid email format for field: ${fieldName}`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// Phone number validation middleware
export const validatePhone = (fieldName: string = "phone") => {
  return (req: Request, res: Response, next: NextFunction) => {
    const phone = req.body[fieldName];

    if (phone) {
      // Simple phone validation - can be extended based on requirements
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;

      if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ""))) {
        return res.status(400).json({
          success: false,
          error: `Invalid phone number format for field: ${fieldName}`,
          transactionId: req.transactionId,
        });
      }
    }

    next();
  };
};

// Date validation middleware
export const validateDate = (
  fieldName: string,
  format: string = "YYYY-MM-DD"
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const dateStr = req.body[fieldName];

    if (dateStr) {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          error: `Invalid date format for field: ${fieldName}. Expected format: ${format}`,
          transactionId: req.transactionId,
        });
      }

      // Check if date is in the past (for birth dates, etc.)
      if (fieldName.includes("birth") || fieldName.includes("dob")) {
        if (date >= new Date()) {
          return res.status(400).json({
            success: false,
            error: `Date of birth must be in the past for field: ${fieldName}`,
            transactionId: req.transactionId,
          });
        }
      }
    }

    next();
  };
};

// Enum validation middleware
export const validateEnum = (fieldName: string, allowedValues: any[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.body[fieldName] || req.query[fieldName];

    if (value && !allowedValues.includes(value)) {
      return res.status(400).json({
        success: false,
        error: `Invalid value for field: ${fieldName}. Allowed values: ${allowedValues.join(", ")}`,
        transactionId: req.transactionId,
      });
    }

    next();
  };
};

// File array validation
export const validateFiles = (
  fieldName: string,
  maxCount: number = 5,
  allowedTypes: string[] = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ],
  maxSize: number = 10 * 1024 * 1024
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No files uploaded for field: ${fieldName}`,
        transactionId: req.transactionId,
      });
    }

    if (files.length > maxCount) {
      return res.status(400).json({
        success: false,
        error: `Too many files for field: ${fieldName}. Maximum: ${maxCount}`,
        transactionId: req.transactionId,
      });
    }

    for (const file of files) {
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `Invalid file type for ${file.originalname}. Allowed types: ${allowedTypes.join(", ")}`,
          transactionId: req.transactionId,
        });
      }

      // Check file size
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          error: `File too large: ${file.originalname}. Max size: ${maxSize / (1024 * 1024)}MB`,
          transactionId: req.transactionId,
        });
      }
    }

    next();
  };
};

// Add transaction ID to request
export const addTransactionId = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const transactionId =
    (req.headers["x-transaction-id"] as string) ||
    req.body.transactionId ||
    `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.transactionId = transactionId;
  next();
};

// Sanitize input middleware
export const sanitizeInput = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const field of fields) {
      if (req.body[field] && typeof req.body[field] === "string") {
        // Basic sanitization - trim and remove excessive whitespace
        req.body[field] = req.body[field].trim().replace(/\s+/g, " ");

        // Remove potentially dangerous characters (XSS prevention)
        req.body[field] = req.body[field].replace(/[<>]/g, "");
      }
    }

    next();
  };
};
