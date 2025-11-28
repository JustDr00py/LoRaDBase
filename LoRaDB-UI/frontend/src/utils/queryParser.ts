/**
 * Parse the SELECT clause from a LoRaDB query to extract field names
 * @param query - The full query string
 * @returns Array of field names or null if unable to parse
 */
export function parseSelectFields(query: string): string[] | null {
  if (!query) return null;

  // Match SELECT clause (everything between SELECT and FROM)
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return null;

  const selectClause = selectMatch[1].trim();

  // Handle wildcard
  if (selectClause === '*') {
    return ['*'];
  }

  // Handle predefined frame types
  if (['uplink', 'downlink', 'join', 'decoded_payload'].includes(selectClause.toLowerCase())) {
    return [selectClause];
  }

  // Parse comma-separated fields
  const fields = selectClause
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);

  return fields.length > 0 ? fields : null;
}

/**
 * Extract a value from a nested object using dot notation path
 * @param obj - The object to extract from
 * @param path - Dot-notation path (e.g., "decoded_payload.object.TempC_SHT")
 * @returns The value at the path, or undefined if not found
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }

  return value;
}

/**
 * Convert a field path to a human-readable column header
 * @param field - Field path (e.g., "decoded_payload.object.TempC_SHT")
 * @returns Formatted header (e.g., "TempC_SHT")
 */
export function formatColumnHeader(field: string): string {
  if (!field) return '';

  // Special case for received_at
  if (field === 'received_at') {
    return 'Received At';
  }

  // Special case for f_port and f_cnt
  if (field === 'f_port') {
    return 'F Port';
  }
  if (field === 'f_cnt') {
    return 'F Cnt';
  }

  // For nested paths, use the last segment
  const parts = field.split('.');
  const lastPart = parts[parts.length - 1];

  // Convert snake_case to Title Case
  return lastPart
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a value for display in the table
 * @param value - The value to format
 * @returns Formatted string representation
 */
export function formatCellValue(value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}
