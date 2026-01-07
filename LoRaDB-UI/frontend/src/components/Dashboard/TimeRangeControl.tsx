import React from 'react';

interface TimeRangeControlProps {
  timeRange: string;
  autoRefresh: boolean;
  refreshInterval: number;
  onTimeRangeChange: (range: string) => void;
  onAutoRefreshChange: (enabled: boolean) => void;
  onRefreshIntervalChange: (seconds: number) => void;
}

export const TimeRangeControl: React.FC<TimeRangeControlProps> = ({
  timeRange,
  autoRefresh,
  refreshInterval,
  onTimeRangeChange,
  onAutoRefreshChange,
  onRefreshIntervalChange,
}) => {
  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '6h', label: 'Last 6 Hours' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
  ];

  const refreshIntervalOptions = [
    { value: 30, label: '30 seconds' },
    { value: 60, label: '1 minute' },
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
  ];

  return (
    <div className="time-range-control card">
      <div className="control-grid">
        {/* Time Range Selector */}
        <div className="control-group">
          <label htmlFor="time-range">Time Range</label>
          <select
            id="time-range"
            className="form-control"
            value={timeRange}
            onChange={(e) => onTimeRangeChange(e.target.value)}
          >
            {timeRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-Refresh Toggle */}
        <div className="control-group">
          <label htmlFor="auto-refresh">Auto-Refresh</label>
          <div className="checkbox-wrapper">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
            />
            <label htmlFor="auto-refresh" className="checkbox-label">
              {autoRefresh ? 'Enabled' : 'Disabled'}
            </label>
          </div>
        </div>

        {/* Refresh Interval */}
        {autoRefresh && (
          <div className="control-group">
            <label htmlFor="refresh-interval">Refresh Every</label>
            <select
              id="refresh-interval"
              className="form-control"
              value={refreshInterval}
              onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
            >
              {refreshIntervalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
