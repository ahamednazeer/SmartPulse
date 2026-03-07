import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroundTruthLabel } from '../entities/ground-truth-label.entity';
import { User } from '../entities/user.entity';
import { UpsertGroundTruthLabelDto } from './dto/ground-truth.dto';

type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

@Injectable()
export class GroundTruthService {
  constructor(
    @InjectRepository(GroundTruthLabel)
    private readonly labelRepository: Repository<GroundTruthLabel>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async upsertLabel(userId: string, dto: UpsertGroundTruthLabelDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const date = dto.date ?? this.getTodayDate();
    let record = await this.labelRepository.findOne({
      where: { user: { id: userId }, date },
    });

    if (!record) {
      record = this.labelRepository.create({
        user,
        date,
      });
    }

    record.label = dto.label;
    record.source = dto.source?.trim() || 'UNSPECIFIED';
    record.confidence =
      typeof dto.confidence === 'number' ? this.clamp(dto.confidence, 0, 1) : null;
    record.notes = dto.notes?.trim() || null;

    const saved = await this.labelRepository.save(record);
    return this.sanitize(saved);
  }

  async getLabels(userId: string, limit = 90) {
    const safeLimit = Math.max(1, Math.min(365, limit));
    const labels = await this.labelRepository.find({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
      take: safeLimit,
    });

    return labels.map((item) => this.sanitize(item));
  }

  async getLatestLabel(userId: string) {
    const latest = await this.labelRepository.findOne({
      where: { user: { id: userId } },
      order: { date: 'DESC' },
    });

    if (!latest) {
      return null;
    }

    return this.sanitize(latest);
  }

  private sanitize(record: GroundTruthLabel): {
    id: string;
    date: string;
    label: RiskLevel;
    source: string;
    confidence: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: record.id,
      date: record.date,
      label: this.toRiskLevel(record.label),
      source: record.source,
      confidence: record.confidence,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private toRiskLevel(value: string): RiskLevel {
    if (value === 'LOW' || value === 'MODERATE' || value === 'HIGH') {
      return value;
    }
    return 'MODERATE';
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}

