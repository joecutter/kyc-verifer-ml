import { useState, useCallback } from "react";
import { kycApi, type VerificationStatus } from "../api/kyc";
import toast from "react-hot-toast";

interface KYCProcessState {
  currentStep: number;
  capturedImages: Record<string, string>;
  attemptId?: string;
  status?: VerificationStatus;
  isLoading: boolean;
  error?: string;
}

export const useKYCProcess = (userId: string) => {
  const [state, setState] = useState<KYCProcessState>({
    currentStep: 1,
    capturedImages: {},
    isLoading: false,
  });

  const uploadSelfie = useCallback(
    async (selfieImage: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        const deviceMetadata = kycApi.generateDeviceMetadata();

        const response = await kycApi.uploadSelfie({
          userId,
          image: selfieImage,
          deviceMetadata,
          challengeType: "blink",
        });

        setState((prev) => ({
          ...prev,
          attemptId: response.data.attemptId,
          capturedImages: { ...prev.capturedImages, selfie: selfieImage },
          currentStep: 2,
          isLoading: false,
        }));

        toast.success("Selfie uploaded successfully!");
        return response.data;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to upload selfie",
        }));
        throw error;
      }
    },
    [userId]
  );

  const uploadID = useCallback(
    async (image: string, side: "front" | "back") => {
      try {
        if (!state.attemptId) {
          throw new Error("No active KYC attempt");
        }

        setState((prev) => ({ ...prev, isLoading: true }));

        const response = await kycApi.uploadID({
          userId,
          attemptId: state.attemptId,
          image,
          side,
        });

        setState((prev) => ({
          ...prev,
          capturedImages: {
            ...prev.capturedImages,
            [`id_${side}`]: image,
          },
          currentStep: side === "front" ? 4 : 5,
          isLoading: false,
        }));

        toast.success(
          `${side === "front" ? "Front" : "Back"} ID uploaded successfully!`
        );
        return response.data;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to upload ID",
        }));
        throw error;
      }
    },
    [userId, state.attemptId]
  );

  const checkStatus = useCallback(async () => {
    if (!state.attemptId) return;

    try {
      const status = await kycApi.getVerificationStatus(state.attemptId);
      setState((prev) => ({ ...prev, status }));

      if (status.status === "completed") {
        toast.success("KYC verification completed!");
      } else if (status.status === "failed") {
        toast.error("KYC verification failed. Please try again.");
      }

      return status;
    } catch (error) {
      console.error("Failed to check status:", error);
    }
  }, [state.attemptId]);

  const retry = useCallback(async () => {
    if (!state.attemptId) return;

    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      await kycApi.retryKYC(state.attemptId);
      setState((prev) => ({ ...prev, isLoading: false, currentStep: 1 }));
      toast.success("Starting new KYC attempt");
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [state.attemptId]);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  return {
    state,
    uploadSelfie,
    uploadID,
    checkStatus,
    retry,
    goToStep,
  };
};
