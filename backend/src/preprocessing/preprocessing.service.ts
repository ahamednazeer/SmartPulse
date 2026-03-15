import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyResponse } from '../entities/survey-response.entity';
import { UsageRecord } from '../entities/usage-record.entity';
import { FeatureStoreRecord } from '../entities/feature-store-record.entity';
import { User } from '../entities/user.entity';

type RiskLabel = 'LOW' | 'MODERATE' | 'HIGH';

interface SanitizedUsageRecord {
  date: string;
  screenTimeMinutes: number;
  unlockCount: number;
  socialMediaMinutes: number;
  nightUsageMinutes: number;
  longestSessionMinutes: number;
  peakUsageHour: number | null;
  notificationCount: number;
  notificationResponseRate: number;
  sleepRegularityScore: number;
  wakeAfterSleepChecks: number;
  midnightSessionCount: number;
  connectivityTransitionCount: number;
  offlineMinutes: number;
  longestOfflineStreakMinutes: number;
  shortSessionCount: number;
  commuteMinutes: number;
}

interface SanitizedSurvey {
  stressLevel: number;
  anxietyLevel: number;
  depressionLevel: number;
  sleepQuality: number;
  sleepHours: number;
  socialInteraction: number;
  dailyProductivity: number;
  phoneDependence: number;
  mood: number;
}

interface NormalizedFeatureSet {
  screenTimeNorm: number;
  unlockNorm: number;
  socialNorm: number;
  nightNorm: number;
  sessionNorm: number;
  notificationNorm: number;
  notificationResponseNorm: number;
  sleepRegularityRiskNorm: number;
  connectivityDisruptionNorm: number;
  activityFragmentationNorm: number;
  commuteImpulseNorm: number;
  stressNorm: number;
  sleepDisruptionNorm: number;
  dependenceNorm: number;
  compulsiveCheckingNorm: number;
  socialIntensityNorm: number;
  nightRatioNorm: number;
}

export interface PreprocessedFeatureSet {
  avgScreenTimeMinutes: number;
  avgUnlockCount: number;
  avgSocialMediaMinutes: number;
  avgNightUsageMinutes: number;
  avgLongestSessionMinutes: number;
  avgNotificationCount: number;
  avgNotificationResponseRate: number;
  avgSleepRegularityScore: number;
  avgConnectivityTransitions: number;
  avgOfflineMinutes: number;
  avgShortSessionCount: number;
  avgCommuteMinutes: number;
  lateNightUsageScore: number;
  socialMediaDependencyScore: number;
  psychologicalStressScore: number;
  sleepDisruptionScore: number;
  notificationLoadScore: number;
  sleepRegularityRiskScore: number;
  connectivityDisruptionScore: number;
  activityFragmentationScore: number;
  commuteImpulseScore: number;
  moodRiskScore: number;
  productivityRiskScore: number;
  addictionBehaviorScore: number;
  overallRiskSignal: number;
  digitalDependencyScore: number;
  nightUsageRatio: number;
  socialMediaIntensity: number;
  compulsiveCheckingScore: number;
  activeHoursEstimate: number;
}

export interface FeatureSelectionSummary {
  selectedFeatureKeys: string[];
  droppedFeatureKeys: string[];
  selectedFeatureVector: Record<string, number>;
  importanceByFeature: Record<string, number>;
  varianceByFeature: Record<string, number>;
  reasonByFeature: Record<string, string>;
}

export interface PreprocessedDatasetRow {
  userId: string;
  date: string;
  screenTime: number;
  unlockFrequency: number;
  nightUsageScore: number;
  socialMediaUsage: number;
  stressScore: number;
  sleepScore: number;
  addictionLabel: RiskLabel;
}

export interface FeatureStoreRecordView {
  id: string;
  date: string;
  addictionLabel: RiskLabel;
  featureVector: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  featureSelection: FeatureSelectionSummary | null;
  quality: {
    removedInvalid: number;
    removedDuplicates: number;
    warnings: string[];
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreprocessedProfile {
  date: string;
  hasSurvey: boolean;
  usageDays: number;
  quality: {
    removedUsageRecords: number;
    removedDuplicates: number;
    warnings: string[];
  };
  source: {
    latestSurvey: SanitizedSurvey | null;
    usageSummary: {
      avgScreenTimeMinutes: number;
      avgUnlockCount: number;
      avgSocialMediaMinutes: number;
      avgNightUsageMinutes: number;
      avgLongestSessionMinutes: number;
      avgNotificationCount: number;
      avgNotificationResponseRate: number;
      avgSleepRegularityScore: number;
      avgConnectivityTransitions: number;
      avgOfflineMinutes: number;
      avgShortSessionCount: number;
      avgCommuteMinutes: number;
    };
  };
  normalizedFeatures: NormalizedFeatureSet;
  featureSelection: FeatureSelectionSummary;
  datasetRow: PreprocessedDatasetRow;
  features: PreprocessedFeatureSet;
}

const FEATURE_IMPORTANCE: Record<string, number> = {
  avgScreenTimeMinutes: 0.9,
  avgUnlockCount: 0.9,
  avgSocialMediaMinutes: 0.82,
  avgNightUsageMinutes: 0.83,
  avgLongestSessionMinutes: 0.6,
  avgNotificationCount: 0.72,
  avgNotificationResponseRate: 0.7,
  avgSleepRegularityScore: 0.78,
  avgConnectivityTransitions: 0.58,
  avgOfflineMinutes: 0.66,
  avgShortSessionCount: 0.74,
  avgCommuteMinutes: 0.57,
  lateNightUsageScore: 0.85,
  socialMediaDependencyScore: 0.88,
  psychologicalStressScore: 0.81,
  sleepDisruptionScore: 0.79,
  notificationLoadScore: 0.72,
  sleepRegularityRiskScore: 0.82,
  connectivityDisruptionScore: 0.68,
  activityFragmentationScore: 0.75,
  commuteImpulseScore: 0.58,
  moodRiskScore: 0.62,
  productivityRiskScore: 0.61,
  addictionBehaviorScore: 0.92,
  overallRiskSignal: 0.95,
  digitalDependencyScore: 0.96,
  nightUsageRatio: 0.84,
  socialMediaIntensity: 0.8,
  compulsiveCheckingScore: 0.93,
  activeHoursEstimate: 0.4,
};

const ESSENTIAL_FEATURES = new Set<string>([
  'avgScreenTimeMinutes',
  'avgUnlockCount',
  'avgSocialMediaMinutes',
  'avgNightUsageMinutes',
  'avgSleepRegularityScore',
  'psychologicalStressScore',
  'sleepDisruptionScore',
  'digitalDependencyScore',
  'compulsiveCheckingScore',
  'overallRiskSignal',
]);

@Injectable()
export class PreprocessingService {
  constructor(
    @InjectRepository(SurveyResponse)
    private readonly surveyRepository: Repository<SurveyResponse>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    @InjectRepository(FeatureStoreRecord)
    private readonly featureStoreRepository: Repository<FeatureStoreRecord>,
  ) {}

  async preprocessUserData(
    userId: string,
    options?: { persist?: boolean; lookbackDays?: number },
  ): Promise<PreprocessedProfile> {
    const lookbackDays = Math.max(
      7,
      Math.min(180, options?.lookbackDays ?? 30),
    );
    const shouldPersist = options?.persist ?? true;

    const [latestSurvey, usageRecords] = await Promise.all([
      this.surveyRepository.findOne({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
      }),
      this.usageRepository.find({
        where: { user: { id: userId } },
        order: { date: 'DESC' },
        take: lookbackDays,
      }),
    ]);

    const warnings: string[] = [];
    const dedupedRecords = this.removeDuplicatesByDate(usageRecords);
    const removedDuplicates = usageRecords.length - dedupedRecords.length;
    if (removedDuplicates > 0) {
      warnings.push(`Removed ${removedDuplicates} duplicate usage record(s)`);
    }

    const { cleanedRecords, removedInvalid } =
      this.validateAndCleanUsageRecords(dedupedRecords);
    if (removedInvalid > 0) {
      warnings.push(`Removed ${removedInvalid} invalid usage record(s)`);
    }

    const sanitizedSurvey = latestSurvey
      ? this.validateSurvey(latestSurvey, warnings)
      : null;

    if (!sanitizedSurvey) {
      warnings.push('Survey unavailable or incomplete; using neutral defaults');
    }

    const usageAverages = this.getUsageAverages(cleanedRecords);
    const surveyInput = sanitizedSurvey ?? this.getNeutralSurvey();
    const normalized = this.normalizeInputs(usageAverages, surveyInput);
    const features = this.buildFeatures(usageAverages, surveyInput, normalized);

    const varianceByFeature = this.computeVarianceSignals(cleanedRecords);
    const featureSelection = this.selectFeatures(features, varianceByFeature);
    const addictionLabel = this.classifyLabel(features.overallRiskSignal);
    const referenceDate = cleanedRecords[0]?.date ?? this.getTodayDate();

    const datasetRow: PreprocessedDatasetRow = {
      userId,
      date: referenceDate,
      screenTime: this.round1(features.avgScreenTimeMinutes),
      unlockFrequency: this.round1(features.avgUnlockCount),
      nightUsageScore: this.round1(features.lateNightUsageScore),
      socialMediaUsage: this.round1(features.avgSocialMediaMinutes),
      stressScore: this.round1(features.psychologicalStressScore),
      sleepScore: this.round1(100 - features.sleepDisruptionScore),
      addictionLabel,
    };

    const profile: PreprocessedProfile = {
      date: referenceDate,
      hasSurvey: Boolean(sanitizedSurvey),
      usageDays: cleanedRecords.length,
      quality: {
        removedUsageRecords: removedInvalid,
        removedDuplicates,
        warnings,
      },
      source: {
        latestSurvey: sanitizedSurvey,
        usageSummary: usageAverages,
      },
      normalizedFeatures: normalized,
      featureSelection,
      datasetRow,
      features,
    };

    if (shouldPersist) {
      await this.persistFeatureStoreRecord(userId, profile);
    }

    return profile;
  }

  async getFeatureStoreRecords(
    userId: string,
    limit = 90,
  ): Promise<FeatureStoreRecordView[]> {
    const safeLimit = Math.max(1, Math.min(365, limit));
    const records = await this.featureStoreRepository.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: safeLimit,
    });

    return records.map((record) => this.sanitizeFeatureStoreRecord(record));
  }

  private removeDuplicatesByDate(records: UsageRecord[]): UsageRecord[] {
    const byDate = new Map<string, UsageRecord>();
    records.forEach((record) => {
      const existing = byDate.get(record.date);
      if (!existing) {
        byDate.set(record.date, record);
        return;
      }

      if (existing.createdAt < record.createdAt) {
        byDate.set(record.date, record);
      }
    });

    return Array.from(byDate.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  private validateAndCleanUsageRecords(records: UsageRecord[]): {
    cleanedRecords: SanitizedUsageRecord[];
    removedInvalid: number;
  } {
    const cleanedRecords: SanitizedUsageRecord[] = [];
    let removedInvalid = 0;

    for (const record of records) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
        removedInvalid += 1;
        continue;
      }

      const screenTime = this.toStrictBoundedNumber(
        record.screenTimeMinutes,
        0,
        1440,
      );
      const unlockCount = this.toStrictBoundedNumber(
        record.unlockCount,
        0,
        2000,
      );
      const socialMedia = this.toStrictBoundedNumber(
        record.socialMediaMinutes,
        0,
        1440,
      );
      const nightUsage = this.toStrictBoundedNumber(
        record.nightUsageMinutes,
        0,
        720,
      );
      const longestSession = this.toStrictBoundedNumber(
        record.longestSessionMinutes,
        0,
        720,
      );

      if (
        screenTime === null ||
        unlockCount === null ||
        socialMedia === null ||
        nightUsage === null ||
        longestSession === null
      ) {
        removedInvalid += 1;
        continue;
      }

      if (
        socialMedia > screenTime ||
        nightUsage > screenTime ||
        longestSession > screenTime
      ) {
        removedInvalid += 1;
        continue;
      }

      const peakUsageHour =
        record.peakUsageHour === null || record.peakUsageHour === undefined
          ? null
          : this.toStrictBoundedNumber(record.peakUsageHour, 0, 23);

      const notificationCount = this.toStrictBoundedNumber(
        record.notificationCount,
        0,
        2000,
      );
      if (notificationCount === null) {
        removedInvalid += 1;
        continue;
      }

      const sleepProxy = this.parseJsonObject(record.sleepProxyJson);
      const notificationInteraction = this.parseJsonObject(
        record.notificationInteractionJson,
      );
      const connectivityContext = this.parseJsonObject(
        record.connectivityContextJson,
      );
      const activityContext = this.parseJsonObject(record.activityContextJson);
      const locationContext = this.parseJsonObject(record.locationContextJson);

      const wakeAfterSleepChecks = this.toBoundedNumberOrDefault(
        this.getNumberField(sleepProxy, 'wakeAfterSleepChecks'),
        0,
        200,
        0,
      );
      const midnightSessionCount = this.toBoundedNumberOrDefault(
        this.getNumberField(sleepProxy, 'midnightSessionCount'),
        0,
        200,
        0,
      );
      const sleepRegularityScore = this.toBoundedNumberOrDefault(
        this.getNumberField(sleepProxy, 'sleepRegularityScore'),
        0,
        100,
        70,
      );

      const posted =
        this.getNestedNumber(
          notificationInteraction,
          'postedByCategory',
          'social',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'postedByCategory',
          'video',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'postedByCategory',
          'games',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'postedByCategory',
          'productivity',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'postedByCategory',
          'other',
        );
      const opened =
        this.getNestedNumber(
          notificationInteraction,
          'openedByCategory',
          'social',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'openedByCategory',
          'video',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'openedByCategory',
          'games',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'openedByCategory',
          'productivity',
        ) +
        this.getNestedNumber(
          notificationInteraction,
          'openedByCategory',
          'other',
        );
      const notificationResponseRate = this.clamp(
        posted <= 0 ? 0 : (opened / posted) * 100,
        0,
        100,
      );

      const connectivityTransitionCount = this.toBoundedNumberOrDefault(
        this.getNumberField(connectivityContext, 'transitionCount'),
        0,
        1000,
        0,
      );
      const offlineMinutes = this.toBoundedNumberOrDefault(
        this.getNumberField(connectivityContext, 'offlineMinutes'),
        0,
        1440,
        0,
      );
      const longestOfflineStreakMinutes = this.toBoundedNumberOrDefault(
        this.getNumberField(connectivityContext, 'longestOfflineStreakMinutes'),
        0,
        1440,
        0,
      );

      const shortSessionCount = this.toBoundedNumberOrDefault(
        this.getNumberField(activityContext, 'shortSessionCount'),
        0,
        500,
        0,
      );

      const commuteMinutes = this.toBoundedNumberOrDefault(
        this.getNumberField(locationContext, 'commuteMinutes'),
        0,
        1440,
        0,
      );

      cleanedRecords.push({
        date: record.date,
        screenTimeMinutes: screenTime,
        unlockCount,
        socialMediaMinutes: socialMedia,
        nightUsageMinutes: nightUsage,
        longestSessionMinutes: longestSession,
        peakUsageHour,
        notificationCount,
        notificationResponseRate: this.round1(notificationResponseRate),
        sleepRegularityScore: this.round1(sleepRegularityScore),
        wakeAfterSleepChecks: this.round1(wakeAfterSleepChecks),
        midnightSessionCount: this.round1(midnightSessionCount),
        connectivityTransitionCount: this.round1(connectivityTransitionCount),
        offlineMinutes: this.round1(offlineMinutes),
        longestOfflineStreakMinutes: this.round1(longestOfflineStreakMinutes),
        shortSessionCount: this.round1(shortSessionCount),
        commuteMinutes: this.round1(commuteMinutes),
      });
    }

    return {
      cleanedRecords,
      removedInvalid,
    };
  }

  private validateSurvey(
    survey: SurveyResponse,
    warnings: string[],
  ): SanitizedSurvey | null {
    const values = [
      survey.stressLevel,
      survey.anxietyLevel,
      survey.depressionLevel,
      survey.sleepQuality,
      survey.sleepHours,
      survey.socialInteraction,
      survey.dailyProductivity,
      survey.phoneDependence,
      survey.mood,
    ];

    if (
      values.some(
        (value) => typeof value !== 'number' || !Number.isFinite(value),
      )
    ) {
      warnings.push('Incomplete survey response dropped from preprocessing');
      return null;
    }

    return {
      stressLevel: this.clamp(survey.stressLevel, 1, 10),
      anxietyLevel: this.clamp(survey.anxietyLevel, 1, 10),
      depressionLevel: this.clamp(survey.depressionLevel, 1, 10),
      sleepQuality: this.clamp(survey.sleepQuality, 1, 10),
      sleepHours: this.clamp(survey.sleepHours, 0, 24),
      socialInteraction: this.clamp(survey.socialInteraction, 1, 10),
      dailyProductivity: this.clamp(survey.dailyProductivity, 1, 10),
      phoneDependence: this.clamp(survey.phoneDependence, 1, 10),
      mood: this.clamp(survey.mood, 1, 5),
    };
  }

  private getNeutralSurvey(): SanitizedSurvey {
    return {
      stressLevel: 5,
      anxietyLevel: 5,
      depressionLevel: 5,
      sleepQuality: 5,
      sleepHours: 7,
      socialInteraction: 5,
      dailyProductivity: 5,
      phoneDependence: 5,
      mood: 3,
    };
  }

  private getUsageAverages(records: SanitizedUsageRecord[]): {
    avgScreenTimeMinutes: number;
    avgUnlockCount: number;
    avgSocialMediaMinutes: number;
    avgNightUsageMinutes: number;
    avgLongestSessionMinutes: number;
    avgNotificationCount: number;
    avgNotificationResponseRate: number;
    avgSleepRegularityScore: number;
    avgConnectivityTransitions: number;
    avgOfflineMinutes: number;
    avgShortSessionCount: number;
    avgCommuteMinutes: number;
  } {
    if (records.length === 0) {
      return {
        avgScreenTimeMinutes: 0,
        avgUnlockCount: 0,
        avgSocialMediaMinutes: 0,
        avgNightUsageMinutes: 0,
        avgLongestSessionMinutes: 0,
        avgNotificationCount: 0,
        avgNotificationResponseRate: 0,
        avgSleepRegularityScore: 70,
        avgConnectivityTransitions: 0,
        avgOfflineMinutes: 0,
        avgShortSessionCount: 0,
        avgCommuteMinutes: 0,
      };
    }

    const size = records.length;
    return {
      avgScreenTimeMinutes: this.round1(
        records.reduce((sum, item) => sum + item.screenTimeMinutes, 0) / size,
      ),
      avgUnlockCount: this.round1(
        records.reduce((sum, item) => sum + item.unlockCount, 0) / size,
      ),
      avgSocialMediaMinutes: this.round1(
        records.reduce((sum, item) => sum + item.socialMediaMinutes, 0) / size,
      ),
      avgNightUsageMinutes: this.round1(
        records.reduce((sum, item) => sum + item.nightUsageMinutes, 0) / size,
      ),
      avgLongestSessionMinutes: this.round1(
        records.reduce((sum, item) => sum + item.longestSessionMinutes, 0) /
          size,
      ),
      avgNotificationCount: this.round1(
        records.reduce((sum, item) => sum + item.notificationCount, 0) / size,
      ),
      avgNotificationResponseRate: this.round1(
        records.reduce((sum, item) => sum + item.notificationResponseRate, 0) /
          size,
      ),
      avgSleepRegularityScore: this.round1(
        records.reduce((sum, item) => sum + item.sleepRegularityScore, 0) /
          size,
      ),
      avgConnectivityTransitions: this.round1(
        records.reduce(
          (sum, item) => sum + item.connectivityTransitionCount,
          0,
        ) / size,
      ),
      avgOfflineMinutes: this.round1(
        records.reduce((sum, item) => sum + item.offlineMinutes, 0) / size,
      ),
      avgShortSessionCount: this.round1(
        records.reduce((sum, item) => sum + item.shortSessionCount, 0) / size,
      ),
      avgCommuteMinutes: this.round1(
        records.reduce((sum, item) => sum + item.commuteMinutes, 0) / size,
      ),
    };
  }

  private normalizeInputs(
    usageAverages: {
      avgScreenTimeMinutes: number;
      avgUnlockCount: number;
      avgSocialMediaMinutes: number;
      avgNightUsageMinutes: number;
      avgLongestSessionMinutes: number;
      avgNotificationCount: number;
      avgNotificationResponseRate: number;
      avgSleepRegularityScore: number;
      avgConnectivityTransitions: number;
      avgOfflineMinutes: number;
      avgShortSessionCount: number;
      avgCommuteMinutes: number;
    },
    survey: SanitizedSurvey,
  ): NormalizedFeatureSet {
    const activeHoursEstimate = this.estimateActiveHours(
      usageAverages.avgScreenTimeMinutes,
    );
    const compulsiveCheckingRaw =
      usageAverages.avgUnlockCount / Math.max(activeHoursEstimate, 1);
    const socialIntensityRaw =
      usageAverages.avgSocialMediaMinutes /
      Math.max(usageAverages.avgScreenTimeMinutes, 1);
    const nightRatioRaw =
      usageAverages.avgNightUsageMinutes /
      Math.max(usageAverages.avgScreenTimeMinutes, 1);
    const notificationResponseRaw =
      usageAverages.avgNotificationResponseRate / 100;
    const sleepRegularityRiskRaw =
      (100 - usageAverages.avgSleepRegularityScore) / 100;
    const connectivityDisruptionRaw =
      this.normalize(usageAverages.avgOfflineMinutes, 0, 480) * 0.6 +
      this.normalize(usageAverages.avgConnectivityTransitions, 0, 40) * 0.4;
    const activityFragmentationRaw = this.normalize(
      usageAverages.avgShortSessionCount,
      0,
      80,
    );
    const commuteImpulseRaw = this.normalize(
      usageAverages.avgCommuteMinutes,
      0,
      240,
    );

    const stressNorm =
      (survey.stressLevel + survey.anxietyLevel + survey.depressionLevel) / 30;
    const sleepHourPenalty =
      survey.sleepHours < 7
        ? this.normalize(7 - survey.sleepHours, 0, 4)
        : this.normalize(survey.sleepHours - 9, 0, 4) * 0.4;
    const sleepQualityPenalty = this.normalize(10 - survey.sleepQuality, 0, 9);
    const sleepDisruptionNorm = this.clamp(
      sleepHourPenalty * 0.6 + sleepQualityPenalty * 0.4,
      0,
      1,
    );

    return {
      screenTimeNorm: this.normalize(
        usageAverages.avgScreenTimeMinutes,
        0,
        720,
      ),
      unlockNorm: this.normalize(usageAverages.avgUnlockCount, 0, 180),
      socialNorm: this.normalize(usageAverages.avgSocialMediaMinutes, 0, 360),
      nightNorm: this.normalize(usageAverages.avgNightUsageMinutes, 0, 180),
      sessionNorm: this.normalize(
        usageAverages.avgLongestSessionMinutes,
        0,
        120,
      ),
      notificationNorm: this.normalize(
        usageAverages.avgNotificationCount,
        0,
        300,
      ),
      notificationResponseNorm: this.clamp(notificationResponseRaw, 0, 1),
      sleepRegularityRiskNorm: this.clamp(sleepRegularityRiskRaw, 0, 1),
      connectivityDisruptionNorm: this.clamp(connectivityDisruptionRaw, 0, 1),
      activityFragmentationNorm: this.clamp(activityFragmentationRaw, 0, 1),
      commuteImpulseNorm: this.clamp(commuteImpulseRaw, 0, 1),
      stressNorm: this.clamp(stressNorm, 0, 1),
      sleepDisruptionNorm,
      dependenceNorm: this.normalize(survey.phoneDependence, 1, 10),
      compulsiveCheckingNorm: this.normalize(compulsiveCheckingRaw, 0, 18),
      socialIntensityNorm: this.clamp(socialIntensityRaw, 0, 1),
      nightRatioNorm: this.clamp(nightRatioRaw, 0, 1),
    };
  }

  private buildFeatures(
    usageAverages: {
      avgScreenTimeMinutes: number;
      avgUnlockCount: number;
      avgSocialMediaMinutes: number;
      avgNightUsageMinutes: number;
      avgLongestSessionMinutes: number;
      avgNotificationCount: number;
      avgNotificationResponseRate: number;
      avgSleepRegularityScore: number;
      avgConnectivityTransitions: number;
      avgOfflineMinutes: number;
      avgShortSessionCount: number;
      avgCommuteMinutes: number;
    },
    survey: SanitizedSurvey,
    normalized: NormalizedFeatureSet,
  ): PreprocessedFeatureSet {
    const activeHoursEstimate = this.estimateActiveHours(
      usageAverages.avgScreenTimeMinutes,
    );
    const compulsiveCheckingScore = this.round1(
      usageAverages.avgUnlockCount / Math.max(activeHoursEstimate, 1),
    );
    const nightUsageRatio = this.round1(normalized.nightRatioNorm * 100);
    const socialMediaIntensity = this.round1(
      normalized.socialIntensityNorm * 100,
    );
    const psychologicalStressScore = this.round1(normalized.stressNorm * 100);
    const sleepDisruptionScore = this.round1(
      normalized.sleepDisruptionNorm * 100,
    );
    const notificationLoadScore = this.round1(
      (normalized.notificationNorm * 0.7 +
        normalized.notificationResponseNorm * 0.3) *
        100,
    );
    const sleepRegularityRiskScore = this.round1(
      normalized.sleepRegularityRiskNorm * 100,
    );
    const connectivityDisruptionScore = this.round1(
      normalized.connectivityDisruptionNorm * 100,
    );
    const activityFragmentationScore = this.round1(
      normalized.activityFragmentationNorm * 100,
    );
    const commuteImpulseScore = this.round1(
      normalized.commuteImpulseNorm * 100,
    );
    const moodRiskScore = this.round1(
      this.normalize(5 - survey.mood, 0, 4) * 100,
    );
    const productivityRiskScore = this.round1(
      this.normalize(10 - survey.dailyProductivity, 0, 9) * 100,
    );

    const lateNightUsageScore = this.round1(
      (normalized.nightNorm * 0.7 + normalized.nightRatioNorm * 0.3) * 100,
    );

    const socialMediaDependencyScore = this.round1(
      (normalized.socialNorm * 0.55 +
        normalized.socialIntensityNorm * 0.25 +
        normalized.dependenceNorm * 0.2) *
        100,
    );

    const addictionBehaviorScore = this.round1(
      (normalized.screenTimeNorm * 0.27 +
        normalized.unlockNorm * 0.2 +
        normalized.compulsiveCheckingNorm * 0.16 +
        normalized.socialNorm * 0.17 +
        normalized.nightNorm * 0.12 +
        normalized.sessionNorm * 0.08) *
        100,
    );

    const digitalDependencyScore = this.round1(
      (normalized.screenTimeNorm * 0.24 +
        normalized.unlockNorm * 0.2 +
        normalized.compulsiveCheckingNorm * 0.2 +
        normalized.socialIntensityNorm * 0.16 +
        normalized.nightRatioNorm * 0.1 +
        normalized.dependenceNorm * 0.1) *
        100,
    );

    const overallRiskSignal = this.round1(
      addictionBehaviorScore * 0.39 +
        digitalDependencyScore * 0.17 +
        socialMediaDependencyScore * 0.12 +
        psychologicalStressScore * 0.12 +
        sleepDisruptionScore * 0.06 +
        notificationLoadScore * 0.04 +
        sleepRegularityRiskScore * 0.04 +
        connectivityDisruptionScore * 0.02 +
        activityFragmentationScore * 0.01 +
        commuteImpulseScore * 0.01 +
        moodRiskScore * 0.01 +
        productivityRiskScore * 0.01,
    );

    return {
      avgScreenTimeMinutes: usageAverages.avgScreenTimeMinutes,
      avgUnlockCount: usageAverages.avgUnlockCount,
      avgSocialMediaMinutes: usageAverages.avgSocialMediaMinutes,
      avgNightUsageMinutes: usageAverages.avgNightUsageMinutes,
      avgLongestSessionMinutes: usageAverages.avgLongestSessionMinutes,
      avgNotificationCount: usageAverages.avgNotificationCount,
      avgNotificationResponseRate: usageAverages.avgNotificationResponseRate,
      avgSleepRegularityScore: usageAverages.avgSleepRegularityScore,
      avgConnectivityTransitions: usageAverages.avgConnectivityTransitions,
      avgOfflineMinutes: usageAverages.avgOfflineMinutes,
      avgShortSessionCount: usageAverages.avgShortSessionCount,
      avgCommuteMinutes: usageAverages.avgCommuteMinutes,
      lateNightUsageScore,
      socialMediaDependencyScore,
      psychologicalStressScore,
      sleepDisruptionScore,
      notificationLoadScore,
      sleepRegularityRiskScore,
      connectivityDisruptionScore,
      activityFragmentationScore,
      commuteImpulseScore,
      moodRiskScore,
      productivityRiskScore,
      addictionBehaviorScore,
      overallRiskSignal,
      digitalDependencyScore,
      nightUsageRatio,
      socialMediaIntensity,
      compulsiveCheckingScore,
      activeHoursEstimate: this.round1(activeHoursEstimate),
    };
  }

  private computeVarianceSignals(
    usageRecords: SanitizedUsageRecord[],
  ): Record<string, number> {
    const screenVar = this.normalizedVariance(
      usageRecords.map((item) => item.screenTimeMinutes),
      720,
    );
    const unlockVar = this.normalizedVariance(
      usageRecords.map((item) => item.unlockCount),
      180,
    );
    const socialVar = this.normalizedVariance(
      usageRecords.map((item) => item.socialMediaMinutes),
      360,
    );
    const nightVar = this.normalizedVariance(
      usageRecords.map((item) => item.nightUsageMinutes),
      180,
    );
    const sessionVar = this.normalizedVariance(
      usageRecords.map((item) => item.longestSessionMinutes),
      120,
    );
    const notificationVar = this.normalizedVariance(
      usageRecords.map((item) => item.notificationCount),
      300,
    );
    const notificationResponseVar = this.normalizedVariance(
      usageRecords.map((item) => item.notificationResponseRate),
      100,
    );
    const sleepRegularityVar = this.normalizedVariance(
      usageRecords.map((item) => item.sleepRegularityScore),
      100,
    );
    const connectivityTransitionVar = this.normalizedVariance(
      usageRecords.map((item) => item.connectivityTransitionCount),
      40,
    );
    const offlineVar = this.normalizedVariance(
      usageRecords.map((item) => item.offlineMinutes),
      480,
    );
    const shortSessionVar = this.normalizedVariance(
      usageRecords.map((item) => item.shortSessionCount),
      80,
    );
    const commuteVar = this.normalizedVariance(
      usageRecords.map((item) => item.commuteMinutes),
      240,
    );

    return {
      avgScreenTimeMinutes: screenVar,
      avgUnlockCount: unlockVar,
      avgSocialMediaMinutes: socialVar,
      avgNightUsageMinutes: nightVar,
      avgLongestSessionMinutes: sessionVar,
      avgNotificationCount: notificationVar,
      avgNotificationResponseRate: notificationResponseVar,
      avgSleepRegularityScore: sleepRegularityVar,
      avgConnectivityTransitions: connectivityTransitionVar,
      avgOfflineMinutes: offlineVar,
      avgShortSessionCount: shortSessionVar,
      avgCommuteMinutes: commuteVar,
      lateNightUsageScore: nightVar,
      socialMediaDependencyScore: (socialVar + screenVar) / 2,
      psychologicalStressScore: 0,
      sleepDisruptionScore: 0,
      notificationLoadScore: (notificationVar + notificationResponseVar) / 2,
      sleepRegularityRiskScore: sleepRegularityVar,
      connectivityDisruptionScore: (offlineVar + connectivityTransitionVar) / 2,
      activityFragmentationScore: shortSessionVar,
      commuteImpulseScore: commuteVar,
      moodRiskScore: 0,
      productivityRiskScore: 0,
      addictionBehaviorScore: (screenVar + unlockVar + nightVar) / 3,
      overallRiskSignal: (screenVar + unlockVar + socialVar + nightVar) / 4,
      digitalDependencyScore: (screenVar + unlockVar + socialVar) / 3,
      nightUsageRatio: nightVar,
      socialMediaIntensity: socialVar,
      compulsiveCheckingScore: unlockVar,
      activeHoursEstimate: screenVar * 0.5,
    };
  }

  private selectFeatures(
    features: PreprocessedFeatureSet,
    varianceByFeature: Record<string, number>,
  ): FeatureSelectionSummary {
    const featureEntries = Object.entries(features) as Array<
      [keyof PreprocessedFeatureSet, number]
    >;
    const selectedFeatureVector: Record<string, number> = {};
    const selectedFeatureKeys: string[] = [];
    const droppedFeatureKeys: string[] = [];
    const reasonByFeature: Record<string, string> = {};

    for (const [featureKey, featureValue] of featureEntries) {
      const key = String(featureKey);
      const importance = FEATURE_IMPORTANCE[featureKey] ?? 0.5;
      const variance = varianceByFeature[featureKey] ?? 0;
      const keepByImportance = importance >= 0.7;
      const keepByVariance = variance >= 0.02;
      const keepByEssential = ESSENTIAL_FEATURES.has(key);

      if (keepByEssential || keepByImportance || keepByVariance) {
        selectedFeatureVector[key] = this.round1(featureValue);
        selectedFeatureKeys.push(key);
        if (keepByEssential) {
          reasonByFeature[key] = 'Selected: essential feature';
        } else if (keepByImportance) {
          reasonByFeature[key] =
            'Selected: high model-based feature importance';
        } else {
          reasonByFeature[key] = 'Selected: high variance signal';
        }
      } else {
        droppedFeatureKeys.push(key);
        reasonByFeature[key] = 'Dropped: low importance and low variance';
      }
    }

    return {
      selectedFeatureKeys,
      droppedFeatureKeys,
      selectedFeatureVector,
      importanceByFeature: FEATURE_IMPORTANCE,
      varianceByFeature,
      reasonByFeature,
    };
  }

  private async persistFeatureStoreRecord(
    userId: string,
    profile: PreprocessedProfile,
  ): Promise<void> {
    let record = await this.featureStoreRepository.findOne({
      where: { user: { id: userId }, date: profile.date },
    });

    if (!record) {
      record = this.featureStoreRepository.create({
        user: { id: userId } as User,
        date: profile.date,
      });
    }

    record.featureVectorJson = JSON.stringify(
      profile.featureSelection.selectedFeatureVector,
    );
    record.normalizedFeaturesJson = JSON.stringify(profile.normalizedFeatures);
    record.featureSelectionJson = JSON.stringify(profile.featureSelection);
    record.qualityJson = JSON.stringify({
      removedInvalid: profile.quality.removedUsageRecords,
      removedDuplicates: profile.quality.removedDuplicates,
      warnings: profile.quality.warnings,
    });
    record.addictionLabel = profile.datasetRow.addictionLabel;

    await this.featureStoreRepository.save(record);
  }

  private sanitizeFeatureStoreRecord(
    record: FeatureStoreRecord,
  ): FeatureStoreRecordView {
    return {
      id: record.id,
      date: record.date,
      addictionLabel: this.toRiskLabel(record.addictionLabel),
      featureVector: this.parseNumberMap(record.featureVectorJson),
      normalizedFeatures: this.parseNumberMap(record.normalizedFeaturesJson),
      featureSelection: this.parseFeatureSelection(record.featureSelectionJson),
      quality: this.parseQuality(record.qualityJson),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private parseNumberMap(jsonValue: string | null): Record<string, number> {
    if (!jsonValue) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const output: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          output[key] = value;
        }
      }
      return output;
    } catch {
      return {};
    }
  }

  private parseFeatureSelection(
    jsonValue: string | null,
  ): FeatureSelectionSummary | null {
    if (!jsonValue) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const obj = parsed as Record<string, unknown>;
      const selectedFeatureKeys = Array.isArray(obj.selectedFeatureKeys)
        ? obj.selectedFeatureKeys.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
      const droppedFeatureKeys = Array.isArray(obj.droppedFeatureKeys)
        ? obj.droppedFeatureKeys.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];

      return {
        selectedFeatureKeys,
        droppedFeatureKeys,
        selectedFeatureVector: this.asNumberMap(obj.selectedFeatureVector),
        importanceByFeature: this.asNumberMap(obj.importanceByFeature),
        varianceByFeature: this.asNumberMap(obj.varianceByFeature),
        reasonByFeature: this.asStringMap(obj.reasonByFeature),
      };
    } catch {
      return null;
    }
  }

  private parseQuality(jsonValue: string | null): {
    removedInvalid: number;
    removedDuplicates: number;
    warnings: string[];
  } | null {
    if (!jsonValue) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const obj = parsed as Record<string, unknown>;
      return {
        removedInvalid:
          typeof obj.removedInvalid === 'number' ? obj.removedInvalid : 0,
        removedDuplicates:
          typeof obj.removedDuplicates === 'number' ? obj.removedDuplicates : 0,
        warnings: Array.isArray(obj.warnings)
          ? obj.warnings.filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
      };
    } catch {
      return null;
    }
  }

  private parseJsonObject(jsonValue: string | null): Record<string, unknown> {
    if (!jsonValue) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private getNumberField(
    source: Record<string, unknown>,
    key: string,
  ): number | null {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private getNestedNumber(
    source: Record<string, unknown>,
    parentKey: string,
    childKey: string,
  ): number {
    const parent = source[parentKey];
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      return 0;
    }

    const value = (parent as Record<string, unknown>)[childKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    return value;
  }

  private asNumberMap(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const output: Record<string, number> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'number' && Number.isFinite(item)) {
        output[key] = item;
      }
    }
    return output;
  }

  private asStringMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const output: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') {
        output[key] = item;
      }
    }
    return output;
  }

  private classifyLabel(score: number): RiskLabel {
    if (score >= 70) {
      return 'HIGH';
    }
    if (score >= 40) {
      return 'MODERATE';
    }
    return 'LOW';
  }

  private toRiskLabel(value: string): RiskLabel {
    if (value === 'LOW' || value === 'MODERATE' || value === 'HIGH') {
      return value;
    }
    return 'MODERATE';
  }

  private estimateActiveHours(avgScreenTimeMinutes: number): number {
    const screenHours = avgScreenTimeMinutes / 60;
    const estimate = screenHours * 1.6 + 3.2;
    return this.clamp(estimate, 4, 18);
  }

  private normalizedVariance(
    values: number[],
    normalizationRange: number,
  ): number {
    if (values.length <= 1 || normalizationRange <= 0) {
      return 0;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => {
        const diff = value - mean;
        return sum + diff * diff;
      }, 0) / values.length;

    return this.clamp(
      variance / (normalizationRange * normalizationRange),
      0,
      1,
    );
  }

  private toStrictBoundedNumber(
    value: unknown,
    min: number,
    max: number,
  ): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (value < min || value > max) {
      return null;
    }
    return value;
  }

  private toBoundedNumberOrDefault(
    value: number | null,
    min: number,
    max: number,
    fallback: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    return this.clamp(value, min, max);
  }

  private normalize(value: number, min: number, max: number): number {
    if (max <= min) {
      return 0;
    }
    const bounded = this.clamp(value, min, max);
    return (bounded - min) / (max - min);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
