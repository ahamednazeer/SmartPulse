import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SurveyModule } from './survey/survey.module';
import { UsageModule } from './usage/usage.module';
import { PreprocessingModule } from './preprocessing/preprocessing.module';
import { PredictionModule } from './prediction/prediction.module';
import { RiskAnalysisModule } from './risk-analysis/risk-analysis.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { NotificationModule } from './notification/notification.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { User } from './entities/user.entity';
import { Permission } from './entities/permission.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { UsageRecord } from './entities/usage-record.entity';
import { PredictionResult } from './entities/prediction-result.entity';
import { NotificationHistory } from './entities/notification-history.entity';
import { FeatureStoreRecord } from './entities/feature-store-record.entity';
import { ModelProfile } from './entities/model-profile.entity';
import { GroundTruthLabel } from './entities/ground-truth-label.entity';
import { GroundTruthModule } from './ground-truth/ground-truth.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'better-sqlite3',
        driver: function (filename: string, options: any) {
          const libsql = require('libsql');
          let urlStr = filename;
          let authToken = undefined;
          try {
            if (urlStr.startsWith('libsql://') || urlStr.startsWith('http')) {
              const url = new URL(urlStr);
              if (url.searchParams.has('authToken')) {
                authToken = url.searchParams.get('authToken') || undefined;
                url.searchParams.delete('authToken');
                urlStr = url.toString().replace(/\/$/, '');
              }
            }
          } catch (e) {}
          return new libsql(urlStr, { ...options, authToken });
        },
        database: process.env.DATABASE_NAME || 'libsql://smartpulse-blazeking.aws-ap-south-1.turso.io',
        entities: [
          User,
          Permission,
          SurveyResponse,
          UsageRecord,
          PredictionResult,
          NotificationHistory,
          FeatureStoreRecord,
          ModelProfile,
          GroundTruthLabel,
        ],
        synchronize: true,
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),
    AuthModule,
    UserModule,
    SurveyModule,
    UsageModule,
    PreprocessingModule,
    PredictionModule,
    RiskAnalysisModule,
    RecommendationModule,
    NotificationModule,
    AnalyticsModule,
    GroundTruthModule,
    HealthModule,
  ],
})
export class AppModule { }
