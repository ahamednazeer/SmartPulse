import { Module } from '@nestjs/common';
import { PreprocessingModule } from '../preprocessing/preprocessing.module';
import { PredictionModule } from '../prediction/prediction.module';
import { AiModule } from '../ai/ai.module';
import { RiskAnalysisService } from './risk-analysis.service';
import { RiskAnalysisController } from './risk-analysis.controller';

@Module({
  imports: [PreprocessingModule, PredictionModule, AiModule],
  providers: [RiskAnalysisService],
  controllers: [RiskAnalysisController],
  exports: [RiskAnalysisService],
})
export class RiskAnalysisModule {}
