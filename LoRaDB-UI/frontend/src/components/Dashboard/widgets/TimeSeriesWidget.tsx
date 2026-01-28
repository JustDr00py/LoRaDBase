import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Brush,
} from 'recharts';
import type { WidgetData, TimeSeriesWidgetConfig, MeasurementDefinition, WidgetInstance } from '../../../types/widgets';
import { formatDate } from '../../../utils/dateFormatter';
import { getConvertedYAxisRange } from '../../../utils/widgetDataProcessor';

interface TimeSeriesWidgetProps {
  data: WidgetData;
  measurement: MeasurementDefinition;
  config: TimeSeriesWidgetConfig;
  widget: WidgetInstance;
  yAxisOverride?: {
    customYAxisMin?: number;
    customYAxisMax?: number;
  };
}

export const TimeSeriesWidget: React.FC<TimeSeriesWidgetProps> = ({
  data,
  measurement,
  config,
  widget,
  yAxisOverride,
}) => {
  // State for zoom/brush control
  const [brushIndexes, setBrushIndexes] = useState<{ startIndex?: number; endIndex?: number }>({});

  if (data.error) {
    return <div className="widget-error">{data.error}</div>;
  }

  if (!data.timeSeries || data.timeSeries.length === 0) {
    return <div className="widget-no-data">No time series data available</div>;
  }

  // Time series only works with numeric data
  if (typeof data.currentValue !== 'number') {
    return <div className="widget-error">Time series widget requires numeric data</div>;
  }

  const displayUnit = 'unit' in data ? data.unit : measurement.unit;
  const displayDecimals = 'decimals' in data && data.decimals !== undefined ? data.decimals : measurement.decimals;

  // Y-AXIS CONFIGURATION WITH PRIORITY:
  // 1. Per-measurement override (highest priority)
  // 2. Global widget customYAxisMin/Max (for backward compatibility)
  // 3. Temperature conversion
  // 4. Measurement definition config (lowest priority)

  let yAxisMin = config.yAxisMin;
  let yAxisMax = config.yAxisMax;

  // PRIORITY 1: Per-measurement override (NEW)
  if (yAxisOverride?.customYAxisMin !== undefined) {
    yAxisMin = yAxisOverride.customYAxisMin;
  }
  // PRIORITY 2: Global widget custom value (backward compatibility)
  else if (widget.customYAxisMin !== undefined) {
    yAxisMin = widget.customYAxisMin;
  }
  // PRIORITY 3: Temperature conversion
  else if (widget.conversion?.enabled && measurement.unit === '°C') {
    const converted = getConvertedYAxisRange(config.yAxisMin, config.yAxisMax, widget.conversion);
    yAxisMin = converted.min;
    yAxisMax = converted.max;
  }

  // Same logic for max
  if (yAxisOverride?.customYAxisMax !== undefined) {
    yAxisMax = yAxisOverride.customYAxisMax;
  } else if (widget.customYAxisMax !== undefined) {
    yAxisMax = widget.customYAxisMax;
  }

  // Format data for Recharts
  const chartData = data.timeSeries.map((point) => ({
    timestamp: new Date(point.timestamp).getTime(),
    value: point.value,
  }));

  const lineColor = config.color || '#2563eb';

  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTooltip = (value: number) => {
    if (typeof value === 'number') {
      return `${value.toFixed(displayDecimals)} ${displayUnit}`;
    }
    return value;
  };

  const formatTooltipLabel = (timestamp: number) => {
    return formatDate(new Date(timestamp).toISOString());
  };

  const handleBrushChange = (brushData: { startIndex?: number; endIndex?: number }) => {
    setBrushIndexes(brushData);
  };

  const handleResetZoom = () => {
    setBrushIndexes({});
  };

  const isZoomed = brushIndexes.startIndex !== undefined || brushIndexes.endIndex !== undefined;

  // Filter chart data based on brush selection
  const visibleData = isZoomed && brushIndexes.startIndex !== undefined && brushIndexes.endIndex !== undefined
    ? chartData.slice(brushIndexes.startIndex, brushIndexes.endIndex + 1)
    : chartData;

  const ChartComponent = config.showArea ? AreaChart : LineChart;

  return (
    <div className="time-series-widget">
      <div className="widget-title">
        {measurement.name}
        {isZoomed && (
          <button
            onClick={handleResetZoom}
            className="reset-zoom-btn"
            title="Reset zoom"
            style={{
              marginLeft: '10px',
              padding: '2px 8px',
              fontSize: '11px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            Reset Zoom
          </button>
        )}
      </div>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={visibleData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              stroke="#666"
              style={{ fontSize: '10px' }}
            />
            <YAxis
              domain={[yAxisMin ?? 'auto', yAxisMax ?? 'auto']}
              label={{ value: displayUnit, angle: -90, position: 'insideLeft', style: { fontSize: '11px' } }}
              tickFormatter={(value) => value.toFixed(displayDecimals)}
              stroke="#666"
              style={{ fontSize: '10px' }}
            />
            <Tooltip
              formatter={formatTooltip}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            />
            {config.showArea ? (
              <Area
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                fill={lineColor}
                fillOpacity={0.3}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            )}
            <Brush
              dataKey="timestamp"
              height={30}
              stroke={lineColor}
              fill="#f9fafb"
              tickFormatter={formatXAxis}
              onChange={handleBrushChange}
              startIndex={brushIndexes.startIndex}
              endIndex={brushIndexes.endIndex}
              data={chartData}
            />
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
