import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { WidgetData, GaugeWidgetConfig, MeasurementDefinition, WidgetInstance } from '../../../types/widgets';
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
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({ data, measurement, config, widget, yAxisOverride }) => {
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

  // Build color zones for axisLine - convert zone boundaries if needed
  const colorZones = config.zones
    ? config.zones.map((zone) => {
        const convertedTo = widget.conversion?.enabled && measurement.unit === '°C'
          ? getConvertedYAxisRange(zone.to, zone.to, widget.conversion).min ?? zone.to
          : zone.to;
        return [convertedTo / gaugeMax, zone.color] as [number, string];
      })
    : [[1, '#10b981']];

  const option = {
    series: [
      {
        type: 'gauge',
        min: gaugeMin,
        max: gaugeMax,
        startAngle: 200,
        endAngle: -20,
        axisLine: {
          lineStyle: {
            width: 15,
            color: colorZones,
          },
        },
        pointer: {
          itemStyle: {
            color: 'auto',
          },
          length: '60%',
        },
        axisTick: {
          distance: -15,
          length: 4,
          lineStyle: {
            color: '#fff',
            width: 1,
          },
        },
        splitLine: {
          distance: -15,
          length: 12,
          lineStyle: {
            color: '#fff',
            width: 2,
          },
        },
        axisLabel: {
          distance: -32,
          color: '#666',
          fontSize: 9,
          formatter: (value: number) => {
            return value.toFixed(0);
          },
        },
        detail: {
          valueAnimation: true,
          formatter: `{value} ${displayUnit}`,
          fontSize: 14,
          fontWeight: 'bold',
          offsetCenter: [0, '70%'],
        },
        data: [
          {
            value: data.currentValue,
          },
        ],
      },
    ],
  };

  return (
    <div className="gauge-widget">
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
};
