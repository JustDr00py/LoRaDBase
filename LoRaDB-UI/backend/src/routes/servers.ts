import { Router, Request, Response } from 'express';
import { serverRepository } from '../db/repositories/serverRepository';
import { authRepository } from '../db/repositories/authRepository';
import { hashPassword, verifyPassword, validatePassword, passwordsMatch } from '../utils/password';
import { encryptApiKey, clearCachedApiKey } from '../utils/encryption';
import { serverCreationLimiter, serverDeletionLimiter, authLimiter } from '../middleware/rateLimiter';
import { requireMasterAuth } from '../middleware/masterAuth';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import crypto from 'crypto';
import axios from 'axios';

const router = Router();

// Configuration for failed attempt lockout
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Helper to get client IP address
 */
function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
}

/**
 * Helper to validate server name (alphanumeric, spaces, hyphens, underscores only)
 */
function isValidServerName(name: string): boolean {
  return /^[a-zA-Z0-9\s\-_]+$/.test(name);
}

/**
 * Helper to validate host (IP:port, domain:port, or full URL format)
 */
function isValidHost(host: string): boolean {
  // Allow http:// or https:// URLs
  if (host.startsWith('http://') || host.startsWith('https://')) {
    try {
      const url = new URL(host);
      return url.hostname.length > 0;
    } catch {
      return false;
    }
  }

  // Match IP:port or domain:port for backward compatibility
  const ipPortRegex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9.-]+)(:\d{1,5})?$/;
  return ipPortRegex.test(host);
}

/**
 * POST /api/servers
 * Create a new server
 * Rate limited: 10 per hour per IP
 * Requires master password authentication if configured
 */
router.post('/', requireMasterAuth, serverCreationLimiter, async (req: Request, res: Response) => {
  try {
    const { name, host, apiKey, password, passwordConfirm } = req.body;

    // Validate required fields
    if (!name || !host || !apiKey || !password || !passwordConfirm) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'All fields are required',
      });
    }

    // Validate server name
    if (!isValidServerName(name)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Server name can only contain letters, numbers, spaces, hyphens, and underscores',
      });
    }

    // Validate host format
    if (!isValidHost(host)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid host format. Use http://domain, https://domain, IP:port, or domain:port (e.g., https://ldb.example.com or 192.168.1.100:8080)',
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'ValidationError',
        message: passwordValidation.error,
      });
    }

    // Check password confirmation
    if (!passwordsMatch(password, passwordConfirm)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Passwords do not match',
      });
    }

    // Check for duplicate name
    if (serverRepository.nameExists(name)) {
      return res.status(409).json({
        error: 'DuplicateError',
        message: 'A server with this name already exists',
      });
    }

    // Check for duplicate host
    if (serverRepository.hostExists(host)) {
      return res.status(409).json({
        error: 'DuplicateError',
        message: 'A server with this host already exists',
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Encrypt API key
    const encryptedApiKey = encryptApiKey(apiKey, passwordHash);

    // Create server
    const server = serverRepository.create({
      name,
      host,
      encryptedApiKey,
      passwordHash,
    });

    console.log(`✅ Server created: ${server.name} (${server.host}) by ${getClientIp(req)}`);

    // Return public data only
    return res.status(201).json({
      id: server.id,
      name: server.name,
      host: server.host,
      created_at: server.created_at,
    });
  } catch (error) {
    console.error('Error creating server:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to create server',
    });
  }
});

/**
 * GET /api/servers
 * List all servers (public data only)
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const servers = serverRepository.listAll();
    return res.json({ servers });
  } catch (error) {
    console.error('Error listing servers:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to list servers',
    });
  }
});

/**
 * GET /api/servers/:id
 * Get a specific server (public data only)
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    if (isNaN(serverId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid server ID',
      });
    }

    const server = serverRepository.findById(serverId);

    if (!server) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Server not found',
      });
    }

    return res.json({
      id: server.id,
      name: server.name,
      host: server.host,
      created_at: server.created_at,
    });
  } catch (error) {
    console.error('Error getting server:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to get server',
    });
  }
});

/**
 * POST /api/servers/:id/authenticate
 * Authenticate to a server with password
 * Rate limited: 10 per 15 minutes per IP
 */
router.post('/:id/authenticate', authLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    const { password } = req.body;
    const ipAddress = getClientIp(req);

    if (isNaN(serverId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid server ID',
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Password is required',
      });
    }

    // Get server
    const server = serverRepository.findById(serverId);
    if (!server) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Server not found',
      });
    }

    // Check if locked out
    const lockoutStatus = authRepository.isLockedOut(
      serverId,
      ipAddress,
      MAX_FAILED_ATTEMPTS,
      FAILED_ATTEMPT_WINDOW_MINUTES
    );

    if (lockoutStatus.isLocked) {
      console.log(`🔒 Account locked for server ${server.name} from IP ${ipAddress} (${lockoutStatus.minutesRemaining} minutes remaining)`);
      return res.status(429).json({
        error: 'AccountLocked',
        message: `Too many failed attempts. Please try again in ${lockoutStatus.minutesRemaining} minute(s)`,
        minutesRemaining: lockoutStatus.minutesRemaining,
      });
    }

    // Verify password
    const isValid = await verifyPassword(password, server.password_hash);

    if (!isValid) {
      // Record failed attempt
      authRepository.recordFailedAttempt(serverId, ipAddress);

      const remainingAttempts = MAX_FAILED_ATTEMPTS - authRepository.getRecentFailedAttempts(
        serverId,
        ipAddress,
        FAILED_ATTEMPT_WINDOW_MINUTES
      );

      console.log(`❌ Failed auth attempt for server ${server.name} from IP ${ipAddress} (${remainingAttempts} attempts remaining)`);

      return res.status(401).json({
        error: 'InvalidCredentials',
        message: 'Invalid password',
        attemptsRemaining: Math.max(0, remainingAttempts),
      });
    }

    // Clear failed attempts on successful auth
    authRepository.clearFailedAttempts(serverId, ipAddress);

    // Generate session token (random 32-byte hex string)
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Create JWT with server context
    const expirationHours = config.jwtExpirationHours || 1;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expirationHours * 60 * 60;

    const token = jwt.sign(
      {
        sub: sessionToken,
        server_id: serverId,
        iat: now,
        exp,
      },
      config.jwtSecret
    );

    const expiresAt = new Date(exp * 1000).toISOString();

    console.log(`✅ Successful auth for server ${server.name} from IP ${ipAddress} (session expires at ${expiresAt})`);

    return res.json({
      token,
      expiresAt,
      server: {
        id: server.id,
        name: server.name,
        host: server.host,
      },
    });
  } catch (error) {
    console.error('Error authenticating to server:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Authentication failed',
    });
  }
});

/**
 * DELETE /api/servers/:id
 * Delete a server
 * Rate limited: 20 per 15 minutes per IP
 * Requires master password authentication if configured
 */
router.delete('/:id', requireMasterAuth, serverDeletionLimiter, (req: Request, res: Response) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    if (isNaN(serverId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid server ID',
      });
    }

    const server = serverRepository.findById(serverId);

    if (!server) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Server not found',
      });
    }

    // Delete server (cascades to failed_auth_attempts)
    const deleted = serverRepository.delete(serverId);

    if (deleted) {
      // Clear cached API key
      clearCachedApiKey(serverId);

      console.log(`🗑️  Server deleted: ${server.name} (${server.host}) by ${getClientIp(req)}`);

      return res.json({
        message: 'Server deleted successfully',
      });
    } else {
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to delete server',
      });
    }
  } catch (error) {
    console.error('Error deleting server:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to delete server',
    });
  }
});

/**
 * PUT /api/servers/:id
 * Update server name and/or host
 * Requires master password authentication if configured
 */
router.put('/:id', requireMasterAuth, async (req: Request, res: Response) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    const { name, host } = req.body;

    if (isNaN(serverId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid server ID',
      });
    }

    // Get existing server
    const server = serverRepository.findById(serverId);
    if (!server) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Server not found',
      });
    }

    // Validate required fields
    if (!name || !host) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Name and host are required',
      });
    }

    // Validate server name
    if (!isValidServerName(name)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Server name can only contain letters, numbers, spaces, hyphens, and underscores',
      });
    }

    // Validate host format
    if (!isValidHost(host)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid host format. Use http://domain, https://domain, IP:port, or domain:port (e.g., https://ldb.example.com or 192.168.1.100:8080)',
      });
    }

    // Check for duplicate name (exclude current server)
    const existingWithName = serverRepository.listAll().find(
      s => s.name === name && s.id !== serverId
    );
    if (existingWithName) {
      return res.status(409).json({
        error: 'DuplicateError',
        message: 'A server with this name already exists',
      });
    }

    // Check for duplicate host (exclude current server)
    const existingWithHost = serverRepository.listAll().find(
      s => s.host === host && s.id !== serverId
    );
    if (existingWithHost) {
      return res.status(409).json({
        error: 'DuplicateError',
        message: 'A server with this host already exists',
      });
    }

    // Update server
    const updated = serverRepository.update(serverId, { name, host });

    if (updated) {
      console.log(`✏️  Server updated: ${name} (${host}) by ${getClientIp(req)}`);

      return res.json({
        id: updated.id,
        name: updated.name,
        host: updated.host,
        created_at: updated.created_at,
      });
    } else {
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to update server',
      });
    }
  } catch (error) {
    console.error('Error updating server:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to update server',
    });
  }
});

/**
 * POST /api/servers/:id/test-connection
 * Test connection to a LoRaDB server
 */
router.post('/:id/test-connection', async (req: Request, res: Response) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    if (isNaN(serverId)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid server ID',
      });
    }

    const server = serverRepository.findById(serverId);

    if (!server) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Server not found',
      });
    }

    // Test connection to LoRaDB
    try {
      // If host already includes protocol, use as-is. Otherwise prepend http://
      const baseURL = server.host.startsWith('http://') || server.host.startsWith('https://')
        ? server.host
        : `http://${server.host}`;

      const response = await axios.get(`${baseURL}/health`, {
        timeout: 5000,
      });

      if (response.status === 200) {
        return res.json({
          success: true,
          message: 'Connection successful',
          data: response.data,
        });
      } else {
        return res.json({
          success: false,
          message: `Unexpected status code: ${response.status}`,
        });
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        return res.json({
          success: false,
          message: 'Connection refused - server may be offline',
        });
      } else if (error.code === 'ETIMEDOUT') {
        return res.json({
          success: false,
          message: 'Connection timed out',
        });
      } else if (error.code === 'ENOTFOUND') {
        return res.json({
          success: false,
          message: 'Host not found - check the hostname/IP',
        });
      } else {
        return res.json({
          success: false,
          message: error.message || 'Connection failed',
        });
      }
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to test connection',
    });
  }
});

export default router;
