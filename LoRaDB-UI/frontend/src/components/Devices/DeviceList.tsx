import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDevices } from '../../api/endpoints';
import { Loading } from '../Common/Loading';
import { formatRelativeTime } from '../../utils/dateFormatter';
import { useNavigate } from 'react-router-dom';

type SortField = 'dev_eui' | 'device_name' | 'application_id' | 'last_seen';
type SortDirection = 'asc' | 'desc';

export const DeviceList: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [applicationFilter, setApplicationFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('last_seen');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Get unique application IDs for filter dropdown
  const applications = useMemo(() => {
    if (!data?.devices) return [];
    const uniqueApps = new Set(data.devices.map(d => d.application_id));
    return Array.from(uniqueApps).sort();
  }, [data?.devices]);

  // Filter and sort devices
  const filteredDevices = useMemo(() => {
    if (!data?.devices) return [];

    let filtered = data.devices;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(device =>
        device.dev_eui.toLowerCase().includes(query) ||
        (device.device_name && device.device_name.toLowerCase().includes(query)) ||
        device.application_id.toLowerCase().includes(query)
      );
    }

    // Apply application filter
    if (applicationFilter !== 'all') {
      filtered = filtered.filter(device => device.application_id === applicationFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | null = '';
      let bVal: string | null = '';

      switch (sortField) {
        case 'dev_eui':
          aVal = a.dev_eui;
          bVal = b.dev_eui;
          break;
        case 'device_name':
          aVal = a.device_name || '';
          bVal = b.device_name || '';
          break;
        case 'application_id':
          aVal = a.application_id;
          bVal = b.application_id;
          break;
        case 'last_seen':
          aVal = a.last_seen || '';
          bVal = b.last_seen || '';
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data?.devices, searchQuery, applicationFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) {
      return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    }
    return <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="alert alert-error">
        Failed to load devices: {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>Devices</h1>
        <div>
          Showing {filteredDevices.length} of {data?.total_devices || 0}
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 300px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Search
            </label>
            <input
              type="text"
              className="input"
              placeholder="Search by DevEUI, name, or application..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 1 250px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
              Filter by Application
            </label>
            <select
              className="input"
              value={applicationFilter}
              onChange={(e) => setApplicationFilter(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="all">All Applications</option>
              {applications.map(app => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>
          </div>
          {(searchQuery || applicationFilter !== 'all') && (
            <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearchQuery('');
                  setApplicationFilter('all');
                }}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort('dev_eui')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Device EUI <SortIcon field="dev_eui" />
                </th>
                <th
                  onClick={() => handleSort('device_name')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Name <SortIcon field="device_name" />
                </th>
                <th
                  onClick={() => handleSort('application_id')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Application ID <SortIcon field="application_id" />
                </th>
                <th
                  onClick={() => handleSort('last_seen')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Last Seen <SortIcon field="last_seen" />
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => (
                <tr key={device.dev_eui} className="clickable">
                  <td><code>{device.dev_eui}</code></td>
                  <td>{device.device_name || '-'}</td>
                  <td>{device.application_id}</td>
                  <td>{formatRelativeTime(device.last_seen)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/query?devEui=${device.dev_eui}`)}
                      >
                        Query
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/analytics?devEui=${device.dev_eui}`)}
                      >
                        KPI
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDevices.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                    {searchQuery || applicationFilter !== 'all'
                      ? 'No devices match your filters'
                      : 'No devices found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
