import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { verifyMasterPassword } from '../api/endpoints';
import { isTokenExpired } from '../utils/dateFormatter';

interface MasterAuthContextType {
  isMasterAuthenticated: boolean;
  masterSessionExpiresAt: string | null;
  authenticateMaster: (password: string) => Promise<void>;
  logoutMaster: () => void;
  isLoading: boolean;
}

const MasterAuthContext = createContext<MasterAuthContextType | undefined>(undefined);

export const useMasterAuth = () => {
  const context = useContext(MasterAuthContext);
  if (!context) {
    throw new Error('useMasterAuth must be used within MasterAuthProvider');
  }
  return context;
};

interface MasterAuthProviderProps {
  children: ReactNode;
}

export const MasterAuthProvider: React.FC<MasterAuthProviderProps> = ({ children }) => {
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState(false);
  const [masterSessionExpiresAt, setMasterSessionExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing master session on mount
  useEffect(() => {
    const restoreSession = () => {
      const token = localStorage.getItem('master_token');
      const expiresAt = localStorage.getItem('master_expires_at');

      if (token && expiresAt) {
        // Check if token is expired
        if (isTokenExpired(expiresAt)) {
          console.log('Master session expired, clearing...');
          clearSession();
          setIsLoading(false);
          return;
        }

        // Restore master session
        setIsMasterAuthenticated(true);
        setMasterSessionExpiresAt(expiresAt);
        console.log('Master session restored');
      }

      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const authenticateMaster = async (password: string) => {
    const response = await verifyMasterPassword(password);

    // Store session data
    localStorage.setItem('master_token', response.token);
    localStorage.setItem('master_expires_at', response.expiresAt);

    // Update state
    setIsMasterAuthenticated(true);
    setMasterSessionExpiresAt(response.expiresAt);

    console.log('Authenticated with master password');
  };

  const clearSession = () => {
    localStorage.removeItem('master_token');
    localStorage.removeItem('master_expires_at');
  };

  const logoutMaster = () => {
    clearSession();
    setIsMasterAuthenticated(false);
    setMasterSessionExpiresAt(null);
    console.log('Master session logged out');
  };

  const value: MasterAuthContextType = {
    isMasterAuthenticated,
    masterSessionExpiresAt,
    authenticateMaster,
    logoutMaster,
    isLoading,
  };

  return <MasterAuthContext.Provider value={value}>{children}</MasterAuthContext.Provider>;
};
