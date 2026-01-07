import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import { serverRepository } from '../db/repositories/serverRepository';
import { masterPasswordLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * POST /api/auth/verify-token
 * Verify if a session token is valid
 */
router.post('/verify-token', (req: Request, res: Response): void => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Token is required',
      });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    // Verify server still exists
    const serverId = decoded.server_id;
    if (!serverId || typeof serverId !== 'number') {
      res.status(401).json({
        error: 'InvalidToken',
        message: 'Token does not contain valid server context',
        valid: false,
      });
      return;
    }

    const server = serverRepository.findById(serverId);
    if (!server) {
      res.status(404).json({
        error: 'ServerNotFound',
        message: 'The server associated with this session no longer exists',
        valid: false,
      });
      return;
    }

    res.json({
      valid: true,
      sessionToken: decoded.sub,
      serverId: serverId,
      serverName: server.name,
      serverHost: server.host,
      expiresAt: new Date((decoded.exp || 0) * 1000).toISOString(),
      issuedAt: new Date((decoded.iat || 0) * 1000).toISOString(),
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'TokenExpired',
        message: 'Session has expired',
        valid: false,
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'InvalidToken',
        message: 'Invalid token',
        valid: false,
      });
      return;
    }

    console.error('Error verifying token:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to verify token',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side only - just clears session)
 */
router.post('/logout', (_req: Request, res: Response): void => {
  // Session management is client-side (localStorage)
  // This endpoint is mainly for consistency and future server-side session tracking
  res.json({
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/master-password-status
 * Check if master password protection is enabled
 */
router.get('/master-password-status', (_req: Request, res: Response): void => {
  res.json({
    enabled: !!(config.masterPassword && config.masterPassword.length > 0),
  });
});

/**
 * POST /api/auth/verify-master-password
 * Verify master password and issue a master session token
 * Rate limited: 5 attempts per 15 minutes per IP
 */
router.post('/verify-master-password', masterPasswordLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    // Check if master password protection is enabled
    if (!config.masterPassword || config.masterPassword.length === 0) {
      res.status(400).json({
        error: 'MasterPasswordNotConfigured',
        message: 'Master password protection is not enabled',
      });
      return;
    }

    if (!password) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Password is required',
      });
      return;
    }

    // Verify password (timing-safe comparison to prevent timing attacks)
    // First check if lengths match (constant-time if possible)
    const providedPassword = Buffer.from(password, 'utf8');
    const storedPassword = Buffer.from(config.masterPassword, 'utf8');

    let isValid = false;
    if (providedPassword.length === storedPassword.length) {
      try {
        // Use timing-safe comparison
        isValid = crypto.timingSafeEqual(providedPassword, storedPassword);
      } catch (error) {
        // timingSafeEqual throws if buffers are different lengths (shouldn't happen due to check above)
        isValid = false;
      }
    }

    if (!isValid) {
      res.status(401).json({
        error: 'InvalidPassword',
        message: 'Invalid master password',
      });
      return;
    }

    // Generate master session token
    const now = Math.floor(Date.now() / 1000);
    const expirationSeconds = config.masterSessionHours * 60 * 60;

    const token = jwt.sign(
      {
        type: 'master',
        iat: now,
        exp: now + expirationSeconds,
      },
      config.jwtSecret,
      {
        algorithm: 'HS256',
      }
    );

    const expiresAt = new Date((now + expirationSeconds) * 1000).toISOString();

    res.json({
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Error verifying master password:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to verify master password',
    });
  }
});

export default router;
