import React, { useState, useEffect } from 'react';
import {
  exportBackup,
  importBackup,
  listAutomaticBackups,
  downloadAutomaticBackup,
  deleteAutomaticBackup,
} from '../../api/endpoints';
import type { BackupData, BackupFile, ImportResult, ImportStrategy } from '../../types/api';
import {
  downloadBackup,
  validateBackupFile,
  formatFileSize,
  formatBackupTimestamp,
} from '../../utils/backupUtils';

const BackupManagement: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<BackupData | null>(null);
  const [importStrategy, setImportStrategy] = useState<ImportStrategy>('merge');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoadingBackups(true);
      const backupList = await listAutomaticBackups();
      setBackups(backupList);
    } catch (error: any) {
      console.error('Failed to load backups:', error);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      // Get dashboard layout from localStorage
      const dashboardLayout = localStorage.getItem('loradb-dashboard-layout');
      const dashboards = dashboardLayout ? JSON.parse(dashboardLayout) : null;

      // Export backup with dashboard data
      const backup = await exportBackup(true, false, dashboards);
      downloadBackup(backup);
      alert('Backup exported successfully!');
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const backup = JSON.parse(json) as BackupData;

          // Validate backup file
          const validation = validateBackupFile(backup);
          if (!validation.valid) {
            alert(`Invalid backup file: ${validation.error}`);
            return;
          }

          setImportFile(backup);
          setShowImportModal(true);
        } catch (error: any) {
          alert(`Failed to read backup file: ${error.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      const result = await importBackup(importFile, importStrategy);
      setImportResult(result);
      setShowImportModal(false);
      setShowResultModal(true);

      // Restore dashboard layout to localStorage if present in backup
      if (importFile.data.dashboards) {
        localStorage.setItem('loradb-dashboard-layout', JSON.stringify(importFile.data.dashboards));
        console.log('✅ Dashboard layout restored from backup');
      }

      // Restore settings to localStorage if present in backup
      if (importFile.data.settings) {
        // Settings restoration can be implemented here when settings are added
        console.log('✅ Settings restored from backup');
      }

      // Reload page after import to apply all changes
      if (result.servers.imported > 0 || importFile.data.dashboards) {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Import failed:', error);
      alert(`Import failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const backup = await downloadAutomaticBackup(filename);
      downloadBackup(backup, filename);
    } catch (error: any) {
      console.error('Download failed:', error);
      alert(`Download failed: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      await deleteAutomaticBackup(filename);
      alert('Backup deleted successfully');
      loadBackups();
    } catch (error: any) {
      console.error('Delete failed:', error);
      alert(`Delete failed: ${error.response?.data?.message || error.message}`);
    }
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <div
        style={{
          marginBottom: '20px',
          paddingBottom: '15px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <h2 style={{ marginBottom: '8px' }}>Backup & Restore</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
          Export and import system data for migration and backup purposes
        </p>
      </div>

      {/* Export/Import Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <button onClick={handleExport} disabled={exporting} className="button-primary">
          {exporting ? 'Exporting...' : 'Export Backup'}
        </button>
        <button onClick={handleImportClick} disabled={importing} className="button-secondary">
          {importing ? 'Importing...' : 'Import Backup'}
        </button>
      </div>

      {/* Info Box */}
      <div
        style={{
          background: 'var(--background-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '30px',
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: '10px' }}>About Backups</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>Manual exports include: servers, dashboards, device types</li>
          <li>Automatic backups (daily at 2 AM) include: servers, device types only (no dashboards)</li>
          <li>API keys remain encrypted in backups - you need server passwords to use restored servers</li>
          <li><strong>Merge:</strong> Adds new servers without deleting existing ones (skips duplicates)</li>
          <li><strong>Replace:</strong> Deletes all servers and imports from backup</li>
        </ul>
      </div>

      {/* Automatic Backups List */}
      <div>
        <h3 style={{ marginBottom: '15px' }}>Automatic Backups (Last 7 Days)</h3>

        {loadingBackups ? (
          <p style={{ color: 'var(--text-secondary)' }}>Loading backups...</p>
        ) : backups.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No automatic backups available yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {backups.map((backup) => (
              <div
                key={backup.filename}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--background-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    {formatBackupTimestamp(backup.timestamp)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {formatFileSize(backup.size)} • {backup.filename}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleDownloadBackup(backup.filename)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      background: 'var(--color-primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(backup.filename)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      background: 'var(--color-danger)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Preview Modal */}
      {showImportModal && importFile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowImportModal(false)}
        >
          <div
            style={{
              background: 'var(--background)',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Import Backup</h2>

            <div style={{ marginBottom: '20px' }}>
              <p>
                <strong>Backup Version:</strong> {importFile.version}
              </p>
              <p>
                <strong>Created:</strong> {formatBackupTimestamp(importFile.timestamp)}
              </p>
              <p>
                <strong>Servers:</strong> {importFile.data.servers.length}
              </p>
              <p>
                <strong>Device Types:</strong> {importFile.data.deviceTypes?.length || 0}
              </p>
              <p>
                <strong>Dashboard Widgets:</strong>{' '}
                {importFile.data.dashboards?.widgets?.length || 0}
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Import Strategy:
              </label>
              <select
                value={importStrategy}
                onChange={(e) => setImportStrategy(e.target.value as ImportStrategy)}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--background)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="merge">Merge (add new servers, skip duplicates)</option>
                <option value="replace">Replace (delete all existing servers)</option>
              </select>
            </div>

            {importStrategy === 'replace' && (
              <div
                style={{
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  padding: '12px',
                  marginBottom: '20px',
                }}
              >
                <strong>Warning:</strong> Replace strategy will delete ALL existing servers
                before importing. This action cannot be undone.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importing}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: importStrategy === 'replace' ? '#dc3545' : 'var(--color-primary)',
                  color: 'white',
                  cursor: importing ? 'not-allowed' : 'pointer',
                  opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {showResultModal && importResult && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowResultModal(false)}
        >
          <div
            style={{
              background: 'var(--background)',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Import Complete</h2>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>Servers:</h4>
              <p>
                <strong>Imported:</strong> {importResult.servers.imported}
              </p>
              <p>
                <strong>Skipped:</strong> {importResult.servers.skipped}
              </p>
              {importResult.servers.errors.length > 0 && (
                <div>
                  <strong>Errors:</strong>
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    {importResult.servers.errors.map((error, index) => (
                      <li key={index} style={{ color: 'var(--color-danger)' }}>
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>Device Types:</h4>
              <p>
                <strong>Imported:</strong> {importResult.deviceTypes.imported}
              </p>
              <p>
                <strong>Skipped:</strong> {importResult.deviceTypes.skipped}
              </p>
              {importResult.deviceTypes.errors.length > 0 && (
                <div>
                  <strong>Errors:</strong>
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    {importResult.deviceTypes.errors.map((error, index) => (
                      <li key={index} style={{ color: 'var(--color-danger)' }}>
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowResultModal(false)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: 'var(--color-primary)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupManagement;
