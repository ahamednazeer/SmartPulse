import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { UsageRecord } from '../entities/usage-record.entity';
import { SurveyResponse } from '../entities/survey-response.entity';
import { PredictionResult } from '../entities/prediction-result.entity';
import { NotificationHistory } from '../entities/notification-history.entity';
import { PreprocessingService } from '../preprocessing/preprocessing.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    @InjectRepository(SurveyResponse)
    private readonly surveyRepository: Repository<SurveyResponse>,
    @InjectRepository(PredictionResult)
    private readonly predictionRepository: Repository<PredictionResult>,
    @InjectRepository(NotificationHistory)
    private readonly notificationRepository: Repository<NotificationHistory>,
    private readonly preprocessingService: PreprocessingService,
  ) {}

  async getDashboard(userId: string) {
    const [usageRecords, predictions, latestSurvey, unreadCount, features] =
      await Promise.all([
        this.usageRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: 30,
        }),
        this.predictionRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: 30,
        }),
        this.surveyRepository.findOne({
          where: { user: { id: userId } },
          order: { createdAt: 'DESC' },
        }),
        this.notificationRepository.count({
          where: { user: { id: userId }, isRead: false },
        }),
        this.preprocessingService.preprocessUserData(userId),
      ]);

    const usageTrend = usageRecords
      .slice(0, 14)
      .map((record) => ({
        date: record.date,
        screenTimeMinutes: Math.round(record.screenTimeMinutes),
        unlockCount: record.unlockCount,
        socialMediaMinutes: Math.round(record.socialMediaMinutes),
        nightUsageMinutes: Math.round(record.nightUsageMinutes),
      }))
      .reverse();

    const riskTrend = predictions
      .slice(0, 14)
      .map((prediction) => ({
        date: prediction.date,
        riskScore: prediction.riskScore,
        riskLevel: prediction.riskLevel,
      }))
      .reverse();

    const latestPrediction = predictions[0] ?? null;

    return {
      generatedAt: new Date().toISOString(),
      usageDashboard: {
        currentDailyScreenTime: usageRecords[0]
          ? Math.round(usageRecords[0].screenTimeMinutes)
          : 0,
        weeklyAverageScreenTime: this.round1(
          this.average(
            usageRecords.slice(0, 7).map((item) => item.screenTimeMinutes),
          ),
        ),
        weeklyAverageUnlocks: this.round1(
          this.average(
            usageRecords.slice(0, 7).map((item) => item.unlockCount),
          ),
        ),
        weeklyAverageNightUsage: this.round1(
          this.average(
            usageRecords.slice(0, 7).map((item) => item.nightUsageMinutes),
          ),
        ),
      },
      trends: {
        usageTrend,
        riskTrend,
      },
      risk: latestPrediction
        ? {
            score: latestPrediction.riskScore,
            level: latestPrediction.riskLevel,
            date: latestPrediction.date,
          }
        : null,
      latestSurvey: latestSurvey
        ? {
            createdAt: latestSurvey.createdAt,
            stressLevel: latestSurvey.stressLevel,
            anxietyLevel: latestSurvey.anxietyLevel,
            depressionLevel: latestSurvey.depressionLevel,
            sleepQuality: latestSurvey.sleepQuality,
            phoneDependence: latestSurvey.phoneDependence,
          }
        : null,
      featureScores: {
        addictionBehaviorScore: features.features.addictionBehaviorScore,
        psychologicalStressScore: features.features.psychologicalStressScore,
        sleepDisruptionScore: features.features.sleepDisruptionScore,
        socialMediaDependencyScore:
          features.features.socialMediaDependencyScore,
      },
      notifications: {
        unreadCount,
      },
    };
  }

  async getResearchExport(userId: string, days = 30) {
    const safeDays = Math.max(1, Math.min(180, days));

    const [usageRecords, surveyResponses, predictions, notifications] =
      await Promise.all([
        this.usageRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: safeDays,
        }),
        this.surveyRepository.find({
          where: { user: { id: userId } },
          order: { createdAt: 'DESC' },
          take: 20,
        }),
        this.predictionRepository.find({
          where: { user: { id: userId } },
          order: { date: 'DESC' },
          take: safeDays,
        }),
        this.notificationRepository.find({
          where: { user: { id: userId } },
          order: { createdAt: 'DESC' },
          take: safeDays,
        }),
      ]);

    const anonUserId = createHash('sha256')
      .update(userId)
      .digest('hex')
      .slice(0, 16);

    return {
      exportedAt: new Date().toISOString(),
      anonymizedUserId: anonUserId,
      windows: {
        usageDays: safeDays,
      },
      behavioralData: usageRecords.map((record) => ({
        date: record.date,
        screenTimeMinutes: Math.round(record.screenTimeMinutes),
        unlockCount: record.unlockCount,
        socialMediaMinutes: Math.round(record.socialMediaMinutes),
        nightUsageMinutes: Math.round(record.nightUsageMinutes),
        peakUsageHour: record.peakUsageHour,
        longestSessionMinutes: Math.round(record.longestSessionMinutes),
      })),
      psychologicalData: surveyResponses.map((survey) => ({
        createdAt: survey.createdAt,
        stressLevel: survey.stressLevel,
        anxietyLevel: survey.anxietyLevel,
        depressionLevel: survey.depressionLevel,
        sleepQuality: survey.sleepQuality,
        sleepHours: survey.sleepHours,
        socialInteraction: survey.socialInteraction,
        dailyProductivity: survey.dailyProductivity,
        phoneDependence: survey.phoneDependence,
        mood: survey.mood,
      })),
      predictions: predictions.map((prediction) => ({
        date: prediction.date,
        riskScore: prediction.riskScore,
        riskLevel: prediction.riskLevel,
      })),
      notifications: notifications.map((notification) => ({
        date: notification.date,
        type: notification.type,
        severity: notification.severity,
        isRead: notification.isRead,
      })),
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }
}
