import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { Camera, RefreshCw, AlertCircle } from "lucide-react";

interface WebcamCaptureProps {
  onCapture: (image: string) => void;
  type: "selfie" | "id";
  challenge?: "blink" | "turn_head_left" | "turn_head_right" | "smile";
}

export const WebcamCapture: React.FC<WebcamCaptureProps> = ({
  onCapture,
  type,
  challenge,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    type === "selfie" ? "user" : "environment"
  );

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        onCapture(imageSrc);
      }
    }
  }, [onCapture]);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const videoConstraints = {
    facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  const handleError = (err: Error) => {
    console.error("Webcam error:", err);
    setError("Camera access failed. Please check permissions.");
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  useEffect(() => {
    // Reset loading when camera switches
    setIsLoading(true);
  }, [facingMode]);

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative rounded-xl overflow-hidden bg-gray-900 shadow-lg">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50">
            <div className="text-center p-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-red-700 font-medium">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Reload Page
              </button>
            </div>
          </div>
        )}

        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          onUserMedia={handleLoad}
          onUserMediaError={handleError}
          className="w-full h-auto"
          imageSmoothing={true}
          mirrored={type === "selfie"}
        />

        {/* Overlay guides */}
        {type === "selfie" && (
          <>
            <div className="absolute inset-0 border-2 border-green-400 border-dashed m-8 rounded-lg pointer-events-none" />
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              Face Camera
            </div>
          </>
        )}

        {type === "id" && (
          <>
            <div className="absolute inset-0 border-2 border-blue-400 border-dashed m-4 rounded-lg pointer-events-none" />
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              Document Camera
            </div>
          </>
        )}

        {/* Challenge indicator */}
        {challenge && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="font-medium">
                {challenge === "blink" && "Blink now"}
                {challenge === "turn_head_left" && "Turn head left"}
                {challenge === "turn_head_right" && "Turn head right"}
                {challenge === "smile" && "Smile please"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {/* Camera controls */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={capture}
            disabled={isLoading || !!error}
            className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Camera className="w-5 h-5 mr-2" />
            Capture {type === "selfie" ? "Selfie" : "ID"}
          </button>

          {type === "selfie" && (
            <button
              onClick={switchCamera}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Switch Camera
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-sm text-gray-600">
            {type === "selfie"
              ? "Look directly at the camera. Ensure your face is well-lit and clearly visible."
              : "Place your ID document within the frame. Ensure all text is readable and there is no glare."}
          </p>
        </div>
      </div>
    </div>
  );
};
