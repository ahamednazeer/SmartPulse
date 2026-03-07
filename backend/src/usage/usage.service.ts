import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageRecord } from '../entities/usage-record.entity';
import { User } from '../entities/user.entity';
import {
  CreateUsageRecordDto,
  CreateMicroCheckinDto,
  CreateInterventionEventDto,
} from './dto/usage.dto';

type AppUsageMap = Record<string, number>;
type JsonObject = Record<string, unknown>;

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(UsageRecord)
    private readonly usageRepository: Repository<UsageRecord>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createOrUpdateRecord(userId: string, dto: CreateUsageRecordDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upsert: if a record for this date already exists, update it.
    let record = await this.usageRepository.findOne({
      where: { user: { id: userId }, date: dto.date },
    });

    if (record) {
      Object.assign(record, dto);
    } else {
      record = this.usageRepository.create({ user, ...dto });
    }

    const saved = await this.usageRepository.save(record);
    return this.sanitize(saved);
  }

  async batchUpload(userId: string, records: CreateUsageRecordDto[]) {
    const results = [];
    for (const dto of records) {
      const result = await this.createOrUpdateRecord(userId, dto);
      results.push(result);
    }
    return results;
  }

  async appendMicroCheckin(userId: string, dto: CreateMicroCheckinDto) {
    const date = dto.date ?? this.currentDateKey();
    const record = await this.findOrCreateDailyRecord(userId, date);

    const current = this.parseJsonArray(record.microCheckinsJson) ?? [];
    const nextItem: JsonObject = {
      id: `${Date.now()}_${Math.round(Math.random() * 100000)}`,
      timestamp: new Date().toISOString(),
      mood: dto.mood,
      craving: dto.craving,
      stress: dto.stress ?? null,
      focus: dto.focus ?? null,
      note: dto.note?.trim() || null,
    };

    current.push(nextItem);
    record.microCheckinsJson = JSON.stringify(current.slice(-64));

    const saved = await this.usageRepository.save(record);
    return this.sanitize(saved);
  }

  async appendInterventionOutcome(
    userId: string,
    dto: CreateInterventionEventDto,
  ) {
    const timestampSource =
      typeof dto.startedAt === 'number'
        ? dto.startedAt
        : typeof dto.endedAt === 'number'
          ? dto.endedAt
          : null;

    const date =
      dto.date ??
      (timestampSource !== null
        ? this.dateKeyFromTimestamp(timestampSource)
        : this.currentDateKey());
    const record = await this.findOrCreateDailyRecord(userId, date);

    const current = this.parseJsonArray(record.interventionOutcomesJson) ?? [];
    const nextItem: JsonObject = {
      id: `${Date.now()}_${Math.round(Math.random() * 100000)}`,
      timestamp: new Date().toISOString(),
      interventionId: dto.interventionId,
      title: dto.title,
      eventType: dto.eventType,
      startedAt: dto.startedAt ?? null,
      endedAt: dto.endedAt ?? null,
      durationMinutes: dto.durationMinutes ?? null,
    };

    current.push(nextItem);
    record.interventionOutcomesJson = JSON.stringify(current.slice(-128));

    const saved = await this.usageRepository.save(record);
    return this.sanitize(saved);
  }

  async getRecords(userId: string, days = 30) {
    const records = await this.usageRepository.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: days,
    });

    return records.map((r) => this.sanitize(r));
  }

  async getRecordByDate(userId: string, date: string) {
    const record = await this.usageRepository.findOne({
      where: { user: { id: userId }, date },
    });

    if (!record) return null;
    return this.sanitize(record);
  }

  async getSummary(userId: string) {
    const records = await this.usageRepository.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: 7,
    });

    if (records.length === 0) {
      return {
        totalDays: 0,
        avgScreenTime: 0,
        avgUnlocks: 0,
        avgSocialMedia: 0,
        avgNightUsage: 0,
        totalRecords: 0,
      };
    }

    const totalRecords = records.length;
    const avgScreenTime =
      records.reduce((sum, r) => sum + r.screenTimeMinutes, 0) / totalRecords;
    const avgUnlocks =
      records.reduce((sum, r) => sum + r.unlockCount, 0) / totalRecords;
    const avgSocialMedia =
      records.reduce((sum, r) => sum + r.socialMediaMinutes, 0) / totalRecords;
    const avgNightUsage =
      records.reduce((sum, r) => sum + r.nightUsageMinutes, 0) / totalRecords;

    return {
      totalDays: totalRecords,
      avgScreenTime: Math.round(avgScreenTime),
      avgUnlocks: Math.round(avgUnlocks),
      avgSocialMedia: Math.round(avgSocialMedia),
      avgNightUsage: Math.round(avgNightUsage),
      totalRecords,
    };
  }

  private async findOrCreateDailyRecord(userId: string, date: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let record = await this.usageRepository.findOne({
      where: { user: { id: userId }, date },
    });

    if (!record) {
      record = this.usageRepository.create({
        user,
        date,
        screenTimeMinutes: 0,
        unlockCount: 0,
        socialMediaMinutes: 0,
        nightUsageMinutes: 0,
        longestSessionMinutes: 0,
        notificationCount: 0,
      });
    }

    return record;
  }

  private sanitize(record: UsageRecord) {
    return {
      id: record.id,
      date: record.date,
      screenTimeMinutes: record.screenTimeMinutes,
      unlockCount: record.unlockCount,
      appUsage: this.parseAppUsage(record.appUsageJson),
      socialMediaMinutes: record.socialMediaMinutes,
      nightUsageMinutes: record.nightUsageMinutes,
      peakUsageHour: record.peakUsageHour,
      longestSessionMinutes: record.longestSessionMinutes,
      notificationCount: record.notificationCount,
      appCategoryTimeline: this.parseJsonObject(record.appCategoryTimelineJson),
      sessionEvents: this.parseJsonArray(record.sessionEventsJson),
      notificationInteraction: this.parseJsonObject(
        record.notificationInteractionJson,
      ),
      sleepProxies: this.parseJsonObject(record.sleepProxyJson),
      activityContext: this.parseJsonObject(record.activityContextJson),
      batteryContext: this.parseJsonObject(record.batteryContextJson),
      connectivityContext: this.parseJsonObject(record.connectivityContextJson),
      locationContext: this.parseJsonObject(record.locationContextJson),
      microCheckins: this.parseJsonArray(record.microCheckinsJson),
      interventionOutcomes: this.parseJsonArray(record.interventionOutcomesJson),
      createdAt: record.createdAt,
    };
  }

  private parseAppUsage(appUsageJson: string | null): AppUsageMap | null {
    if (!appUsageJson) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(appUsageJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const usageMap: AppUsageMap = {};
      for (const [appName, minutes] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        if (typeof minutes === 'number' && Number.isFinite(minutes)) {
          usageMap[appName] = minutes;
        }
      }

      return usageMap;
    } catch {
      return null;
    }
  }

  private parseJsonObject(raw: string | null): JsonObject | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as JsonObject;
    } catch {
      return null;
    }
  }

  private parseJsonArray(raw: string | null): unknown[] | null {
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private currentDateKey(): string {
    return this.dateKeyFromTimestamp(Date.now());
  }

  private dateKeyFromTimestamp(timestampMs: number): string {
    const date = new Date(timestampMs);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
