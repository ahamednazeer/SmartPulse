import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export class CreateSurveyDto {
  @IsInt()
  @Min(1)
  @Max(10)
  stressLevel: number;

  @IsInt()
  @Min(1)
  @Max(10)
  anxietyLevel: number;

  @IsInt()
  @Min(1)
  @Max(10)
  depressionLevel: number;

  @IsInt()
  @Min(1)
  @Max(10)
  sleepQuality: number;

  @IsNumber()
  @Min(0)
  @Max(24)
  sleepHours: number;

  @IsInt()
  @Min(1)
  @Max(10)
  socialInteraction: number;

  @IsInt()
  @Min(1)
  @Max(10)
  dailyProductivity: number;

  @IsInt()
  @Min(1)
  @Max(10)
  phoneDependence: number;

  @IsInt()
  @Min(1)
  @Max(5)
  mood: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
