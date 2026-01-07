import { Router, Request, Response } from 'express';
import { backupRepository } from '../db/repositories/backupRepository';
import { exportDeviceTypes, importDeviceTypes } from '../utils/deviceTypeLoader';
import { requireMasterAuth } from '../middleware/masterAuth';
import { BackupData, ImportStrategy } from '../types/backup';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for backup operations (10 per 15 minutes per IP)
const backupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many backup operations, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/backup/export
 * Export full system backup
 * Requires master authentication
 * Rate limited: 10 per 15 minutes per IP
 */
router.post('/export', requireMasterAuth, backupLimiter, async (req: Request, res: Response) => {
  try {
    const { includeDeviceTypes = true, saveAutomatic = false, dashboards, settings } = req.body;

    console.log('📦 Exporting backup...');

    // Export servers from database
    const servers = backupRepository.exportServers();

    // Export device types if requested
    const deviceTypes = includeDeviceTypes ? await exportDeviceTypes() : [];

    // Create backup structure
    const backup: BackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'full',
        source: saveAutomatic ? 'automatic' : 'manual',
      },
      data: {
        servers,
        deviceTypes,
        ...(dashboards && { dashboards }), // Include dashboards if provided from frontend
        ...(settings && { settings }), // Include settings if provided from frontend
      },
    };

    // Optionally save to automatic backup directory
    if (saveAutomatic) {
      const filename = backupRepository.saveAutomaticBackup(backup);
      console.log(`✅ Backup saved automatically: ${filename}`);
    }

    console.log(`✅ Backup exported: ${servers.length} servers, ${deviceTypes.length} device types, dashboards: ${dashboards ? 'yes' : 'no'}`);
    return res.json(backup);
  } catch (error: any) {
    console.error('❌ Backup export failed:', error);
    return res.status(500).json({
      error: 'BackupError',
      message: error.message || 'Failed to export backup',
    });
  }
});

/**
 * POST /api/backup/import
 * Import backup data with merge or replace strategy
 * Requires master authentication
 * Rate limited: 10 per 15 minutes per IP
 */
router.post('/import', requireMasterAuth, backupLimiter, async (req: Request, res: Response) => {
  try {
    const { backup, strategy = 'merge' } = req.body;

    // Validate request
    if (!backup || !backup.version || !backup.data) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid backup data structure',
      });
    }

    // Validate strategy
    if (strategy !== 'merge' && strategy !== 'replace') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Strategy must be "merge" or "replace"',
      });
    }

    console.log(`📥 Importing backup with ${strategy} strategy...`);

    // Check version compatibility
    if (!backupRepository.isVersionCompatible(backup.version)) {
      return res.status(400).json({
        error: 'VersionError',
        message: `Backup version ${backup.version} is not compatible with current version`,
      });
    }

    // Import servers
    const serverResult = backupRepository.importServers(
      backup.data.servers || [],
      strategy as ImportStrategy
    );

    // Import device types
    const deviceTypeResult =
      backup.data.deviceTypes && backup.data.deviceTypes.length > 0
        ? await importDeviceTypes(backup.data.deviceTypes)
        : { imported: 0, skipped: 0, errors: [] };

    const result = {
      servers: serverResult,
      deviceTypes: deviceTypeResult,
    };

    console.log(
      `✅ Import completed: ${serverResult.imported} servers, ${deviceTypeResult.imported} device types`
    );

    if (serverResult.errors.length > 0 || deviceTypeResult.errors.length > 0) {
      console.warn('⚠️  Import completed with errors:', {
        serverErrors: serverResult.errors,
        deviceTypeErrors: deviceTypeResult.errors,
      });
    }

    return res.json(result);
  } catch (error: any) {
    console.error('❌ Backup import failed:', error);
    return res.status(500).json({
      error: 'BackupError',
      message: error.message || 'Failed to import backup',
    });
  }
});

/**
 * GET /api/backup/list
 * List automatic backup files
 * Requires master authentication
 */
router.get('/list', requireMasterAuth, async (_req: Request, res: Response) => {
  try {
    const backups = backupRepository.listAutomaticBackups();
    return res.json(backups);
  } catch (error: any) {
    console.error('❌ Failed to list backups:', error);
    return res.status(500).json({
      error: 'BackupError',
      message: error.message || 'Failed to list backups',
    });
  }
});

/**
 * GET /api/backup/download/:filename
 * Download specific automatic backup file
 * Requires master authentication
 */
router.get('/download/:filename', requireMasterAuth, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Security: validate filename
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid filename',
      });
    }

    // Read backup file
    const backup = backupRepository.readBackupFile(filename);

    if (!backup) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Backup file not found',
      });
    }

    return res.json(backup);
  } catch (error: any) {
    console.error('❌ Failed to download backup:', error);
    return res.status(500).json({
      error: 'BackupError',
      message: error.message || 'Failed to download backup',
    });
  }
});

/**
 * DELETE /api/backup/:filename
 * Delete automatic backup file
 * Requires master authentication
 * Rate limited: 10 per 15 minutes per IP
 */
router.delete('/:filename', requireMasterAuth, backupLimiter, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Security: validate filename
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid filename',
      });
    }

    // Only allow deletion of automatic backups
    if (!filename.startsWith('backup-automatic-')) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Can only delete automatic backup files',
      });
    }

    const deleted = backupRepository.deleteBackupFile(filename);

    if (!deleted) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Backup file not found',
      });
    }

    console.log(`🗑️  Deleted backup: ${filename}`);
    return res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error: any) {
    console.error('❌ Failed to delete backup:', error);
    return res.status(500).json({
      error: 'BackupError',
      message: error.message || 'Failed to delete backup',
    });
  }
});

export default router;
