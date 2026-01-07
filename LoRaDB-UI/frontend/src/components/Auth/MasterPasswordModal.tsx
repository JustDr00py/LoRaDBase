import React, { useState } from 'react';
import { useMasterAuth } from '../../context/MasterAuthContext';

interface MasterPasswordModalProps {
  isOpen: boolean;
  onAuthenticated: () => void;
  onCancel?: () => void;
}

const MasterPasswordModal: React.FC<MasterPasswordModalProps> = ({
  isOpen,
  onAuthenticated,
  onCancel,
}) => {
  const { authenticateMaster } = useMasterAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authenticateMaster(password);
      setPassword('');
      onAuthenticated();
    } catch (err: any) {
      const errorData = err.response?.data;

      if (errorData?.error === 'TooManyRequests') {
        setError('Too many attempts. Please try again later.');
      } else if (errorData?.error === 'InvalidPassword') {
        setError('Invalid master password');
      } else if (errorData?.error === 'MasterPasswordNotConfigured') {
        setError('Master password protection is not configured');
      } else {
        setError(errorData?.message || 'Authentication failed');
      }

      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError(null);
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel ? handleCancel : undefined}
    >
      <div
        className="card"
        style={{ maxWidth: '400px', width: '100%', margin: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h3 style={{ margin: 0 }}>Master Password Required</h3>
          {onCancel && (
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ marginBottom: '15px' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Enter the master password to access server management features
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '15px' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="master-password">Master Password</label>
            <input
              type="password"
              id="master-password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter master password"
              disabled={loading}
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: onCancel ? 1 : undefined, width: onCancel ? undefined : '100%' }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MasterPasswordModal;
