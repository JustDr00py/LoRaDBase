import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRetentionPolicies,
  setGlobalRetentionPolicy,
  setApplicationRetentionPolicy,
  deleteApplicationRetentionPolicy,
  enforceRetention,
} from '../../api/endpoints';
import { Loading } from '../Common/Loading';
import { formatRelativeTime } from '../../utils/dateFormatter';
import type { SetRetentionPolicyRequest } from '../../types/api';

export const RetentionPolicies: React.FC = () => {
  const queryClient = useQueryClient();
  const [showEditGlobal, setShowEditGlobal] = useState(false);
  const [showAddApp, setShowAddApp] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);

  const [globalDays, setGlobalDays] = useState<string>('90');
  const [globalNever, setGlobalNever] = useState(false);

  const [appId, setAppId] = useState('');
  const [appDays, setAppDays] = useState<string>('90');
  const [appNever, setAppNever] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['retentionPolicies'],
    queryFn: getRetentionPolicies,
    refetchInterval: 30000,
  });

  const setGlobalMutation = useMutation({
    mutationFn: (data: SetRetentionPolicyRequest) => setGlobalRetentionPolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] });
      setShowEditGlobal(false);
      setGlobalDays('90');
      setGlobalNever(false);
    },
  });

  const setAppMutation = useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: SetRetentionPolicyRequest }) =>
      setApplicationRetentionPolicy(appId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] });
      setShowAddApp(false);
      setEditingAppId(null);
      setAppId('');
      setAppDays('90');
      setAppNever(false);
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: (appId: string) => deleteApplicationRetentionPolicy(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionPolicies'] });
    },
  });

  const enforceMutation = useMutation({
    mutationFn: enforceRetention,
  });

  const handleSetGlobal = (e: React.FormEvent) => {
    e.preventDefault();

    const request: SetRetentionPolicyRequest = {
      days: globalNever ? null : parseInt(globalDays, 10),
    };

    if (!globalNever && (isNaN(request.days!) || request.days! < 1)) {
      alert('Please enter a valid number of days (minimum 1)');
      return;
    }

    setGlobalMutation.mutate(request);
  };

  const handleSetApp = (e: React.FormEvent) => {
    e.preventDefault();

    if (!appId.trim() && !editingAppId) {
      alert('Please enter an application ID');
      return;
    }

    const request: SetRetentionPolicyRequest = {
      days: appNever ? null : parseInt(appDays, 10),
    };

    if (!appNever && (isNaN(request.days!) || request.days! < 1)) {
      alert('Please enter a valid number of days (minimum 1)');
      return;
    }

    const finalAppId = editingAppId || appId.trim();
    setAppMutation.mutate({ appId: finalAppId, data: request });
  };

  const handleDeleteApp = (applicationId: string) => {
    if (
      confirm(
        `Are you sure you want to delete the retention policy for "${applicationId}"? It will fall back to the global policy.`
      )
    ) {
      deleteAppMutation.mutate(applicationId);
    }
  };

  const handleEditApp = (applicationId: string, currentDays: number | null) => {
    setEditingAppId(applicationId);
    if (currentDays === null) {
      setAppNever(true);
      setAppDays('90');
    } else {
      setAppNever(false);
      setAppDays(currentDays.toString());
    }
    setShowAddApp(true);
  };

  const handleCancelAppForm = () => {
    setShowAddApp(false);
    setEditingAppId(null);
    setAppId('');
    setAppDays('90');
    setAppNever(false);
  };

  const handleEnforce = () => {
    if (
      confirm(
        'This will immediately run retention enforcement and delete data older than the configured policies. Continue?'
      )
    ) {
      enforceMutation.mutate();
    }
  };

  React.useEffect(() => {
    if (data && showEditGlobal) {
      if (data.global_days === null) {
        setGlobalNever(true);
        setGlobalDays('90');
      } else {
        setGlobalNever(false);
        setGlobalDays(data.global_days.toString());
      }
    }
  }, [data, showEditGlobal]);

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="alert alert-error">
        Failed to load retention policies: {(error as Error).message}
      </div>
    );
  }

  const formatDays = (days: number | null): string => {
    if (days === null) return 'Never (keep forever)';
    if (days === 1) return '1 day';
    if (days === 7) return '7 days (1 week)';
    if (days === 30) return '30 days (1 month)';
    if (days === 90) return '90 days (3 months)';
    if (days === 365) return '365 days (1 year)';
    if (days === 730) return '730 days (2 years)';
    return `${days} days`;
  };

  return (
    <div>
      <div className="header">
        <h1>Retention Policies</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleEnforce}
            disabled={enforceMutation.isPending}
          >
            {enforceMutation.isPending ? 'Enforcing...' : 'Enforce Now'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddApp(!showAddApp)}
          >
            {showAddApp ? 'Cancel' : 'Add Application Policy'}
          </button>
        </div>
      </div>

      {enforceMutation.isSuccess && (
        <div className="alert alert-success" style={{ marginBottom: '20px' }}>
          Retention enforcement completed successfully!
          {enforceMutation.data.deleted_sstables !== undefined &&
            ` Deleted ${enforceMutation.data.deleted_sstables} SSTable(s).`}
        </div>
      )}

      {enforceMutation.isError && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          Failed to enforce retention: {(enforceMutation.error as Error).message}
        </div>
      )}

      {/* Global Retention Policy */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
          <div>
            <h2 style={{ marginBottom: '5px' }}>Global Default Policy</h2>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              Applied to all applications without specific policies
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowEditGlobal(!showEditGlobal)}
          >
            {showEditGlobal ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {!showEditGlobal ? (
          <div style={{ fontSize: '16px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
            <strong>Retention Period:</strong> {formatDays(data?.global_days ?? null)}
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
              Enforcement runs every {data?.check_interval_hours || 24} hours
            </div>
          </div>
        ) : (
          <form onSubmit={handleSetGlobal}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={globalNever}
                  onChange={(e) => setGlobalNever(e.target.checked)}
                />
                <span>Never delete (keep forever)</span>
              </label>

              {!globalNever && (
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Delete data older than (days)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    value={globalDays}
                    onChange={(e) => setGlobalDays(e.target.value)}
                    style={{ width: '200px' }}
                  />
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                    Common values: 7, 30, 90, 365
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={setGlobalMutation.isPending}
              >
                {setGlobalMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowEditGlobal(false)}
              >
                Cancel
              </button>
            </div>

            {setGlobalMutation.isError && (
              <div className="alert alert-error" style={{ marginTop: '15px' }}>
                Failed to update global policy: {(setGlobalMutation.error as Error).message}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Add/Edit Application Policy Form */}
      {showAddApp && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '15px' }}>
            {editingAppId ? `Edit Policy for "${editingAppId}"` : 'Add Application Policy'}
          </h2>
          <form onSubmit={handleSetApp}>
            {!editingAppId && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                  Application ID <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., production, test-sensors, critical-devices"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  Enter the exact application ID from your MQTT network server
                </div>
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={appNever}
                  onChange={(e) => setAppNever(e.target.checked)}
                />
                <span>Never delete (keep forever)</span>
              </label>

              {!appNever && (
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Delete data older than (days)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    value={appDays}
                    onChange={(e) => setAppDays(e.target.value)}
                    style={{ width: '200px' }}
                  />
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                    This overrides the global default for this application
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={setAppMutation.isPending}
              >
                {setAppMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelAppForm}
              >
                Cancel
              </button>
            </div>

            {setAppMutation.isError && (
              <div className="alert alert-error" style={{ marginTop: '15px' }}>
                Failed to save application policy: {(setAppMutation.error as Error).message}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Application-Specific Policies */}
      <div className="card">
        <h2 style={{ marginBottom: '15px' }}>
          Application-Specific Policies ({data?.applications.length || 0})
        </h2>

        {!data?.applications.length ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No application-specific policies configured. All applications use the global default.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Application ID</th>
                  <th>Retention Period</th>
                  <th>Created</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((policy) => (
                  <tr key={policy.application_id}>
                    <td>
                      <strong>{policy.application_id}</strong>
                    </td>
                    <td>{formatDays(policy.days)}</td>
                    <td>{formatRelativeTime(policy.created_at)}</td>
                    <td>{formatRelativeTime(policy.updated_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEditApp(policy.application_id, policy.days)}
                          disabled={setAppMutation.isPending}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-error btn-sm"
                          onClick={() => handleDeleteApp(policy.application_id)}
                          disabled={deleteAppMutation.isPending}
                        >
                          {deleteAppMutation.isPending ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Information Card */}
      <div className="card" style={{ marginTop: '20px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ marginBottom: '10px' }}>About Retention Policies</h3>
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151' }}>
          <p style={{ marginBottom: '10px' }}>
            Retention policies automatically delete old data to manage storage costs, comply with privacy
            regulations (GDPR, HIPAA), and optimize database performance.
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>How It Works:</strong>
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '10px' }}>
            <li>
              <strong>Global Default:</strong> Applied to all applications unless overridden
            </li>
            <li>
              <strong>Application-Specific:</strong> Override the global default for specific applications
            </li>
            <li>
              <strong>Conservative Deletion:</strong> If an SSTable contains data from multiple applications,
              the longest retention period is used
            </li>
            <li>
              <strong>Never Delete:</strong> Setting a policy to "never" preserves data indefinitely
            </li>
            <li>
              <strong>Automatic Enforcement:</strong> Runs every {data?.check_interval_hours || 24} hours,
              or trigger manually with "Enforce Now"
            </li>
          </ul>
          <p style={{ marginBottom: '10px' }}>
            <strong>Common Use Cases:</strong>
          </p>
          <ul style={{ marginLeft: '20px' }}>
            <li>Development/Testing: 7 days</li>
            <li>General Monitoring: 30-90 days</li>
            <li>Long-term Analytics: 365 days</li>
            <li>Compliance/Safety-Critical: Never delete</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
