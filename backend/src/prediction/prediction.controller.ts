import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PredictionService } from './prediction.service';
import { MarkovService } from './markov.service';
import { AnomalyService } from './anomaly.service';
import { ForecastService } from './forecast.service';
import { ContextScorerService } from './context-scorer.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('prediction')
@UseGuards(JwtAuthGuard)
export class PredictionController {
  constructor(
    private readonly predictionService: PredictionService,
    private readonly markovService: MarkovService,
    private readonly anomalyService: AnomalyService,
    private readonly forecastService: ForecastService,
    private readonly contextScorerService: ContextScorerService,
  ) {}

  @Post('run')
  async runPrediction(@Request() req: AuthenticatedRequest) {
    return this.predictionService.runPrediction(req.user.id);
  }

  @Post('train')
  async trainModel(@Request() req: AuthenticatedRequest) {
    return this.predictionService.trainModel(req.user.id);
  }

  @Get('latest')
  async getLatest(@Request() req: AuthenticatedRequest) {
    return this.predictionService.getLatestPrediction(req.user.id);
  }

  @Get('history')
  async getHistory(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.predictionService.getPredictionHistory(
      req.user.id,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('monitor')
  async getMonitoring(
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.predictionService.getModelMonitoring(
      req.user.id,
      days ? parseInt(days, 10) : 90,
    );
  }

  @Get('training-summary')
  async getTrainingSummary(@Request() req: AuthenticatedRequest) {
    return this.predictionService.getLatestTrainingSummary(req.user.id);
  }

  @Get('advanced')
  async getAdvancedML(@Request() req: AuthenticatedRequest) {
    const history = await this.predictionService.getPredictionHistory(
      req.user.id,
      30,
    );

    // 1. Time Series Forecast (Extract riskScores up to 30 days)
    const riskScores = history.map((h) => h.riskScore).reverse();
    const forecast = this.forecastService.exponentialSmoothingForecast(
      riskScores,
      0.4,
      7,
    );

    // 2. Anomaly Detection (Check if the most recent score is an anomaly)
    const recentScore =
      riskScores.length > 0 ? riskScores[riskScores.length - 1] : 0;
    const anomaly = this.anomalyService.detectAnomaly(
      recentScore,
      riskScores.slice(0, Math.max(0, riskScores.length - 1)),
    );

    // 3. Markov Chain Dopamine Loop (Mocking sequence for demo utilizing the context vectors in real use case)
    const mockSequences = [
      ['Instagram', 'TikTok', 'YouTube', 'WhatsApp'],
      ['Instagram', 'WhatsApp', 'Chrome', 'Gmail'],
      ['TikTok', 'YouTube', 'Netflix'],
    ];
    const transitionMatrix =
      this.markovService.trainTransitionMatrix(mockSequences);
    const markovPrediction = this.markovService.predictNextApp(
      'Instagram',
      transitionMatrix,
    );

    // 4. Context Matching
    // Extracting a sample recent context if available, otherwise defaulting
    let bestIntervention = 'Micro Check-In';
    if (history.length > 0) {
      const recentFeature = history[0].featureVector as unknown as Record<string, unknown>;
      const advancedSensors = recentFeature?.advancedSensors as
        | Record<string, unknown>
        | undefined;
      const recentLatency =
        typeof advancedSensors?.avgLatencySec === 'number'
          ? advancedSensors.avgLatencySec
          : 15;
      const activityCtx = recentFeature?.activityContext as
        | Record<string, unknown>
        | undefined;
      const recentActivity =
        typeof activityCtx?.currentActivity === 'string'
          ? activityCtx.currentActivity
          : 'Stationary';
      bestIntervention =
        this.contextScorerService.getBestInterventionForContext(
          recentActivity,
          recentLatency,
        );
    }

    return {
      forecasting: {
        method: 'Single Exponential Smoothing (SES)',
        next7DaysRiskForecast: forecast,
      },
      anomalyDetection: {
        method: 'Z-Score Statistical Detection',
        latestScoreAnomaly: anomaly,
      },
      markovChains: {
        method: '1st-Order Transition Matrix',
        predictedNextAppFromInstagram: markovPrediction,
        transitionMatrix,
      },
      contextScorer: {
        method: 'Statistical Naive Rules',
        recommendedIntervention: bestIntervention,
      },
    };
  }
}
