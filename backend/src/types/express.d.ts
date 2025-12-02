import { UserData } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      transactionId?: string;
      deviceFingerprint?: string;
      user?: UserData;
      files?: {
        [fieldname: string]: Express.Multer.File[];
      };
    }
  }
}

// This ensures the file is treated as a module
export {};