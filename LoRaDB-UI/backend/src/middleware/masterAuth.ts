import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * Middleware to require master password authentication
 * Protects routes that should only be accessible with master password
 */
export async function requireMasterAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // If no master password configured, allow through (backward compatibility)
    if (!config.masterPassword || config.masterPassword.length === 0) {
      next();
      return;
    }

    // Extract master token from header
    const masterToken = req.headers['x-master-token'] as string;

    if (!masterToken) {
      res.status(401).json({
        error: 'MasterAuthRequired',
        message: 'Master password authentication required',
      });
      return;
    }

    // Verify JWT signature
    const decoded = jwt.verify(masterToken, config.jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    // Check that this is a master token
    if (decoded.type !== 'master') {
      res.status(401).json({
        error: 'InvalidMasterToken',
        message: 'Invalid master authentication token',
      });
      return;
    }

    // Token is valid, proceed
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'MasterTokenExpired',
        message: 'Master session has expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'InvalidMasterToken',
        message: 'Invalid master authentication token',
      });
      return;
    }

    console.error('Error verifying master token:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to verify master authentication',
    });
  }
}
