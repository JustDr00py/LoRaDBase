import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Format ISO date string for display
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';

  try {
    const date = parseISO(dateString);
    return format(date, 'PPpp'); // e.g., "Apr 29, 2025, 1:45:00 PM"
  } catch (error) {
    return dateString;
  }
}

/**
 * Format ISO date string as relative time
 */
export function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';

  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    return dateString;
  }
}

/**
 * Format date for ISO string (used in queries)
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Get current date in ISO format
 */
export function getCurrentISO(): string {
  return new Date().toISOString();
}

/**
 * Check if token is expired
 */
export function isTokenExpired(expiresAt: string): boolean {
  try {
    const expiry = parseISO(expiresAt);
    return expiry.getTime() < Date.now();
  } catch (error) {
    return true;
  }
}
