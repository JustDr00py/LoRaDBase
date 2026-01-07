import fs from 'fs';
import path from 'path';
import { DeviceTypeBackup, ValidationResult } from '../types/backup';

// Device types directory - check for Docker mount or local path
const DEVICE_TYPES_DIR =
  process.env.DEVICE_TYPES_DIR ||
  (fs.existsSync('/app/device-types') ? '/app/device-types' : path.join(__dirname, '../../../device-types'));

const INDEX_FILE = path.join(DEVICE_TYPES_DIR, 'index.json');

/**
 * Export all device types from filesystem
 * @returns Array of device type backups
 */
export async function exportDeviceTypes(): Promise<DeviceTypeBackup[]> {
  const deviceTypes: DeviceTypeBackup[] = [];

  try {
    // Check if directory exists
    if (!fs.existsSync(DEVICE_TYPES_DIR)) {
      console.warn(`Device types directory not found: ${DEVICE_TYPES_DIR}`);
      return [];
    }

    // Read index.json to get list of device types
    let indexData: any = { deviceTypes: [] };
    if (fs.existsSync(INDEX_FILE)) {
      const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
      indexData = JSON.parse(indexContent);
    }

    // If no index, scan directory for JSON files
    const deviceTypeFiles =
      indexData.deviceTypes && indexData.deviceTypes.length > 0
        ? indexData.deviceTypes
        : fs
            .readdirSync(DEVICE_TYPES_DIR)
            .filter((file) => file.endsWith('.json') && file !== 'index.json');

    // Read each device type file
    for (const filename of deviceTypeFiles) {
      try {
        const filePath = path.join(DEVICE_TYPES_DIR, filename);
        if (!fs.existsSync(filePath)) {
          console.warn(`Device type file not found: ${filename}`);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const deviceType = JSON.parse(content);

        deviceTypes.push({
          filename: filename,
          content: deviceType,
        });
      } catch (error: any) {
        console.error(`Error reading device type ${filename}:`, error.message);
      }
    }

    console.log(`Exported ${deviceTypes.length} device types`);
    return deviceTypes;
  } catch (error: any) {
    console.error('Error exporting device types:', error);
    return [];
  }
}

/**
 * Import device types to filesystem
 * @param types - Device types to import
 * @returns Import result with counts and errors
 */
export async function importDeviceTypes(
  types: DeviceTypeBackup[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = {
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // Ensure directory exists
    if (!fs.existsSync(DEVICE_TYPES_DIR)) {
      fs.mkdirSync(DEVICE_TYPES_DIR, { recursive: true });
    }

    const importedFilenames: string[] = [];

    // Import each device type
    for (const type of types) {
      try {
        // Validate device type
        const validation = validateDeviceType(type.content);
        if (!validation.valid) {
          result.errors.push(`${type.filename}: ${validation.errors.join(', ')}`);
          result.skipped++;
          continue;
        }

        // Write device type file
        const filePath = path.join(DEVICE_TYPES_DIR, type.filename);
        fs.writeFileSync(filePath, JSON.stringify(type.content, null, 2), 'utf8');

        importedFilenames.push(type.filename);
        result.imported++;
      } catch (error: any) {
        result.errors.push(`${type.filename}: ${error.message}`);
        result.skipped++;
      }
    }

    // Update index.json
    if (importedFilenames.length > 0) {
      try {
        updateDeviceTypesIndex(importedFilenames);
      } catch (error: any) {
        console.error('Error updating index.json:', error.message);
        result.errors.push(`Failed to update index.json: ${error.message}`);
      }
    }

    console.log(`Imported ${result.imported} device types, skipped ${result.skipped}`);
    return result;
  } catch (error: any) {
    throw new Error(`Device type import failed: ${error.message}`);
  }
}

/**
 * Validate device type JSON structure
 * @param deviceType - Device type data to validate
 * @returns Validation result
 */
export function validateDeviceType(deviceType: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!deviceType.deviceType) {
    errors.push('deviceType field is required');
  }

  if (!deviceType.name) {
    errors.push('name field is required');
  }

  if (!Array.isArray(deviceType.measurements)) {
    errors.push('measurements must be an array');
  } else {
    // Validate measurements array
    deviceType.measurements.forEach((measurement: any, index: number) => {
      if (!measurement.id) {
        errors.push(`measurements[${index}]: id is required`);
      }
      if (!measurement.path) {
        errors.push(`measurements[${index}]: path is required`);
      }
      if (!measurement.name) {
        errors.push(`measurements[${index}]: name is required`);
      }
    });
  }

  // Optional but recommended fields
  if (!deviceType.manufacturer) {
    warnings.push('manufacturer field is recommended');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Update index.json with new device types
 * @param newFilenames - New device type filenames to add
 */
function updateDeviceTypesIndex(newFilenames: string[]): void {
  try {
    let indexData: any = { deviceTypes: [] };

    // Read existing index if it exists
    if (fs.existsSync(INDEX_FILE)) {
      const indexContent = fs.readFileSync(INDEX_FILE, 'utf8');
      indexData = JSON.parse(indexContent);
    }

    // Ensure deviceTypes array exists
    if (!Array.isArray(indexData.deviceTypes)) {
      indexData.deviceTypes = [];
    }

    // Add new filenames (avoid duplicates)
    for (const filename of newFilenames) {
      if (!indexData.deviceTypes.includes(filename)) {
        indexData.deviceTypes.push(filename);
      }
    }

    // Sort alphabetically
    indexData.deviceTypes.sort();

    // Write updated index
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf8');
    console.log('Updated device types index.json');
  } catch (error: any) {
    throw new Error(`Failed to update index.json: ${error.message}`);
  }
}

/**
 * Get device types directory path
 * @returns Device types directory path
 */
export function getDeviceTypesDir(): string {
  return DEVICE_TYPES_DIR;
}
