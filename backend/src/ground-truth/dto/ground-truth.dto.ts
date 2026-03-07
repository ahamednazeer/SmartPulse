import { IsIn, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpsertGroundTruthLabelDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @IsString()
  @IsIn(['LOW', 'MODERATE', 'HIGH'])
  label: 'LOW' | 'MODERATE' | 'HIGH';

  @IsString()
  @IsOptional()
  source?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  confidence?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

