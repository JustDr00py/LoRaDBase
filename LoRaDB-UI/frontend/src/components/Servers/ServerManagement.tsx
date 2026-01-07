import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listServers, deleteServer, testServerConnection } from '../../api/endpoints';
import { Server, ConnectionTestResponse } from '../../types/api';
import AddServerModal from './AddServerModal';
import EditServerModal from './EditServerModal';
import BackupManagement from './BackupManagement';
import MasterProtectedRoute from '../Auth/MasterProtectedRoute';

const ServerManagement: React.FC = () => {
  const navigate = useNavigate();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editServer, setEditServer] = useState<Server | null>(null);
  const [testingServer, setTestingServer] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, ConnectionTestResponse>>({});
  const [deletingServer, setDeletingServer] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Server | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

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

  const handleServerAdded = () => {
    setShowAddModal(false);
    loadServers();
  };

  const handleServerUpdated = () => {
    setEditServer(null);
    loadServers();
  };

  const handleTestConnection = async (server: Server) => {
    try {
      setTestingServer(server.id);
      const result = await testServerConnection(server.id);
      setTestResults({ ...testResults, [server.id]: result });
    } catch (error: any) {
      setTestResults({
        ...testResults,
        [server.id]: {
          success: false,
          message: error.response?.data?.message || 'Connection test failed',
        },
      });
    } finally {
      setTestingServer(null);
    }
  };

  const handleDeleteClick = (server: Server) => {
    setDeleteConfirm(server);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;

    try {
      setDeletingServer(deleteConfirm.id);
      await deleteServer(deleteConfirm.id);
      setDeleteConfirm(null);
      loadServers();
      // Clear test result for deleted server
      const newResults = { ...testResults };
      delete newResults[deleteConfirm.id];
      setTestResults(newResults);
    } catch (error) {
      console.error('Error deleting server:', error);
      alert('Failed to delete server');
    } finally {
      setDeletingServer(null);
    }
  };

  return (
    <MasterProtectedRoute>
      <div style={{ padding: '30px' }}>
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '10px' }}>Server Management</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Manage your LoRaDB server connections
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate('/servers')}
            className="btn btn-secondary"
          >
            Back
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary"
          >
            Add Server
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <p>Loading servers...</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="card">
          <p>No servers configured. Click "Add Server" to get started.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Host</th>
                  <th>Created</th>
                  <th>Connection</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => {
                  const testResult = testResults[server.id];
                  return (
                    <tr key={server.id}>
                      <td style={{ fontWeight: 'bold' }}>{server.name}</td>
                      <td>{server.host}</td>
                      <td>{new Date(server.created_at).toLocaleDateString()}</td>
                      <td>
                        {testResult ? (
                          <span
                            style={{
                              color: testResult.success ? 'var(--success-color)' : 'var(--danger-color)',
                              fontSize: '0.875rem',
                            }}
                          >
                            {testResult.success ? '✓ Online' : '✗ ' + testResult.message}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            Not tested
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={() => handleTestConnection(server)}
                            className="btn btn-sm btn-secondary"
                            disabled={testingServer === server.id}
                          >
                            {testingServer === server.id ? 'Testing...' : 'Test'}
                          </button>
                          <button
                            onClick={() => setEditServer(server)}
                            className="btn btn-sm btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(server)}
                            className="btn btn-sm btn-danger"
                            disabled={deletingServer === server.id}
                          >
                            {deletingServer === server.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backup & Restore Section */}
      <BackupManagement />

      {showAddModal && (
        <AddServerModal
          onClose={() => setShowAddModal(false)}
          onServerAdded={handleServerAdded}
        />
      )}

      {editServer && (
        <EditServerModal
          server={editServer}
          onClose={() => setEditServer(null)}
          onServerUpdated={handleServerUpdated}
        />
      )}

      {deleteConfirm && (
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
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '400px', width: '100%', margin: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h3 style={{ margin: 0 }}>Confirm Deletion</h3>
            </div>

            <p>
              Are you sure you want to delete server <strong>{deleteConfirm.name}</strong>?
            </p>
            <div className="alert alert-error" style={{ marginBottom: '15px' }}>
              This action cannot be undone. The server configuration and password will be permanently deleted.
              You will need to re-add the server if you want to connect to it again.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={deletingServer !== null}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={deletingServer !== null}
              >
                {deletingServer !== null ? 'Deleting...' : 'Delete Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </MasterProtectedRoute>
  );
};

export default ServerManagement;
