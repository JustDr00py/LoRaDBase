import type { FrameData, RxInfo, FrequencyDistribution } from '../types/api';

/**
 * Parameters for LoRaWAN airtime calculation using Semtech formula
 */
export interface AirtimeParams {
  spreadingFactor: number;    // 7-12
  bandwidth: number;          // Hz (125000, 250000, 500000)
  payloadBytes: number;       // From base64 decoded raw_payload
  codingRate?: number;        // Default: 1 (for 4/5)
  preambleSymbols?: number;   // Default: 8
  explicitHeader?: boolean;   // Default: false (implicit for LoRaWAN)
  crcEnabled?: boolean;       // Default: true
}

/**
 * Signal quality metrics aggregated from gateway reception data
 */
export interface SignalQualityMetrics {
  averageRSSI: number;
  minRSSI: number;
  maxRSSI: number;
  averageSNR: number;
  minSNR: number;
  maxSNR: number;
  gatewayCount: number;
  gateways: Map<string, { rssi: number; snr: number; count: number }>;
}

/**
 * Spreading factor distribution across frames
 */
export interface SpreadingFactorDistribution {
  SF7: number;
  SF8: number;
  SF9: number;
  SF10: number;
  SF11: number;
  SF12: number;
  total: number;
  percentages: Record<string, number>;
}

/**
 * Energy consumption metrics
 */
export interface EnergyMetrics {
  totalEnergyMah: number;
  averageEnergyPerTx: number;
  energyBySpreadingFactor: Record<string, number>;
  powerConsumptionMw: number;
}

/**
 * Time-series data point for chart visualization
 */
export interface TimeSeriesDataPoint {
  timestamp: string;      // ISO 8601
  timestampMs: number;    // Unix epoch for sorting
  rssi?: number;
  snr?: number;
  spreadingFactor?: number;
  airtime?: number;
  energy?: number;
  gatewayCount?: number;
}

/**
 * Energy calculation configuration
 */
export interface EnergyConfig {
  txCurrentMa: number;  // Default: 40mA
  voltage: number;       // Default: 3.3V
}

/**
 * Calculate LoRaWAN packet airtime using Semtech formula
 *
 * Formula:
 * Airtime = (T_preamble + T_payload) ms
 * T_preamble = (n_preamble + 4.25) × T_symbol
 * T_payload = n_payload × T_symbol
 * T_symbol = (2^SF) / BW seconds
 * n_payload = 8 + max(ceil[(8×PL - 4×SF + 28 + 16×CRC - 20×IH) / (4×(SF - 2×DE))] × (CR + 4), 0)
 *
 * Where:
 * - SF = Spreading Factor (7-12)
 * - BW = Bandwidth in Hz (125000, 250000, 500000)
 * - PL = Payload size in bytes
 * - CR = Coding Rate (typically 1 for 4/5)
 * - CRC = 1 (CRC enabled, standard for LoRaWAN)
 * - IH = 0 (implicit header disabled, standard for LoRaWAN)
 * - DE = 1 if SF >= 11 AND BW = 125kHz, else 0 (Low Data Rate Optimization)
 * - n_preamble = 8 (standard LoRaWAN preamble)
 */
export function calculateAirtime(params: AirtimeParams): number {
  const {
    spreadingFactor: SF,
    bandwidth: BW,
    payloadBytes: PL,
    codingRate: CR = 1,
    preambleSymbols: n_preamble = 8,
    explicitHeader = false,
    crcEnabled = true,
  } = params;

  // Validate inputs
  if (SF < 7 || SF > 12) {
    console.warn(`Invalid spreading factor: ${SF}, using SF7`);
    return 0;
  }
  if (![125000, 250000, 500000].includes(BW)) {
    console.warn(`Invalid bandwidth: ${BW}, expected 125000, 250000, or 500000`);
    return 0;
  }

  // Symbol time in seconds
  const T_symbol = Math.pow(2, SF) / BW;

  // Low Data Rate Optimization
  const DE = (SF >= 11 && BW === 125000) ? 1 : 0;

  // IH: 0 for explicit header (LoRaWAN standard), 1 for implicit
  const IH = explicitHeader ? 0 : 1;
  const CRC = crcEnabled ? 1 : 0;

  // Payload symbol count
  const payloadSymbolCount = 8 + Math.max(
    Math.ceil(
      (8 * PL - 4 * SF + 28 + 16 * CRC - 20 * IH) /
      (4 * (SF - 2 * DE))
    ) * (CR + 4),
    0
  );

  // Preamble time
  const T_preamble = (n_preamble + 4.25) * T_symbol;

  // Payload time
  const T_payload = payloadSymbolCount * T_symbol;

  // Total airtime in milliseconds
  return (T_preamble + T_payload) * 1000;
}

/**
 * Decode base64 payload to get byte count
 */
export function getPayloadSize(base64Payload: string | undefined): number {
  if (!base64Payload) return 0;

  try {
    // Base64 to bytes: remove padding and calculate
    const base64Length = base64Payload.replace(/=/g, '').length;
    return Math.floor((base64Length * 3) / 4);
  } catch (error) {
    console.warn('Failed to decode base64 payload:', error);
    return 0;
  }
}

/**
 * Get the best gateway (highest RSSI) from rx_info array
 */
function getBestGateway(rx_info: RxInfo[] | undefined): RxInfo | null {
  if (!rx_info || rx_info.length === 0) return null;

  return rx_info.reduce((best, current) => {
    const bestRssi = best.rssi ?? -999;
    const currentRssi = current.rssi ?? -999;
    return currentRssi > bestRssi ? current : best;
  }, rx_info[0]);
}

/**
 * Calculate signal quality metrics from frame data
 */
export function calculateSignalQuality(frames: FrameData[]): SignalQualityMetrics {
  const rssiValues: number[] = [];
  const snrValues: number[] = [];
  const gatewayStats = new Map<string, { rssi: number[]; snr: number[] }>();

  frames.forEach(frame => {
    frame.rx_info?.forEach(rx => {
      if (rx.rssi !== undefined) rssiValues.push(rx.rssi);
      if (rx.snr !== undefined) snrValues.push(rx.snr);

      if (rx.gateway_id) {
        if (!gatewayStats.has(rx.gateway_id)) {
          gatewayStats.set(rx.gateway_id, { rssi: [], snr: [] });
        }
        const stats = gatewayStats.get(rx.gateway_id)!;
        if (rx.rssi !== undefined) stats.rssi.push(rx.rssi);
        if (rx.snr !== undefined) stats.snr.push(rx.snr);
      }
    });
  });

  const gateways = new Map<string, { rssi: number; snr: number; count: number }>();
  gatewayStats.forEach((stats, gwId) => {
    gateways.set(gwId, {
      rssi: stats.rssi.reduce((a, b) => a + b, 0) / stats.rssi.length,
      snr: stats.snr.reduce((a, b) => a + b, 0) / stats.snr.length,
      count: stats.rssi.length,
    });
  });

  return {
    averageRSSI: rssiValues.length > 0 ? rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length : 0,
    minRSSI: rssiValues.length > 0 ? Math.min(...rssiValues) : 0,
    maxRSSI: rssiValues.length > 0 ? Math.max(...rssiValues) : 0,
    averageSNR: snrValues.length > 0 ? snrValues.reduce((a, b) => a + b, 0) / snrValues.length : 0,
    minSNR: snrValues.length > 0 ? Math.min(...snrValues) : 0,
    maxSNR: snrValues.length > 0 ? Math.max(...snrValues) : 0,
    gatewayCount: gateways.size,
    gateways,
  };
}

/**
 * Map LoRaWAN Data Rate (DR) index to actual Spreading Factor
 * Supports US915, AU915, EU868, and AS923 regions
 */
function mapDataRateToSpreadingFactor(dr: number, bandwidth: number, frequency?: number): number | undefined {
  // Determine region based on frequency (if available)
  const isUS915 = frequency !== undefined && frequency >= 902000000 && frequency <= 928000000;
  const isEU868 = frequency !== undefined && frequency >= 863000000 && frequency <= 870000000;
  const isAS923 = frequency !== undefined && frequency >= 915000000 && frequency <= 928000000 && !isUS915;

  // US915 / AU915 mapping
  if (isUS915 || bandwidth === 500000) {
    const us915Map: Record<number, number> = {
      0: 10,  // DR0: SF10 BW125
      1: 9,   // DR1: SF9 BW125
      2: 8,   // DR2: SF8 BW125
      3: 7,   // DR3: SF7 BW125
      4: 8,   // DR4: SF8 BW500
      8: 12,  // DR8: SF12 BW500
      9: 11,  // DR9: SF11 BW500
      10: 10, // DR10: SF10 BW500
      11: 9,  // DR11: SF9 BW500
      12: 8,  // DR12: SF8 BW500
      13: 7,  // DR13: SF7 BW500
    };
    return us915Map[dr];
  }

  // EU868 mapping
  if (isEU868 || bandwidth === 125000) {
    const eu868Map: Record<number, number> = {
      0: 12,  // DR0: SF12 BW125
      1: 11,  // DR1: SF11 BW125
      2: 10,  // DR2: SF10 BW125
      3: 9,   // DR3: SF9 BW125
      4: 8,   // DR4: SF8 BW125
      5: 7,   // DR5: SF7 BW125
      6: 7,   // DR6: SF7 BW250
    };
    return eu868Map[dr];
  }

  // AS923 mapping (similar to EU868)
  if (isAS923) {
    const as923Map: Record<number, number> = {
      0: 12,
      1: 11,
      2: 10,
      3: 9,
      4: 8,
      5: 7,
      6: 7,
    };
    return as923Map[dr];
  }

  return undefined;
}

/**
 * Get spreading factor from frame - handles both nested and direct structure
 * Also handles data rate indices that need to be mapped to SF
 */
function getSpreadingFactor(frame: FrameData): number | undefined {
  // Try nested structure first (dr.lora.spreading_factor)
  let sf = frame.dr?.lora?.spreading_factor;
  if (sf !== undefined) {
    // Check if it's a valid SF (7-12) or a DR index (0-15)
    if (sf >= 7 && sf <= 12) {
      return sf;
    }
    // It's a DR index, map it
    const bw = frame.dr?.lora?.bandwidth;
    const freq = (frame as any).frequency;
    return mapDataRateToSpreadingFactor(sf, bw || 125000, freq);
  }

  // Try direct structure (dr.spreading_factor)
  sf = (frame.dr as any)?.spreading_factor;
  if (sf !== undefined) {
    // Check if it's a valid SF (7-12) or a DR index (0-15)
    if (sf >= 7 && sf <= 12) {
      return sf;
    }
    // It's a DR index, map it
    const bw = (frame.dr as any)?.bandwidth;
    const freq = (frame as any).frequency;
    return mapDataRateToSpreadingFactor(sf, bw || 125000, freq);
  }

  return undefined;
}

/**
 * Get bandwidth from frame - handles both nested and direct structure
 */
function getBandwidth(frame: FrameData): number | undefined {
  // Try nested structure first (dr.lora.bandwidth)
  if (frame.dr?.lora?.bandwidth !== undefined) {
    return frame.dr.lora.bandwidth;
  }
  // Try direct structure (dr.bandwidth)
  if ((frame.dr as any)?.bandwidth !== undefined) {
    return (frame.dr as any).bandwidth;
  }
  return undefined;
}

/**
 * Analyze spreading factor distribution across frames
 */
export function analyzeSpreadingFactor(frames: FrameData[]): SpreadingFactorDistribution {
  const distribution = {
    SF7: 0,
    SF8: 0,
    SF9: 0,
    SF10: 0,
    SF11: 0,
    SF12: 0,
  };

  frames.forEach((frame, index) => {
    const sf = getSpreadingFactor(frame);
    if (index === 0) {
      console.log('analyzeSpreadingFactor - First frame SF:', sf, 'dr object:', frame.dr);
    }
    if (sf) {
      const key = `SF${sf}` as keyof typeof distribution;
      if (key in distribution) {
        distribution[key]++;
      } else {
        console.warn(`Invalid spreading factor: ${sf} (expected 7-12)`);
      }
    }
  });

  console.log('analyzeSpreadingFactor - Distribution:', distribution);

  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const percentages: Record<string, number> = {};

  Object.entries(distribution).forEach(([key, value]) => {
    percentages[key] = total > 0 ? (value / total) * 100 : 0;
  });

  return { ...distribution, total, percentages };
}

/**
 * Analyze frequency distribution across frames
 * Converts Hz to MHz and groups by frequency
 */
export function analyzeFrequency(frames: FrameData[]): FrequencyDistribution {
  const frequencyCount: Record<string, number> = {};

  frames.forEach((frame) => {
    if (frame.frequency !== undefined) {
      // Convert Hz to MHz with 3 decimal precision (e.g., 868100000 -> "868.100")
      const frequencyMHz = (frame.frequency / 1000000).toFixed(3);
      frequencyCount[frequencyMHz] = (frequencyCount[frequencyMHz] || 0) + 1;
    }
  });

  const total = Object.values(frequencyCount).reduce((a, b) => a + b, 0);

  // Sort frequencies numerically
  const frequencies = Object.keys(frequencyCount).sort((a, b) => parseFloat(a) - parseFloat(b));

  return {
    ...frequencyCount,
    total,
    frequencies,
  };
}

/**
 * Calculate energy impact of transmissions
 */
export function calculateEnergyImpact(
  frames: FrameData[],
  config: EnergyConfig = { txCurrentMa: 40, voltage: 3.3 }
): EnergyMetrics {
  let totalEnergyMah = 0;
  const energyBySF: Record<string, number> = {};

  frames.forEach(frame => {
    const sf = getSpreadingFactor(frame);
    const bw = getBandwidth(frame);
    const payloadSize = getPayloadSize(frame.raw_payload);

    if (sf && bw) {
      const airtimeMs = calculateAirtime({
        spreadingFactor: sf,
        bandwidth: bw,
        payloadBytes: payloadSize,
      });

      // Energy = Airtime (hours) × Current (mA)
      const energyMah = (airtimeMs / 3600000) * config.txCurrentMa;
      totalEnergyMah += energyMah;

      const sfKey = `SF${sf}`;
      energyBySF[sfKey] = (energyBySF[sfKey] || 0) + energyMah;
    }
  });

  return {
    totalEnergyMah,
    averageEnergyPerTx: frames.length > 0 ? totalEnergyMah / frames.length : 0,
    energyBySpreadingFactor: energyBySF,
    powerConsumptionMw: config.txCurrentMa * config.voltage,
  };
}

/**
 * Prepare time-series data for chart visualization
 */
export function prepareTimeSeriesData(frames: FrameData[]): TimeSeriesDataPoint[] {
  return frames
    .map((frame, index) => {
      const sf = getSpreadingFactor(frame);
      const bw = getBandwidth(frame);
      const payloadSize = getPayloadSize(frame.raw_payload);

      if (index === 0) {
        console.log('prepareTimeSeriesData - First frame:', {
          sf,
          bw,
          payloadSize,
          raw_payload: frame.raw_payload,
        });
      }

      // Calculate airtime if data available
      let airtime: number | undefined;
      if (sf && bw) {
        airtime = calculateAirtime({
          spreadingFactor: sf,
          bandwidth: bw,
          payloadBytes: payloadSize,
        });
        if (index === 0) {
          console.log('prepareTimeSeriesData - Calculated airtime:', airtime);
        }
      } else {
        if (index === 0) {
          console.log('prepareTimeSeriesData - Missing SF or BW, cannot calculate airtime');
        }
      }

      // Get best gateway RSSI/SNR (highest RSSI)
      const bestGateway = getBestGateway(frame.rx_info);
      let gatewayCount = 0;

      if (frame.rx_info && frame.rx_info.length > 0) {
        gatewayCount = frame.rx_info.length;
      }

      // Extract and convert frequency from Hz to MHz
      const frequencyHz = frame.frequency;
      const frequencyMHz = frequencyHz !== undefined ? frequencyHz / 1000000 : undefined;

      return {
        timestamp: frame.received_at,
        timestampMs: new Date(frame.received_at).getTime(),
        rssi: bestGateway?.rssi,
        snr: bestGateway?.snr,
        spreadingFactor: sf,
        airtime,
        energy: airtime ? (airtime / 3600000) * 40 : undefined, // Using 40mA default
        gatewayCount,
        frequency: frequencyMHz,
      };
    })
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

/**
 * Get the dominant (most common) spreading factor
 */
export function getDominantSpreadingFactor(distribution: SpreadingFactorDistribution): string {
  if (distribution.total === 0) return 'N/A';

  const entries = Object.entries(distribution)
    .filter(([key]) => key.startsWith('SF'))
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  return entries[0]?.[0] || 'N/A';
}
