import React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import type { TimeSeriesDataPoint } from '../../types/api';

interface EnergyChartProps {
  data: TimeSeriesDataPoint[];
}

export const EnergyChart: React.FC<EnergyChartProps> = ({ data }) => {
  // Filter out data points without energy and calculate cumulative
  const chartData = data
    .filter(d => d.energy !== undefined)
    .map((d, index, arr) => {
      const cumulative = arr.slice(0, index + 1).reduce((sum, item) => sum + (item.energy || 0), 0);
      return {
        ...d,
        cumulative,
      };
    });

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Energy Consumption</div>
        <div className="no-data-message">No energy data available</div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return formatDate(timestamp);
  };

  return (
    <div className="chart-container">
      <div className="chart-title">Energy Consumption</div>
      <div className="kpi-subtitle" style={{ marginBottom: '10px' }}>
        Estimated based on 40mA TX current at 3.3V
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            yAxisId="left"
            stroke="#10b981"
            label={{ value: 'Energy per TX (mAh)', angle: -90, position: 'insideLeft', style: { fill: '#10b981' } }}
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => value.toExponential(2)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#2563eb"
            label={{ value: 'Cumulative (mAh)', angle: 90, position: 'insideRight', style: { fill: '#2563eb' } }}
            style={{ fontSize: '12px' }}
            tickFormatter={(value) => value.toFixed(4)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '10px',
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 600, marginBottom: 5 }}>
                      {formatTimestamp(data.timestamp)}
                    </p>
                    <p style={{ margin: 0, color: '#10b981' }}>
                      Energy: {data.energy?.toExponential(4)} mAh
                    </p>
                    <p style={{ margin: 0, color: '#2563eb' }}>
                      Cumulative: {data.cumulative?.toFixed(4)} mAh
                    </p>
                    {data.airtime && (
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        Airtime: {data.airtime.toFixed(2)} ms
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={{ fontSize: '14px' }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="energy"
            stroke="#10b981"
            fillOpacity={1}
            fill="url(#energyGradient)"
            name="Energy per TX"
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            stroke="#2563eb"
            name="Cumulative Energy"
            dot={false}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
