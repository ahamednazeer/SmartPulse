import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { Permission } from '../entities/permission.entity';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  UpdatePermissionsDto,
  UpdateBehaviorSyncDto,
} from './dto/user.dto';

export interface ActiveInterventionState {
  id: string;
  startedAt: number;
  endsAt: number;
}

export interface BehaviorSyncState {
  actionTracker: Record<string, boolean>;
  completedDates: string[];
  activeIntervention: ActiveInterventionState | null;
}

export interface BehaviorSyncResponse extends BehaviorSyncState {
  updatedAt: string;
}

export interface UserDemographics {
  ageBand: string | null;
  gender: string | null;
  region: string | null;
  educationLevel: string | null;
  occupation: string | null;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['permission'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.avatar !== undefined) user.avatar = dto.avatar;
    if (dto.demographics !== undefined) {
      user.demographicsJson = JSON.stringify(
        this.sanitizeDemographics(dto.demographics),
      );
    }

    const saved = await this.userRepository.save(user);
    return this.sanitizeUser(saved);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Password changed successfully' };
  }

  async getPermissions(userId: string) {
    let permission = await this.permissionRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!permission) {
      // Create default permissions
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('User not found');

      permission = this.permissionRepository.create({ user });
      permission = await this.permissionRepository.save(permission);
    }

    return {
      screenUsageMonitoring: permission.screenUsageMonitoring,
      appUsageStatistics: permission.appUsageStatistics,
      notificationAccess: permission.notificationAccess,
      backgroundActivityTracking: permission.backgroundActivityTracking,
    };
  }

  async updatePermissions(userId: string, dto: UpdatePermissionsDto) {
    let permission = await this.permissionRepository.findOne({
      where: { user: { id: userId } },
    });

    const userExists = await this.userRepository.exist({
      where: { id: userId },
    });
    if (!userExists) throw new NotFoundException('User not found');

    if (!permission) {
      permission = this.permissionRepository.create({
        user: { id: userId } as User,
      });
    }

    if (dto.screenUsageMonitoring !== undefined)
      permission.screenUsageMonitoring = dto.screenUsageMonitoring;
    if (dto.appUsageStatistics !== undefined)
      permission.appUsageStatistics = dto.appUsageStatistics;
    if (dto.notificationAccess !== undefined)
      permission.notificationAccess = dto.notificationAccess;
    if (dto.backgroundActivityTracking !== undefined)
      permission.backgroundActivityTracking = dto.backgroundActivityTracking;

    await this.permissionRepository.save(permission);

    // Mark permissions as configured without cascading stale permission relation state.
    await this.userRepository.update(
      { id: userId },
      { permissionsConfigured: true },
    );

    return {
      screenUsageMonitoring: permission.screenUsageMonitoring,
      appUsageStatistics: permission.appUsageStatistics,
      notificationAccess: permission.notificationAccess,
      backgroundActivityTracking: permission.backgroundActivityTracking,
    };
  }

  async getBehaviorSync(userId: string): Promise<BehaviorSyncResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'behaviorSyncJson', 'updatedAt'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const behaviorSync = this.parseBehaviorSync(user.behaviorSyncJson);
    return {
      ...behaviorSync,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateBehaviorSync(
    userId: string,
    dto: UpdateBehaviorSyncDto,
  ): Promise<BehaviorSyncResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'behaviorSyncJson'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const current = this.parseBehaviorSync(user.behaviorSyncJson);
    const next = this.mergeBehaviorSync(current, dto);
    const updatedAt = new Date();

    await this.userRepository.update(
      { id: userId },
      {
        behaviorSyncJson: JSON.stringify(next),
        updatedAt,
      },
    );

    return {
      ...next,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private defaultBehaviorSync(): BehaviorSyncState {
    return {
      actionTracker: {},
      completedDates: [],
      activeIntervention: null,
    };
  }

  private parseBehaviorSync(raw: string | null): BehaviorSyncState {
    if (!raw) {
      return this.defaultBehaviorSync();
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return this.sanitizeBehaviorSync(parsed);
    } catch {
      return this.defaultBehaviorSync();
    }
  }

  private sanitizeBehaviorSync(value: unknown): BehaviorSyncState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.defaultBehaviorSync();
    }

    const candidate = value as {
      actionTracker?: unknown;
      completedDates?: unknown;
      activeIntervention?: unknown;
    };

    return {
      actionTracker: this.sanitizeActionTracker(candidate.actionTracker),
      completedDates: this.sanitizeCompletedDates(candidate.completedDates),
      activeIntervention: this.sanitizeActiveIntervention(
        candidate.activeIntervention,
      ),
    };
  }

  private sanitizeActionTracker(input: unknown): Record<string, boolean> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }

    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!key) {
        continue;
      }
      result[key] = Boolean(value);
    }

    return result;
  }

  private sanitizeCompletedDates(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const unique = new Set<string>();
    for (const item of input) {
      if (typeof item !== 'string') {
        continue;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(item)) {
        continue;
      }

      unique.add(item);
    }

    return Array.from(unique).sort().slice(-180);
  }

  private sanitizeActiveIntervention(
    input: unknown,
  ): ActiveInterventionState | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const candidate = input as {
      id?: unknown;
      startedAt?: unknown;
      endsAt?: unknown;
    };

    if (
      typeof candidate.id !== 'string' ||
      !candidate.id.trim() ||
      typeof candidate.startedAt !== 'number' ||
      !Number.isFinite(candidate.startedAt) ||
      typeof candidate.endsAt !== 'number' ||
      !Number.isFinite(candidate.endsAt)
    ) {
      return null;
    }

    const startedAt = Math.floor(candidate.startedAt);
    const endsAt = Math.floor(candidate.endsAt);

    if (endsAt <= startedAt) {
      return null;
    }

    return {
      id: candidate.id.trim(),
      startedAt,
      endsAt,
    };
  }

  private mergeBehaviorSync(
    current: BehaviorSyncState,
    dto: UpdateBehaviorSyncDto,
  ): BehaviorSyncState {
    return {
      actionTracker:
        dto.actionTracker === undefined
          ? current.actionTracker
          : this.sanitizeActionTracker(dto.actionTracker),
      completedDates:
        dto.completedDates === undefined
          ? current.completedDates
          : this.sanitizeCompletedDates(dto.completedDates),
      activeIntervention:
        dto.activeIntervention === undefined
          ? current.activeIntervention
          : this.sanitizeActiveIntervention(dto.activeIntervention),
    };
  }

  private defaultDemographics(): UserDemographics {
    return {
      ageBand: null,
      gender: null,
      region: null,
      educationLevel: null,
      occupation: null,
    };
  }

  private parseDemographics(raw: string | null): UserDemographics {
    if (!raw) {
      return this.defaultDemographics();
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return this.sanitizeDemographics(parsed);
    } catch {
      return this.defaultDemographics();
    }
  }

  private sanitizeDemographics(value: unknown): UserDemographics {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.defaultDemographics();
    }

    const candidate = value as Record<string, unknown>;
    return {
      ageBand: this.sanitizeDemographicValue(candidate.ageBand),
      gender: this.sanitizeDemographicValue(candidate.gender),
      region: this.sanitizeDemographicValue(candidate.region),
      educationLevel: this.sanitizeDemographicValue(candidate.educationLevel),
      occupation: this.sanitizeDemographicValue(candidate.occupation),
    };
  }

  private sanitizeDemographicValue(value: unknown): string | null {
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

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.role,
      permissionsConfigured: user.permissionsConfigured,
      demographics: this.parseDemographics(user.demographicsJson),
      createdAt: user.createdAt,
      permission: user.permission
        ? {
            screenUsageMonitoring: user.permission.screenUsageMonitoring,
            appUsageStatistics: user.permission.appUsageStatistics,
            notificationAccess: user.permission.notificationAccess,
            backgroundActivityTracking:
              user.permission.backgroundActivityTracking,
          }
        : null,
    };
  }
}
