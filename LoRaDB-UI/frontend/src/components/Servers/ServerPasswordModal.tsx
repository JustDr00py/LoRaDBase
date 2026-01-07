import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Server } from '../../types/api';

interface ServerPasswordModalProps {
  server: Server;
  onClose: () => void;
  onSuccess: () => void;
}

const ServerPasswordModal: React.FC<ServerPasswordModalProps> = ({ server, onClose, onSuccess }) => {
  const { authenticateToServer } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Listen for session expired events (re-authentication needed)
  useEffect(() => {
    const handleSessionExpired = () => {
      setError('Your session has expired. Please enter your password again.');
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await authenticateToServer(server.id, password);
      onSuccess();
    } catch (err: any) {
      const errorData = err.response?.data;

      if (errorData?.error === 'AccountLocked') {
        setError(`Account locked. Please try again in ${errorData.minutesRemaining} minute(s).`);
      } else if (errorData?.error === 'InvalidCredentials') {
        const remaining = errorData.attemptsRemaining;
        setAttemptsRemaining(remaining);
        setError(`Invalid password. ${remaining} attempt(s) remaining.`);

        if (remaining === 0) {
          setError('Too many failed attempts. Account locked. Please try again later or delete and re-add this server.');
        }
      } else {
        setError(errorData?.message || 'Authentication failed');
      }

      setPassword('');
    } finally {
      setLoading(false);
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '400px', width: '100%', margin: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Enter Password</h3>
          <button
            onClick={onClose}
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
        </div>

        <div style={{ marginBottom: '15px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
            {server.name}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {server.host}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '15px' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter server password"
              disabled={loading}
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ flex: 1 }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={loading}
            >
              {loading ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>

          {attemptsRemaining !== null && attemptsRemaining <= 2 && attemptsRemaining > 0 && (
            <div className="alert alert-info" style={{ marginTop: '15px' }}>
              Forgot your password? You can delete this server from the{' '}
              <a href="/servers/manage" style={{ color: 'var(--primary-color)' }}>
                Manage Servers
              </a>{' '}
              page and re-add it with a new password.
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ServerPasswordModal;
