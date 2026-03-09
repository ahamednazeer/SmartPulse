import {
  IsString,
  IsOptional,
  MinLength,
  IsObject,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsOptional()
  @IsObject()
  demographics?: Record<string, unknown>;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class UpdatePermissionsDto {
  @IsOptional()
  screenUsageMonitoring?: boolean;

  @IsOptional()
  appUsageStatistics?: boolean;

  @IsOptional()
  notificationAccess?: boolean;

  @IsOptional()
  backgroundActivityTracking?: boolean;
}

export class ActiveInterventionDto {
  @IsString()
  id: string;

  @IsNumber()
  startedAt: number;

  @IsNumber()
  endsAt: number;
}

export class UpdateBehaviorSyncDto {
  @IsOptional()
  @IsObject()
  actionTracker?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completedDates?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ActiveInterventionDto)
  activeIntervention?: ActiveInterventionDto | null;
}
