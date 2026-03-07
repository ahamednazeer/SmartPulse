import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PredictionResult } from '../entities/prediction-result.entity';
import { ModelProfile } from '../entities/model-profile.entity';
import { GroundTruthLabel } from '../entities/ground-truth-label.entity';
import {
  PreprocessingService,
  PreprocessedFeatureSet,
} from '../preprocessing/preprocessing.service';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface EnsembleWeights {
  randomForest: number;
  extraTrees: number;
  svm: number;
}

export interface PredictionResultView {
  id: string;
  date: string;
  riskScore: number;
  riskLevel: RiskLevel;
  randomForestScore: number;
  extraTreesScore: number;
  svmScore: number;
  featureVector: PreprocessedFeatureSet | null;
  insights: string[];
  modelWeights: EnsembleWeights;
  createdAt: Date;
  updatedAt: Date;
}

interface TrainingSample {
  date: string;
  featureVector: Record<string, number>;
  label: RiskLevel;
  labelSource: 'GROUND_TRUTH' | 'DERIVED_FEATURE' | 'DERIVED_PREDICTION';
}

interface SamplePrediction {
  actualLabel: RiskLevel;
  predictedLabel: RiskLevel;
  riskScore: number;
}

export interface ClassificationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
}

export interface PredictionTrainingSummary {
  trainedAt: string;
  dataset: {
    totalSamples: number;
    trainSamples: number;
    validationSamples: number;
    testSamples: number;
    classDistribution: Record<RiskLevel, number>;
    labelSourceDistribution: Record<
      'GROUND_TRUTH' | 'DERIVED_FEATURE' | 'DERIVED_PREDICTION',
      number
    >;
  };
  split: {
    trainRatio: number;
    validationRatio: number;
    testRatio: number;
  };
  bestWeights: EnsembleWeights;
  validationMetrics: ClassificationMetrics;
  testMetrics: ClassificationMetrics;
  crossValidationF1: number;
  gridSearch: Array<{
    weights: EnsembleWeights;
    validationF1: number;
  }>;
  featureImportance: Record<string, number>;
  monitoring: ModelMonitoringSummary;
  notes: string[];
}

interface LearnedLinearModel {
  featureKeys: string[];
  meanByFeature: Record<string, number>;
  stdByFeature: Record<string, number>;
  coefficients: Record<string, number>;
  intercept: number;
}

interface LearnedScorers {
  randomForest: LearnedLinearModel | null;
  extraTrees: LearnedLinearModel | null;
  svm: LearnedLinearModel | null;
}

interface CalibrationBinSummary {
  binStart: number;
  binEnd: number;
  count: number;
  avgPredictedHighProbability: number;
  observedHighRate: number;
}

interface SegmentAuditSummary {
  segment: string;
  sampleCount: number;
  accuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  predictedHighRate: number;
  observedHighRate: number;
}

export interface ModelMonitoringSummary {
  generatedAt: string;
  evaluationWindowDays: number;
  evaluatedSampleCount: number;
  calibration: {
    brierScore: number;
    expectedCalibrationError: number;
    bins: CalibrationBinSummary[];
  };
  backtest: {
    windowMetrics: Array<{
      windowDays: number;
      metrics: ClassificationMetrics;
      sampleCount: number;
    }>;
  };
  drift: {
    flaggedFeatures: string[];
    featureShift: Record<string, number>;
  };
  fairnessAudit: {
    segments: SegmentAuditSummary[];
    maxAccuracyGap: number;
    maxFalsePositiveRateGap: number;
  };
}

function toRiskLevel(value: string): RiskLevel {
  if (value === 'LOW' || value === 'MODERATE' || value === 'HIGH') {
    return value;
  }
  return 'MODERATE';
}

const DEFAULT_WEIGHTS: EnsembleWeights = {
  randomForest: 0.4,
  extraTrees: 0.35,
  svm: 0.25,
};

const WEIGHT_GRID: EnsembleWeights[] = [
  { randomForest: 0.45, extraTrees: 0.35, svm: 0.2 },
  { randomForest: 0.4, extraTrees: 0.35, svm: 0.25 },
  { randomForest: 0.35, extraTrees: 0.4, svm: 0.25 },
  { randomForest: 0.3, extraTrees: 0.45, svm: 0.25 },
  { randomForest: 0.4, extraTrees: 0.3, svm: 0.3 },
  { randomForest: 0.5, extraTrees: 0.25, svm: 0.25 },
  { randomForest: 0.33, extraTrees: 0.33, svm: 0.34 },
];

@Injectable()
export class PredictionService {
  constructor(
    @InjectRepository(PredictionResult)
    private readonly predictionRepository: Repository<PredictionResult>,
    @InjectRepository(ModelProfile)
    private readonly modelProfileRepository: Repository<ModelProfile>,
    @InjectRepository(GroundTruthLabel)
    private readonly groundTruthRepository: Repository<GroundTruthLabel>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly preprocessingService: PreprocessingService,
  ) {}

  async runPrediction(userId: string): Promise<PredictionResultView> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [profile, weights, learnedScorers] = await Promise.all([
      this.preprocessingService.preprocessUserData(userId),
      this.getModelWeights(userId),
      this.getLearnedScorers(userId),
    ]);

    const featureVector = profile.features;
    const randomForestScore = this.scoreRandomForestLike(
      featureVector,
      learnedScorers?.randomForest ?? null,
    );
    const extraTreesScore = this.scoreExtraTreesLike(
      featureVector,
      learnedScorers?.extraTrees ?? null,
    );
    const svmScore = this.scoreSvmLike(
      featureVector,
      learnedScorers?.svm ?? null,
    );

    const riskScore = this.combineScores(
      randomForestScore,
      extraTreesScore,
      svmScore,
      weights,
    );
    const riskLevel = this.classifyRisk(riskScore);
    const insights = this.buildPredictionInsights(featureVector, riskLevel);

    let prediction = await this.predictionRepository.findOne({
      where: { user: { id: userId }, date: profile.date },
    });

    if (!prediction) {
      prediction = this.predictionRepository.create({
        user,
        date: profile.date,
      });
    }

    prediction.riskScore = riskScore;
    prediction.riskLevel = riskLevel;
    prediction.randomForestScore = randomForestScore;
    prediction.extraTreesScore = extraTreesScore;
    prediction.svmScore = svmScore;
    prediction.featureVectorJson = JSON.stringify(featureVector);
    prediction.insightsJson = JSON.stringify(insights);

    const saved = await this.predictionRepository.save(prediction);
    await this.refreshMonitoringSnapshotIfStale(userId);
    return this.sanitize(saved, weights);
  }

  async trainModel(userId: string): Promise<PredictionTrainingSummary> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure at least one fresh feature snapshot for current state.
    await this.preprocessingService.preprocessUserData(userId, {
      persist: true,
    });

    const samples = await this.loadTrainingSamples(userId);
    const notes: string[] = [];
    if (samples.length < 12) {
      notes.push(
        'Insufficient historical samples for robust training. Minimum recommended samples: 12.',
      );
    }

    const groundTruthSamples = samples.filter(
      (item) => item.labelSource === 'GROUND_TRUTH',
    ).length;
    if (groundTruthSamples === 0) {
      notes.push(
        'No ground-truth labels found. Training uses derived labels; add validated labels via /api/ground-truth/label for stronger supervision.',
      );
    } else if (groundTruthSamples < 8) {
      notes.push(
        `Ground-truth coverage is limited (${groundTruthSamples} sample(s)). Model quality may be unstable.`,
      );
    }

    const sortedSamples = samples.sort((a, b) => a.date.localeCompare(b.date));
    const { trainSet, validationSet, testSet } =
      this.splitDataset(sortedSamples);
    const classDistribution = this.classDistribution(sortedSamples);
    const labelSourceDistribution = this.labelSourceDistribution(sortedSamples);
    const learnedScorers = this.trainLearnedScorers(trainSet);
    if (!learnedScorers) {
      notes.push(
        'Trainable linear scorers were not produced (not enough stable feature samples). Falling back to deterministic scoring rules.',
      );
    }

    let bestWeights = DEFAULT_WEIGHTS;
    let bestValidationMetrics = this.emptyMetrics();
    let bestScore = -1;
    const gridSearchResults: Array<{
      weights: EnsembleWeights;
      validationF1: number;
    }> = [];

    for (const candidateWeights of WEIGHT_GRID) {
      const validationPredictions = this.predictSamples(
        validationSet,
        candidateWeights,
        learnedScorers,
      );
      const validationMetrics = this.computeMetrics(validationPredictions);
      gridSearchResults.push({
        weights: candidateWeights,
        validationF1: validationMetrics.f1Score,
      });

      const tieBreaker = validationMetrics.accuracy;
      const candidateScore = validationMetrics.f1Score * 1000 + tieBreaker;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestWeights = candidateWeights;
        bestValidationMetrics = validationMetrics;
      }
    }

    const recalculatedImportance = this.buildFeatureImportance(
      learnedScorers,
      bestWeights,
    );
    const testPredictions = this.predictSamples(
      testSet,
      bestWeights,
      learnedScorers,
    );
    const testMetrics = this.computeMetrics(testPredictions);
    const crossValidationF1 = this.crossValidateF1(
      trainSet,
      bestWeights,
      3,
      learnedScorers,
    );
    const monitoring = await this.buildMonitoringSummary(userId, 90);

    await this.upsertModelProfile(userId, {
      weights: bestWeights,
      searchSummary: gridSearchResults,
      metrics: {
        validation: bestValidationMetrics,
        test: testMetrics,
        crossValidationF1,
      },
      learnedScorers,
      featureImportance: recalculatedImportance,
      monitoring,
      trainedSampleCount: sortedSamples.length,
    });

    return {
      trainedAt: new Date().toISOString(),
      dataset: {
        totalSamples: sortedSamples.length,
        trainSamples: trainSet.length,
        validationSamples: validationSet.length,
        testSamples: testSet.length,
        classDistribution,
        labelSourceDistribution,
      },
      split: {
        trainRatio: 0.7,
        validationRatio: 0.15,
        testRatio: 0.15,
      },
      bestWeights,
      validationMetrics: bestValidationMetrics,
      testMetrics,
      crossValidationF1,
      gridSearch: gridSearchResults,
      featureImportance: recalculatedImportance,
      monitoring,
      notes,
    };
  }

  async getLatestPrediction(
    userId: string,
  ): Promise<PredictionResultView | null> {
    const latest = await this.predictionRepository.findOne({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
    });

    if (!latest) {
      return null;
    }

    const weights = await this.getModelWeights(userId);
    return this.sanitize(latest, weights);
  }

  async getPredictionHistory(
    userId: string,
    limit = 30,
  ): Promise<PredictionResultView[]> {
    const results = await this.predictionRepository.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: limit,
    });

    const weights = await this.getModelWeights(userId);
    return results.map((item) => this.sanitize(item, weights));
  }

  async getModelMonitoring(
    userId: string,
    days = 90,
  ): Promise<ModelMonitoringSummary> {
    const safeDays = Math.max(30, Math.min(365, days));
    return this.buildMonitoringSummary(userId, safeDays);
  }

  private async loadTrainingSamples(userId: string): Promise<TrainingSample[]> {
    const [featureStoreRecords, historicalPredictions, validatedLabels] =
      await Promise.all([
        this.preprocessingService.getFeatureStoreRecords(userId, 365),
        this.predictionRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: 365,
        }),
        this.groundTruthRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: 365,
        }),
      ]);

    const groundTruthByDate = new Map<string, RiskLevel>();
    validatedLabels.forEach((item) => {
      groundTruthByDate.set(item.date, toRiskLevel(item.label));
    });

    const byDate = new Map<string, TrainingSample>();

    featureStoreRecords.forEach((record) => {
      const groundTruthLabel = groundTruthByDate.get(record.date);
      byDate.set(record.date, {
        date: record.date,
        featureVector: record.featureVector,
        label: groundTruthLabel ?? record.addictionLabel,
        labelSource: groundTruthLabel ? 'GROUND_TRUTH' : 'DERIVED_FEATURE',
      });
    });

    historicalPredictions.forEach((prediction) => {
      const existing = byDate.get(prediction.date);
      if (existing) {
        return;
      }
      const groundTruthLabel = groundTruthByDate.get(prediction.date);
      byDate.set(prediction.date, {
        date: prediction.date,
        featureVector: this.parseFeatureVector(prediction.featureVectorJson),
        label: groundTruthLabel ?? toRiskLevel(prediction.riskLevel),
        labelSource: groundTruthLabel ? 'GROUND_TRUTH' : 'DERIVED_PREDICTION',
      });
    });

    return Array.from(byDate.values()).filter(
      (item) => Object.keys(item.featureVector).length > 0,
    );
  }

  private splitDataset(samples: TrainingSample[]): {
    trainSet: TrainingSample[];
    validationSet: TrainingSample[];
    testSet: TrainingSample[];
  } {
    if (samples.length === 0) {
      return {
        trainSet: [],
        validationSet: [],
        testSet: [],
      };
    }

    const total = samples.length;
    const trainEnd = Math.max(1, Math.floor(total * 0.7));
    const validationEnd = Math.max(trainEnd + 1, Math.floor(total * 0.85));

    const trainSet = samples.slice(0, trainEnd);
    const validationSet = samples.slice(trainEnd, validationEnd);
    const testSet = samples.slice(validationEnd);

    if (validationSet.length === 0) {
      validationSet.push(trainSet[trainSet.length - 1]);
    }

    if (testSet.length === 0) {
      testSet.push(validationSet[validationSet.length - 1]);
    }

    return {
      trainSet,
      validationSet,
      testSet,
    };
  }

  private classDistribution(
    samples: TrainingSample[],
  ): Record<RiskLevel, number> {
    return samples.reduce(
      (acc, sample) => {
        acc[sample.label] += 1;
        return acc;
      },
      { LOW: 0, MODERATE: 0, HIGH: 0 } as Record<RiskLevel, number>,
    );
  }

  private labelSourceDistribution(
    samples: TrainingSample[],
  ): Record<'GROUND_TRUTH' | 'DERIVED_FEATURE' | 'DERIVED_PREDICTION', number> {
    return samples.reduce(
      (acc, sample) => {
        acc[sample.labelSource] += 1;
        return acc;
      },
      {
        GROUND_TRUTH: 0,
        DERIVED_FEATURE: 0,
        DERIVED_PREDICTION: 0,
      } as Record<'GROUND_TRUTH' | 'DERIVED_FEATURE' | 'DERIVED_PREDICTION', number>,
    );
  }

  private predictSamples(
    samples: TrainingSample[],
    weights: EnsembleWeights,
    learnedScorers: LearnedScorers | null = null,
  ): SamplePrediction[] {
    return samples.map((sample) => {
      const rf = this.scoreRandomForestLikeFromMap(
        sample.featureVector,
        learnedScorers?.randomForest ?? null,
      );
      const et = this.scoreExtraTreesLikeFromMap(
        sample.featureVector,
        learnedScorers?.extraTrees ?? null,
      );
      const svm = this.scoreSvmLikeFromMap(
        sample.featureVector,
        learnedScorers?.svm ?? null,
      );
      const score = this.combineScores(rf, et, svm, weights);
      return {
        actualLabel: sample.label,
        predictedLabel: this.classifyRisk(score),
        riskScore: score,
      };
    });
  }

  private computeMetrics(
    predictions: SamplePrediction[],
  ): ClassificationMetrics {
    if (predictions.length === 0) {
      return this.emptyMetrics();
    }

    const labels: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH'];
    const total = predictions.length;
    const correct = predictions.filter(
      (item) => item.actualLabel === item.predictedLabel,
    ).length;
    const accuracy = (correct / total) * 100;

    let precisionSum = 0;
    let recallSum = 0;
    let f1Sum = 0;

    for (const label of labels) {
      const tp = predictions.filter(
        (item) => item.actualLabel === label && item.predictedLabel === label,
      ).length;
      const fp = predictions.filter(
        (item) => item.actualLabel !== label && item.predictedLabel === label,
      ).length;
      const fn = predictions.filter(
        (item) => item.actualLabel === label && item.predictedLabel !== label,
      ).length;

      const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
      const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
      const f1 =
        precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall);

      precisionSum += precision;
      recallSum += recall;
      f1Sum += f1;
    }

    const rocAuc = this.computeHighRiskRocAuc(predictions);

    return {
      accuracy: this.round2(accuracy),
      precision: this.round2((precisionSum / labels.length) * 100),
      recall: this.round2((recallSum / labels.length) * 100),
      f1Score: this.round2((f1Sum / labels.length) * 100),
      rocAuc: this.round2(rocAuc * 100),
    };
  }

  private computeHighRiskRocAuc(predictions: SamplePrediction[]): number {
    const ranked = [...predictions].sort((a, b) => a.riskScore - b.riskScore);
    const positives = ranked.filter(
      (item) => item.actualLabel === 'HIGH',
    ).length;
    const negatives = ranked.length - positives;

    if (positives === 0 || negatives === 0) {
      return 0.5;
    }

    let rankSum = 0;
    for (let i = 0; i < ranked.length; i += 1) {
      if (ranked[i].actualLabel === 'HIGH') {
        rankSum += i + 1;
      }
    }

    const auc =
      (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
    return this.clamp(auc, 0, 1);
  }

  private crossValidateF1(
    samples: TrainingSample[],
    weights: EnsembleWeights,
    folds: number,
    learnedScorers: LearnedScorers | null = null,
  ): number {
    if (samples.length < folds || folds <= 1) {
      return 0;
    }

    const foldSize = Math.max(1, Math.floor(samples.length / folds));
    const foldScores: number[] = [];

    for (let index = 0; index < folds; index += 1) {
      const start = index * foldSize;
      const end = index === folds - 1 ? samples.length : start + foldSize;
      const validation = samples.slice(start, end);
      const predictions = this.predictSamples(
        validation,
        weights,
        learnedScorers,
      );
      foldScores.push(this.computeMetrics(predictions).f1Score);
    }

    if (foldScores.length === 0) {
      return 0;
    }

    return this.round2(
      foldScores.reduce((sum, score) => sum + score, 0) / foldScores.length,
    );
  }

  private async upsertModelProfile(
    userId: string,
    payload: {
      weights: EnsembleWeights;
      searchSummary: Array<{ weights: EnsembleWeights; validationF1: number }>;
      metrics: {
        validation: ClassificationMetrics;
        test: ClassificationMetrics;
        crossValidationF1: number;
      };
      learnedScorers: LearnedScorers | null;
      featureImportance: Record<string, number>;
      monitoring: ModelMonitoringSummary;
      trainedSampleCount: number;
    },
  ): Promise<void> {
    let profile = await this.modelProfileRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!profile) {
      profile = this.modelProfileRepository.create({
        user: { id: userId } as User,
      });
    }

    profile.weightsJson = JSON.stringify(payload.weights);
    profile.searchSummaryJson = JSON.stringify(payload.searchSummary);
    profile.metricsJson = JSON.stringify(payload.metrics);
    profile.learnedModelJson = JSON.stringify(payload.learnedScorers ?? null);
    profile.featureImportanceJson = JSON.stringify(payload.featureImportance);
    profile.monitoringJson = JSON.stringify(payload.monitoring);
    profile.trainedSampleCount = payload.trainedSampleCount;
    profile.trainedAtIso = new Date().toISOString();

    await this.modelProfileRepository.save(profile);
  }

  private async getModelWeights(userId: string): Promise<EnsembleWeights> {
    const profile = await this.modelProfileRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!profile?.weightsJson) {
      return DEFAULT_WEIGHTS;
    }

    try {
      const parsed: unknown = JSON.parse(profile.weightsJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return DEFAULT_WEIGHTS;
      }

      const obj = parsed as Record<string, unknown>;
      const weights: EnsembleWeights = {
        randomForest:
          typeof obj.randomForest === 'number'
            ? obj.randomForest
            : DEFAULT_WEIGHTS.randomForest,
        extraTrees:
          typeof obj.extraTrees === 'number'
            ? obj.extraTrees
            : DEFAULT_WEIGHTS.extraTrees,
        svm: typeof obj.svm === 'number' ? obj.svm : DEFAULT_WEIGHTS.svm,
      };

      const sum = weights.randomForest + weights.extraTrees + weights.svm;
      if (sum <= 0) {
        return DEFAULT_WEIGHTS;
      }

      return {
        randomForest: this.round3(weights.randomForest / sum),
        extraTrees: this.round3(weights.extraTrees / sum),
        svm: this.round3(weights.svm / sum),
      };
    } catch {
      return DEFAULT_WEIGHTS;
    }
  }

  private async getLearnedScorers(
    userId: string,
  ): Promise<LearnedScorers | null> {
    const profile = await this.modelProfileRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!profile?.learnedModelJson) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(profile.learnedModelJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      const obj = parsed as Record<string, unknown>;
      return {
        randomForest: this.parseLearnedLinearModel(obj.randomForest),
        extraTrees: this.parseLearnedLinearModel(obj.extraTrees),
        svm: this.parseLearnedLinearModel(obj.svm),
      };
    } catch {
      return null;
    }
  }

  private scoreRandomForestLike(
    features: PreprocessedFeatureSet,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    if (learnedModel) {
      return this.scoreUsingLearnedModel(features, learnedModel);
    }

    const score =
      features.addictionBehaviorScore * 0.33 +
      features.digitalDependencyScore * 0.18 +
      features.socialMediaDependencyScore * 0.16 +
      features.lateNightUsageScore * 0.1 +
      features.sleepDisruptionScore * 0.07 +
      features.notificationLoadScore * 0.06 +
      features.sleepRegularityRiskScore * 0.06 +
      features.connectivityDisruptionScore * 0.04;
    return this.bound0to100(score);
  }

  private scoreExtraTreesLike(
    features: PreprocessedFeatureSet,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    if (learnedModel) {
      return this.scoreUsingLearnedModel(features, learnedModel);
    }

    const behaviorInteraction =
      (features.avgScreenTimeMinutes / 720) *
      (features.avgUnlockCount / 180) *
      100;

    const score =
      features.addictionBehaviorScore * 0.3 +
      features.compulsiveCheckingScore * 1.6 +
      features.psychologicalStressScore * 0.17 +
      features.productivityRiskScore * 0.08 +
      features.socialMediaIntensity * 0.09 +
      features.activityFragmentationScore * 0.08 +
      features.commuteImpulseScore * 0.04 +
      features.notificationLoadScore * 0.06 +
      this.bound0to100(behaviorInteraction) * 0.14;

    return this.bound0to100(score);
  }

  private scoreSvmLike(
    features: PreprocessedFeatureSet,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    if (learnedModel) {
      return this.scoreUsingLearnedModel(features, learnedModel);
    }

    const linearMargin =
      features.overallRiskSignal * 0.5 +
      features.digitalDependencyScore * 0.15 +
      features.psychologicalStressScore * 0.14 +
      features.sleepDisruptionScore * 0.08 +
      features.notificationLoadScore * 0.05 +
      features.sleepRegularityRiskScore * 0.04 +
      features.connectivityDisruptionScore * 0.04;

    return this.bound0to100(linearMargin);
  }

  private scoreRandomForestLikeFromMap(
    featureMap: Record<string, number>,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    return this.scoreRandomForestLike(
      this.mapToFeatureSet(featureMap),
      learnedModel,
    );
  }

  private scoreExtraTreesLikeFromMap(
    featureMap: Record<string, number>,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    return this.scoreExtraTreesLike(
      this.mapToFeatureSet(featureMap),
      learnedModel,
    );
  }

  private scoreSvmLikeFromMap(
    featureMap: Record<string, number>,
    learnedModel: LearnedLinearModel | null = null,
  ): number {
    return this.scoreSvmLike(this.mapToFeatureSet(featureMap), learnedModel);
  }

  private mapToFeatureSet(
    featureMap: Record<string, number>,
  ): PreprocessedFeatureSet {
    return {
      avgScreenTimeMinutes: this.featureValue(
        featureMap,
        'avgScreenTimeMinutes',
      ),
      avgUnlockCount: this.featureValue(featureMap, 'avgUnlockCount'),
      avgSocialMediaMinutes: this.featureValue(
        featureMap,
        'avgSocialMediaMinutes',
      ),
      avgNightUsageMinutes: this.featureValue(
        featureMap,
        'avgNightUsageMinutes',
      ),
      avgLongestSessionMinutes: this.featureValue(
        featureMap,
        'avgLongestSessionMinutes',
      ),
      avgNotificationCount: this.featureValue(featureMap, 'avgNotificationCount'),
      avgNotificationResponseRate: this.featureValue(
        featureMap,
        'avgNotificationResponseRate',
      ),
      avgSleepRegularityScore: this.featureValue(
        featureMap,
        'avgSleepRegularityScore',
      ),
      avgConnectivityTransitions: this.featureValue(
        featureMap,
        'avgConnectivityTransitions',
      ),
      avgOfflineMinutes: this.featureValue(featureMap, 'avgOfflineMinutes'),
      avgShortSessionCount: this.featureValue(
        featureMap,
        'avgShortSessionCount',
      ),
      avgCommuteMinutes: this.featureValue(featureMap, 'avgCommuteMinutes'),
      lateNightUsageScore: this.featureValue(featureMap, 'lateNightUsageScore'),
      socialMediaDependencyScore: this.featureValue(
        featureMap,
        'socialMediaDependencyScore',
      ),
      psychologicalStressScore: this.featureValue(
        featureMap,
        'psychologicalStressScore',
      ),
      sleepDisruptionScore: this.featureValue(
        featureMap,
        'sleepDisruptionScore',
      ),
      notificationLoadScore: this.featureValue(featureMap, 'notificationLoadScore'),
      sleepRegularityRiskScore: this.featureValue(
        featureMap,
        'sleepRegularityRiskScore',
      ),
      connectivityDisruptionScore: this.featureValue(
        featureMap,
        'connectivityDisruptionScore',
      ),
      activityFragmentationScore: this.featureValue(
        featureMap,
        'activityFragmentationScore',
      ),
      commuteImpulseScore: this.featureValue(featureMap, 'commuteImpulseScore'),
      moodRiskScore: this.featureValue(featureMap, 'moodRiskScore'),
      productivityRiskScore: this.featureValue(
        featureMap,
        'productivityRiskScore',
      ),
      addictionBehaviorScore: this.featureValue(
        featureMap,
        'addictionBehaviorScore',
      ),
      overallRiskSignal: this.featureValue(featureMap, 'overallRiskSignal'),
      digitalDependencyScore: this.featureValue(
        featureMap,
        'digitalDependencyScore',
      ),
      nightUsageRatio: this.featureValue(featureMap, 'nightUsageRatio'),
      socialMediaIntensity: this.featureValue(
        featureMap,
        'socialMediaIntensity',
      ),
      compulsiveCheckingScore: this.featureValue(
        featureMap,
        'compulsiveCheckingScore',
      ),
      activeHoursEstimate: this.featureValue(featureMap, 'activeHoursEstimate'),
    };
  }

  private featureValue(
    featureMap: Record<string, number>,
    key: string,
  ): number {
    const value = featureMap[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    return value;
  }

  private combineScores(
    randomForestScore: number,
    extraTreesScore: number,
    svmScore: number,
    weights: EnsembleWeights,
  ): number {
    const weightedScore =
      randomForestScore * weights.randomForest +
      extraTreesScore * weights.extraTrees +
      svmScore * weights.svm;
    return this.bound0to100(weightedScore);
  }

  private classifyRisk(riskScore: number): RiskLevel {
    if (riskScore >= 70) {
      return 'HIGH';
    }
    if (riskScore >= 40) {
      return 'MODERATE';
    }
    return 'LOW';
  }

  private buildPredictionInsights(
    features: PreprocessedFeatureSet,
    riskLevel: RiskLevel,
  ): string[] {
    const insights: string[] = [];

    if (features.avgUnlockCount >= 100) {
      insights.push(
        `Frequent unlock behavior (${Math.round(features.avgUnlockCount)} unlocks/day)`,
      );
    }

    if (features.avgNightUsageMinutes >= 90) {
      insights.push(
        `High late-night usage (${Math.round(features.avgNightUsageMinutes)} min/day)`,
      );
    }

    if (features.avgSocialMediaMinutes >= 180) {
      insights.push(
        `Elevated social media exposure (${Math.round(features.avgSocialMediaMinutes)} min/day)`,
      );
    }

    if (features.compulsiveCheckingScore >= 10) {
      insights.push(
        `Compulsive checking score is high (${features.compulsiveCheckingScore.toFixed(1)} unlocks/active-hour)`,
      );
    }

    if (features.psychologicalStressScore >= 65) {
      insights.push(
        'Survey indicates elevated stress/anxiety/depression markers',
      );
    }

    if (features.sleepRegularityRiskScore >= 60) {
      insights.push('Sleep regularity telemetry indicates inconsistent recovery');
    }

    if (features.notificationLoadScore >= 65) {
      insights.push('High notification pressure may be amplifying checking loops');
    }

    if (insights.length === 0) {
      insights.push(
        'No major addiction-triggering patterns detected in recent data',
      );
    }

    insights.push(`Current classification: ${riskLevel}`);
    return insights;
  }

  private scoreUsingLearnedModel(
    features: PreprocessedFeatureSet,
    learnedModel: LearnedLinearModel,
  ): number {
    const featureMap = this.featureSetToMap(features);
    let score = learnedModel.intercept;

    learnedModel.featureKeys.forEach((key) => {
      const raw = featureMap[key];
      const mean = learnedModel.meanByFeature[key] ?? 0;
      const std = learnedModel.stdByFeature[key] ?? 1;
      const normalized = (this.safeNumber(raw) - mean) / Math.max(std, 1e-6);
      score += (learnedModel.coefficients[key] ?? 0) * normalized;
    });

    return this.bound0to100(score);
  }

  private featureSetToMap(
    features: PreprocessedFeatureSet,
  ): Record<string, number> {
    const output: Record<string, number> = {};
    Object.entries(features).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        output[key] = value;
      }
    });
    return output;
  }

  private trainLearnedScorers(
    trainSet: TrainingSample[],
  ): LearnedScorers | null {
    if (trainSet.length < 6) {
      return null;
    }

    const stableKeys = this.collectStableFeatureKeys(trainSet, 0.35);
    if (stableKeys.length < 6) {
      return null;
    }

    const rfPreferred = [
      'addictionBehaviorScore',
      'digitalDependencyScore',
      'socialMediaDependencyScore',
      'lateNightUsageScore',
      'sleepDisruptionScore',
      'notificationLoadScore',
      'sleepRegularityRiskScore',
      'connectivityDisruptionScore',
    ];
    const etPreferred = [
      'addictionBehaviorScore',
      'compulsiveCheckingScore',
      'psychologicalStressScore',
      'activityFragmentationScore',
      'commuteImpulseScore',
      'notificationLoadScore',
      'socialMediaIntensity',
      'avgScreenTimeMinutes',
      'avgUnlockCount',
    ];
    const svmPreferred = [
      'overallRiskSignal',
      'digitalDependencyScore',
      'psychologicalStressScore',
      'sleepDisruptionScore',
      'notificationLoadScore',
      'sleepRegularityRiskScore',
      'connectivityDisruptionScore',
    ];

    const rfKeys = this.selectFeatureKeys(stableKeys, rfPreferred);
    const etKeys = this.selectFeatureKeys(stableKeys, etPreferred);
    const svmKeys = this.selectFeatureKeys(stableKeys, svmPreferred);

    const randomForest = this.trainLinearRegressor(trainSet, rfKeys, {
      learningRate: 0.03,
      iterations: 450,
      l2: 0.03,
    });
    const extraTrees = this.trainLinearRegressor(trainSet, etKeys, {
      learningRate: 0.025,
      iterations: 520,
      l2: 0.02,
    });
    const svm = this.trainLinearRegressor(trainSet, svmKeys, {
      learningRate: 0.02,
      iterations: 480,
      l2: 0.05,
    });

    if (!randomForest && !extraTrees && !svm) {
      return null;
    }

    return {
      randomForest,
      extraTrees,
      svm,
    };
  }

  private collectStableFeatureKeys(
    samples: TrainingSample[],
    minCoverage: number,
  ): string[] {
    if (samples.length === 0) {
      return [];
    }

    const counts = new Map<string, number>();
    samples.forEach((sample) => {
      Object.entries(sample.featureVector).forEach(([key, value]) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return;
        }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });

    const minimum = Math.max(2, Math.floor(samples.length * minCoverage));
    return Array.from(counts.entries())
      .filter(([, count]) => count >= minimum)
      .map(([key]) => key)
      .sort();
  }

  private selectFeatureKeys(
    stableKeys: string[],
    preferred: string[],
  ): string[] {
    const preferredSet = new Set(preferred);
    const chosen = stableKeys.filter((key) => preferredSet.has(key));
    if (chosen.length >= 4) {
      return chosen;
    }
    return stableKeys;
  }

  private trainLinearRegressor(
    samples: TrainingSample[],
    featureKeys: string[],
    options: {
      learningRate: number;
      iterations: number;
      l2: number;
    },
  ): LearnedLinearModel | null {
    if (samples.length === 0 || featureKeys.length === 0) {
      return null;
    }

    const meanByFeature: Record<string, number> = {};
    const stdByFeature: Record<string, number> = {};

    featureKeys.forEach((key) => {
      const values = samples.map((sample) => this.featureValue(sample.featureVector, key));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => {
          const diff = value - mean;
          return sum + diff * diff;
        }, 0) / values.length;
      meanByFeature[key] = mean;
      stdByFeature[key] = Math.max(Math.sqrt(variance), 1);
    });

    const normalizedRows = samples.map((sample) =>
      featureKeys.map((key) => {
        const raw = this.featureValue(sample.featureVector, key);
        return (raw - meanByFeature[key]) / stdByFeature[key];
      }),
    );
    const targets = samples.map((sample) => this.labelToRegressionTarget(sample.label));

    const coeff = new Array(featureKeys.length).fill(0);
    let intercept = targets.reduce((sum, value) => sum + value, 0) / targets.length;

    for (let step = 0; step < options.iterations; step += 1) {
      const grad = new Array(featureKeys.length).fill(0);
      let gradIntercept = 0;

      for (let i = 0; i < normalizedRows.length; i += 1) {
        const row = normalizedRows[i];
        let prediction = intercept;
        for (let j = 0; j < row.length; j += 1) {
          prediction += coeff[j] * row[j];
        }

        const error = prediction - targets[i];
        gradIntercept += error;
        for (let j = 0; j < row.length; j += 1) {
          grad[j] += error * row[j];
        }
      }

      const size = normalizedRows.length;
      for (let j = 0; j < coeff.length; j += 1) {
        const regularized = grad[j] / size + coeff[j] * options.l2;
        coeff[j] -= options.learningRate * regularized;
      }
      intercept -= options.learningRate * (gradIntercept / size);
    }

    const coefficients: Record<string, number> = {};
    featureKeys.forEach((key, index) => {
      const value = coeff[index];
      coefficients[key] = Number.isFinite(value) ? this.round6(value) : 0;
    });

    if (!Number.isFinite(intercept)) {
      return null;
    }

    return {
      featureKeys,
      meanByFeature,
      stdByFeature,
      coefficients,
      intercept: this.round6(intercept),
    };
  }

  private labelToRegressionTarget(label: RiskLevel): number {
    if (label === 'LOW') {
      return 20;
    }
    if (label === 'HIGH') {
      return 85;
    }
    return 55;
  }

  private buildFeatureImportance(
    learnedScorers: LearnedScorers | null,
    weights: EnsembleWeights,
  ): Record<string, number> {
    if (!learnedScorers) {
      return {};
    }

    const aggregate: Record<string, number> = {};
    const addWeights = (
      model: LearnedLinearModel | null,
      modelWeight: number,
    ) => {
      if (!model) {
        return;
      }
      Object.entries(model.coefficients).forEach(([key, value]) => {
        const contribution = Math.abs(value) * modelWeight;
        aggregate[key] = (aggregate[key] ?? 0) + contribution;
      });
    };

    addWeights(learnedScorers.randomForest, weights.randomForest);
    addWeights(learnedScorers.extraTrees, weights.extraTrees);
    addWeights(learnedScorers.svm, weights.svm);

    const values = Object.values(aggregate);
    if (values.length === 0) {
      return {};
    }
    const max = Math.max(...values, 1e-6);

    const normalized: Record<string, number> = {};
    Object.entries(aggregate)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, value]) => {
        normalized[key] = this.round3(value / max);
      });
    return normalized;
  }

  private parseLearnedLinearModel(value: unknown): LearnedLinearModel | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const obj = value as Record<string, unknown>;
    const featureKeys = Array.isArray(obj.featureKeys)
      ? obj.featureKeys.filter((item): item is string => typeof item === 'string')
      : [];
    if (featureKeys.length === 0) {
      return null;
    }

    const meanByFeature = this.parseNumberMapFromUnknown(obj.meanByFeature);
    const stdByFeature = this.parseNumberMapFromUnknown(obj.stdByFeature);
    const coefficients = this.parseNumberMapFromUnknown(obj.coefficients);
    const intercept =
      typeof obj.intercept === 'number' && Number.isFinite(obj.intercept)
        ? obj.intercept
        : null;

    if (intercept === null) {
      return null;
    }

    return {
      featureKeys,
      meanByFeature,
      stdByFeature,
      coefficients,
      intercept,
    };
  }

  private parseNumberMapFromUnknown(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const output: Record<string, number> = {};
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        output[key] = item;
      }
    });
    return output;
  }

  private async refreshMonitoringSnapshotIfStale(
    userId: string,
  ): Promise<void> {
    let profile = await this.modelProfileRepository.findOne({
      where: { user: { id: userId } },
    });

    const generatedAt = this.parseMonitoringGeneratedAt(
      profile?.monitoringJson ?? null,
    );
    const staleMs = 24 * 60 * 60 * 1000;
    const isStale = !generatedAt || Date.now() - generatedAt.getTime() >= staleMs;

    if (!isStale) {
      return;
    }

    const monitoring = await this.buildMonitoringSummary(userId, 90);

    if (!profile) {
      profile = this.modelProfileRepository.create({
        user: { id: userId } as User,
      });
    }

    profile.monitoringJson = JSON.stringify(monitoring);
    await this.modelProfileRepository.save(profile);
  }

  private parseMonitoringGeneratedAt(jsonValue: string | null): Date | null {
    if (!jsonValue) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      const generatedAt = (parsed as Record<string, unknown>).generatedAt;
      if (typeof generatedAt !== 'string') {
        return null;
      }
      const date = new Date(generatedAt);
      return Number.isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private async buildMonitoringSummary(
    userId: string,
    evaluationWindowDays: number,
  ): Promise<ModelMonitoringSummary> {
    const [predictions, featureStoreRecords, validatedLabels] = await Promise.all([
      this.predictionRepository.find({
        where: { user: { id: userId } },
        order: { date: 'DESC' },
        take: evaluationWindowDays,
      }),
      this.preprocessingService.getFeatureStoreRecords(
        userId,
        Math.max(evaluationWindowDays, 120),
      ),
      this.groundTruthRepository.find({
        where: { user: { id: userId } },
        order: { date: 'DESC' },
        take: Math.max(evaluationWindowDays, 120),
      }),
    ]);

    const groundTruthByDate = new Map<string, RiskLevel>();
    validatedLabels.forEach((item) => {
      groundTruthByDate.set(item.date, toRiskLevel(item.label));
    });

    const featureByDate = new Map<string, Record<string, number>>();
    const derivedLabelByDate = new Map<string, RiskLevel>();
    featureStoreRecords.forEach((record) => {
      featureByDate.set(record.date, record.featureVector);
      derivedLabelByDate.set(record.date, record.addictionLabel);
    });

    const evaluationRows = predictions
      .map((prediction) => {
        const actual =
          groundTruthByDate.get(prediction.date) ??
          derivedLabelByDate.get(prediction.date) ??
          null;
        if (!actual) {
          return null;
        }
        return {
          date: prediction.date,
          predictedLabel: this.classifyRisk(prediction.riskScore),
          actualLabel: actual,
          riskScore: prediction.riskScore,
          featureVector:
            featureByDate.get(prediction.date) ??
            this.parseFeatureVector(prediction.featureVectorJson),
        };
      })
      .filter(
        (
          row,
        ): row is {
          date: string;
          predictedLabel: RiskLevel;
          actualLabel: RiskLevel;
          riskScore: number;
          featureVector: Record<string, number>;
        } => row !== null,
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const samplePredictions: SamplePrediction[] = evaluationRows.map((row) => ({
      actualLabel: row.actualLabel,
      predictedLabel: row.predictedLabel,
      riskScore: row.riskScore,
    }));

    const calibration = this.computeCalibrationSummary(samplePredictions);
    const backtestWindows = [7, 14, 30].map((windowDays) => {
      const subset = samplePredictions.slice(-windowDays);
      return {
        windowDays,
        sampleCount: subset.length,
        metrics: this.computeMetrics(subset),
      };
    });
    const drift = this.computeDriftSummary(featureStoreRecords);
    const fairnessAudit = this.computeFairnessAudit(evaluationRows);

    return {
      generatedAt: new Date().toISOString(),
      evaluationWindowDays,
      evaluatedSampleCount: samplePredictions.length,
      calibration,
      backtest: {
        windowMetrics: backtestWindows,
      },
      drift,
      fairnessAudit,
    };
  }

  private computeCalibrationSummary(
    predictions: SamplePrediction[],
  ): ModelMonitoringSummary['calibration'] {
    if (predictions.length === 0) {
      return {
        brierScore: 0,
        expectedCalibrationError: 0,
        bins: [],
      };
    }

    const binCount = 5;
    const binStats = Array.from({ length: binCount }, (_, index) => ({
      start: index / binCount,
      end: (index + 1) / binCount,
      count: 0,
      sumPred: 0,
      sumObs: 0,
    }));

    let brier = 0;
    predictions.forEach((item) => {
      const probability = this.clamp(item.riskScore / 100, 0, 1);
      const outcome = item.actualLabel === 'HIGH' ? 1 : 0;
      brier += (probability - outcome) * (probability - outcome);

      const index = Math.min(binCount - 1, Math.floor(probability * binCount));
      binStats[index].count += 1;
      binStats[index].sumPred += probability;
      binStats[index].sumObs += outcome;
    });

    const bins: CalibrationBinSummary[] = [];
    let ece = 0;
    binStats.forEach((bin) => {
      if (bin.count === 0) {
        bins.push({
          binStart: this.round2(bin.start),
          binEnd: this.round2(bin.end),
          count: 0,
          avgPredictedHighProbability: 0,
          observedHighRate: 0,
        });
        return;
      }

      const avgPred = bin.sumPred / bin.count;
      const observed = bin.sumObs / bin.count;
      ece += Math.abs(observed - avgPred) * (bin.count / predictions.length);
      bins.push({
        binStart: this.round2(bin.start),
        binEnd: this.round2(bin.end),
        count: bin.count,
        avgPredictedHighProbability: this.round3(avgPred),
        observedHighRate: this.round3(observed),
      });
    });

    return {
      brierScore: this.round4(brier / predictions.length),
      expectedCalibrationError: this.round4(ece),
      bins,
    };
  }

  private computeDriftSummary(
    featureStoreRecords: Array<{ date: string; featureVector: Record<string, number> }>,
  ): ModelMonitoringSummary['drift'] {
    const ordered = [...featureStoreRecords].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (ordered.length < 20) {
      return {
        flaggedFeatures: [],
        featureShift: {},
      };
    }

    const recent = ordered.slice(-14);
    const baseline = ordered.slice(-44, -14);
    if (baseline.length < 10) {
      return {
        flaggedFeatures: [],
        featureShift: {},
      };
    }

    const keys = new Set<string>();
    recent.forEach((row) => Object.keys(row.featureVector).forEach((key) => keys.add(key)));
    baseline.forEach((row) =>
      Object.keys(row.featureVector).forEach((key) => keys.add(key)),
    );

    const featureShift: Record<string, number> = {};
    const flaggedFeatures: string[] = [];

    keys.forEach((key) => {
      const recentMean = this.average(
        recent.map((row) => this.featureValue(row.featureVector, key)),
      );
      const baselineMean = this.average(
        baseline.map((row) => this.featureValue(row.featureVector, key)),
      );
      const shift = (recentMean - baselineMean) / Math.max(Math.abs(baselineMean), 1);
      const rounded = this.round3(shift);
      featureShift[key] = rounded;
      if (Math.abs(rounded) >= 0.35) {
        flaggedFeatures.push(key);
      }
    });

    return {
      flaggedFeatures: flaggedFeatures.sort(),
      featureShift,
    };
  }

  private computeFairnessAudit(
    rows: Array<{
      date: string;
      predictedLabel: RiskLevel;
      actualLabel: RiskLevel;
      riskScore: number;
      featureVector: Record<string, number>;
    }>,
  ): ModelMonitoringSummary['fairnessAudit'] {
    const segments: SegmentAuditSummary[] = [];

    const segmentSources: Array<[string, typeof rows]> = [
      ['weekday', rows.filter((row) => !this.isWeekend(row.date))],
      ['weekend', rows.filter((row) => this.isWeekend(row.date))],
      [
        'high_stress',
        rows.filter(
          (row) => this.featureValue(row.featureVector, 'psychologicalStressScore') >= 65,
        ),
      ],
      [
        'low_stress',
        rows.filter(
          (row) => this.featureValue(row.featureVector, 'psychologicalStressScore') < 65,
        ),
      ],
      [
        'high_night_usage',
        rows.filter(
          (row) => this.featureValue(row.featureVector, 'avgNightUsageMinutes') >= 90,
        ),
      ],
      [
        'low_night_usage',
        rows.filter(
          (row) => this.featureValue(row.featureVector, 'avgNightUsageMinutes') < 90,
        ),
      ],
    ];

    segmentSources.forEach(([name, subset]) => {
      if (subset.length === 0) {
        return;
      }

      let tp = 0;
      let tn = 0;
      let fp = 0;
      let fn = 0;
      subset.forEach((row) => {
        const predictedHigh = row.predictedLabel === 'HIGH';
        const actualHigh = row.actualLabel === 'HIGH';
        if (predictedHigh && actualHigh) {
          tp += 1;
        } else if (predictedHigh && !actualHigh) {
          fp += 1;
        } else if (!predictedHigh && actualHigh) {
          fn += 1;
        } else {
          tn += 1;
        }
      });

      const sampleCount = subset.length;
      const accuracy = ((tp + tn) / sampleCount) * 100;
      const fpr = fp + tn === 0 ? 0 : (fp / (fp + tn)) * 100;
      const fnr = fn + tp === 0 ? 0 : (fn / (fn + tp)) * 100;
      const predictedHighRate = ((tp + fp) / sampleCount) * 100;
      const observedHighRate = ((tp + fn) / sampleCount) * 100;

      segments.push({
        segment: name,
        sampleCount,
        accuracy: this.round2(accuracy),
        falsePositiveRate: this.round2(fpr),
        falseNegativeRate: this.round2(fnr),
        predictedHighRate: this.round2(predictedHighRate),
        observedHighRate: this.round2(observedHighRate),
      });
    });

    const accuracyValues = segments.map((segment) => segment.accuracy);
    const fprValues = segments.map((segment) => segment.falsePositiveRate);
    const maxAccuracyGap =
      accuracyValues.length === 0
        ? 0
        : this.round2(Math.max(...accuracyValues) - Math.min(...accuracyValues));
    const maxFalsePositiveRateGap =
      fprValues.length === 0
        ? 0
        : this.round2(Math.max(...fprValues) - Math.min(...fprValues));

    return {
      segments,
      maxAccuracyGap,
      maxFalsePositiveRateGap,
    };
  }

  private isWeekend(date: string): boolean {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }
    const day = parsed.getUTCDay();
    return day === 0 || day === 6;
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private safeNumber(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    return value;
  }

  private sanitize(
    result: PredictionResult,
    weights: EnsembleWeights,
  ): PredictionResultView {
    return {
      id: result.id,
      date: result.date,
      riskScore: result.riskScore,
      riskLevel: toRiskLevel(result.riskLevel),
      randomForestScore: result.randomForestScore,
      extraTreesScore: result.extraTreesScore,
      svmScore: result.svmScore,
      featureVector: this.parseFeatureVectorOrNull(result.featureVectorJson),
      insights: this.parseInsights(result.insightsJson),
      modelWeights: weights,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  private parseFeatureVector(jsonValue: string | null): Record<string, number> {
    if (!jsonValue) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const vector: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          vector[key] = value;
        }
      }
      return vector;
    } catch {
      return {};
    }
  }

  private parseFeatureVectorOrNull(
    jsonValue: string | null,
  ): PreprocessedFeatureSet | null {
    const vector = this.parseFeatureVector(jsonValue);
    if (Object.keys(vector).length === 0) {
      return null;
    }
    return this.mapToFeatureSet(vector);
  }

  private parseInsights(jsonValue: string | null): string[] {
    if (!jsonValue) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  }

  private emptyMetrics(): ClassificationMetrics {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      rocAuc: 0,
    };
  }

  private bound0to100(value: number): number {
    return this.round1(Math.min(100, Math.max(0, value)));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private round3(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private round6(value: number): number {
    return Math.round(value * 1000000) / 1000000;
  }
}
