import { Injectable } from '@nestjs/common';

export interface AnomalyResult {
  isAnomaly: boolean;
  zScore: number;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

@Injectable()
export class AnomalyService {
  /**
   * Calculates a Z-Score for a new value against a historical baseline array.
   * Assumes values are normally distributed.
   */
  public detectAnomaly(
    currentValue: number,
    historicalValues: number[],
  ): AnomalyResult {
    if (historicalValues.length < 3) {
      return { isAnomaly: false, zScore: 0, severity: 'NORMAL' };
    }

    const mean =
      historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const variance =
      historicalValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      historicalValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return {
        isAnomaly: currentValue !== mean,
        zScore: currentValue !== mean ? 99 : 0,
        severity: currentValue !== mean ? 'CRITICAL' : 'NORMAL',
      };
    }

    const zScore = (currentValue - mean) / stdDev;
    const absZ = Math.abs(zScore);

    let severity: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    if (absZ >= 3.0) {
      severity = 'CRITICAL';
    } else if (absZ >= 2.0) {
      severity = 'WARNING';
    }

    return {
      isAnomaly: absZ >= 2.0,
      zScore,
      severity,
    };
  }
}
