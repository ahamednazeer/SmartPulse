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
  providers: [PredictionService],
  controllers: [PredictionController],
  exports: [PredictionService],
})
export class PredictionModule {}
