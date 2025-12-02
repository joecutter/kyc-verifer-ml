export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  kycStatus: "pending" | "approved" | "rejected" | "in_review";
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCAttempt {
  id: string;
  userId: string;
  selfieUrl: string;
  idFrontUrl: string;
  idBackUrl: string;
  livenessScore: number;
  matchScore: number;
  fraudScore: number;
  status: "pending" | "processing" | "completed" | "failed";
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface DeviceMetadata {
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  browserName: string;
  browserVersion: string;
  os: string;
  ipAddress?: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    url: string;
    key: string;
  };
  error?: string;
}

export interface VerificationResponse {
  success: boolean;
  status: string;
  scores: {
    liveness: number;
    match: number;
    fraud: number;
  };
  message: string;
}
