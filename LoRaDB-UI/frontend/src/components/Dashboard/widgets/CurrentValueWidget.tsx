import React from 'react';
import type { WidgetData, CurrentValueWidgetConfig, MeasurementDefinition, Threshold } from '../../../types/widgets';
import { formatRelativeTime } from '../../../utils/dateFormatter';

interface CurrentValueWidgetProps {
  data: WidgetData;
  measurement: MeasurementDefinition;
  config: CurrentValueWidgetConfig;
  showThresholdLabels?: boolean;
}

/**
 * Evaluate if a value matches a threshold condition
 */
const matchesThreshold = (value: number, threshold: Threshold): boolean => {
  // Handle legacy format with just min/max (no operator)
  if (!threshold.operator && threshold.min !== undefined && threshold.max !== undefined) {
    return value >= threshold.min && value < threshold.max;
  }

  // Handle operator-based format
  switch (threshold.operator) {
    case '<':
      return threshold.value !== undefined && value < threshold.value;
    case '<=':
      return threshold.value !== undefined && value <= threshold.value;
    case '>':
      return threshold.value !== undefined && value > threshold.value;
    case '>=':
      return threshold.value !== undefined && value >= threshold.value;
    case '=':
      return threshold.value !== undefined && value === threshold.value;
    case 'between':
      return threshold.min !== undefined && threshold.max !== undefined &&
             value >= threshold.min && value < threshold.max;
    default:
      return false;
  }
};

export const CurrentValueWidget: React.FC<CurrentValueWidgetProps> = ({
  data,
  measurement,
  config,
  showThresholdLabels = true,
}) => {
  if (data.error) {
    return <div className="widget-error">{data.error}</div>;
  }

  if (data.currentValue === undefined) {
    return <div className="widget-no-data">No data available</div>;
  }

  const valueType = measurement.valueType || 'number';

  // Thresholds only apply to numeric values
  let color = '#6b7280';
  let label: string | undefined;
  let displayUnit: string | undefined;
  let displayDecimals: number | undefined;

  if (valueType === 'number' && typeof data.currentValue === 'number') {
    // Assign to local variable to preserve type narrowing
    const currentNumericValue = data.currentValue;

    // Find first matching threshold
    const threshold = config.thresholds?.find((t) => matchesThreshold(currentNumericValue, t));

    color = threshold?.color || '#6b7280';
    label = threshold?.customLabel || threshold?.label;

    // Safe to access numeric properties
    displayUnit = 'unit' in data ? data.unit : measurement.unit;
    displayDecimals = 'decimals' in data && data.decimals !== undefined ? data.decimals : measurement.decimals;
  }

  return (
    <div className="current-value-widget" style={{ borderLeftColor: color }}>
      <div className="measurement-name">{measurement.name}</div>
      <div className="value-container">
        <div className="value" style={{ color }}>
          {valueType === 'string' && typeof data.currentValue === 'string' ? (
            data.currentValue
          ) : typeof data.currentValue === 'number' && displayDecimals !== undefined ? (
            data.currentValue.toFixed(displayDecimals)
          ) : (
            '-'
          )}
        </div>
        {valueType === 'number' && typeof data.currentValue === 'number' && displayUnit && (
          <div className="unit">{displayUnit}</div>
        )}
      </div>
      {showThresholdLabels && label && (
        <div className="threshold-label" style={{ backgroundColor: color, color: '#ffffff' }}>
          {label}
        </div>
      )}
      {data.timestamp && (
        <div className="timestamp">{formatRelativeTime(data.timestamp)}</div>
      )}
    </div>
  );
};
