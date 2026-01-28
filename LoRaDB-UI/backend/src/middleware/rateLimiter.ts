import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

/**
 * General API rate limiter
 * Applies to all API routes
 * Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX environment variables
 */
export const generalLimiter = rateLimit({
  windowMs: config.rateLimits.general.windowMs,
  max: config.rateLimits.general.max,
  message: {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Authentication endpoint rate limiter
 * More strict limit for authentication attempts
 * Configurable via AUTH_RATE_LIMIT_WINDOW_MS and AUTH_RATE_LIMIT_MAX environment variables
 */
export const authLimiter = rateLimit({
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  message: {
    error: 'TooManyRequests',
    message: 'Too many authentication attempts, please try again later',
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Server creation rate limiter
 * Very strict limit to prevent database spam
 * Configurable via SERVER_CREATION_RATE_LIMIT_WINDOW_MS and SERVER_CREATION_RATE_LIMIT_MAX environment variables
 */
export const serverCreationLimiter = rateLimit({
  windowMs: config.rateLimits.serverCreation.windowMs,
  max: config.rateLimits.serverCreation.max,
  message: {
    error: 'TooManyRequests',
    message: 'Too many server creation attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Server deletion rate limiter
 * Prevent rapid deletion attacks
 * Configurable via SERVER_DELETION_RATE_LIMIT_WINDOW_MS and SERVER_DELETION_RATE_LIMIT_MAX environment variables
 */
export const serverDeletionLimiter = rateLimit({
  windowMs: config.rateLimits.serverDeletion.windowMs,
  max: config.rateLimits.serverDeletion.max,
  message: {
    error: 'TooManyRequests',
    message: 'Too many deletion attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Master password authentication rate limiter
 * Very strict limit to prevent brute force attacks
 * Configurable via MASTER_PASSWORD_RATE_LIMIT_WINDOW_MS and MASTER_PASSWORD_RATE_LIMIT_MAX environment variables
 */
export const masterPasswordLimiter = rateLimit({
  windowMs: config.rateLimits.masterPassword.windowMs,
  max: config.rateLimits.masterPassword.max,
  message: {
    error: 'TooManyRequests',
    message: 'Too many master password attempts, please try again later',
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});
