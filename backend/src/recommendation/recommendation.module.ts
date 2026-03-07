import { Module } from '@nestjs/common';
import { PreprocessingModule } from '../preprocessing/preprocessing.module';
import { RiskAnalysisModule } from '../risk-analysis/risk-analysis.module';
import { AiModule } from '../ai/ai.module';
import { RecommendationService } from './recommendation.service';
import { RecommendationController } from './recommendation.controller';

@Module({
  imports: [PreprocessingModule, RiskAnalysisModule, AiModule],
  providers: [RecommendationService],
  controllers: [RecommendationController],
  exports: [RecommendationService],
})
export class RecommendationModule {}
