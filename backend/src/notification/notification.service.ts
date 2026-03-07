import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationHistory } from '../entities/notification-history.entity';
import { UsageRecord } from '../entities/usage-record.entity';
import { RiskAnalysisService } from '../risk-analysis/risk-analysis.service';
import { User } from '../entities/user.entity';

interface AlertCandidate {
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationHistory)
    private readonly notificationRepository: Repository<NotificationHistory>,
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    private readonly riskAnalysisService: RiskAnalysisService,
  ) {}

  async evaluateAndGenerate(userId: string) {
    const [latestUsage, analysis] = await Promise.all([
      this.usageRepository.findOne({
        where: { user: { id: userId } },
        order: { date: 'DESC' },
      }),
      this.riskAnalysisService.getLatestAnalysis(userId),
    ]);

    const referenceDate = latestUsage?.date ?? this.getTodayDate();
    const candidates: AlertCandidate[] = [];

    if (latestUsage) {
      if (latestUsage.screenTimeMinutes >= 300) {
        candidates.push({
          type: 'screen_time_limit',
          severity:
            latestUsage.screenTimeMinutes >= 420 ? 'CRITICAL' : 'WARNING',
          title: 'Screen Time Threshold Exceeded',
          message: `You have used your phone for ${Math.round(latestUsage.screenTimeMinutes)} minutes today.`,
          metadata: {
            screenTimeMinutes: latestUsage.screenTimeMinutes,
            thresholdMinutes: 300,
          },
        });
      }

      if (latestUsage.nightUsageMinutes >= 90) {
        candidates.push({
          type: 'night_usage_alert',
          severity:
            latestUsage.nightUsageMinutes >= 140 ? 'CRITICAL' : 'WARNING',
          title: 'High Night-Time Activity Detected',
          message: `Night usage reached ${Math.round(latestUsage.nightUsageMinutes)} minutes today.`,
          metadata: {
            nightUsageMinutes: latestUsage.nightUsageMinutes,
            thresholdMinutes: 90,
          },
        });
      }

      if (latestUsage.unlockCount >= 100) {
        candidates.push({
          type: 'unlock_frequency_alert',
          severity: latestUsage.unlockCount >= 150 ? 'CRITICAL' : 'WARNING',
          title: 'Frequent Phone Checking Detected',
          message: `Phone unlock count is ${latestUsage.unlockCount} today.`,
          metadata: {
            unlockCount: latestUsage.unlockCount,
            thresholdCount: 100,
          },
        });
      }
    }

    if (analysis.riskLevel === 'HIGH') {
      candidates.push({
        type: 'high_risk_prediction',
        severity: 'CRITICAL',
        title: 'Addiction Risk Elevated',
        message: `Your latest addiction risk is HIGH (${Math.round(analysis.riskScore)}/100).`,
        metadata: {
          riskScore: analysis.riskScore,
          patternCount: analysis.patterns.length,
        },
      });
    } else if (analysis.riskLevel === 'MODERATE') {
      candidates.push({
        type: 'moderate_risk_watch',
        severity: 'WARNING',
        title: 'Addiction Risk Rising',
        message: `Your latest addiction risk is MODERATE (${Math.round(analysis.riskScore)}/100). Review your recent usage patterns.`,
        metadata: {
          riskScore: analysis.riskScore,
        },
      });
    }

    if (analysis.aiInsight) {
      candidates.push({
        type: 'ai_behavior_insight',
        severity: analysis.riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING',
        title: 'AI Behavioral Insight',
        message: analysis.aiInsight,
        metadata: {
          riskLevel: analysis.riskLevel,
          keyPattern: analysis.patterns[0]?.key ?? null,
        },
      });
    }

    if (candidates.length === 0) {
      candidates.push({
        type: 'daily_usage_summary',
        severity: 'INFO',
        title: 'Daily Usage Summary',
        message:
          'Your usage is within current thresholds today. Keep your present routine and re-check tomorrow.',
        metadata: {
          riskScore: analysis.riskScore,
        },
      });
    }

    const created: NotificationHistory[] = [];
    for (const candidate of candidates) {
      const exists = await this.notificationRepository.findOne({
        where: {
          user: { id: userId },
          date: referenceDate,
          type: candidate.type,
        },
      });

      if (exists) {
        continue;
      }

      const notification = this.notificationRepository.create({
        user: { id: userId } as User,
        date: referenceDate,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        metadataJson: candidate.metadata
          ? JSON.stringify(candidate.metadata)
          : undefined,
      });

      const saved = await this.notificationRepository.save(notification);
      created.push(saved);
    }

    return {
      date: referenceDate,
      createdCount: created.length,
      notifications: created.map((item) => this.sanitize(item)),
    };
  }

  async getNotifications(userId: string, limit = 30) {
    const notifications = await this.notificationRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return notifications.map((item) => this.sanitize(item));
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await this.notificationRepository.count({
      where: {
        user: { id: userId },
        isRead: false,
      },
    });

    return { unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        user: { id: userId },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    const saved = await this.notificationRepository.save(notification);
    return this.sanitize(saved);
  }

  private sanitize(notification: NotificationHistory) {
    return {
      id: notification.id,
      date: notification.date,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      metadata: this.parseMetadata(notification.metadataJson),
      createdAt: notification.createdAt,
    };
  }

  private parseMetadata(
    jsonValue: string | null,
  ): Record<string, unknown> | null {
    if (!jsonValue) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
