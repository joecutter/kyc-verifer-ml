import { apiClient } from "./client";

export interface UploadSelfieRequest {
  userId: string;
  image: string; // base64
  deviceMetadata: DeviceMetadata;
  challengeType?: "blink" | "turn_head" | "smile";
}

export interface UploadIDRequest {
  userId: string;
  attemptId: string;
  image: string;
  side: "front" | "back";
}

export interface VerificationStatus {
  attemptId: string;
  status: "pending" | "processing" | "completed" | "failed";
  scores?: {
    liveness: number;
    match: number;
    fraud: number;
  };
  kycStatus?: "pending" | "approved" | "rejected" | "in_review";
  estimatedCompletion?: number;
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
  orientation?: string;
  colorDepth?: number;
  pixelRatio?: number;
  hardwareConcurrency?: number;
}

export const kycApi = {
  // Upload selfie with liveness check
  async uploadSelfie(data: UploadSelfieRequest) {
    const formData = new FormData();
    formData.append("userId", data.userId);
    formData.append("deviceMetadata", JSON.stringify(data.deviceMetadata));

    // Convert base64 to blob
    const blob = await fetch(data.image).then((r) => r.blob());
    formData.append("selfie", blob, "selfie.jpg");

    const response = await apiClient.post("/kyc/upload-selfie", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  },

  // Upload ID document
  async uploadID(data: UploadIDRequest) {
    const formData = new FormData();
    formData.append("userId", data.userId);
    formData.append("attemptId", data.attemptId);
    formData.append("side", data.side);

    // Convert base64 to blob
    const blob = await fetch(data.image).then((r) => r.blob());
    formData.append("id", blob, `id_${data.side}.jpg`);

    const response = await apiClient.post("/kyc/upload-id", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data;
  },

  // Check verification status
  async getVerificationStatus(attemptId: string): Promise<VerificationStatus> {
    const response = await apiClient.get(`/kyc/status/${attemptId}`);
    return response.data;
  },

  // Get user KYC status
  async getUserKYCStatus(userId: string) {
    const response = await apiClient.get(`/kyc/user/${userId}/status`);
    return response.data;
  },

  // Retry failed KYC attempt
  async retryKYC(attemptId: string) {
    const response = await apiClient.post(`/kyc/retry/${attemptId}`);
    return response.data;
  },

  // Generate device fingerprint
  generateDeviceMetadata(): DeviceMetadata {
    const screen = window.screen;
    const nav = navigator as any;

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${screen.width}x${screen.height}`,
      browserName: this.getBrowserName(),
      browserVersion: this.getBrowserVersion(),
      os: this.getOS(),
      orientation: screen.orientation?.type,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
    };
  },

  // Helper methods
  getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Edge")) return "Edge";
    return "Unknown";
  },

  getBrowserVersion(): string {
    const ua = navigator.userAgent;
    let version = "Unknown";

    if (ua.includes("Chrome")) {
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? match[1] : "Unknown";
    } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
      const match = ua.match(/Version\/(\d+)/);
      version = match ? match[1] : "Unknown";
    } else if (ua.includes("Firefox")) {
      const match = ua.match(/Firefox\/(\d+)/);
      version = match ? match[1] : "Unknown";
    }

    return version;
  },

  getOS(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad"))
      return "iOS";
    return "Unknown";
  },
};
