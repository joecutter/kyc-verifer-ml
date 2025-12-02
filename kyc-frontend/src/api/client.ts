import axios from "axios";
import toast from "react-hot-toast";

const API_BASE_URL =
  import.meta.env.REACT_APP_API_URL || "http://localhost:3001/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add device fingerprint
    const fingerprint = localStorage.getItem("deviceFingerprint");
    if (fingerprint) {
      config.headers["X-Device-Fingerprint"] = fingerprint;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || "Something went wrong";

    // Don't show toast for 401 errors (handled by auth flow)
    if (error.response?.status !== 401) {
      toast.error(message);
    }

    if (error.response?.status === 429) {
      toast.error("Too many attempts. Please try again later.");
    }

    return Promise.reject(error);
  }
);
