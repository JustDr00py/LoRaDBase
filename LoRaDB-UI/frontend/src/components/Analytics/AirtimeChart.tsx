import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import type { TimeSeriesDataPoint } from '../../types/api';

interface AirtimeChartProps {
  data: TimeSeriesDataPoint[];
}

// SF colors for gradient
const SF_COLORS: Record<number, string> = {
  7: '#10b981',
  8: '#84cc16',
  9: '#eab308',
  10: '#f59e0b',
  11: '#f97316',
  12: '#ef4444',
};

export const AirtimeChart: React.FC<AirtimeChartProps> = ({ data }) => {
  // Filter out data points without airtime
  const chartData = data.filter(d => d.airtime !== undefined);

  if (chartData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Airtime per Transmission</div>
        <div className="no-data-message">No airtime data available</div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return formatDate(timestamp);
  };

  return (
    <div className="chart-container">
      <div className="chart-title">Airtime per Transmission</div>
      <div className="kpi-subtitle" style={{ marginBottom: '10px' }}>
        Calculated using Semtech airtime formula
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="airtimeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
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
            stroke="#6b7280"
            label={{ value: 'Airtime (ms)', angle: -90, position: 'insideLeft' }}
            style={{ fontSize: '12px' }}
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
                    <p style={{ margin: 0, color: '#2563eb' }}>
                      Airtime: {data.airtime?.toFixed(2)} ms
                    </p>
                    {data.spreadingFactor && (
                      <p style={{ margin: 0, color: SF_COLORS[data.spreadingFactor] || '#6b7280' }}>
                        SF{data.spreadingFactor}
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="airtime"
            stroke="#2563eb"
            fillOpacity={1}
            fill="url(#airtimeGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
