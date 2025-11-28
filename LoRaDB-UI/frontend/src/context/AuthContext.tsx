import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { generateToken, verifyToken } from '../api/endpoints';
import type { GenerateTokenRequest } from '../types/api';
import { isTokenExpired } from '../utils/dateFormatter';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  expiresAt: string | null;
  login: (data: GenerateTokenRequest) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('jwt_token');
      const storedUsername = localStorage.getItem('jwt_username');
      const storedExpiresAt = localStorage.getItem('jwt_expires_at');

      if (token && storedUsername && storedExpiresAt) {
        // Check if token is expired
        if (isTokenExpired(storedExpiresAt)) {
          logout();
          setIsLoading(false);
          return;
        }

        // Verify token with backend
        try {
          const result = await verifyToken({ token });
          if (result.valid) {
            setIsAuthenticated(true);
            setUsername(storedUsername);
            setExpiresAt(storedExpiresAt);
          } else {
            logout();
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          logout();
        }
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (data: GenerateTokenRequest) => {
    try {
      const response = await generateToken(data);

      // Store token and metadata
      localStorage.setItem('jwt_token', response.token);
      localStorage.setItem('jwt_username', response.username);
      localStorage.setItem('jwt_expires_at', response.expiresAt);

      setIsAuthenticated(true);
      setUsername(response.username);
      setExpiresAt(response.expiresAt);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('jwt_username');
    localStorage.removeItem('jwt_expires_at');

    setIsAuthenticated(false);
    setUsername(null);
    setExpiresAt(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username,
        expiresAt,
        login,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
