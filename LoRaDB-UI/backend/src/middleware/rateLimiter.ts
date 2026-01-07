import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 * Applies to all API routes
 * Limit: 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
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
 * Limit: 10 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
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
 * Limit: 10 requests per hour per IP
 */
export const serverCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 server creations per hour
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
 * Limit: 20 requests per 15 minutes per IP
 */
export const serverDeletionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 deletions per windowMs
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
 * Limit: 5 requests per 15 minutes per IP
 */
export const masterPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict - only 5 attempts per 15 minutes
  message: {
    error: 'TooManyRequests',
    message: 'Too many master password attempts, please try again later',
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});
