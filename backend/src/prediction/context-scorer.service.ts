import { Injectable } from '@nestjs/common';

@Injectable()
export class ContextScorerService {
  /**
   * Matches the best possible intervention to a specific context.
   * Simple naive implementation relying on statistical ranking.
   */
  public getBestInterventionForContext(
    currentActivity: string,
    currentLatency: number,
  ): string {
    // If they are highly impulsive (fast reaction) and stationary, block app
    if (currentLatency < 10 && currentActivity === 'Stationary') {
      return 'Hard App Lock';
    }

    // If they are commuting/walking and moderately impulsive, use an audio or gentle nudge
    if (
      currentLatency < 20 &&
      (currentActivity === 'Walking' || currentActivity === 'InVehicle')
    ) {
      return 'Vibration Pattern Nudge';
    }

    // Defaults
    return 'Micro Check-In';
  }
}
