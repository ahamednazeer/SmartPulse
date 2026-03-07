import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  Min,
  Max,
  Matches,
  IsIn,
} from 'class-validator';

export class CreateUsageRecordDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date: string;

  @IsNumber()
  @Min(0)
  screenTimeMinutes: number;

  @IsInt()
  @Min(0)
  unlockCount: number;

  @IsString()
  @IsOptional()
  appUsageJson?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  socialMediaMinutes?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  nightUsageMinutes?: number;

  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  peakUsageHour?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  longestSessionMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  notificationCount?: number;

  @IsString()
  @IsOptional()
  appCategoryTimelineJson?: string;

  @IsString()
  @IsOptional()
  sessionEventsJson?: string;

  @IsString()
  @IsOptional()
  notificationInteractionJson?: string;

  @IsString()
  @IsOptional()
  sleepProxyJson?: string;

  @IsString()
  @IsOptional()
  activityContextJson?: string;

  @IsString()
  @IsOptional()
  batteryContextJson?: string;

  @IsString()
  @IsOptional()
  connectivityContextJson?: string;

  @IsString()
  @IsOptional()
  locationContextJson?: string;

  @IsString()
  @IsOptional()
  microCheckinsJson?: string;

  @IsString()
  @IsOptional()
  interventionOutcomesJson?: string;
}

export class BatchUsageDto {
  records: CreateUsageRecordDto[];
}

export class CreateMicroCheckinDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  mood: number;

  @IsInt()
  @Min(1)
  @Max(5)
  craving: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  stress?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  focus?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateInterventionEventDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @IsString()
  interventionId: string;

  @IsString()
  title: string;

  @IsString()
  @IsIn(['STARTED', 'STOPPED', 'COMPLETED'])
  eventType: 'STARTED' | 'STOPPED' | 'COMPLETED';

  @IsNumber()
  @IsOptional()
  startedAt?: number;

  @IsNumber()
  @IsOptional()
  endedAt?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  durationMinutes?: number;
}
