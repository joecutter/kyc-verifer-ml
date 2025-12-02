import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { kycApi } from "../api/kyc";
import toast from "react-hot-toast";

interface KYCStatus {
  kycStatus: "pending" | "approved" | "rejected" | "in_review";
  latestAttempt?: {
    id: string;
    status: string;
    scores?: {
      liveness: number;
      match: number;
      fraud: number;
    };
    createdAt: string;
  };
  canRetry: boolean;
}

export const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<KYCStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = localStorage.getItem("userId");

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await kycApi.getUserKYCStatus(userId);
      setStatus(response.data);
    } catch (error) {
      toast.error("Failed to fetch status");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!status?.latestAttempt?.id) return;

    try {
      await kycApi.retryKYC(status.latestAttempt.id);
      toast.success("New KYC attempt started");
      fetchStatus();
    } catch (error) {
      toast.error("Failed to retry");
    }
  };

  const getStatusIcon = () => {
    switch (status?.kycStatus) {
      case "approved":
        return <CheckCircle className="h-12 w-12 text-green-500" />;
      case "rejected":
        return <XCircle className="h-12 w-12 text-red-500" />;
      case "in_review":
        return <AlertTriangle className="h-12 w-12 text-yellow-500" />;
      default:
        return <Clock className="h-12 w-12 text-blue-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status?.kycStatus) {
      case "approved":
        return "green";
      case "rejected":
        return "red";
      case "in_review":
        return "yellow";
      default:
        return "blue";
    }
  };

  const getStatusText = () => {
    switch (status?.kycStatus) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "in_review":
        return "Under Review";
      default:
        return "Pending";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          KYC Status Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Track your identity verification status
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="card col-span-2">
          <div className="flex items-center space-x-4">
            {getStatusIcon()}
            <div>
              <h3 className="text-lg font-semibold">Verification Status</h3>
              <p className={`text-${getStatusColor()}-600 font-medium`}>
                {getStatusText()}
              </p>
            </div>
          </div>

          {status?.latestAttempt && (
            <div className="mt-6 space-y-4">
              <h4 className="font-medium">Latest Attempt Details</h4>

              <div className="grid grid-cols-3 gap-4">
                {status.latestAttempt.scores &&
                  Object.entries(status.latestAttempt.scores).map(
                    ([key, value]) => (
                      <div key={key} className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {(value * 100).toFixed(0)}%
                        </div>
                        <div className="text-sm text-gray-600 capitalize">
                          {key.replace("_", " ")}
                        </div>
                      </div>
                    )
                  )}
              </div>

              <div className="text-sm text-gray-500">
                Attempted:{" "}
                {new Date(status.latestAttempt.createdAt).toLocaleDateString()}
              </div>
            </div>
          )}

          {status?.canRetry && (
            <button
              onClick={handleRetry}
              className="mt-6 flex items-center space-x-2 btn-secondary"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retry Verification</span>
            </button>
          )}
        </div>

        {/* Instructions Card */}
        <div className="card">
          <h4 className="font-semibold mb-4">Next Steps</h4>
          <ul className="space-y-3">
            {status?.kycStatus === "approved" && (
              <>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>Your identity has been verified</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <span>You can now use all platform features</span>
                </li>
              </>
            )}

            {status?.kycStatus === "rejected" && (
              <>
                <li className="flex items-start space-x-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <span>Please ensure your documents are clear and valid</span>
                </li>
                <li className="flex items-start space-x-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <span>Make sure your selfie matches your ID photo</span>
                </li>
              </>
            )}

            {status?.kycStatus === "pending" && (
              <>
                <li className="flex items-start space-x-2">
                  <Clock className="h-5 w-5 text-blue-500 mt-0.5" />
                  <span>Start the KYC process to get verified</span>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};
