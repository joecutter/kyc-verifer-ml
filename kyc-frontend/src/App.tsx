import React, { useState, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Shield, User, Home, FileText } from "lucide-react";
import { KYCStepper } from "./components/KYCStepper";
import { BrowserDetector } from "./components/BrowserDetector";
import { ProgressLoader } from "./components/ProgressLoader";
import { Dashboard } from "./components/Dashboard";
import { useKYCProcess } from "./hooks/useKYCProcess";

function App() {
  const [userId] = useState(
    () => localStorage.getItem("userId") || `user_${Date.now()}`
  );
  const { state, checkStatus } = useKYCProcess(userId);
  const [showInstructions, setShowInstructions] = useState(true);

  // Save userId on initial load
  useEffect(() => {
    if (!localStorage.getItem("userId")) {
      localStorage.setItem("userId", userId);
    }
  }, [userId]);

  // Poll for status updates if verification is in progress
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (state.attemptId && state.status?.status === "processing") {
      interval = setInterval(() => {
        checkStatus();
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.attemptId, state.status?.status, checkStatus]);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#363636",
              color: "#fff",
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: "#10B981",
                secondary: "#fff",
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: "#EF4444",
                secondary: "#fff",
              },
            },
          }}
        />

        <BrowserDetector />

        {/* Navigation */}
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-8">
                <div className="flex items-center space-x-3">
                  <Shield className="h-8 w-8 text-primary-600" />
                  <span className="text-xl font-bold text-gray-900">
                    SecureKYC
                  </span>
                </div>

                <div className="hidden md:flex space-x-6">
                  <a
                    href="/"
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600"
                  >
                    <Home className="h-5 w-5" />
                    <span>Home</span>
                  </a>
                  <a
                    href="/kyc"
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600"
                  >
                    <User className="h-5 w-5" />
                    <span>Start KYC</span>
                  </a>
                  <a
                    href="/dashboard"
                    className="flex items-center space-x-2 text-gray-700 hover:text-primary-600"
                  >
                    <FileText className="h-5 w-5" />
                    <span>Dashboard</span>
                  </a>
                </div>
              </div>

              <div className="flex items-center">
                <div className="text-sm text-gray-500">
                  User ID:{" "}
                  <span className="font-mono">{userId.substring(0, 8)}...</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main>
          <Routes>
            <Route
              path="/"
              element={
                <div className="max-w-7xl mx-auto px-4 py-12">
                  <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">
                      Secure Identity Verification
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                      Complete your KYC verification in minutes using advanced
                      facial recognition and document verification technology.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                    {[
                      {
                        icon: User,
                        title: "Face Verification",
                        desc: "Real-time selfie capture with liveness detection",
                      },
                      {
                        icon: Shield,
                        title: "Document Scan",
                        desc: "Automatic ID document verification",
                      },
                      {
                        icon: FileText,
                        title: "Instant Results",
                        desc: "Get verified in minutes",
                      },
                    ].map((item, idx) => (
                      <div key={idx} className="card text-center">
                        <div className="p-3 bg-primary-100 rounded-lg inline-block mb-4">
                          <item.icon className="h-8 w-8 text-primary-600" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">
                          {item.title}
                        </h3>
                        <p className="text-gray-600">{item.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="text-center mt-12">
                    <a
                      href="/kyc"
                      className="inline-flex items-center px-8 py-3 text-lg font-semibold 
                             text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                    >
                      Start Verification
                    </a>
                  </div>
                </div>
              }
            />

            <Route path="/kyc" element={<KYCStepper />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {state.isLoading && (
          <ProgressLoader
            message="Processing..."
            progress={state.currentStep * 25}
          />
        )}
      </div>
    </Router>
  );
}

export default App;
