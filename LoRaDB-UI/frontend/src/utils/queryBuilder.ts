import type { QueryConfig } from '../types/api';

/**
 * Build a query string from QueryConfig
 */
export function buildQuery(config: QueryConfig): string {
  const parts: string[] = [];

  // SELECT clause
  if (config.customFields && config.customFields.length > 0) {
    parts.push(`SELECT ${config.customFields.join(', ')}`);
  } else if (config.frameType === 'all') {
    parts.push('SELECT *');
  } else if (config.frameType === 'decoded_payload') {
    // decoded_payload is a field, not a frame type - select uplink frames with specific fields
    parts.push('SELECT uplink');
  } else {
    parts.push(`SELECT ${config.frameType}`);
  }

  // FROM clause
  parts.push(`FROM device '${config.devEui}'`);

  // WHERE clause (time filter)
  if (config.timeRangeType === 'last' && config.lastDuration && config.lastUnit) {
    parts.push(`WHERE LAST '${config.lastDuration}${config.lastUnit}'`);
  } else if (config.timeRangeType === 'since' && config.sinceDate) {
    parts.push(`WHERE SINCE '${config.sinceDate}'`);
  } else if (
    config.timeRangeType === 'between' &&
    config.startDate &&
    config.endDate
  ) {
    parts.push(`WHERE BETWEEN '${config.startDate}' AND '${config.endDate}'`);
  }

  return parts.join(' ');
}

/**
 * Validate query configuration
 */
export function validateQueryConfig(config: QueryConfig): string | null {
  if (!config.devEui || config.devEui.trim() === '') {
    return 'Device EUI is required';
  }

  if (config.timeRangeType === 'last') {
    if (!config.lastDuration || !config.lastUnit) {
      return 'Duration and unit are required for LAST time filter';
    }
    const duration = parseInt(config.lastDuration);
    if (isNaN(duration) || duration <= 0) {
      return 'Duration must be a positive number';
    }
  }

  if (config.timeRangeType === 'since') {
    if (!config.sinceDate) {
      return 'Start date is required for SINCE time filter';
    }
  }

  if (config.timeRangeType === 'between') {
    if (!config.startDate || !config.endDate) {
      return 'Start and end dates are required for BETWEEN time filter';
    }
    if (new Date(config.startDate) >= new Date(config.endDate)) {
      return 'Start date must be before end date';
    }
  }

  return null;
}

/**
 * Get example queries
 */
export const exampleQueries = [
  {
    name: 'All frames from last hour',
    query: "SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'",
  },
  {
    name: 'Uplink frames from last 24 hours',
    query: "SELECT uplink FROM device '0123456789ABCDEF' WHERE LAST '24h'",
  },
  {
    name: 'Decoded payload from last hour',
    query: "SELECT decoded_payload FROM device '0123456789ABCDEF' WHERE LAST '1h'",
  },
  {
    name: 'Nested field - Battery voltage',
    query: "SELECT decoded_payload.object.BatV FROM device '0123456789ABCDEF' WHERE LAST '1h'",
  },
  {
    name: 'Multiple nested fields',
    query: "SELECT decoded_payload.object.BatV, decoded_payload.object.TempC_SHT, f_port FROM device '0123456789ABCDEF' WHERE LAST '1h'",
  },
  {
    name: 'Frames since specific date',
    query: "SELECT * FROM device '0123456789ABCDEF' WHERE SINCE '2025-01-01T00:00:00Z'",
  },
  {
    name: 'Frames in date range',
    query: "SELECT * FROM device '0123456789ABCDEF' WHERE BETWEEN '2025-01-01T00:00:00Z' AND '2025-01-02T00:00:00Z'",
  },
  {
    name: 'Custom fields',
    query: "SELECT f_port, f_cnt, rssi FROM device 'ABCD' WHERE LAST '1h'",
  },
  {
    name: 'All frames without time filter',
    query: "SELECT * FROM device '0123456789ABCDEF'",
  },
];
