import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface BrowserCapabilities {
  hasGetUserMedia: boolean;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  browserName: string;
  browserVersion: string;
}

export const BrowserDetector: React.FC = () => {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(
    null
  );
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const detectBrowser = () => {
      const ua = navigator.userAgent;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
      const isIOS = /iPhone|iPad|iPod/.test(ua);
      const isAndroid = /Android/.test(ua);

      let browserName = "Unknown";
      let browserVersion = "Unknown";

      // Detect browser
      if (ua.includes("Chrome")) {
        browserName = "Chrome";
        const match = ua.match(/Chrome\/(\d+)/);
        browserVersion = match ? match[1] : "Unknown";
      } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
        browserName = "Safari";
        const match = ua.match(/Version\/(\d+)/);
        browserVersion = match ? match[1] : "Unknown";
      } else if (ua.includes("Firefox")) {
        browserName = "Firefox";
        const match = ua.match(/Firefox\/(\d+)/);
        browserVersion = match ? match[1] : "Unknown";
      }

      const hasGetUserMedia = !!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      );

      const caps: BrowserCapabilities = {
        hasGetUserMedia,
        isMobile,
        isIOS,
        isAndroid,
        browserName,
        browserVersion,
      };

      setCapabilities(caps);

      // Show warning for unsupported browsers
      if (isIOS && browserName === "Safari" && parseInt(browserVersion) < 14) {
        setShowWarning(true);
      }

      if (!hasGetUserMedia) {
        setShowWarning(true);
      }
    };

    detectBrowser();
  }, []);

  if (!capabilities) return null;

  return (
    <>
      {showWarning && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3" />
            <div>
              <p className="text-sm text-yellow-700">
                {!capabilities.hasGetUserMedia
                  ? "Your browser does not support camera access. Please use Chrome, Firefox, or Safari on a supported device."
                  : capabilities.isIOS
                  ? "For best experience on iOS, please use Safari 14+ or Chrome."
                  : "Ensure camera permissions are enabled for this site."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Browser Status Bar */}
      <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-3 text-xs border">
        <div className="flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>
            {capabilities.browserName} {capabilities.browserVersion}
            {capabilities.isMobile && " • Mobile"}
          </span>
        </div>
      </div>
    </>
  );
};
