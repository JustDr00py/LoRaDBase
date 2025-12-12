import React from 'react';
import type { SignalQualityMetrics, SpreadingFactorDistribution, EnergyMetrics } from '../../types/api';

interface KPISummaryCardsProps {
  totalTransmissions: number;
  signalQuality: SignalQualityMetrics;
  spreadingFactor: SpreadingFactorDistribution;
  energy: EnergyMetrics;
  averageAirtime: number;
  dominantSF: string;
}

export const KPISummaryCards: React.FC<KPISummaryCardsProps> = ({
  totalTransmissions,
  signalQuality,
  spreadingFactor,
  energy,
  averageAirtime,
  dominantSF,
}) => {
  // Determine color class for RSSI (green >-100, yellow -100 to -120, red <-120)
  const getRSSIColorClass = (rssi: number): string => {
    if (rssi > -100) return 'success';
    if (rssi > -120) return 'warning';
    return 'danger';
  };

  // Determine color class for SNR (green >0, yellow -5 to 0, red <-5)
  const getSNRColorClass = (snr: number): string => {
    if (snr > 0) return 'success';
    if (snr > -5) return 'warning';
    return 'danger';
  };

  return (
    <div className="kpi-summary-grid">
      <div className="kpi-card">
        <div className="kpi-label">Total Transmissions</div>
        <div className="kpi-value">{totalTransmissions}</div>
        <div className="kpi-subtitle">Uplink frames</div>
      </div>

      <div className={`kpi-card ${getRSSIColorClass(signalQuality.averageRSSI)}`}>
        <div className="kpi-label">Average RSSI</div>
        <div className="kpi-value">
          {signalQuality.averageRSSI.toFixed(1)}
          <span className="kpi-unit">dBm</span>
        </div>
        <div className="kpi-subtitle">
          Range: {signalQuality.minRSSI.toFixed(1)} to {signalQuality.maxRSSI.toFixed(1)} dBm
        </div>
      </div>

      <div className={`kpi-card ${getSNRColorClass(signalQuality.averageSNR)}`}>
        <div className="kpi-label">Average SNR</div>
        <div className="kpi-value">
          {signalQuality.averageSNR.toFixed(1)}
          <span className="kpi-unit">dB</span>
        </div>
        <div className="kpi-subtitle">
          Range: {signalQuality.minSNR.toFixed(1)} to {signalQuality.maxSNR.toFixed(1)} dB
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Average Airtime</div>
        <div className="kpi-value">
          {averageAirtime.toFixed(2)}
          <span className="kpi-unit">ms</span>
        </div>
        <div className="kpi-subtitle">Per transmission</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Total Energy</div>
        <div className="kpi-value">
          {energy.totalEnergyMah.toFixed(4)}
          <span className="kpi-unit">mAh</span>
        </div>
        <div className="kpi-subtitle">
          Avg: {energy.averageEnergyPerTx.toFixed(6)} mAh/tx (40mA TX current)
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Dominant Spreading Factor</div>
        <div className="kpi-value">{dominantSF}</div>
        <div className="kpi-subtitle">
          {spreadingFactor.total > 0 &&
            `${((spreadingFactor[dominantSF as keyof typeof spreadingFactor] as number / spreadingFactor.total) * 100).toFixed(1)}% of transmissions`
          }
        </div>
      </div>
    </div>
  );
};
