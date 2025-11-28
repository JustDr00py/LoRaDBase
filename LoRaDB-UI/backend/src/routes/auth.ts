import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

const router = Router();

interface GenerateTokenRequest {
  username: string;
  expirationHours?: number;
}

interface TokenResponse {
  token: string;
  expiresIn: number;
  expiresAt: string;
  username: string;
}

/**
 * POST /api/auth/generate-token
 * Generate a JWT token for authentication
 */
router.post('/generate-token', (req: Request, res: Response): void => {
  try {
    const { username, expirationHours }: GenerateTokenRequest = req.body;

    if (!username || typeof username !== 'string' || username.trim() === '') {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Username is required and must be a non-empty string',
      });
      return;
    }

    const expHours = expirationHours || config.jwtExpirationHours;

    if (expHours <= 0 || expHours > 8760) { // Max 1 year
      res.status(400).json({
        error: 'ValidationError',
        message: 'Expiration hours must be between 1 and 8760 (1 year)',
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (expHours * 3600);

    const payload = {
      sub: username.trim(),
      iat: now,
      exp: exp,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
      algorithm: 'HS256',
    });

    const response: TokenResponse = {
      token,
      expiresIn: expHours * 3600,
      expiresAt: new Date(exp * 1000).toISOString(),
      username: username.trim(),
    };

    console.log(`Generated token for user '${username}' (expires in ${expHours}h)`);

    res.json(response);
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to generate token',
    });
  }
});

/**
 * POST /api/auth/verify-token
 * Verify if a token is valid
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

    res.json({
      valid: true,
      username: decoded.sub,
      expiresAt: new Date((decoded.exp || 0) * 1000).toISOString(),
      issuedAt: new Date((decoded.iat || 0) * 1000).toISOString(),
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'TokenExpired',
        message: 'Token has expired',
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

export default router;
