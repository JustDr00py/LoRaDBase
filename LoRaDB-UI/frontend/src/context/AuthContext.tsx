import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authenticateServer, verifyToken } from '../api/endpoints';
import { Server } from '../types/api';
import { isTokenExpired } from '../utils/dateFormatter';

interface AuthContextType {
  isAuthenticated: boolean;
  selectedServer: Server | null;
  sessionExpiresAt: string | null;
  authenticateToServer: (serverId: number, password: string) => Promise<void>;
  logout: () => void;
  switchServer: () => void;
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
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('session_token');
      const serverIdStr = localStorage.getItem('selected_server_id');
      const expiresAt = localStorage.getItem('session_expires_at');
      const cachedServer = localStorage.getItem('server_cache');

      if (token && serverIdStr && expiresAt) {
        // Check if token is expired
        if (isTokenExpired(expiresAt)) {
          console.log('Session expired, clearing...');
          clearSession();
          setIsLoading(false);
          return;
        }

        // Restore server info from cache
        if (cachedServer) {
          try {
            const server: Server = JSON.parse(cachedServer);
            setIsAuthenticated(true);
            setSelectedServer(server);
            setSessionExpiresAt(expiresAt);
            console.log(`Session restored for server: ${server.name}`);

            // Optionally verify token with backend (but don't block on it)
            verifyToken({ token }).catch((error) => {
              console.error('Background token verification failed:', error);
              // Token is invalid, clear session
              clearSession();
            });
          } catch (error) {
            console.error('Failed to parse cached server:', error);
            clearSession();
          }
        } else {
          // No cached server info, need to re-select server
          console.log('No cached server info, clearing session');
          clearSession();
        }
      }

      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const authenticateToServer = async (serverId: number, password: string) => {
    const response = await authenticateServer(serverId, { password });

    // Store session data
    localStorage.setItem('session_token', response.token);
    localStorage.setItem('selected_server_id', serverId.toString());
    localStorage.setItem('session_expires_at', response.expiresAt);
    localStorage.setItem('server_cache', JSON.stringify(response.server));

    // Update state
    setIsAuthenticated(true);
    setSelectedServer(response.server);
    setSessionExpiresAt(response.expiresAt);

    console.log(`Authenticated to server: ${response.server.name}`);
  };

  const clearSession = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('session_expires_at');
    // Keep selected_server_id and server_cache for easier re-authentication
  };

  const logout = () => {
    localStorage.removeItem('session_token');
    localStorage.removeItem('selected_server_id');
    localStorage.removeItem('session_expires_at');
    localStorage.removeItem('server_cache');

    setIsAuthenticated(false);
    setSelectedServer(null);
    setSessionExpiresAt(null);

    console.log('Logged out');
  };

  const switchServer = () => {
    clearSession();
    setIsAuthenticated(false);
    setSelectedServer(null);
    setSessionExpiresAt(null);

    console.log('Switched server, session cleared');
  };

  const value: AuthContextType = {
    isAuthenticated,
    selectedServer,
    sessionExpiresAt,
    authenticateToServer,
    logout,
    switchServer,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
