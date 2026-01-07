import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import { serverRepository } from '../db/repositories/serverRepository';
import { getDecryptedApiKey } from '../utils/encryption';

// Extend Express Request type to include server context
declare global {
  namespace Express {
    interface Request {
      loradbClient?: AxiosInstance;
      server?: {
        id: number;
        name: string;
        host: string;
      };
      sessionToken?: string;
    }
  }
}

/**
 * Middleware to extract server context from JWT and setup LoRaDB client
 * This middleware should be applied to all proxy routes
 */
export async function serverContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract JWT token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization token provided',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify and decode JWT
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'TokenExpired',
          message: 'Session expired',
        });
        return;
      } else if (error.name === 'JsonWebTokenError') {
        res.status(401).json({
          error: 'InvalidToken',
          message: 'Invalid token',
        });
        return;
      } else {
        throw error;
      }
    }

    // Extract server_id from JWT payload
    const serverId = decoded.server_id;
    const sessionToken = decoded.sub;

    if (!serverId || typeof serverId !== 'number') {
      res.status(401).json({
        error: 'InvalidToken',
        message: 'Token does not contain valid server context',
      });
      return;
    }

    // Get server from database
    const server = serverRepository.findById(serverId);
    if (!server) {
      res.status(404).json({
        error: 'ServerNotFound',
        message: 'The server associated with this session no longer exists',
      });
      return;
    }

    // Get encrypted API key data
    const encryptedApiKey = serverRepository.getEncryptedApiKey(serverId);
    if (!encryptedApiKey) {
      console.error(`Failed to retrieve encrypted credentials for server ${serverId}`);
      res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to retrieve server credentials',
      });
      return;
    }

    // Decrypt API key (uses cache internally)
    let apiKey: string;
    try {
      apiKey = getDecryptedApiKey(serverId, encryptedApiKey, server.password_hash);
    } catch (error) {
      console.error(`Failed to decrypt API key for server ${serverId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({
        error: 'InternalServerError',
        message: 'Failed to decrypt server credentials',
      });
      return;
    }

    // Create axios client for this specific server
    // If host already includes protocol, use as-is. Otherwise prepend http://
    const baseURL = server.host.startsWith('http://') || server.host.startsWith('https://')
      ? server.host
      : `http://${server.host}`;

    const loradbClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    // Attach server context to request
    req.loradbClient = loradbClient;
    req.server = {
      id: server.id,
      name: server.name,
      host: server.host,
    };
    req.sessionToken = sessionToken;

    next();
  } catch (error) {
    console.error('Error in serverContextMiddleware:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to setup server context',
    });
  }
}
