import { db } from '../database';
import { serverRepository, Server } from './serverRepository';
import { dashboardRepository } from './dashboardRepository';
import {
  BackupServerData,
  ValidationResult,
  ImportStrategy,
  BackupFile,
} from '../../types/backup';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = path.join(__dirname, '../../../data/backups');
const CURRENT_VERSION = '1.0.0';

class BackupRepository {
  constructor() {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log('📁 Created backup directory:', BACKUP_DIR);
    }
  }

  /**
   * Export all servers with encrypted API keys
   * @returns Array of server data for backup
   */
  exportServers(): BackupServerData[] {
    const stmt = db.prepare(`
      SELECT
        name, host,
        api_key, api_key_iv, api_key_auth_tag, api_key_salt,
        password_hash,
        created_at, updated_at
      FROM servers
      ORDER BY created_at ASC
    `);

    const servers = stmt.all() as Server[];

    return servers.map((server) => ({
      name: server.name,
      host: server.host,
      api_key: server.api_key,
      api_key_iv: server.api_key_iv,
      api_key_auth_tag: server.api_key_auth_tag,
      api_key_salt: server.api_key_salt,
      password_hash: server.password_hash,
      created_at: server.created_at,
      updated_at: server.updated_at,
    }));
  }

  /**
   * Export all dashboards (from all servers)
   * @returns Array of dashboards for backup with server names
   */
  exportDashboards(): any[] {
    // Get all dashboards across all servers
    const stmt = db.prepare(`
      SELECT d.*, s.name as server_name
      FROM dashboards d
      JOIN servers s ON d.server_id = s.id
      ORDER BY s.name, d.is_default DESC, d.created_at DESC
    `);
    const dashboards = stmt.all() as any[];

    // Return dashboards with parsed JSON and server reference
    return dashboards.map((d) => ({
      server_name: d.server_name,  // Reference server by name for portability
      name: d.name,
      is_default: d.is_default === 1,
      version: d.version,
      time_range: d.time_range,
      auto_refresh: d.auto_refresh === 1,
      refresh_interval: d.refresh_interval,
      widgets: JSON.parse(d.widgets),
      layouts: JSON.parse(d.layouts),
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  }

  /**
   * Import dashboards with merge or replace strategy
   * @param dashboards - Dashboards to import (with server_name reference)
   * @param strategy - Import strategy (merge or replace)
   * @returns Import result with counts and errors
   */
  importDashboards(
    dashboards: any[],
    strategy: ImportStrategy
  ): { imported: number; skipped: number; errors: string[] } {
    const result = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    if (!dashboards || dashboards.length === 0) {
      return result;
    }

    try {
      db.transaction(() => {
        // Replace strategy: delete all existing dashboards
        if (strategy === 'replace') {
          const deleteStmt = db.prepare('DELETE FROM dashboards');
          const deleteResult = deleteStmt.run();
          console.log(`Deleted ${deleteResult.changes} existing dashboards for replace strategy`);
        }

        // Import each dashboard
        for (const dashboard of dashboards) {
          try {
            // Validate dashboard data
            if (!dashboard.version || !dashboard.time_range) {
              result.errors.push(`Invalid dashboard data`);
              result.skipped++;
              continue;
            }

            // Map server name to server ID
            if (!dashboard.server_name) {
              result.errors.push(`Dashboard missing server_name reference`);
              result.skipped++;
              continue;
            }

            const server = serverRepository.findByName(dashboard.server_name);
            if (!server) {
              result.errors.push(`Server '${dashboard.server_name}' not found (skipped dashboard)`);
              result.skipped++;
              continue;
            }

            // For merge strategy, skip if it's a default dashboard and one already exists for this server
            if (strategy === 'merge' && dashboard.is_default) {
              const existingDefault = dashboardRepository.getDefault(server.id);
              if (existingDefault) {
                result.errors.push(`Default dashboard for server '${dashboard.server_name}' already exists (skipped)`);
                result.skipped++;
                continue;
              }
            }

            // Create dashboard
            const created = dashboardRepository.create({
              serverId: server.id,
              name: dashboard.name || 'Imported Dashboard',
              version: dashboard.version,
              timeRange: dashboard.time_range,
              autoRefresh: dashboard.auto_refresh !== false,
              refreshInterval: dashboard.refresh_interval || 60,
              widgets: dashboard.widgets || [],
              layouts: dashboard.layouts || { lg: [] },
            });

            // Set as default if it was default in backup
            if (dashboard.is_default) {
              dashboardRepository.setDefault(created.id);
            }

            result.imported++;
          } catch (error: any) {
            result.errors.push(`Dashboard import failed: ${error.message}`);
            result.skipped++;
          }
        }
      })();
    } catch (error: any) {
      throw new Error(`Dashboard import failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Import servers with merge or replace strategy
   * @param servers - Servers to import
   * @param strategy - Import strategy (merge or replace)
   * @returns Import result with counts and errors
   */
  importServers(
    servers: BackupServerData[],
    strategy: ImportStrategy
  ): { imported: number; skipped: number; errors: string[] } {
    const result = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      // Use transaction for atomic operation
      db.transaction(() => {
        // Replace strategy: delete all existing servers
        if (strategy === 'replace') {
          const deleteStmt = db.prepare('DELETE FROM servers');
          const deleteResult = deleteStmt.run();
          console.log(`Deleted ${deleteResult.changes} existing servers for replace strategy`);
        }

        // Import each server
        for (const server of servers) {
          try {
            // Validate server data
            const validation = this.validateServerData(server);
            if (!validation.valid) {
              result.errors.push(`${server.name}: ${validation.errors.join(', ')}`);
              result.skipped++;
              continue;
            }

            // Check for conflicts
            let serverName = server.name;
            const existingByName = serverRepository.findByName(serverName);
            const existingByHost = serverRepository.findByHost(server.host);

            if (strategy === 'merge') {
              // Skip if host already exists (security concern)
              if (existingByHost) {
                result.errors.push(
                  `${server.name}: Host ${server.host} already exists (skipped for security)`
                );
                result.skipped++;
                continue;
              }

              // Resolve name conflict by appending timestamp
              if (existingByName) {
                const timestamp = new Date().toISOString().split('T')[0];
                let counter = 1;
                serverName = `${server.name} (${timestamp})`;

                while (serverRepository.findByName(serverName)) {
                  serverName = `${server.name} (${timestamp}-${counter})`;
                  counter++;
                }

                console.log(`Renamed ${server.name} to ${serverName} to avoid conflict`);
              }
            }

            // Insert server
            const insertStmt = db.prepare(`
              INSERT INTO servers (
                name, host,
                api_key, api_key_iv, api_key_auth_tag, api_key_salt,
                password_hash,
                created_at, updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insertStmt.run(
              serverName,
              server.host,
              server.api_key,
              server.api_key_iv,
              server.api_key_auth_tag,
              server.api_key_salt,
              server.password_hash,
              server.created_at,
              server.updated_at || new Date().toISOString()
            );

            result.imported++;
          } catch (error: any) {
            result.errors.push(`${server.name}: ${error.message}`);
            result.skipped++;
          }
        }
      })();
    } catch (error: any) {
      throw new Error(`Import failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate server data structure
   * @param server - Server data to validate
   * @returns Validation result
   */
  validateServerData(server: BackupServerData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!server.name) errors.push('Server name is required');
    if (!server.host) errors.push('Server host is required');
    if (!server.api_key) errors.push('API key is required');
    if (!server.password_hash) errors.push('Password hash is required');

    // Encryption fields
    if (!server.api_key_iv || !server.api_key_auth_tag || !server.api_key_salt) {
      errors.push('Missing encryption fields (iv, auth_tag, or salt)');
    }

    // Format validation
    if (server.name && !/^[a-zA-Z0-9\s\-_().]+$/.test(server.name)) {
      errors.push('Invalid server name format');
    }

    if (server.host && !/^https?:\/\/.+/.test(server.host)) {
      warnings.push('Host should start with http:// or https://');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate backup data version compatibility
   * @param version - Backup version string
   * @returns True if compatible, false otherwise
   */
  isVersionCompatible(version: string): boolean {
    const [backupMajor] = version.split('.').map(Number);
    const [currentMajor] = CURRENT_VERSION.split('.').map(Number);

    // Same major version = compatible
    return backupMajor === currentMajor;
  }

  /**
   * List automatic backup files
   * @returns Array of backup files with metadata
   */
  listAutomaticBackups(): BackupFile[] {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return [];
      }

      const files = fs.readdirSync(BACKUP_DIR);
      const backupFiles = files
        .filter((file) => file.startsWith('backup-automatic-') && file.endsWith('.json'))
        .map((file) => {
          const filePath = path.join(BACKUP_DIR, file);
          const stats = fs.statSync(filePath);

          // Extract timestamp from filename: backup-automatic-YYYY-MM-DD-HHmmss.json
          const match = file.match(/backup-automatic-(.+)\.json$/);
          let timestamp = '';
          if (match) {
            // Convert YYYY-MM-DD-HHmmss to YYYY-MM-DDTHH:mm:ss
            const parts = match[1].split('-');
            if (parts.length === 4 && parts[3].length === 6) {
              const date = parts.slice(0, 3).join('-'); // YYYY-MM-DD
              const time = parts[3]; // HHmmss
              const formattedTime = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`; // HH:mm:ss
              timestamp = `${date}T${formattedTime}`;
            }
          }

          return {
            filename: file,
            timestamp: timestamp || stats.mtime.toISOString(),
            size: stats.size,
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return backupFiles;
    } catch (error: any) {
      console.error('Error listing backups:', error);
      return [];
    }
  }

  /**
   * Read automatic backup file
   * @param filename - Backup filename
   * @returns Backup data or null if not found
   */
  readBackupFile(filename: string): any | null {
    try {
      // Security: ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid filename');
      }

      const filePath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error: any) {
      console.error('Error reading backup file:', error);
      return null;
    }
  }

  /**
   * Save automatic backup file
   * @param data - Backup data to save
   * @returns Filename of saved backup
   */
  saveAutomaticBackup(data: any): string {
    try {
      // Create filename: backup-automatic-YYYY-MM-DD-HHmmss.json
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHmmss
      const filename = `backup-automatic-${dateStr}-${timeStr}.json`;

      const filePath = path.join(BACKUP_DIR, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

      // Set file permissions to 600 (owner read/write only)
      fs.chmodSync(filePath, 0o600);

      console.log(`✅ Automatic backup saved: ${filename}`);
      return filename;
    } catch (error: any) {
      console.error('Error saving backup:', error);
      throw new Error(`Failed to save backup: ${error.message}`);
    }
  }

  /**
   * Delete automatic backup file
   * @param filename - Backup filename to delete
   * @returns True if deleted, false otherwise
   */
  deleteBackupFile(filename: string): boolean {
    try {
      // Security: ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid filename');
      }

      const filePath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return false;
      }

      fs.unlinkSync(filePath);
      console.log(`🗑️  Deleted backup: ${filename}`);
      return true;
    } catch (error: any) {
      console.error('Error deleting backup:', error);
      return false;
    }
  }

  /**
   * Cleanup old automatic backups
   * @param keepDays - Number of days to keep backups
   * @returns Number of backups deleted
   */
  cleanupOldBackups(keepDays: number = 7): number {
    try {
      const backups = this.listAutomaticBackups();
      const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const backup of backups) {
        const backupDate = new Date(backup.timestamp);
        if (backupDate < cutoffDate) {
          if (this.deleteBackupFile(backup.filename)) {
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
      }

      return deletedCount;
    } catch (error: any) {
      console.error('Error cleaning up backups:', error);
      return 0;
    }
  }
}

export const backupRepository = new BackupRepository();
