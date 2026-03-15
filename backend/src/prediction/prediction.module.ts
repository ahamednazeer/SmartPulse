import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictionResult } from '../entities/prediction-result.entity';
import { User } from '../entities/user.entity';
import { ModelProfile } from '../entities/model-profile.entity';
import { GroundTruthLabel } from '../entities/ground-truth-label.entity';
import { FeatureStoreRecord } from '../entities/feature-store-record.entity';
import { PreprocessingModule } from '../preprocessing/preprocessing.module';
import { PredictionService } from './prediction.service';
import { PredictionController } from './prediction.controller';
import { MarkovService } from './markov.service';
import { AnomalyService } from './anomaly.service';
import { ForecastService } from './forecast.service';
import { ContextScorerService } from './context-scorer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PredictionResult,
      User,
      ModelProfile,
      GroundTruthLabel,
      FeatureStoreRecord,
    ]),
    PreprocessingModule,
  ],
  providers: [
    PredictionService,
    MarkovService,
    AnomalyService,
    ForecastService,
    ContextScorerService,
  ],
  controllers: [PredictionController],
  exports: [
    PredictionService,
    MarkovService,
    AnomalyService,
    ForecastService,
    ContextScorerService,
  ],
})
export class PredictionModule {}
