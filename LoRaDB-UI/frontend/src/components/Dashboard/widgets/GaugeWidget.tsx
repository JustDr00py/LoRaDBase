import React from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import type { WidgetData, GaugeWidgetConfig, MeasurementDefinition, WidgetInstance, Threshold } from '../../../types/widgets';
import { getConvertedYAxisRange } from '../../../utils/widgetDataProcessor';

interface GaugeWidgetProps {
  data: WidgetData;
  measurement: MeasurementDefinition;
  config: GaugeWidgetConfig;
  widget: WidgetInstance;
  yAxisOverride?: {
    customYAxisMin?: number;
    customYAxisMax?: number;
  };
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

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({
  data,
  measurement,
  config,
  widget,
  yAxisOverride,
  showThresholdLabels = true,
}) => {
  if (data.error) {
    return <div className="widget-error">{data.error}</div>;
  }

  if (data.currentValue === undefined) {
    return <div className="widget-no-data">No data available</div>;
  }

  // Gauges only work with numeric data
  if (typeof data.currentValue !== 'number') {
    return <div className="widget-error">Gauge widget requires numeric data</div>;
  }

  const displayUnit = 'unit' in data ? data.unit : measurement.unit;

  // Evaluate threshold for status label
  const thresholds = measurement.widgets['current-value']?.thresholds;
  const currentNumericValue = data.currentValue;
  const matchedThreshold = thresholds?.find((t) => matchesThreshold(currentNumericValue, t));
  const thresholdColor = matchedThreshold?.color;
  const thresholdLabel = matchedThreshold?.customLabel || matchedThreshold?.label;

  // Convert min/max if temperature conversion is enabled and measurement is temperature
  const convertedRange = measurement.unit === '°C'
    ? getConvertedYAxisRange(config.min, config.max, widget.conversion)
    : { min: config.min, max: config.max };

  // Apply per-measurement override if present
  let gaugeMin = convertedRange.min ?? config.min;
  let gaugeMax = convertedRange.max ?? config.max;

  if (yAxisOverride?.customYAxisMin !== undefined) {
    gaugeMin = yAxisOverride.customYAxisMin;
  }
  if (yAxisOverride?.customYAxisMax !== undefined) {
    gaugeMax = yAxisOverride.customYAxisMax;
  }

  // Calculate percentage for radial bar
  const percentage = ((data.currentValue - gaugeMin) / (gaugeMax - gaugeMin)) * 100;

  // Determine color based on zones
  let barColor = '#10b981'; // Default green
  if (config.zones && config.zones.length > 0) {
    for (const zone of config.zones) {
      if (data.currentValue >= zone.from && data.currentValue < zone.to) {
        barColor = zone.color;
        break;
      }
    }
  }

  const chartData = [
    {
      name: measurement.name,
      value: Math.min(Math.max(percentage, 0), 100), // Clamp between 0-100
      fill: barColor,
    },
  ];

  return (
    <div className="gauge-widget">
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="65%"
            innerRadius="68%"
            outerRadius="98%"
            barSize={30}
            data={chartData}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background
              dataKey="value"
              cornerRadius={15}
              fill={barColor}
            />
            <text
              x="50%"
              y="55%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                fill: '#333',
              }}
            >
              {data.currentValue.toFixed(measurement.decimals)}
            </text>
            <text
              x="50%"
              y="66%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: '16px',
                fill: '#666',
              }}
            >
              {displayUnit}
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      {showThresholdLabels && thresholdLabel && (
        <div className="threshold-label" style={{ backgroundColor: thresholdColor, color: '#ffffff' }}>
          {thresholdLabel}
        </div>
      )}
      <div className="widget-title">{measurement.name}</div>
    </div>
  );
};
