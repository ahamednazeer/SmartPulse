import { Injectable } from '@nestjs/common';

@Injectable()
export class MarkovService {
  /**
   * Trains a simple 1st-order Markov Chain transition matrix from a history of app sequences.
   * Return a matrix representing the probability of moving from App A -> App B.
   */
  public trainTransitionMatrix(
    sequences: string[][],
  ): Record<string, Record<string, number>> {
    const counts: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};

    for (const seq of sequences) {
      for (let i = 0; i < seq.length - 1; i++) {
        const from = seq[i];
        const to = seq[i + 1];

        if (!counts[from]) counts[from] = {};
        if (!counts[from][to]) counts[from][to] = 0;

        counts[from][to]++;
        totals[from] = (totals[from] || 0) + 1;
      }
    }

    const probabilities: Record<string, Record<string, number>> = {};
    for (const [from, toCounts] of Object.entries(counts)) {
      probabilities[from] = {};
      for (const [to, count] of Object.entries(toCounts)) {
        probabilities[from][to] = count / totals[from];
      }
    }

    return probabilities;
  }

  /**
   * Given a current app and a transition matrix, predict the most likely next app.
   */
  public predictNextApp(
    currentApp: string,
    transitionMatrix: Record<string, Record<string, number>>,
  ): { predictedApp: string | null; probability: number } {
    const transitions = transitionMatrix[currentApp];
    if (!transitions) {
      return { predictedApp: null, probability: 0 };
    }

    let maxProb = -1;
    let nextApp = null;

    for (const [to, prob] of Object.entries(transitions)) {
      if (prob > maxProb) {
        maxProb = prob;
        nextApp = to;
      }
    }

    return { predictedApp: nextApp, probability: maxProb };
  }
}
