import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiToken, listApiTokens, revokeApiToken } from '../../api/endpoints';
import { Loading } from '../Common/Loading';
import { formatRelativeTime } from '../../utils/dateFormatter';
import type { CreateApiTokenRequest } from '../../types/api';

export const TokenManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('365');
  const [neverExpires, setNeverExpires] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['apiTokens'],
    queryFn: listApiTokens,
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateApiTokenRequest) => createApiToken(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
      setNewlyCreatedToken(response.token);
      setTokenName('');
      setExpiresInDays('365');
      setNeverExpires(false);
      setShowCreateForm(false);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => revokeApiToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiTokens'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) {
      alert('Please enter a token name');
      return;
    }

    const request: CreateApiTokenRequest = {
      name: tokenName.trim(),
    };

    if (!neverExpires) {
      const days = parseInt(expiresInDays, 10);
      if (isNaN(days) || days < 1) {
        alert('Please enter a valid number of days (minimum 1)');
        return;
      }
      request.expires_in_days = days;
    }

    createMutation.mutate(request);
  };

  const handleRevoke = (tokenId: string, tokenName: string) => {
    if (confirm(`Are you sure you want to revoke the token "${tokenName}"? This action cannot be undone.`)) {
      revokeMutation.mutate(tokenId);
    }
  };

  const handleCopyToken = async () => {
    if (newlyCreatedToken) {
      try {
        await navigator.clipboard.writeText(newlyCreatedToken);
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } catch (err) {
        alert('Failed to copy token to clipboard');
      }
    }
  };

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="alert alert-error">
        Failed to load API tokens: {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>API Token Management</h1>
        <div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : 'Create New Token'}
          </button>
        </div>
      </div>

      {newlyCreatedToken && (
        <div className="card" style={{ marginBottom: '20px', backgroundColor: '#fffbeb', borderColor: '#f59e0b' }}>
          <div style={{ marginBottom: '10px' }}>
            <strong style={{ color: '#d97706' }}>Token Created Successfully!</strong>
          </div>
          <div style={{ marginBottom: '10px', fontSize: '14px' }}>
            Save this token now - you won't be able to see it again!
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <code style={{
              flex: 1,
              padding: '10px',
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px',
              wordBreak: 'break-all'
            }}>
              {newlyCreatedToken}
            </code>
            <button
              className="btn btn-secondary"
              onClick={handleCopyToken}
            >
              {copiedToken ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
            Store this token securely in a password manager or environment variable.
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: '10px' }}
            onClick={() => setNewlyCreatedToken(null)}
          >
            I've saved the token
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ marginBottom: '15px' }}>Create New API Token</h2>
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                Token Name <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Production Dashboard, Monitoring Script"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                Use a descriptive name indicating the token's purpose
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={neverExpires}
                  onChange={(e) => setNeverExpires(e.target.checked)}
                />
                <span>Never expires</span>
              </label>

              {!neverExpires && (
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Expires in (days)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    style={{ width: '200px' }}
                  />
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                    Common values: 30 (1 month), 90 (3 months), 365 (1 year)
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Token'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>

            {createMutation.isError && (
              <div className="alert alert-error" style={{ marginTop: '15px' }}>
                Failed to create token: {(createMutation.error as Error).message}
              </div>
            )}
          </form>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: '15px' }}>Your API Tokens ({data?.total || 0})</h2>

        {!data?.tokens.length ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No API tokens found. Create one to get started.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((token) => {
                  const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

                  return (
                    <tr key={token.id}>
                      <td>
                        <strong>{token.name}</strong>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          ID: {token.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td>{formatRelativeTime(token.created_at)}</td>
                      <td>{formatRelativeTime(token.last_used_at)}</td>
                      <td>
                        {token.expires_at ? (
                          <span style={{ color: isExpired ? '#ef4444' : 'inherit' }}>
                            {formatRelativeTime(token.expires_at)}
                          </span>
                        ) : (
                          <span style={{ color: '#6b7280' }}>Never</span>
                        )}
                      </td>
                      <td>
                        {!token.is_active ? (
                          <span className="badge badge-error">Revoked</span>
                        ) : isExpired ? (
                          <span className="badge badge-warning">Expired</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-error btn-sm"
                          onClick={() => handleRevoke(token.id, token.name)}
                          disabled={!token.is_active || revokeMutation.isPending}
                        >
                          {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '20px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ marginBottom: '10px' }}>About API Tokens</h3>
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151' }}>
          <p style={{ marginBottom: '10px' }}>
            API tokens are long-lived authentication tokens ideal for dashboards, automated scripts,
            and service integrations. They use the same <code>Authorization: Bearer &lt;token&gt;</code>
            header format as JWT tokens.
          </p>
          <p style={{ marginBottom: '10px' }}>
            <strong>Security Best Practices:</strong>
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '10px' }}>
            <li>Never commit tokens to version control</li>
            <li>Store tokens in environment variables or secrets managers</li>
            <li>Use descriptive names indicating the token's purpose</li>
            <li>Regularly review and revoke unused tokens</li>
            <li>Set appropriate expiration times based on usage</li>
          </ul>
          <p>
            <strong>Token Format:</strong> All API tokens start with <code>ldb_</code> prefix
            for easy identification.
          </p>
        </div>
      </div>
    </div>
  );
};
