import axios, { AxiosError, AxiosInstance } from 'axios';
import type { ErrorResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add session token and master token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add master token for server management operations
    const masterToken = localStorage.getItem('master_token');
    if (masterToken && config.headers) {
      config.headers['X-Master-Token'] = masterToken;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorResponse>) => {
    if (error.response?.status === 401) {
      const serverId = localStorage.getItem('selected_server_id');

      // Clear session but keep server selection
      localStorage.removeItem('session_token');
      localStorage.removeItem('session_expires_at');

      // Dispatch event for session expiration (AuthContext will handle re-auth)
      if (serverId) {
        window.dispatchEvent(
          new CustomEvent('session-expired', {
            detail: { serverId: parseInt(serverId) },
          })
        );
      }

      // Only redirect if not on servers page
      if (!window.location.pathname.startsWith('/servers')) {
        window.location.href = '/servers';
      }
    }

    if (error.response?.status === 404 && error.response?.data?.error === 'ServerNotFound') {
      // Server was deleted, clear everything and redirect
      localStorage.clear();
      window.location.href = '/servers';
    }

    return Promise.reject(error);
  }
);

export default apiClient;
