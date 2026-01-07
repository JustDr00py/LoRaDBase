import React, { useState } from 'react';
import { updateServer } from '../../api/endpoints';
import { Server } from '../../types/api';

interface EditServerModalProps {
  server: Server;
  onClose: () => void;
  onServerUpdated: () => void;
}

const EditServerModal: React.FC<EditServerModalProps> = ({ server, onClose, onServerUpdated }) => {
  const [formData, setFormData] = useState({
    name: server.name,
    host: server.host,
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

      await updateServer(server.id, formData);
      onServerUpdated();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to update server';
      setError(errorMessage);
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
        style={{ maxWidth: '500px', width: '100%', margin: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Edit Server</h3>
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
            <small style={{ color: 'var(--text-secondary)' }}>
              Examples: 192.168.1.100:8080, http://loradb.example.com, https://loradb.example.com
            </small>
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
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditServerModal;
