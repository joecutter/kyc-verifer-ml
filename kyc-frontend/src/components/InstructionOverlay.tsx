import React from "react";
import { Camera, User, FileText, Shield } from "lucide-react";

interface InstructionOverlayProps {
  step: number;
  isVisible: boolean;
  onClose: () => void;
}

const instructions = [
  {
    title: "Selfie Capture",
    icon: User,
    points: [
      "Ensure good lighting",
      "Remove glasses and hats",
      "Look directly at camera",
      "Keep a neutral expression",
    ],
  },
  {
    title: "Liveness Check",
    icon: Shield,
    points: [
      "Follow on-screen prompts",
      "Blink when asked",
      "Turn head slowly",
      "Do not use photos or videos",
    ],
  },
  {
    title: "ID Document",
    icon: FileText,
    points: [
      "Use government-issued ID",
      "Ensure all details are visible",
      "Avoid glare and shadows",
      "Capture front and back",
    ],
  },
  {
    title: "Verification",
    icon: Camera,
    points: [
      "Review captured images",
      "Submit for processing",
      "Wait for verification",
      "Check status in dashboard",
    ],
  },
];

export const InstructionOverlay: React.FC<InstructionOverlayProps> = ({
  step,
  isVisible,
  onClose,
}) => {
  if (!isVisible) return null;

  const currentInstruction = instructions[step - 1];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-primary-100 rounded-lg">
              <currentInstruction.icon className="w-6 h-6 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {currentInstruction.title}
            </h2>
          </div>

          <div className="space-y-4">
            {currentInstruction.points.map((point, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 font-semibold text-sm">
                    {index + 1}
                  </span>
                </div>
                <p className="text-gray-700">{point}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-6">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              {instructions.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full ${
                    idx + 1 === step ? "bg-primary-600" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
