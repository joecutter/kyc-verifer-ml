import React from "react";
import { Loader2 } from "lucide-react";

interface ProgressLoaderProps {
  message: string;
  progress?: number;
  subMessage?: string;
}

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({
  message,
  progress,
  subMessage,
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />

          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">{message}</h3>
            {subMessage && (
              <p className="text-sm text-gray-600 mt-1">{subMessage}</p>
            )}
          </div>

          {progress !== undefined && (
            <div className="w-full">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-2 text-center">
                {progress.toFixed(0)}% complete
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
