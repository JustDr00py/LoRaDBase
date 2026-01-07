import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listServers, getMasterPasswordStatus } from '../../api/endpoints';
import { Server } from '../../types/api';
import AddServerModal from './AddServerModal';
import ServerPasswordModal from './ServerPasswordModal';
import MasterPasswordModal from '../Auth/MasterPasswordModal';
import { useMasterAuth } from '../../context/MasterAuthContext';

const ServerWelcome: React.FC = () => {
  const navigate = useNavigate();
  const { isMasterAuthenticated, logoutMaster } = useMasterAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showMasterPasswordModal, setShowMasterPasswordModal] = useState(false);
  const [masterPasswordRequired, setMasterPasswordRequired] = useState(false);

  useEffect(() => {
    loadServers();
    checkMasterPasswordStatus();
  }, []);

  const checkMasterPasswordStatus = async () => {
    try {
      const status = await getMasterPasswordStatus();
      setMasterPasswordRequired(status.enabled);
    } catch (error) {
      console.error('Error checking master password status:', error);
      setMasterPasswordRequired(false);
    }
  };

  const loadServers = async () => {
    try {
      setLoading(true);
      const response = await listServers();
      setServers(response.servers);
    } catch (error) {
      console.error('Error loading servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddServerClick = () => {
    // Check if master password is required and user is not authenticated
    if (masterPasswordRequired && !isMasterAuthenticated) {
      setShowMasterPasswordModal(true);
    } else {
      setShowAddModal(true);
    }
  };

  const handleMasterPasswordAuthenticated = () => {
    setShowMasterPasswordModal(false);
    setShowAddModal(true);
  };

  const handleServerAdded = () => {
    setShowAddModal(false);
    loadServers();
  };

  const handleConnectClick = () => {
    const server = servers.find(s => s.id.toString() === selectedServerId);
    if (server) {
      setSelectedServer(server);
      setShowPasswordModal(true);
    }
  };

  const handleAuthSuccess = () => {
    // AuthContext will handle navigation after successful auth
    navigate('/');
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '500px' }}>
        <h2 style={{ marginBottom: '10px' }}>Welcome to LoRaDB UI</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Select a server to connect or add a new one
        </p>

        {masterPasswordRequired && (
          <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Master Password: {isMasterAuthenticated ? '🔓 Authenticated' : '🔒 Not Authenticated'}
              </span>
              {isMasterAuthenticated && (
                <button
                  onClick={logoutMaster}
                  className="btn btn-sm"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                >
                  Logout Master
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>Loading servers...</p>
          </div>
        ) : servers.length === 0 ? (
          <div>
            <div className="alert alert-info" style={{ marginBottom: '20px' }}>
              No servers configured. Add your first server or import a backup to get started.
            </div>
            <button
              onClick={handleAddServerClick}
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '15px' }}
            >
              Add New Server
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => navigate('/servers/manage')}
                className="btn btn-sm"
                style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)' }}
              >
                Manage Servers & Import Backup
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="server-select" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Select Server
              </label>
              <select
                id="server-select"
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="form-input"
                style={{ width: '100%', marginBottom: '15px' }}
              >
                <option value="">-- Choose a server --</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.host})
                  </option>
                ))}
              </select>

              <button
                onClick={handleConnectClick}
                disabled={!selectedServerId}
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '15px' }}
              >
                Connect
              </button>
            </div>

            <button
              onClick={handleAddServerClick}
              className="btn btn-secondary"
              style={{ width: '100%' }}
            >
              Add New Server
            </button>

            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <button
                onClick={() => navigate('/servers/manage')}
                className="btn btn-sm"
                style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)' }}
              >
                Manage Servers
              </button>
            </div>
          </div>
        )}

        {showAddModal && (
          <AddServerModal
            onClose={() => setShowAddModal(false)}
            onServerAdded={handleServerAdded}
          />
        )}

        {showPasswordModal && selectedServer && (
          <ServerPasswordModal
            server={selectedServer}
            onClose={() => {
              setShowPasswordModal(false);
              setSelectedServer(null);
            }}
            onSuccess={handleAuthSuccess}
          />
        )}

        {showMasterPasswordModal && (
          <MasterPasswordModal
            isOpen={showMasterPasswordModal}
            onAuthenticated={handleMasterPasswordAuthenticated}
            onCancel={() => setShowMasterPasswordModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default ServerWelcome;
