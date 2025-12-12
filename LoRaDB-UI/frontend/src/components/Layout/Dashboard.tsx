import React from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/dateFormatter';

export const Dashboard: React.FC = () => {
  const { isAuthenticated, username, expiresAt, logout, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h1>LoRaDB UI</h1>
        <nav>
          <ul className="sidebar-nav">
            <li><Link to="/" className={isActive('/')}>Dashboard</Link></li>
            <li><Link to="/devices" className={isActive('/devices')}>Devices</Link></li>
            <li><Link to="/query" className={isActive('/query')}>Query</Link></li>
            <li><Link to="/analytics" className={isActive('/analytics')}>Device Analytics</Link></li>
            <li><Link to="/tokens" className={isActive('/tokens')}>API Tokens</Link></li>
            <li><Link to="/retention" className={isActive('/retention')}>Retention Policies</Link></li>
            <li><Link to="/settings" className={isActive('/settings')}>Settings</Link></li>
          </ul>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--sidebar-hover)' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: '10px' }}>
            <strong>{username}</strong>
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', marginBottom: '10px' }}>
            Token expires {formatRelativeTime(expiresAt)}
          </p>
          <button onClick={logout} className="btn btn-danger btn-sm" style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
