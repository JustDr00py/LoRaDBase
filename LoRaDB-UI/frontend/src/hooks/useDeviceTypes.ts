import { useState, useEffect } from 'react';
import type { DeviceTypeDefinition, MeasurementDefinition } from '../types/widgets';

/**
 * Hook to load and manage device type definitions
 */
export function useDeviceTypes() {
  const [deviceTypes, setDeviceTypes] = useState<DeviceTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadDeviceTypes() {
      try {
        setLoading(true);

        // First, fetch the index file to get the list of available device types
        const indexResponse = await fetch('/device-types/index.json');
        if (!indexResponse.ok) {
          throw new Error(`Failed to load device types index: ${indexResponse.statusText}`);
        }

        const index = await indexResponse.json();
        const deviceTypeFiles = index.deviceTypes || [];

        if (deviceTypeFiles.length === 0) {
          console.warn('No device types found in index.json');
          setDeviceTypes([]);
          setError(null);
          setLoading(false);
          return;
        }

        console.log(`Loading ${deviceTypeFiles.length} device type(s):`, deviceTypeFiles);

        // Load all device type files listed in the index
        const responses = await Promise.all(
          deviceTypeFiles.map((filename: string) =>
            fetch(`/device-types/${filename}`).then((res) => {
              if (!res.ok) {
                console.error(`Failed to load ${filename}: ${res.statusText}`);
                return null;
              }
              return res.json();
            })
          )
        );

        // Filter out any failed loads
        const validDeviceTypes = responses.filter(
          (dt): dt is DeviceTypeDefinition => dt !== null
        );

        console.log(`Successfully loaded ${validDeviceTypes.length} device type(s)`);
        setDeviceTypes(validDeviceTypes);
        setError(null);
      } catch (err) {
        console.error('Failed to load device types:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    loadDeviceTypes();
  }, []);

  /**
   * Get a device type by ID
   */
  const getDeviceType = (deviceTypeId: string): DeviceTypeDefinition | undefined => {
    return deviceTypes.find((dt) => dt.deviceType === deviceTypeId);
  };

  /**
   * Get a specific measurement from a device type
   */
  const getMeasurement = (
    deviceTypeId: string,
    measurementId: string
  ): MeasurementDefinition | undefined => {
    const deviceType = getDeviceType(deviceTypeId);
    return deviceType?.measurements.find((m) => m.id === measurementId);
  };

  /**
   * Get all measurements for a device type
   */
  const getMeasurements = (deviceTypeId: string): MeasurementDefinition[] => {
    const deviceType = getDeviceType(deviceTypeId);
    return deviceType?.measurements || [];
  };

  /**
   * Get all available widget types for a measurement
   */
  const getAvailableWidgetTypes = (deviceTypeId: string, measurementId: string): string[] => {
    const measurement = getMeasurement(deviceTypeId, measurementId);
    if (!measurement) return [];

    return Object.entries(measurement.widgets)
      .filter(([_, config]) => config.enabled)
      .map(([type, _]) => type);
  };

  return {
    deviceTypes,
    loading,
    error,
    getDeviceType,
    getMeasurement,
    getMeasurements,
    getAvailableWidgetTypes,
  };
}
