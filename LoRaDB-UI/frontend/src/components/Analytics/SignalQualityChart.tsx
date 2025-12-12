import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import type { TimeSeriesDataPoint } from '../../types/api';

interface SignalQualityChartProps {
  data: TimeSeriesDataPoint[];
}

export const SignalQualityChart: React.FC<SignalQualityChartProps> = ({ data }) => {
  // Filter out data points without RSSI or SNR
  const chartData = data.filter(d => d.rssi !== undefined || d.snr !== undefined);

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Signal Quality Over Time</div>
        <div className="no-data-message">No signal quality data available</div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return formatDate(timestamp);
  };

  return (
    <div className="chart-container">
      <div className="chart-title">Signal Quality Over Time</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTimestamp}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            yAxisId="left"
            stroke="#2563eb"
            label={{ value: 'RSSI (dBm)', angle: -90, position: 'insideLeft', style: { fill: '#2563eb' } }}
            style={{ fontSize: '12px' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#f59e0b"
            label={{ value: 'SNR (dB)', angle: 90, position: 'insideRight', style: { fill: '#f59e0b' } }}
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
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
                      {formatTimestamp(payload[0].payload.timestamp)}
                    </p>
                    {payload.map((entry: any, index: number) => (
                      <p key={index} style={{ margin: 0, color: entry.color }}>
                        {entry.name}: {entry.value?.toFixed(2)} {entry.unit}
                      </p>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend wrapperStyle={{ fontSize: '14px' }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="rssi"
            stroke="#2563eb"
            name="RSSI"
            unit="dBm"
            dot={false}
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="snr"
            stroke="#f59e0b"
            name="SNR"
            unit="dB"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
