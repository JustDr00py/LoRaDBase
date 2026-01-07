import React, { useState } from 'react';
import { createServer } from '../../api/endpoints';

interface AddServerModalProps {
  onClose: () => void;
  onServerAdded: () => void;
}

const AddServerModal: React.FC<AddServerModalProps> = ({ onClose, onServerAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    apiKey: '',
    password: '',
    passwordConfirm: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(null);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'Server name is required';
    }
    if (!formData.host.trim()) {
      return 'Host is required (e.g., 192.168.1.100:8080)';
    }
    if (!formData.apiKey.trim()) {
      return 'API Key is required';
    }
    if (formData.password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (formData.password !== formData.passwordConfirm) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createServer(formData);
      onServerAdded();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to add server';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (password: string): string => {
    if (password.length === 0) return '';
    if (password.length < 8) return 'Too short';
    if (password.length < 12) return 'Moderate';
    return 'Strong';
  };

  const passwordStrength = getPasswordStrength(formData.password);

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
        style={{ maxWidth: '500px', width: '100%', margin: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Add New Server</h3>
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

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '15px' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="name">Server Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              className="form-control"
              value={formData.name}
              onChange={handleChange}
              placeholder="My LoRaDB Server"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="host">Host (IP:Port or Domain:Port) *</label>
            <input
              type="text"
              id="host"
              name="host"
              className="form-control"
              value={formData.host}
              onChange={handleChange}
              placeholder="192.168.1.100:8080"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">API Key *</label>
            <input
              type="text"
              id="apiKey"
              name="apiKey"
              className="form-control"
              value={formData.apiKey}
              onChange={handleChange}
              placeholder="Your LoRaDB API key"
              disabled={loading}
              required
            />
            <small style={{ color: 'var(--text-secondary)' }}>
              This will be encrypted and stored securely
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              className="form-control"
              value={formData.password}
              onChange={handleChange}
              placeholder="Minimum 8 characters"
              disabled={loading}
              required
            />
            {formData.password && (
              <small style={{ color: passwordStrength === 'Strong' ? 'var(--success-color)' : passwordStrength === 'Moderate' ? 'var(--warning-color)' : 'var(--danger-color)' }}>
                Strength: {passwordStrength}
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirm">Confirm Password *</label>
            <input
              type="password"
              id="passwordConfirm"
              name="passwordConfirm"
              className="form-control"
              value={formData.passwordConfirm}
              onChange={handleChange}
              placeholder="Re-enter password"
              disabled={loading}
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
              {loading ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;
