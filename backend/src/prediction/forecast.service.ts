import { Injectable } from '@nestjs/common';

@Injectable()
export class ForecastService {
  /**
   * Forecasts the next N steps using Simple Exponential Smoothing (SES).
   * Alpha represents the weighting factor (0 < alpha <= 1).
   * Higher alpha gives more weight to recent observations.
   */
  public exponentialSmoothingForecast(
    timeSeries: number[],
    alpha = 0.3,
    steps = 7,
  ): number[] {
    if (timeSeries.length === 0) return Array<number>(steps).fill(0);
    if (timeSeries.length === 1)
      return Array<number>(steps).fill(timeSeries[0]);

    let smoothed = timeSeries[0]; // Initialize with first value

    // Calculate smoothed levels for existing data
    for (let i = 1; i < timeSeries.length; i++) {
      smoothed = alpha * timeSeries[i] + (1 - alpha) * smoothed;
    }

    // For SES, the forecast for all future steps is a flat line extending from the last smoothed calculation
    // More advanced models (Holt-Winters) could capture trend/seasonality, but SES is a strong short-term baseline.
    return Array<number>(steps).fill(Math.max(0, smoothed));
  }
}
