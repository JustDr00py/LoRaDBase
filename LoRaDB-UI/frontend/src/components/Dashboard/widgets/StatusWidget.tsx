import React from 'react';
import type { WidgetData, MeasurementDefinition } from '../../../types/widgets';
import { getStatusColor, getStatusIcon } from '../../../utils/widgetDataProcessor';

interface StatusWidgetProps {
  data: WidgetData;
  measurement: MeasurementDefinition;
}

export const StatusWidget: React.FC<StatusWidgetProps> = ({ data, measurement }) => {
  if (data.error) {
    return <div className="widget-error">{data.error}</div>;
  }

  if (!data.status || data.currentValue === undefined) {
    return <div className="widget-no-data">No data available</div>;
  }

  const backgroundColor = getStatusColor(data.status.level);
  const icon = getStatusIcon(data.status.level);

  const valueType = measurement.valueType || 'number';

  // Extract display properties safely based on type
  const displayUnit = 'unit' in data ? data.unit : measurement.unit;
  const displayDecimals = 'decimals' in data && data.decimals !== undefined ? data.decimals : measurement.decimals;

  return (
    <div className="status-widget">
      <div className="status-badge" style={{ backgroundColor }}>
        <span className="status-icon">{icon}</span>
        <span className="status-label">{data.status.label}</span>
      </div>
      <div className="status-value">
        {valueType === 'string' && typeof data.currentValue === 'string' ? (
          // String: display as-is
          data.currentValue
        ) : typeof data.currentValue === 'number' && displayDecimals !== undefined ? (
          // Numeric: format with decimals and unit
          <>
            {data.currentValue.toFixed(displayDecimals)} {displayUnit}
          </>
        ) : (
          '-'
        )}
      </div>
    </div>
  );
};
