import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { PredictionResult } from '../entities/prediction-result.entity';
import { ModelProfile } from '../entities/model-profile.entity';
import { GroundTruthLabel } from '../entities/ground-truth-label.entity';
import { FeatureStoreRecord } from '../entities/feature-store-record.entity';
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
  modelType: 'LINEAR';
  featureKeys: string[];
  meanByFeature: Record<string, number>;
  stdByFeature: Record<string, number>;
  coefficients: Record<string, number>;
  intercept: number;
}

interface LearnedTreeNode {
  splitFeature: string | null;
  threshold: number | null;
  value: number;
  gain: number;
  sampleCount: number;
  left: LearnedTreeNode | null;
  right: LearnedTreeNode | null;
}

interface LearnedTreeEnsembleModel {
  modelType: 'TREE_ENSEMBLE';
  featureKeys: string[];
  trees: LearnedTreeNode[];
  treeWeights: number[];
  maxDepth: number;
  minSamplesLeaf: number;
  splitStrategy: 'BEST' | 'RANDOM';
  featureImportance: Record<string, number>;
}

type LearnedScorerModel = LearnedLinearModel | LearnedTreeEnsembleModel;

interface LearnedScorers {
  randomForest: LearnedScorerModel | null;
  extraTrees: LearnedScorerModel | null;
  svm: LearnedScorerModel | null;
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

interface UserDemographicsSnapshot {
  ageBand: string | null;
  gender: string | null;
  region: string | null;
  educationLevel: string | null;
  occupation: string | null;
}

interface FairnessAuditRow {
  date: string;
  predictedLabel: RiskLevel;
  actualLabel: RiskLevel;
  riskScore: number;
  featureVector: Record<string, number>;
  demographics: UserDemographicsSnapshot;
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

const AUTO_TRAIN_MIN_SAMPLES = 8;
const AUTO_TRAIN_MIN_NEW_SAMPLES = 3;
const AUTO_TRAIN_MIN_HOURS = 24;
const AUTO_TRAIN_STALE_DAYS = 14;
const MIN_TREE_TRAIN_SAMPLES = 12;
const MIN_LINEAR_TRAIN_SAMPLES = 6;
const MIN_STABLE_FEATURE_KEYS = 4;

@Injectable()
export class PredictionService {
  constructor(
    @InjectRepository(PredictionResult)
    private readonly predictionRepository: Repository<PredictionResult>,
    @InjectRepository(ModelProfile)
    private readonly modelProfileRepository: Repository<ModelProfile>,
    @InjectRepository(GroundTruthLabel)
    private readonly groundTruthRepository: Repository<GroundTruthLabel>,
    @InjectRepository(FeatureStoreRecord)
    private readonly featureStoreRepository: Repository<FeatureStoreRecord>,
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

    const profile = await this.preprocessingService.preprocessUserData(userId);
    try {
      await this.maybeAutoTrain(userId);
    } catch {
      // Auto-training should never block primary prediction flow.
    }

    const [weights, learnedScorers] = await Promise.all([
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
        'Trainable tree-ensemble scorers were not produced (not enough stable feature samples). Falling back to deterministic scoring rules.',
      );
    } else {
      const linearChannels = (['randomForest', 'extraTrees', 'svm'] as const)
        .map((key) => {
          const model = learnedScorers[key];
          if (!model || this.isTreeEnsembleModel(model)) {
            return null;
          }
          return key;
        })
        .filter(
          (
            value,
          ): value is 'randomForest' | 'extraTrees' | 'svm' => value !== null,
        );
      if (linearChannels.length > 0) {
        notes.push(
          `Linear fallback models trained for: ${linearChannels.join(', ')}.`,
        );
      }
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

    const trainingSummary: PredictionTrainingSummary = {
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
      trainingSummary,
    });

    return trainingSummary;
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

  async getLatestTrainingSummary(
    userId: string,
  ): Promise<PredictionTrainingSummary | null> {
    const profile = await this.modelProfileRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!profile?.trainingSummaryJson) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(profile.trainingSummaryJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as PredictionTrainingSummary;
    } catch {
      return null;
    }
  }

  private async maybeAutoTrain(userId: string): Promise<void> {
    const [profile, samples] = await Promise.all([
      this.modelProfileRepository.findOne({
        where: { user: { id: userId } },
      }),
      this.loadTrainingSamples(userId),
    ]);

    if (samples.length < AUTO_TRAIN_MIN_SAMPLES) {
      return;
    }

    const trainedAt = this.parseIsoDate(profile?.trainedAtIso ?? null);
    const hoursSince =
      trainedAt === null
        ? Number.POSITIVE_INFINITY
        : (Date.now() - trainedAt.getTime()) / (60 * 60 * 1000);
    const newSamples = Math.max(
      0,
      samples.length - (profile?.trainedSampleCount ?? 0),
    );
    const learnedMissing =
      !profile?.learnedModelJson || profile.learnedModelJson === 'null';
    const stale = hoursSince >= AUTO_TRAIN_STALE_DAYS * 24;
    const shouldTrainForNewData =
      newSamples >= AUTO_TRAIN_MIN_NEW_SAMPLES;
    const shouldTrainForMissing =
      learnedMissing && (trainedAt === null || newSamples > 0);
    const shouldTrainForStale = stale && newSamples > 0;

    if (hoursSince < AUTO_TRAIN_MIN_HOURS) {
      return;
    }

    if (
      !profile ||
      trainedAt === null ||
      shouldTrainForNewData ||
      shouldTrainForMissing ||
      shouldTrainForStale
    ) {
      await this.trainModel(userId);
    }
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
      trainingSummary?: PredictionTrainingSummary;
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
    if (payload.trainingSummary) {
      profile.trainingSummaryJson = JSON.stringify(payload.trainingSummary);
    }
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
        randomForest: this.parseLearnedScorerModel(obj.randomForest),
        extraTrees: this.parseLearnedScorerModel(obj.extraTrees),
        svm: this.parseLearnedScorerModel(obj.svm),
      };
    } catch {
      return null;
    }
  }

  private scoreRandomForestLike(
    features: PreprocessedFeatureSet,
    learnedModel: LearnedScorerModel | null = null,
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
    learnedModel: LearnedScorerModel | null = null,
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
    learnedModel: LearnedScorerModel | null = null,
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
    learnedModel: LearnedScorerModel | null = null,
  ): number {
    return this.scoreRandomForestLike(
      this.mapToFeatureSet(featureMap),
      learnedModel,
    );
  }

  private scoreExtraTreesLikeFromMap(
    featureMap: Record<string, number>,
    learnedModel: LearnedScorerModel | null = null,
  ): number {
    return this.scoreExtraTreesLike(
      this.mapToFeatureSet(featureMap),
      learnedModel,
    );
  }

  private scoreSvmLikeFromMap(
    featureMap: Record<string, number>,
    learnedModel: LearnedScorerModel | null = null,
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
    learnedModel: LearnedScorerModel,
  ): number {
    if (this.isTreeEnsembleModel(learnedModel)) {
      return this.scoreUsingTreeEnsembleModel(
        this.featureSetToMap(features),
        learnedModel,
      );
    }
    return this.scoreUsingLearnedLinearModel(features, learnedModel);
  }

  private scoreUsingLearnedLinearModel(
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

  private scoreUsingTreeEnsembleModel(
    featureMap: Record<string, number>,
    learnedModel: LearnedTreeEnsembleModel,
  ): number {
    if (learnedModel.trees.length === 0) {
      return 0;
    }

    let weightedTotal = 0;
    let weightSum = 0;
    learnedModel.trees.forEach((tree, index) => {
      const weight = learnedModel.treeWeights[index] ?? 1;
      weightedTotal += this.scoreTreeNode(tree, featureMap) * weight;
      weightSum += weight;
    });

    if (weightSum <= 0) {
      return 0;
    }
    return this.bound0to100(weightedTotal / weightSum);
  }

  private scoreTreeNode(
    node: LearnedTreeNode,
    featureMap: Record<string, number>,
  ): number {
    if (
      !node.splitFeature ||
      node.threshold === null ||
      node.left === null ||
      node.right === null
    ) {
      return node.value;
    }

    const featureValue = this.featureValue(featureMap, node.splitFeature);
    if (featureValue <= node.threshold) {
      return this.scoreTreeNode(node.left, featureMap);
    }
    return this.scoreTreeNode(node.right, featureMap);
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
    if (trainSet.length < MIN_LINEAR_TRAIN_SAMPLES) {
      return null;
    }

    const stableKeys = this.collectStableFeatureKeys(trainSet, 0.35);
    let candidateKeys = stableKeys;
    if (candidateKeys.length < MIN_STABLE_FEATURE_KEYS) {
      const ranked = this.rankFeatureKeysByVariance(trainSet);
      candidateKeys = ranked.slice(
        0,
        Math.max(MIN_STABLE_FEATURE_KEYS, candidateKeys.length),
      );
    }
    if (candidateKeys.length < 2) {
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

    const rfKeys = this.selectFeatureKeys(candidateKeys, rfPreferred);
    const etKeys = this.selectFeatureKeys(candidateKeys, etPreferred);
    const svmKeys = this.selectFeatureKeys(candidateKeys, svmPreferred);
    const canTrainTrees = trainSet.length >= MIN_TREE_TRAIN_SAMPLES;

    const randomForest =
      (canTrainTrees
        ? this.trainTreeEnsembleRegressor(trainSet, rfKeys, {
            treeCount: 29,
            maxDepth: 5,
            minSamplesLeaf: 3,
            featureSubsampleRatio: 0.65,
            splitCandidatesPerFeature: 10,
            splitStrategy: 'BEST',
            bootstrap: true,
          })
        : null) ?? this.trainLinearModel(trainSet, rfKeys);
    const extraTrees =
      (canTrainTrees
        ? this.trainTreeEnsembleRegressor(trainSet, etKeys, {
            treeCount: 35,
            maxDepth: 5,
            minSamplesLeaf: 2,
            featureSubsampleRatio: 0.8,
            splitCandidatesPerFeature: 14,
            splitStrategy: 'RANDOM',
            bootstrap: false,
          })
        : null) ?? this.trainLinearModel(trainSet, etKeys);
    const svm =
      (canTrainTrees
        ? this.trainTreeEnsembleRegressor(trainSet, svmKeys, {
            treeCount: 21,
            maxDepth: 4,
            minSamplesLeaf: 3,
            featureSubsampleRatio: 0.55,
            splitCandidatesPerFeature: 8,
            splitStrategy: 'BEST',
            bootstrap: true,
          })
        : null) ?? this.trainLinearModel(trainSet, svmKeys);

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

  private rankFeatureKeysByVariance(samples: TrainingSample[]): string[] {
    const stats = new Map<
      string,
      { count: number; sum: number; sumSq: number }
    >();

    samples.forEach((sample) => {
      Object.entries(sample.featureVector).forEach(([key, value]) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return;
        }
        const entry = stats.get(key) ?? { count: 0, sum: 0, sumSq: 0 };
        entry.count += 1;
        entry.sum += value;
        entry.sumSq += value * value;
        stats.set(key, entry);
      });
    });

    return Array.from(stats.entries())
      .map(([key, entry]) => {
        const mean = entry.sum / Math.max(1, entry.count);
        const variance = Math.max(
          0,
          entry.sumSq / Math.max(1, entry.count) - mean * mean,
        );
        return { key, variance };
      })
      .sort((a, b) => b.variance - a.variance)
      .map((item) => item.key);
  }

  private trainLinearModel(
    samples: TrainingSample[],
    featureKeys: string[],
  ): LearnedLinearModel | null {
    if (samples.length < MIN_LINEAR_TRAIN_SAMPLES || featureKeys.length < 2) {
      return null;
    }

    const meanByFeature: Record<string, number> = {};
    const stdByFeature: Record<string, number> = {};

    featureKeys.forEach((key) => {
      let count = 0;
      let sum = 0;
      let sumSq = 0;
      samples.forEach((sample) => {
        const raw = sample.featureVector[key];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          return;
        }
        count += 1;
        sum += raw;
        sumSq += raw * raw;
      });
      if (count === 0) {
        meanByFeature[key] = 0;
        stdByFeature[key] = 1;
        return;
      }
      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      const std = Math.sqrt(variance);
      meanByFeature[key] = this.round4(mean);
      stdByFeature[key] = this.round4(std > 1e-6 ? std : 1);
    });

    const rows = samples.map((sample) => {
      const features = featureKeys.map((key) => {
        const raw = sample.featureVector[key];
        const mean = meanByFeature[key] ?? 0;
        const std = stdByFeature[key] ?? 1;
        const value =
          typeof raw === 'number' && Number.isFinite(raw) ? raw : mean;
        return (value - mean) / Math.max(std, 1e-6);
      });
      return {
        features,
        target: this.labelToRegressionTarget(sample.label),
      };
    });

    if (rows.length === 0) {
      return null;
    }

    const featureCount = featureKeys.length;
    let intercept = this.average(rows.map((row) => row.target));
    const weights = new Array(featureCount).fill(0);

    const iterations = 260;
    const learningRate = 0.05;
    const l2 = 0.01;

    for (let iter = 0; iter < iterations; iter += 1) {
      let gradB = 0;
      const gradW = new Array(featureCount).fill(0);

      rows.forEach((row) => {
        let prediction = intercept;
        for (let idx = 0; idx < featureCount; idx += 1) {
          prediction += weights[idx] * row.features[idx];
        }
        const error = prediction - row.target;
        gradB += error;
        for (let idx = 0; idx < featureCount; idx += 1) {
          gradW[idx] += error * row.features[idx];
        }
      });

      const invN = 1 / rows.length;
      gradB *= invN;
      for (let idx = 0; idx < featureCount; idx += 1) {
        gradW[idx] = gradW[idx] * invN + l2 * weights[idx];
        weights[idx] -= learningRate * gradW[idx];
      }
      intercept -= learningRate * gradB;
    }

    const coefficients: Record<string, number> = {};
    featureKeys.forEach((key, index) => {
      coefficients[key] = this.round4(weights[index]);
    });

    return {
      modelType: 'LINEAR',
      featureKeys,
      meanByFeature,
      stdByFeature,
      coefficients,
      intercept: this.round4(intercept),
    };
  }

  private trainTreeEnsembleRegressor(
    samples: TrainingSample[],
    featureKeys: string[],
    options: {
      treeCount: number;
      maxDepth: number;
      minSamplesLeaf: number;
      featureSubsampleRatio: number;
      splitCandidatesPerFeature: number;
      splitStrategy: 'BEST' | 'RANDOM';
      bootstrap: boolean;
    },
  ): LearnedTreeEnsembleModel | null {
    if (samples.length < 6 || featureKeys.length < 2) {
      return null;
    }

    const dataRows = samples.map((sample) => ({
      featureVector: sample.featureVector,
      target: this.labelToRegressionTarget(sample.label),
    }));
    const rng = this.createSeededRng(
      this.buildTrainingSeed(samples, featureKeys, options.splitStrategy),
    );

    const trees: LearnedTreeNode[] = [];
    const treeWeights: number[] = [];
    const rawImportance: Record<string, number> = {};

    for (let treeIndex = 0; treeIndex < options.treeCount; treeIndex += 1) {
      const trainingRows = options.bootstrap
        ? this.bootstrapRows(dataRows, rng)
        : this.subsampleRows(
            dataRows,
            rng,
            Math.max(0.7, options.featureSubsampleRatio),
          );
      if (trainingRows.length < Math.max(6, options.minSamplesLeaf * 2)) {
        continue;
      }

      const tree = this.buildRegressionTree(
        trainingRows,
        featureKeys,
        options,
        rng,
        0,
      );
      if (!tree) {
        continue;
      }

      this.collectTreeFeatureImportance(tree, rawImportance);
      trees.push(tree);
      treeWeights.push(1);
    }

    if (trees.length === 0) {
      return null;
    }

    return {
      modelType: 'TREE_ENSEMBLE',
      featureKeys,
      trees,
      treeWeights,
      maxDepth: options.maxDepth,
      minSamplesLeaf: options.minSamplesLeaf,
      splitStrategy: options.splitStrategy,
      featureImportance: this.normalizeImportance(rawImportance),
    };
  }

  private buildRegressionTree(
    rows: Array<{ featureVector: Record<string, number>; target: number }>,
    featureKeys: string[],
    options: {
      treeCount: number;
      maxDepth: number;
      minSamplesLeaf: number;
      featureSubsampleRatio: number;
      splitCandidatesPerFeature: number;
      splitStrategy: 'BEST' | 'RANDOM';
      bootstrap: boolean;
    },
    rng: () => number,
    depth: number,
  ): LearnedTreeNode | null {
    if (rows.length === 0) {
      return null;
    }

    const currentValue = this.average(rows.map((item) => item.target));
    const minBranchSize = Math.max(2, options.minSamplesLeaf);
    if (depth >= options.maxDepth || rows.length < minBranchSize * 2) {
      return {
        splitFeature: null,
        threshold: null,
        value: this.round4(currentValue),
        gain: 0,
        sampleCount: rows.length,
        left: null,
        right: null,
      };
    }

    const candidateFeatureCount = this.clamp(
      Math.floor(featureKeys.length * options.featureSubsampleRatio),
      2,
      featureKeys.length,
    );
    const candidateFeatures = this.pickRandomSubset(
      featureKeys,
      candidateFeatureCount,
      rng,
    );

    const totalError = this.squaredError(rows.map((item) => item.target));
    type CandidateSplit = {
      feature: string;
      threshold: number;
      gain: number;
      left: Array<{ featureVector: Record<string, number>; target: number }>;
      right: Array<{ featureVector: Record<string, number>; target: number }>;
    };
    let bestSplit: CandidateSplit | null = null;

    for (const feature of candidateFeatures) {
      const values = rows.map((row) => this.featureValue(row.featureVector, feature));
      const thresholds = this.generateThresholdCandidates(
        values,
        options.splitCandidatesPerFeature,
        options.splitStrategy,
        rng,
      );
      for (const threshold of thresholds) {
        const left = rows.filter(
          (row) => this.featureValue(row.featureVector, feature) <= threshold,
        );
        const right = rows.filter(
          (row) => this.featureValue(row.featureVector, feature) > threshold,
        );
        if (left.length < minBranchSize || right.length < minBranchSize) {
          continue;
        }

        const childError =
          this.squaredError(left.map((item) => item.target)) +
          this.squaredError(right.map((item) => item.target));
        const gain = totalError - childError;
        if (gain <= 0) {
          continue;
        }

        if (!bestSplit || gain > bestSplit.gain) {
          bestSplit = {
            feature,
            threshold,
            gain,
            left,
            right,
          };
        }
      }
    }

    if (!bestSplit || bestSplit.gain < 1e-3) {
      return {
        splitFeature: null,
        threshold: null,
        value: this.round4(currentValue),
        gain: 0,
        sampleCount: rows.length,
        left: null,
        right: null,
      };
    }

    const leftNode = this.buildRegressionTree(
      bestSplit.left,
      featureKeys,
      options,
      rng,
      depth + 1,
    );
    const rightNode = this.buildRegressionTree(
      bestSplit.right,
      featureKeys,
      options,
      rng,
      depth + 1,
    );

    if (!leftNode || !rightNode) {
      return {
        splitFeature: null,
        threshold: null,
        value: this.round4(currentValue),
        gain: 0,
        sampleCount: rows.length,
        left: null,
        right: null,
      };
    }

    return {
      splitFeature: bestSplit.feature,
      threshold: this.round4(bestSplit.threshold),
      value: this.round4(currentValue),
      gain: this.round4(bestSplit.gain),
      sampleCount: rows.length,
      left: leftNode,
      right: rightNode,
    };
  }

  private generateThresholdCandidates(
    values: number[],
    maxCandidates: number,
    strategy: 'BEST' | 'RANDOM',
    rng: () => number,
  ): number[] {
    const sorted = [...values]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (sorted.length < 2) {
      return [];
    }

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    if (max <= min) {
      return [];
    }

    if (strategy === 'RANDOM') {
      const samples = new Set<number>();
      const count = Math.max(2, Math.min(maxCandidates, sorted.length - 1));
      while (samples.size < count) {
        const threshold = min + (max - min) * rng();
        samples.add(this.round4(threshold));
      }
      return Array.from(samples.values());
    }

    const candidates = new Set<number>();
    const step = Math.max(1, Math.floor(sorted.length / (maxCandidates + 1)));
    for (let i = step; i < sorted.length; i += step) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) {
        continue;
      }
      candidates.add(this.round4((prev + next) / 2));
      if (candidates.size >= maxCandidates) {
        break;
      }
    }

    return Array.from(candidates.values());
  }

  private bootstrapRows<T>(rows: T[], rng: () => number): T[] {
    if (rows.length === 0) {
      return [];
    }
    return Array.from({ length: rows.length }, () => {
      const index = Math.floor(rng() * rows.length);
      return rows[index];
    });
  }

  private subsampleRows<T>(rows: T[], rng: () => number, ratio: number): T[] {
    if (rows.length === 0) {
      return [];
    }
    const target = this.clamp(Math.floor(rows.length * ratio), 1, rows.length);
    const selected = [...rows];
    for (let i = selected.length - 1; i > 0; i -= 1) {
      const swap = Math.floor(rng() * (i + 1));
      [selected[i], selected[swap]] = [selected[swap], selected[i]];
    }
    return selected.slice(0, target);
  }

  private pickRandomSubset<T>(items: T[], count: number, rng: () => number): T[] {
    if (count >= items.length) {
      return [...items];
    }
    const cloned = [...items];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const swap = Math.floor(rng() * (i + 1));
      [cloned[i], cloned[swap]] = [cloned[swap], cloned[i]];
    }
    return cloned.slice(0, count);
  }

  private squaredError(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const mean = this.average(values);
    return values.reduce((sum, value) => {
      const diff = value - mean;
      return sum + diff * diff;
    }, 0);
  }

  private collectTreeFeatureImportance(
    node: LearnedTreeNode | null,
    output: Record<string, number>,
  ): void {
    if (!node) {
      return;
    }

    if (node.splitFeature && node.gain > 0) {
      output[node.splitFeature] = (output[node.splitFeature] ?? 0) + node.gain;
    }
    this.collectTreeFeatureImportance(node.left, output);
    this.collectTreeFeatureImportance(node.right, output);
  }

  private normalizeImportance(values: Record<string, number>): Record<string, number> {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      return {};
    }
    const max = Math.max(...entries.map(([, value]) => value), 1e-6);
    const output: Record<string, number> = {};
    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, value]) => {
        output[key] = this.round3(value / max);
      });
    return output;
  }

  private buildTrainingSeed(
    samples: TrainingSample[],
    featureKeys: string[],
    strategy: 'BEST' | 'RANDOM',
  ): number {
    const source = `${samples.length}|${featureKeys.join(',')}|${strategy}|${samples
      .slice(0, 10)
      .map((sample) => `${sample.date}:${sample.label}`)
      .join('|')}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) + 1;
  }

  private createSeededRng(seed: number): () => number {
    let state = seed % 2147483647;
    if (state <= 0) {
      state += 2147483646;
    }
    return () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
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
    const addWeights = (model: LearnedScorerModel | null, modelWeight: number) => {
      if (!model) {
        return;
      }
      const source = this.isTreeEnsembleModel(model)
        ? model.featureImportance
        : this.normalizeImportance(
            Object.fromEntries(
              Object.entries(model.coefficients).map(([key, value]) => [
                key,
                Math.abs(value),
              ]),
            ),
          );
      Object.entries(source).forEach(([key, value]) => {
        const contribution = value * modelWeight;
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

  private parseLearnedScorerModel(value: unknown): LearnedScorerModel | null {
    const tree = this.parseLearnedTreeEnsembleModel(value);
    if (tree) {
      return tree;
    }
    return this.parseLearnedLinearModel(value);
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
      modelType: 'LINEAR',
      featureKeys,
      meanByFeature,
      stdByFeature,
      coefficients,
      intercept,
    };
  }

  private parseLearnedTreeEnsembleModel(
    value: unknown,
  ): LearnedTreeEnsembleModel | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const obj = value as Record<string, unknown>;
    if (obj.modelType !== 'TREE_ENSEMBLE') {
      return null;
    }

    const featureKeys = Array.isArray(obj.featureKeys)
      ? obj.featureKeys.filter((item): item is string => typeof item === 'string')
      : [];
    const trees = Array.isArray(obj.trees)
      ? obj.trees
          .map((item) => this.parseTreeNode(item))
          .filter((item): item is LearnedTreeNode => item !== null)
      : [];
    const treeWeights = Array.isArray(obj.treeWeights)
      ? obj.treeWeights
          .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : 0))
          .slice(0, trees.length)
      : [];

    if (featureKeys.length === 0 || trees.length === 0) {
      return null;
    }
    while (treeWeights.length < trees.length) {
      treeWeights.push(1);
    }

    const maxDepth =
      typeof obj.maxDepth === 'number' && Number.isFinite(obj.maxDepth)
        ? Math.max(1, Math.floor(obj.maxDepth))
        : 5;
    const minSamplesLeaf =
      typeof obj.minSamplesLeaf === 'number' && Number.isFinite(obj.minSamplesLeaf)
        ? Math.max(1, Math.floor(obj.minSamplesLeaf))
        : 2;
    const splitStrategy = obj.splitStrategy === 'RANDOM' ? 'RANDOM' : 'BEST';
    const featureImportance = this.parseNumberMapFromUnknown(obj.featureImportance);

    return {
      modelType: 'TREE_ENSEMBLE',
      featureKeys,
      trees,
      treeWeights,
      maxDepth,
      minSamplesLeaf,
      splitStrategy,
      featureImportance,
    };
  }

  private parseTreeNode(value: unknown): LearnedTreeNode | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const obj = value as Record<string, unknown>;
    const nodeValue =
      typeof obj.value === 'number' && Number.isFinite(obj.value) ? obj.value : null;
    if (nodeValue === null) {
      return null;
    }

    const splitFeature =
      typeof obj.splitFeature === 'string' ? obj.splitFeature : null;
    const threshold =
      typeof obj.threshold === 'number' && Number.isFinite(obj.threshold)
        ? obj.threshold
        : null;
    const gain =
      typeof obj.gain === 'number' && Number.isFinite(obj.gain) ? obj.gain : 0;
    const sampleCount =
      typeof obj.sampleCount === 'number' && Number.isFinite(obj.sampleCount)
        ? Math.max(1, Math.floor(obj.sampleCount))
        : 1;
    const left = obj.left === null ? null : this.parseTreeNode(obj.left);
    const right = obj.right === null ? null : this.parseTreeNode(obj.right);

    return {
      splitFeature,
      threshold,
      value: nodeValue,
      gain,
      sampleCount,
      left,
      right,
    };
  }

  private isTreeEnsembleModel(
    model: LearnedScorerModel,
  ): model is LearnedTreeEnsembleModel {
    return model.modelType === 'TREE_ENSEMBLE';
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

  private parseIsoDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async buildMonitoringSummary(
    userId: string,
    evaluationWindowDays: number,
  ): Promise<ModelMonitoringSummary> {
    const [predictions, featureStoreRecords, validatedLabels, user] =
      await Promise.all([
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
        this.userRepository.findOne({
          where: { id: userId },
          select: ['id', 'demographicsJson'],
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
    const fairnessRows = await this.loadDemographicFairnessRows(
      evaluationWindowDays,
    );
    const fallbackDemographics = this.parseDemographicsJson(
      user?.demographicsJson ?? null,
    );
    const fairnessAudit = this.computeFairnessAudit(
      fairnessRows.length > 0
        ? fairnessRows
        : evaluationRows.map((row) => ({
            ...row,
            demographics: fallbackDemographics,
          })),
    );

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

  private async loadDemographicFairnessRows(
    evaluationWindowDays: number,
  ): Promise<FairnessAuditRow[]> {
    const cutoffDate = this.isoDateDaysAgo(evaluationWindowDays);
    const [predictions, groundTruthLabels, featureStoreRows] = await Promise.all([
      this.predictionRepository.find({
        where: { date: MoreThanOrEqual(cutoffDate) },
        relations: ['user'],
        order: { date: 'DESC' },
        take: 5000,
      }),
      this.groundTruthRepository.find({
        where: { date: MoreThanOrEqual(cutoffDate) },
        relations: ['user'],
        order: { date: 'DESC' },
        take: 5000,
      }),
      this.featureStoreRepository.find({
        where: { date: MoreThanOrEqual(cutoffDate) },
        relations: ['user'],
        order: { date: 'DESC' },
        take: 5000,
      }),
    ]);

    const groundTruthByKey = new Map<string, RiskLevel>();
    groundTruthLabels.forEach((labelRow) => {
      const key = this.userDateKey(labelRow.user?.id ?? null, labelRow.date);
      if (!key) {
        return;
      }
      groundTruthByKey.set(key, toRiskLevel(labelRow.label));
    });

    const derivedLabelByKey = new Map<string, RiskLevel>();
    featureStoreRows.forEach((featureRow) => {
      const key = this.userDateKey(featureRow.user?.id ?? null, featureRow.date);
      if (!key) {
        return;
      }
      derivedLabelByKey.set(key, toRiskLevel(featureRow.addictionLabel));
    });

    return predictions
      .map((prediction) => {
        const userId = prediction.user?.id ?? null;
        const key = this.userDateKey(userId, prediction.date);
        if (!key) {
          return null;
        }

        const actualLabel =
          groundTruthByKey.get(key) ??
          derivedLabelByKey.get(key) ??
          toRiskLevel(prediction.riskLevel);
        return {
          date: prediction.date,
          predictedLabel: this.classifyRisk(prediction.riskScore),
          actualLabel,
          riskScore: prediction.riskScore,
          featureVector: this.parseFeatureVector(prediction.featureVectorJson),
          demographics: this.parseDemographicsJson(
            prediction.user?.demographicsJson ?? null,
          ),
        };
      })
      .filter((row): row is FairnessAuditRow => row !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private computeFairnessAudit(
    rows: FairnessAuditRow[],
  ): ModelMonitoringSummary['fairnessAudit'] {
    if (rows.length === 0) {
      return {
        segments: [],
        maxAccuracyGap: 0,
        maxFalsePositiveRateGap: 0,
      };
    }

    const segments: SegmentAuditSummary[] = [];
    const segmentSources: Array<[string, FairnessAuditRow[]]> = [];
    const minimumSegmentSamples = 8;
    const demographicAxes: Array<keyof UserDemographicsSnapshot> = [
      'gender',
      'ageBand',
      'region',
      'educationLevel',
      'occupation',
    ];

    demographicAxes.forEach((axis) => {
      const groups = new Map<string, FairnessAuditRow[]>();
      rows.forEach((row) => {
        const groupValue = row.demographics[axis] ?? 'unknown';
        const existing = groups.get(groupValue);
        if (existing) {
          existing.push(row);
          return;
        }
        groups.set(groupValue, [row]);
      });

      const eligible = Array.from(groups.entries()).filter(
        ([, subset]) => subset.length >= minimumSegmentSamples,
      );
      if (eligible.length < 2) {
        return;
      }
      eligible.forEach(([group, subset]) => {
        segmentSources.push([`demographic_${axis}:${group}`, subset]);
      });
    });

    if (segmentSources.length === 0) {
      segmentSources.push(
        ['behavior_weekday', rows.filter((row) => !this.isWeekend(row.date))],
        ['behavior_weekend', rows.filter((row) => this.isWeekend(row.date))],
        [
          'behavior_high_stress',
          rows.filter(
            (row) =>
              this.featureValue(row.featureVector, 'psychologicalStressScore') >=
              65,
          ),
        ],
        [
          'behavior_low_stress',
          rows.filter(
            (row) =>
              this.featureValue(row.featureVector, 'psychologicalStressScore') <
              65,
          ),
        ],
      );
    }

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

  private defaultDemographics(): UserDemographicsSnapshot {
    return {
      ageBand: null,
      gender: null,
      region: null,
      educationLevel: null,
      occupation: null,
    };
  }

  private parseDemographicsJson(raw: string | null): UserDemographicsSnapshot {
    if (!raw) {
      return this.defaultDemographics();
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return this.defaultDemographics();
      }
      const candidate = parsed as Record<string, unknown>;
      return {
        ageBand: this.normalizeDemographicValue(candidate.ageBand),
        gender: this.normalizeDemographicValue(candidate.gender),
        region: this.normalizeDemographicValue(candidate.region),
        educationLevel: this.normalizeDemographicValue(candidate.educationLevel),
        occupation: this.normalizeDemographicValue(candidate.occupation),
      };
    } catch {
      return this.defaultDemographics();
    }
  }

  private normalizeDemographicValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    return normalized.length > 0 ? normalized : null;
  }

  private userDateKey(userId: string | null, date: string): string | null {
    if (!userId) {
      return null;
    }
    return `${userId}:${date}`;
  }

  private isoDateDaysAgo(daysAgo: number): string {
    const safeDays = Math.max(0, Math.floor(daysAgo));
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - safeDays);
    return date.toISOString().slice(0, 10);
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
