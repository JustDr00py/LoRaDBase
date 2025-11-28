import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import type { ErrorResponse } from '../../types/api';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [expirationHours, setExpirationHours] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({
        username,
        expirationHours: parseInt(expirationHours, 10),
      });
      navigate('/');
    } catch (err) {
      const axiosError = err as AxiosError<ErrorResponse>;
      setError(
        axiosError.response?.data?.message || 'Failed to generate token'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>LoRaDB UI</h1>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="expiration">Token Expiration (hours)</label>
            <input
              id="expiration"
              type="number"
              className="form-control"
              value={expirationHours}
              onChange={(e) => setExpirationHours(e.target.value)}
              min="1"
              max="8760"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Generating Token...' : 'Generate Token & Login'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <p>This will generate a JWT token for authentication with LoRaDB API.</p>
        </div>
      </div>
    </div>
  );
};
