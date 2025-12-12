import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import type { SpreadingFactorDistribution, TimeSeriesDataPoint } from '../../types/api';

interface SpreadingFactorChartProps {
  distribution: SpreadingFactorDistribution;
  timeSeries: TimeSeriesDataPoint[];
}

// SF colors (gradient from green to red)
const SF_COLORS: Record<string, string> = {
  SF7: '#10b981',
  SF8: '#84cc16',
  SF9: '#eab308',
  SF10: '#f59e0b',
  SF11: '#f97316',
  SF12: '#ef4444',
};

export const SpreadingFactorChart: React.FC<SpreadingFactorChartProps> = ({
  distribution,
  timeSeries,
}) => {
  // Prepare pie chart data
  const pieData = Object.entries(distribution)
    .filter(([key]) => key.startsWith('SF'))
    .map(([key, value]) => ({
      name: key,
      value: value as number,
      percentage: distribution.percentages[key],
    }))
    .filter(item => item.value > 0);

  // Prepare scatter chart data
  const scatterData = timeSeries
    .filter(d => d.spreadingFactor !== undefined)
    .map(d => ({
      timestamp: new Date(d.timestamp).getTime(),
      sf: d.spreadingFactor,
      label: `SF${d.spreadingFactor}`,
    }));

  if (pieData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Spreading Factor Distribution</div>
        <div className="no-data-message">No spreading factor data available</div>
      </div>
    );
  }

  return (
    <>
      {/* Pie Chart - Distribution */}
      <div className="chart-container">
        <div className="chart-title">Spreading Factor Distribution</div>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={SF_COLORS[entry.name] || '#6b7280'} />
              ))}
            </Pie>
            <Tooltip
              content={({ payload }) => {
                if (payload && payload.length > 0) {
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
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        {data.name}
                      </p>
                      <p style={{ margin: 0, color: SF_COLORS[data.name] }}>
                        Count: {data.value}
                      </p>
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        Percentage: {data.percentage.toFixed(1)}%
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Scatter Chart - Trend over time */}
      {scatterData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">Spreading Factor Usage Over Time</div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                dataKey="timestamp"
                name="Time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => formatDate(new Date(value).toISOString())}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                type="number"
                dataKey="sf"
                name="Spreading Factor"
                domain={[7, 12]}
                ticks={[7, 8, 9, 10, 11, 12]}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
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
                          {formatDate(new Date(data.timestamp).toISOString())}
                        </p>
                        <p style={{ margin: 0, color: SF_COLORS[data.label] }}>
                          {data.label}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                name="Spreading Factor"
                data={scatterData}
                fill="#2563eb"
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  const color = SF_COLORS[payload.label] || '#2563eb';
                  return <circle cx={cx} cy={cy} r={4} fill={color} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
};
