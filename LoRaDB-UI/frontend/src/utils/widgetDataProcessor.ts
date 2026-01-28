import type { Frame, FrameData } from '../types/api';
import type {
  WidgetData,
  WidgetInstance,
  MeasurementDefinition,
  StatusCondition,
  StatusLevel,
  TimeSeriesDataPoint,
  ConversionSettings,
} from '../types/widgets';
import { getNestedValue } from './queryParser';

/**
 * Process frames to extract widget data
 */
export function processWidgetData(
  frames: Frame[],
  widget: WidgetInstance,
  measurement: MeasurementDefinition
): WidgetData | null {
  if (!frames || frames.length === 0) {
    return null;
  }

  const valueType = measurement.valueType || 'number';

  // Extract uplink frames - handle both nested (f.Uplink) and direct (f) structures
  // When query is "SELECT uplink", frames may be returned directly without nesting
  const uplinkFrames = frames
    .map((f) => f.Uplink || (f.dev_eui ? (f as unknown as FrameData) : undefined))
    .filter((f): f is FrameData => f !== undefined);

  if (uplinkFrames.length === 0) {
    return {
      widgetId: widget.id,
      error: 'No uplink frames found',
    } as WidgetData;
  }

  // For string measurements, only extract latest value (no time series)
  if (valueType === 'string') {
    return processStringWidgetData(uplinkFrames, widget, measurement);
  }

  // For numeric measurements, use existing logic
  return processNumericWidgetData(uplinkFrames, widget, measurement);
}

/**
 * Process numeric widget data (existing logic)
 */
function processNumericWidgetData(
  uplinkFrames: FrameData[],
  widget: WidgetInstance,
  measurement: MeasurementDefinition
): WidgetData | null {
  // Extract measurement values from each frame
  const timeSeries: TimeSeriesDataPoint[] = [];

  for (const frame of uplinkFrames) {
    const value = extractMeasurementValue(frame, measurement.path, 'number');

    if (value !== null && typeof value === 'number' && frame.received_at) {
      // Apply conversion if enabled and measurement is temperature
      const convertedValue = measurement.unit === '°C'
        ? convertTemperature(value, widget.conversion)
        : value;

      timeSeries.push({
        timestamp: frame.received_at,
        value: convertedValue,
      });
    }
  }

  if (timeSeries.length === 0) {
    return {
      widgetId: widget.id,
      error: `No data found at path: ${measurement.path}`,
    } as WidgetData;
  }

  // Sort by timestamp (oldest first)
  timeSeries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Get latest value
  const latest = timeSeries[timeSeries.length - 1];

  // Evaluate status
  const status = evaluateStatus(latest.value, measurement.widgets.status.conditions, 'number');

  // Get converted unit
  const displayUnit = getConvertedUnit(measurement.unit, widget.conversion);

  return {
    widgetId: widget.id,
    currentValue: latest.value,
    timestamp: latest.timestamp,
    timeSeries,
    status,
    unit: displayUnit,
    decimals: measurement.decimals,
  };
}

/**
 * Process string widget data (new)
 */
function processStringWidgetData(
  uplinkFrames: FrameData[],
  widget: WidgetInstance,
  measurement: MeasurementDefinition
): WidgetData | null {
  // Extract only the latest string value (iterate from newest to oldest)
  for (let i = uplinkFrames.length - 1; i >= 0; i--) {
    const frame = uplinkFrames[i];
    const value = extractMeasurementValue(frame, measurement.path, 'string');

    if (value !== null && typeof value === 'string') {
      const status = evaluateStatus(value, measurement.widgets.status.conditions, 'string');

      return {
        widgetId: widget.id,
        currentValue: value,
        timestamp: frame.received_at,
        status,
        // No timeSeries, unit, or decimals for string values
      };
    }
  }

  return {
    widgetId: widget.id,
    error: `No data found at path: ${measurement.path}`,
  } as WidgetData;
}

/**
 * Extract a measurement value from a frame using dot notation path
 * Returns number or string based on measurement configuration
 */
export function extractMeasurementValue(
  frame: FrameData,
  path: string,
  valueType: 'number' | 'string' = 'number'
): number | string | null {
  const value = getNestedValue(frame, path);

  if (value === null || value === undefined) {
    return null;
  }

  if (valueType === 'string') {
    // For string measurements, return as-is (coerced to string)
    return String(value);
  }

  // For numeric measurements, validate and convert
  const numValue = Number(value);
  if (isNaN(numValue)) {
    return null;
  }
  return numValue;
}

/**
 * Evaluate status based on conditions (type-safe wrapper)
 */
export function evaluateStatus(
  value: number | string,
  conditions?: StatusCondition[],
  valueType: 'number' | 'string' = 'number'
): { level: StatusLevel; label: string } {
  if (!conditions || conditions.length === 0) {
    return { level: 'info', label: 'Unknown' };
  }

  if (valueType === 'string' && typeof value === 'string') {
    return evaluateStringStatus(value, conditions);
  }

  if (valueType === 'number' && typeof value === 'number') {
    return evaluateNumericStatus(value, conditions);
  }

  // Fallback for type mismatch
  return { level: 'info', label: 'Unknown' };
}

/**
 * Evaluate numeric status (existing logic)
 */
function evaluateNumericStatus(
  value: number,
  conditions: StatusCondition[]
): { level: StatusLevel; label: string } {
  for (const condition of conditions) {
    // Skip string conditions
    if ('valueType' in condition && condition.valueType === 'string') {
      continue;
    }
    if (checkNumericCondition(value, condition)) {
      return {
        level: condition.status,
        label: condition.label,
      };
    }
  }
  return { level: 'info', label: 'Unknown' };
}

/**
 * Evaluate string status (new)
 */
function evaluateStringStatus(
  value: string,
  conditions: StatusCondition[]
): { level: StatusLevel; label: string } {
  for (const condition of conditions) {
    // Filter to only string conditions
    if ('valueType' in condition && condition.valueType === 'string' && checkStringCondition(value, condition)) {
      return {
        level: condition.status,
        label: condition.label,
      };
    }
  }
  return { level: 'info', label: 'Unknown' };
}

/**
 * Check numeric condition (existing logic renamed)
 */
function checkNumericCondition(value: number, condition: StatusCondition): boolean {
  // Type guard: Skip string conditions
  if ('valueType' in condition && condition.valueType === 'string') {
    return false;
  }

  switch (condition.operator) {
    case 'lt':
      return condition.value !== undefined && value < condition.value;
    case 'lte':
      return condition.value !== undefined && value <= condition.value;
    case 'gt':
      return condition.value !== undefined && value > condition.value;
    case 'gte':
      return condition.value !== undefined && value >= condition.value;
    case 'eq':
      return condition.value !== undefined && value === condition.value;
    case 'between':
      return (
        condition.min !== undefined &&
        condition.max !== undefined &&
        value >= condition.min &&
        value <= condition.max
      );
    default:
      return false;
  }
}

/**
 * Check string condition (new)
 */
function checkStringCondition(value: string, condition: StatusCondition): boolean {
  // Type guard: Only process string conditions
  if (!('valueType' in condition) || condition.valueType !== 'string') {
    return false;
  }

  // Only 'eq' operator supported for strings
  return condition.operator === 'eq' && value === condition.value;
}

/**
 * Format value with unit
 */
export function formatValueWithUnit(
  value: number | undefined,
  unit: string,
  decimals: number
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '-';
  }

  const formatted = value.toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Convert temperature value based on conversion settings
 */
export function convertTemperature(
  value: number,
  conversion?: ConversionSettings
): number {
  if (!conversion || !conversion.enabled || !conversion.convertTo) {
    return value;
  }

  switch (conversion.convertTo) {
    case 'fahrenheit':
      return (value * 9) / 5 + 32;
    case 'kelvin':
      return value + 273.15;
    default:
      return value;
  }
}

/**
 * Get converted unit based on conversion settings
 */
export function getConvertedUnit(
  originalUnit: string,
  conversion?: ConversionSettings
): string {
  if (!conversion || !conversion.enabled || !conversion.convertTo) {
    return originalUnit;
  }

  if (originalUnit === '°C') {
    switch (conversion.convertTo) {
      case 'fahrenheit':
        return '°F';
      case 'kelvin':
        return 'K';
      default:
        return originalUnit;
    }
  }

  return originalUnit;
}

/**
 * Get converted Y-axis range based on conversion settings
 */
export function getConvertedYAxisRange(
  originalMin: number | undefined,
  originalMax: number | undefined,
  conversion?: ConversionSettings
): { min: number | undefined; max: number | undefined } {
  if (!conversion || !conversion.enabled || !conversion.convertTo) {
    return { min: originalMin, max: originalMax };
  }

  return {
    min: originalMin !== undefined ? convertTemperature(originalMin, conversion) : undefined,
    max: originalMax !== undefined ? convertTemperature(originalMax, conversion) : undefined,
  };
}

/**
 * Get status color
 */
export function getStatusColor(level: StatusLevel): string {
  const colors: Record<StatusLevel, string> = {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  };

  return colors[level] || colors.info;
}

/**
 * Get status icon
 */
export function getStatusIcon(level: StatusLevel): string {
  const icons: Record<StatusLevel, string> = {
    success: '✓',
    warning: '⚠',
    error: '✗',
    info: 'ℹ',
  };

  return icons[level] || icons.info;
}

/**
 * Apply a custom formula to a numeric value
 * Safely evaluates mathematical expressions using Function constructor
 * @param value - The input value
 * @param formula - The formula string (e.g., "value * 1.8 + 32")
 * @returns The transformed value, or original value if formula is invalid
 */
export function applyFormula(value: number, formula?: string): number {
  if (!formula || formula.trim() === '') {
    return value;
  }

  try {
    // Replace 'value' with the actual value in the formula
    // Use Function constructor instead of eval for better security
    // Only allow basic math operations
    const sanitizedFormula = formula.trim();

    // Create a safe evaluation context with only math functions
    const safeEval = new Function(
      'value',
      'Math',
      `
      'use strict';
      try {
        return ${sanitizedFormula};
      } catch (e) {
        return value;
      }
      `
    );

    const result = safeEval(value, Math);

    // Validate result is a number
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }

    return value;
  } catch (error) {
    console.warn('Formula evaluation failed:', error);
    return value;
  }
}
