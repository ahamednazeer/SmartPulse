import { Module } from '@nestjs/common';
import { GroqInsightService } from './groq-insight.service';

@Module({
  providers: [GroqInsightService],
  exports: [GroqInsightService],
})
export class AiModule {}
