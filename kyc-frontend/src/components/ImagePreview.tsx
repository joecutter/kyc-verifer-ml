import React from "react";
import { X, CheckCircle, AlertCircle } from "lucide-react";

interface ImagePreviewProps {
  image: string;
  type: "selfie" | "id_front" | "id_back";
  onRemove?: () => void;
  validation?: {
    isValid: boolean;
    message: string;
  };
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  image,
  type,
  onRemove,
  validation,
}) => {
  const getTypeLabel = () => {
    switch (type) {
      case "selfie":
        return "Selfie";
      case "id_front":
        return "ID Front";
      case "id_back":
        return "ID Back";
      default:
        return type;
    }
  };

  return (
    <div className="relative group">
      <div className="relative overflow-hidden rounded-lg border border-gray-200">
        <img
          src={image}
          alt={getTypeLabel()}
          className="w-full h-48 object-cover"
        />

        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full 
                     opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Validation Indicator */}
        {validation && (
          <div
            className={`absolute bottom-0 left-0 right-0 p-2 ${
              validation.isValid ? "bg-green-500/80" : "bg-red-500/80"
            }`}
          >
            <div className="flex items-center justify-center space-x-1">
              {validation.isValid ? (
                <CheckCircle className="w-4 h-4 text-white" />
              ) : (
                <AlertCircle className="w-4 h-4 text-white" />
              )}
              <span className="text-white text-xs font-medium">
                {validation.message}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {getTypeLabel()}
        </span>
        <span className="text-xs text-gray-500">
          {new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
};
