import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { executeQuery, getDevices } from '../../api/endpoints';
import { useSearchParams } from 'react-router-dom';
import {
  calculateSignalQuality,
  analyzeSpreadingFactor,
  calculateEnergyImpact,
  prepareTimeSeriesData,
  getDominantSpreadingFactor,
  analyzeFrequency,
} from '../../utils/kpiCalculations';
import type { FrameData } from '../../types/api';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import { KPISummaryCards } from './KPISummaryCards';
import { SignalQualityChart } from './SignalQualityChart';
import { SpreadingFactorChart } from './SpreadingFactorChart';
import { AirtimeChart } from './AirtimeChart';
import { EnergyChart } from './EnergyChart';
import { FrequencyChart } from './FrequencyChart';

export const DeviceKPI: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [devEui, setDevEui] = useState(searchParams.get('devEui') || '');
  const [timeRange, setTimeRange] = useState<TimeRange>(
    (searchParams.get('timeRange') as TimeRange) || '24h'
  );

  // Fetch devices for dropdown
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  // Fetch KPI data when device selected
  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey: ['device-kpi', devEui, timeRange],
    queryFn: () =>
      executeQuery({
        query: `SELECT uplink FROM device '${devEui}' WHERE LAST '${timeRange}'`,
      }),
    enabled: !!devEui,
    staleTime: 30000, // 30 seconds
  });

  // Process data with useMemo
  const kpiData = useMemo(() => {
    if (!queryData?.frames) return null;

    console.log('DeviceKPI - Raw query response:', queryData);
    console.log('DeviceKPI - Frames:', queryData.frames);
    console.log('DeviceKPI - First frame structure:', queryData.frames[0]);

    // Extract uplink frames - handle both nested (f.Uplink) and direct (f) structures
    // When query is "SELECT uplink", frames may be returned directly without nesting
    const uplinkFrames = queryData.frames
      .map((f) => f.Uplink || (f.dev_eui ? f : undefined))
      .filter((f): f is FrameData => f !== undefined);

    console.log('DeviceKPI - Extracted uplink frames:', uplinkFrames);

    // Debug: Check what fields are available in first frame
    if (uplinkFrames.length > 0) {
      const firstFrame = uplinkFrames[0];
      console.log('DeviceKPI - First uplink frame fields:', {
        has_dr: !!firstFrame.dr,
        dr_value: firstFrame.dr,
        has_spreading_factor: !!firstFrame.dr?.lora?.spreading_factor,
        spreading_factor: firstFrame.dr?.lora?.spreading_factor,
        has_bandwidth: !!firstFrame.dr?.lora?.bandwidth,
        bandwidth: firstFrame.dr?.lora?.bandwidth,
        has_raw_payload: !!firstFrame.raw_payload,
        raw_payload_length: firstFrame.raw_payload?.length,
      });
    }

    if (uplinkFrames.length === 0) return null;

    const timeSeries = prepareTimeSeriesData(uplinkFrames);
    const signalQuality = calculateSignalQuality(uplinkFrames);
    const spreadingFactor = analyzeSpreadingFactor(uplinkFrames);
    const energy = calculateEnergyImpact(uplinkFrames);
    const frequency = analyzeFrequency(uplinkFrames);

    // Calculate average airtime
    const airtimeValues = timeSeries.filter((d) => d.airtime !== undefined).map((d) => d.airtime!);
    const averageAirtime =
      airtimeValues.length > 0 ? airtimeValues.reduce((a, b) => a + b, 0) / airtimeValues.length : 0;

    return {
      frames: uplinkFrames,
      timeSeries,
      signalQuality,
      spreadingFactor,
      energy,
      averageAirtime,
      dominantSF: getDominantSpreadingFactor(spreadingFactor),
      frequency,
    };
  }, [queryData]);

  // Handle device/time selection
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDevEui = e.target.value;
    setDevEui(newDevEui);
    if (newDevEui) {
      setSearchParams({ devEui: newDevEui, timeRange });
    }
  };

  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
    if (devEui) {
      setSearchParams({ devEui, timeRange: newRange });
    }
  };

  return (
    <div className="kpi-container">
      <div className="header">
        <h1>Device Analytics</h1>
      </div>

      {/* Device selector dropdown */}
      <div className="card">
        <div className="form-group">
          <label htmlFor="device-select">Select Device</label>
          <select
            id="device-select"
            className="form-control"
            value={devEui}
            onChange={handleDeviceChange}
          >
            <option value="">-- Select a device --</option>
            {devicesData?.devices.map((device) => (
              <option key={device.dev_eui} value={device.dev_eui}>
                {device.device_name || device.dev_eui} ({device.dev_eui})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Show content only when device is selected */}
      {devEui && (
        <>
          {/* Time range selector */}
          <TimeRangeSelector selected={timeRange} onChange={handleTimeRangeChange} />

          {/* Loading state */}
          {isLoading && (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="alert alert-error">
              Failed to load KPI data: {(error as Error).message}
              <button onClick={() => refetch()} className="btn btn-sm btn-primary" style={{ marginLeft: '10px' }}>
                Retry
              </button>
            </div>
          )}

          {/* No data state */}
          {!isLoading && !error && !kpiData && (
            <div className="card">
              <div className="no-data-message">
                No data available for this device in the selected time range.
                <br />
                Try expanding the time range or check if the device is actively transmitting.
              </div>
            </div>
          )}

          {/* KPI Data */}
          {!isLoading && !error && kpiData && (
            <>
              {/* Summary Cards */}
              <KPISummaryCards
                totalTransmissions={kpiData.frames.length}
                signalQuality={kpiData.signalQuality}
                spreadingFactor={kpiData.spreadingFactor}
                energy={kpiData.energy}
                averageAirtime={kpiData.averageAirtime}
                dominantSF={kpiData.dominantSF}
              />

              {/* Signal Quality Chart */}
              <SignalQualityChart data={kpiData.timeSeries} />

              {/* Spreading Factor Charts */}
              <SpreadingFactorChart
                distribution={kpiData.spreadingFactor}
                timeSeries={kpiData.timeSeries}
              />

              {/* Airtime Chart */}
              <AirtimeChart data={kpiData.timeSeries} />

              {/* Energy Chart */}
              <EnergyChart data={kpiData.timeSeries} />

              {/* Frequency Charts */}
              <FrequencyChart
                distribution={kpiData.frequency}
                timeSeries={kpiData.timeSeries}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};
