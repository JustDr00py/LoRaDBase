import React from 'react';
import {
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatDate } from '../../utils/dateFormatter';
import type { FrequencyDistribution, TimeSeriesDataPoint } from '../../types/api';

interface FrequencyChartProps {
  distribution: FrequencyDistribution;
  timeSeries: TimeSeriesDataPoint[];
}

export const FrequencyChart: React.FC<FrequencyChartProps> = ({
  distribution,
  timeSeries,
}) => {
  // Prepare bar chart data from distribution
  const barData = distribution.frequencies.map(freq => ({
    frequency: parseFloat(freq),
    frequencyLabel: `${freq} MHz`,
    count: distribution[freq] as number,  // Frequency keys map to counts (numbers)
  }));

  // Prepare scatter chart data from timeSeries
  const scatterData = timeSeries
    .filter(d => d.frequency !== undefined)
    .map(d => ({
      timestamp: new Date(d.timestamp).getTime(),
      frequency: d.frequency,
      frequencyLabel: `${d.frequency?.toFixed(3)} MHz`,
    }));

  if (barData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Frequency Analysis</div>
        <div className="no-data-message">No frequency data available</div>
      </div>
    );
  }

  // Color scheme: Use primary blue
  const FREQ_COLOR = '#2563eb';

  return (
    <>
      {/* Bar Chart - Frequency Distribution */}
      <div className="chart-container">
        <div className="chart-title">Frequency Distribution</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={barData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="frequencyLabel"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="#6b7280"
              label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
              style={{ fontSize: '12px' }}
              allowDecimals={false}
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
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        {data.frequencyLabel}
                      </p>
                      <p style={{ margin: 0, color: FREQ_COLOR }}>
                        Count: {data.count}
                      </p>
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        Percentage: {((data.count / distribution.total) * 100).toFixed(1)}%
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" fill={FREQ_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Scatter Chart - Frequency over time */}
      {scatterData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">Frequency Usage Over Time</div>
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
                dataKey="frequency"
                name="Frequency (MHz)"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => value.toFixed(3)}
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
                        <p style={{ margin: 0, color: FREQ_COLOR }}>
                          {data.frequencyLabel}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                name="Frequency"
                data={scatterData}
                fill={FREQ_COLOR}
                shape={(props: any) => {
                  const { cx, cy } = props;
                  return <circle cx={cx} cy={cy} r={4} fill={FREQ_COLOR} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
};
