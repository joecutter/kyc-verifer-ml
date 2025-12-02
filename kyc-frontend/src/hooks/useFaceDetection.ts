import { useState, useEffect, useRef } from "react";
import * as faceapi from "face-api.js";

interface FaceDetectionState {
  isLoaded: boolean;
  isDetecting: boolean;
  faceDetected: boolean;
  landmarks: faceapi.FaceLandmarks68 | null;
  expressions: faceapi.FaceExpressions | null;
  detection: faceapi.FaceDetection | null;
}

export const useFaceDetection = () => {
  const [state, setState] = useState<FaceDetectionState>({
    isLoaded: false,
    isDetecting: false,
    faceDetected: false,
    landmarks: null,
    expressions: null,
    detection: null,
  });

  const modelsLoadedRef = useRef(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "/models";

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);

        modelsLoadedRef.current = true;
        setState((prev) => ({ ...prev, isLoaded: true }));
      } catch (error) {
        console.error("Failed to load face-api models:", error);
      }
    };

    loadModels();
  }, []);

  const detectFace = async (
    videoElement: HTMLVideoElement
  ): Promise<FaceDetectionState> => {
    if (!modelsLoadedRef.current || !videoElement) {
      return state;
    }

    setState((prev) => ({ ...prev, isDetecting: true }));

    try {
      const detection = await faceapi
        .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detection) {
        const newState = {
          isLoaded: true,
          isDetecting: false,
          faceDetected: true,
          landmarks: detection.landmarks,
          expressions: detection.expressions,
          detection: detection.detection,
        };

        setState(newState);
        return newState;
      } else {
        const newState = {
          ...state,
          isDetecting: false,
          faceDetected: false,
          landmarks: null,
          expressions: null,
          detection: null,
        };

        setState(newState);
        return newState;
      }
    } catch (error) {
      console.error("Face detection error:", error);
      setState((prev) => ({ ...prev, isDetecting: false }));
      return state;
    }
  };

  const detectBlink = (landmarks: faceapi.FaceLandmarks68): boolean => {
    if (!landmarks) return false;

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // Calculate eye aspect ratio (simplified)
    const leftEyeHeight = Math.abs(leftEye[1].y - leftEye[5].y);
    const leftEyeWidth = Math.abs(leftEye[0].x - leftEye[3].x);
    const leftEAR = leftEyeHeight / leftEyeWidth;

    const rightEyeHeight = Math.abs(rightEye[1].y - rightEye[5].y);
    const rightEyeWidth = Math.abs(rightEye[0].x - rightEye[3].x);
    const rightEAR = rightEyeHeight / rightEyeWidth;

    const avgEAR = (leftEAR + rightEAR) / 2;

    // Threshold for blink detection
    return avgEAR < 0.25;
  };

  const detectHeadTurn = (
    landmarks: faceapi.FaceLandmarks68
  ): "left" | "right" | "center" => {
    if (!landmarks) return "center";

    const nose = landmarks.getNose();
    if (nose.length < 3) return "center";

    const noseTip = nose[3];
    const faceWidth = state.detection?.box.width || 300;

    const relativePosition = (noseTip.x - faceWidth / 2) / (faceWidth / 2);

    if (relativePosition < -0.3) return "left";
    if (relativePosition > 0.3) return "right";
    return "center";
  };

  return {
    ...state,
    detectFace,
    detectBlink,
    detectHeadTurn,
  };
};
