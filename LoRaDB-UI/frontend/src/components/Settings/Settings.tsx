import React from 'react';
import { useSettings } from '../../context/SettingsContext';

export const Settings: React.FC = () => {
  const { showDebugView, setShowDebugView } = useSettings();

  return (
    <div>
      <div className="header">
        <h1>Settings</h1>
      </div>

      <div className="card">
        <div className="card-header">Debug Options</div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDebugView}
              onChange={(e) => setShowDebugView(e.target.checked)}
              style={{ marginRight: '10px', cursor: 'pointer' }}
            />
            <span>Show Raw API Response in Query Results</span>
          </label>
          <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block', marginLeft: '30px' }}>
            When enabled, query results will include a collapsible section showing the raw JSON response from the API.
            This is useful for debugging and understanding the data structure.
          </small>
        </div>
      </div>

      <div className="card">
        <div className="card-header">About</div>
        <p>
          <strong>LoRaDB UI</strong> is a web interface for querying and managing LoRaWAN devices.
        </p>
        <p style={{ marginTop: '10px', fontSize: '0.875rem', color: '#666' }}>
          Settings are automatically saved to your browser's local storage.
        </p>
      </div>
    </div>
  );
};
