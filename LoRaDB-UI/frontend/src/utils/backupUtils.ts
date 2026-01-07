import type { BackupData } from '../types/api';
import { loadDashboardLayout } from './dashboardStorage';

/**
 * Download backup as JSON file
 * @param backup - Backup data to download
 * @param filename - Optional custom filename
 */
export function downloadBackup(backup: BackupData, filename?: string): void {
  const defaultFilename = `loradb-backup-${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export frontend data (dashboards and settings)
 * @returns Frontend backup data
 */
export function exportFrontendData(): any {
  return {
    dashboards: loadDashboardLayout(),
    settings: {
      showDebugView: localStorage.getItem('settings_showDebugView')
        ? JSON.parse(localStorage.getItem('settings_showDebugView')!)
        : false,
    },
  };
}

/**
 * Import frontend data to localStorage
 * @param dashboards - Dashboard layout data
 * @param settings - Settings data
 */
export function importFrontendData(dashboards: any, settings: any): void {
  // Import dashboard layout
  if (dashboards) {
    localStorage.setItem('loradb-dashboard-layout', JSON.stringify(dashboards));
  }

  // Import settings
  if (settings && typeof settings.showDebugView !== 'undefined') {
    localStorage.setItem('settings_showDebugView', JSON.stringify(settings.showDebugView));
  }
}

/**
 * Validate backup file structure
 * @param data - Parsed backup data
 * @returns Validation result with error message if invalid
 */
export function validateBackupFile(data: any): { valid: boolean; error?: string } {
  if (!data) {
    return { valid: false, error: 'Backup file is empty' };
  }

  if (!data.version) {
    return { valid: false, error: 'Missing version field' };
  }

  if (!data.timestamp) {
    return { valid: false, error: 'Missing timestamp field' };
  }

  if (!data.metadata || !data.metadata.type || !data.metadata.source) {
    return { valid: false, error: 'Invalid metadata structure' };
  }

  if (!data.data) {
    return { valid: false, error: 'Missing data field' };
  }

  if (!Array.isArray(data.data.servers)) {
    return { valid: false, error: 'Invalid servers data (must be an array)' };
  }

  if (data.data.deviceTypes && !Array.isArray(data.data.deviceTypes)) {
    return { valid: false, error: 'Invalid deviceTypes data (must be an array)' };
  }

  return { valid: true };
}

/**
 * Backup current localStorage state before import (for rollback)
 * @returns Backup key to use for rollback
 */
export function backupLocalStorage(): string {
  const backupKey = 'loradb-restore-backup';
  const currentState = {
    dashboard: localStorage.getItem('loradb-dashboard-layout'),
    settings: localStorage.getItem('settings_showDebugView'),
  };
  localStorage.setItem(backupKey, JSON.stringify(currentState));
  return backupKey;
}

/**
 * Restore localStorage from backup (rollback)
 * @param backupKey - Backup key returned from backupLocalStorage
 */
export function restoreLocalStorage(backupKey: string): void {
  const backup = localStorage.getItem(backupKey);
  if (backup) {
    const state = JSON.parse(backup);
    if (state.dashboard) {
      localStorage.setItem('loradb-dashboard-layout', state.dashboard);
    }
    if (state.settings) {
      localStorage.setItem('settings_showDebugView', state.settings);
    }
  }
  localStorage.removeItem(backupKey);
}

/**
 * Clear localStorage backup (after successful import)
 * @param backupKey - Backup key returned from backupLocalStorage
 */
export function clearLocalStorageBackup(backupKey: string): void {
  localStorage.removeItem(backupKey);
}

/**
 * Format file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5 KB", "2.3 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Format timestamp to readable date string
 * @param timestamp - ISO timestamp string
 * @returns Formatted date string
 */
export function formatBackupTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}
