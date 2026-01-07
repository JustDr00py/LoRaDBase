import cron from 'node-cron';
import { backupRepository } from '../db/repositories/backupRepository';
import { exportDeviceTypes } from './deviceTypeLoader';
import { BackupData } from '../types/backup';

const BACKUP_ENABLED = process.env.BACKUP_ENABLED !== 'false'; // Default: true
const BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

/**
 * Create a full system backup
 * @returns Backup data
 */
async function createFullBackup(): Promise<BackupData> {
  console.log('🔄 Creating automatic backup...');

  try {
    // Export servers from database
    const servers = backupRepository.exportServers();

    // Export device types from filesystem
    const deviceTypes = await exportDeviceTypes();

    // Create backup data structure
    const backup: BackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'full',
        source: 'automatic',
      },
      data: {
        servers,
        deviceTypes,
      },
    };

    console.log(`✅ Backup created: ${servers.length} servers, ${deviceTypes.length} device types`);
    return backup;
  } catch (error: any) {
    console.error('❌ Failed to create backup:', error);
    throw error;
  }
}

/**
 * Run automatic backup task
 */
async function runAutomaticBackup(): Promise<void> {
  try {
    console.log('🕐 Running scheduled automatic backup...');

    // Create backup
    const backup = await createFullBackup();

    // Save to file
    const filename = backupRepository.saveAutomaticBackup(backup);
    console.log(`📦 Automatic backup saved: ${filename}`);

    // Cleanup old backups
    const deletedCount = backupRepository.cleanupOldBackups(BACKUP_RETENTION_DAYS);
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
    }

    console.log('✅ Automatic backup completed successfully');
  } catch (error: any) {
    console.error('❌ Automatic backup failed:', error.message);
    // Don't throw - we don't want to crash the server on backup failure
  }
}

/**
 * Start the backup scheduler
 */
export function startBackupScheduler(): void {
  if (!BACKUP_ENABLED) {
    console.log('⏸️  Automatic backups disabled (BACKUP_ENABLED=false)');
    return;
  }

  console.log(`🕐 Starting backup scheduler...`);
  console.log(`   Schedule: ${BACKUP_SCHEDULE}`);
  console.log(`   Retention: ${BACKUP_RETENTION_DAYS} days`);

  // Validate cron schedule
  if (!cron.validate(BACKUP_SCHEDULE)) {
    console.error('❌ Invalid backup schedule:', BACKUP_SCHEDULE);
    console.log('⏸️  Automatic backups disabled due to invalid schedule');
    return;
  }

  // Schedule automatic backups
  cron.schedule(BACKUP_SCHEDULE, async () => {
    await runAutomaticBackup();
  });

  console.log('✅ Backup scheduler started successfully');

  // Run initial cleanup of old backups
  setTimeout(() => {
    const deletedCount = backupRepository.cleanupOldBackups(BACKUP_RETENTION_DAYS);
    if (deletedCount > 0) {
      console.log(`🧹 Initial cleanup: Removed ${deletedCount} old backup(s)`);
    }
  }, 5000); // Wait 5 seconds after startup
}

/**
 * Manually trigger a backup (for testing or manual execution)
 * @returns Filename of created backup
 */
export async function manualBackup(): Promise<string> {
  const backup = await createFullBackup();
  const filename = backupRepository.saveAutomaticBackup(backup);
  backupRepository.cleanupOldBackups(BACKUP_RETENTION_DAYS);
  return filename;
}
