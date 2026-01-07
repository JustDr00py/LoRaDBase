import React, { useState, useEffect, ReactNode } from 'react';
import { useMasterAuth } from '../../context/MasterAuthContext';
import { getMasterPasswordStatus } from '../../api/endpoints';
import MasterPasswordModal from './MasterPasswordModal';

interface MasterProtectedRouteProps {
  children: ReactNode;
}

const MasterProtectedRoute: React.FC<MasterProtectedRouteProps> = ({ children }) => {
  const { isMasterAuthenticated, isLoading } = useMasterAuth();
  const [requiresAuth, setRequiresAuth] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if master password protection is enabled
  useEffect(() => {
    const checkMasterAuth = async () => {
      try {
        const status = await getMasterPasswordStatus();
        setRequiresAuth(status.enabled);
      } catch (error: any) {
        console.error('Error checking master password status:', error);
        // On error, assume no protection (backward compatible)
        setRequiresAuth(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    if (!isLoading) {
      checkMasterAuth();
    }
  }, [isLoading]);

  // Show modal when auth is required but user is not authenticated
  useEffect(() => {
    if (requiresAuth && !isMasterAuthenticated && !checkingAuth) {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [requiresAuth, isMasterAuthenticated, checkingAuth]);

  // Wait for both master auth context and our check to complete
  if (isLoading || checkingAuth) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <div>Loading...</div>
      </div>
    );
  }

  // If master auth is required but not authenticated, show modal
  if (requiresAuth && !isMasterAuthenticated) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <h2>Master Password Required</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            You need to enter the master password to access server management features.
          </p>
        </div>
        <MasterPasswordModal
          isOpen={showModal}
          onAuthenticated={() => {
            setShowModal(false);
            // Force re-render by updating a state
            setRequiresAuth(true);
          }}
        />
      </div>
    );
  }

  // Either no master auth required, or user is authenticated
  return <>{children}</>;
};

export default MasterProtectedRoute;
