import React from 'react';

export type TimeRange = '1h' | '24h' | '7d' | '30d';

interface TimeRangeSelectorProps {
  selected: TimeRange;
  onChange: (range: TimeRange) => void;
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ selected, onChange }) => {
  const ranges: TimeRange[] = ['1h', '24h', '7d', '30d'];

  const labels: Record<TimeRange, string> = {
    '1h': 'Last Hour',
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
  };

  return (
    <div className="time-range-selector">
      {ranges.map(range => (
        <button
          key={range}
          className={`time-range-btn ${selected === range ? 'active' : ''}`}
          onClick={() => onChange(range)}
        >
          {labels[range]}
        </button>
      ))}
    </div>
  );
};
