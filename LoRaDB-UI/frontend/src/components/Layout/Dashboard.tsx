import React, { useState } from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/dateFormatter';

export const Dashboard: React.FC = () => {
  const { isAuthenticated, selectedServer, sessionExpiresAt, logout, switchServer, isLoading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/servers" replace />;
  }

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  // Toggle sidebar (for FAB button)
  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  // Close sidebar when clicking backdrop or navigation link (mobile/tablet only)
  const handleNavigationClick = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  // Close sidebar when clicking backdrop
  const handleBackdropClick = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="app-container">
      {/* FAB Button (mobile/tablet only) */}
      <button
        className="fab-button"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Backdrop (mobile/tablet only) */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`}
        onClick={handleBackdropClick}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <h1>LoRaDB UI</h1>
        <nav>
          <ul className="sidebar-nav">
            <li><Link to="/" className={isActive('/')} onClick={handleNavigationClick}>Dashboard</Link></li>
            <li><Link to="/devices" className={isActive('/devices')} onClick={handleNavigationClick}>Devices</Link></li>
            <li><Link to="/query" className={isActive('/query')} onClick={handleNavigationClick}>Query</Link></li>
            <li><Link to="/analytics" className={isActive('/analytics')} onClick={handleNavigationClick}>Device Analytics</Link></li>
            <li><Link to="/tokens" className={isActive('/tokens')} onClick={handleNavigationClick}>API Tokens</Link></li>
            <li><Link to="/retention" className={isActive('/retention')} onClick={handleNavigationClick}>Retention Policies</Link></li>
            <li><Link to="/servers/manage" className={isActive('/servers/manage')} onClick={handleNavigationClick}>Manage Servers</Link></li>
            <li><Link to="/settings" className={isActive('/settings')} onClick={handleNavigationClick}>Settings</Link></li>
          </ul>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--sidebar-hover)' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: '5px', fontWeight: 'bold' }}>
            {selectedServer?.name}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', marginBottom: '10px' }}>
            {selectedServer?.host}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', marginBottom: '10px' }}>
            Session expires {formatRelativeTime(sessionExpiresAt)}
          </p>
          <button
            onClick={() => {
              handleNavigationClick();
              switchServer();
            }}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', marginBottom: '5px' }}
          >
            Switch Server
          </button>
          <button
            onClick={() => {
              handleNavigationClick();
              logout();
            }}
            className="btn btn-danger btn-sm"
            style={{ width: '100%' }}
          >
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
