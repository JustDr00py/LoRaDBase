import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATABASE_DIR = path.join(__dirname, '../../data');
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATABASE_DIR, 'servers.db');

// Ensure data directory exists
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}

// Create backup if database exists
if (fs.existsSync(DATABASE_PATH)) {
  const backupPath = `${DATABASE_PATH}.backup.${Date.now()}`;
  try {
    fs.copyFileSync(DATABASE_PATH, backupPath);
    console.log(`📦 Database backed up to ${backupPath}`);
  } catch (error) {
    console.warn('Warning: Could not create database backup:', error);
  }
}

// Initialize database connection
export const db: Database.Database = new Database(DATABASE_PATH, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Set file permissions to 600 (owner read/write only)
try {
  fs.chmodSync(DATABASE_PATH, 0o600);
  console.log('🔒 Database file permissions set to 600 (owner only)');
} catch (error) {
  console.warn('Warning: Could not set database file permissions:', error);
}

// Initialize schema
export function initializeSchema(): void {
  console.log('🗄️  Initializing database schema...');

  // Create servers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      host TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL,
      api_key_iv TEXT NOT NULL,
      api_key_auth_tag TEXT NOT NULL,
      api_key_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create failed_auth_attempts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS failed_auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      ip_address TEXT NOT NULL,
      attempted_at TEXT NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // Create or migrate dashboards table
  // Check if table exists and if it has server_id column
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dashboards'").get() as any;

  if (!tableInfo) {
    // Table doesn't exist, create with server_id
    db.exec(`
      CREATE TABLE dashboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Default Dashboard',
        is_default INTEGER NOT NULL DEFAULT 0,
        version TEXT NOT NULL,
        time_range TEXT NOT NULL,
        auto_refresh INTEGER NOT NULL,
        refresh_interval INTEGER NOT NULL,
        widgets TEXT NOT NULL,
        layouts TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);
  } else {
    // Table exists, check if server_id column exists
    const columnInfo = db.prepare("PRAGMA table_info(dashboards)").all() as any[];
    const hasServerId = columnInfo.some((col) => col.name === 'server_id');

    if (!hasServerId) {
      console.log('🔄 Migrating dashboards table to add server_id column...');

      // SQLite doesn't support ADD COLUMN with foreign key, so we need to recreate the table
      db.exec(`
        BEGIN TRANSACTION;

        -- Rename old table
        ALTER TABLE dashboards RENAME TO dashboards_old;

        -- Create new table with server_id
        CREATE TABLE dashboards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL DEFAULT 'Default Dashboard',
          is_default INTEGER NOT NULL DEFAULT 0,
          version TEXT NOT NULL,
          time_range TEXT NOT NULL,
          auto_refresh INTEGER NOT NULL,
          refresh_interval INTEGER NOT NULL,
          widgets TEXT NOT NULL,
          layouts TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        );

        -- Copy data from old table to new table
        -- Assign all existing dashboards to the first server (if any exists)
        INSERT INTO dashboards (id, server_id, name, is_default, version, time_range, auto_refresh, refresh_interval, widgets, layouts, created_at, updated_at)
        SELECT id, (SELECT id FROM servers LIMIT 1), name, is_default, version, time_range, auto_refresh, refresh_interval, widgets, layouts, created_at, updated_at
        FROM dashboards_old
        WHERE (SELECT COUNT(*) FROM servers) > 0;

        -- Drop old table
        DROP TABLE dashboards_old;

        COMMIT;
      `);

      console.log('✅ Dashboards table migrated successfully');
    }
  }

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_failed_attempts_server
    ON failed_auth_attempts(server_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip
    ON failed_auth_attempts(ip_address)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_failed_attempts_time
    ON failed_auth_attempts(attempted_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dashboards_server
    ON dashboards(server_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dashboards_server_default
    ON dashboards(server_id, is_default)
  `);

  console.log('✅ Database schema initialized successfully');
}

// Run integrity check
export function checkDatabaseIntegrity(): boolean {
  try {
    const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (result[0].integrity_check === 'ok') {
      console.log('✅ Database integrity check passed');
      return true;
    } else {
      console.error('❌ Database integrity check failed:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Database integrity check error:', error);
    return false;
  }
}

// Cleanup old failed attempts (older than 24 hours)
export function cleanupOldFailedAttempts(): void {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare('DELETE FROM failed_auth_attempts WHERE attempted_at < ?');
  const result = stmt.run(cutoffTime);

  if (result.changes > 0) {
    console.log(`🧹 Cleaned up ${result.changes} old failed auth attempts`);
  }
}

// Graceful shutdown
export function closeDatabase(): void {
  console.log('Closing database connection...');
  db.close();
}

// Initialize on import
initializeSchema();
checkDatabaseIntegrity();

// Schedule daily cleanup (run every 24 hours)
setInterval(cleanupOldFailedAttempts, 24 * 60 * 60 * 1000);

export default db;
