import React from 'react';
import ReactECharts from 'echarts-for-react';
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

  const option = {
    grid: {
      left: 50,
      right: 15,
      top: 15,
      bottom: 30,
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        fontSize: 10,
        formatter: (value: number) => {
          const date = new Date(value);
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        },
      },
    },
    yAxis: {
      type: 'value',
      name: displayUnit,
      nameTextStyle: {
        fontSize: 11,
      },
      min: yAxisMin,
      max: yAxisMax,
      axisLabel: {
        fontSize: 10,
        formatter: (value: number) => value.toFixed(displayDecimals),
      },
    },
    series: [
      {
        type: 'line',
        data: data.timeSeries.map((d) => [new Date(d.timestamp).getTime(), d.value]),
        smooth: true,
        areaStyle: config.showArea ? { opacity: 0.3 } : undefined,
        itemStyle: {
          color: config.color || '#2563eb',
        },
        lineStyle: {
          width: 2,
        },
        showSymbol: false,
      },
    ],
    tooltip: {
      trigger: 'axis',
      textStyle: {
        fontSize: 12,
      },
      formatter: (params: any) => {
        const point = params[0];
        const value = point.value[1].toFixed(displayDecimals);
        const time = formatDate(new Date(point.value[0]).toISOString());
        return `<strong>${value} ${displayUnit}</strong><br/>${time}`;
      },
    },
  };

  return (
    <div className="time-series-widget">
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};
