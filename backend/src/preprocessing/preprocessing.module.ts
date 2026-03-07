import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyResponse } from '../entities/survey-response.entity';
import { UsageRecord } from '../entities/usage-record.entity';
import { FeatureStoreRecord } from '../entities/feature-store-record.entity';
import { PreprocessingService } from './preprocessing.service';
import { PreprocessingController } from './preprocessing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyResponse, UsageRecord, FeatureStoreRecord]),
  ],
  providers: [PreprocessingService],
  controllers: [PreprocessingController],
  exports: [PreprocessingService],
})
export class PreprocessingModule {}
