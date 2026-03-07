import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from '../entities/usage-record.entity';
import { SurveyResponse } from '../entities/survey-response.entity';
import { PredictionResult } from '../entities/prediction-result.entity';
import { NotificationHistory } from '../entities/notification-history.entity';
import { PreprocessingModule } from '../preprocessing/preprocessing.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UsageRecord,
      SurveyResponse,
      PredictionResult,
      NotificationHistory,
    ]),
    PreprocessingModule,
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
