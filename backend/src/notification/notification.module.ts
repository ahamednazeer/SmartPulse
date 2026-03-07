import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationHistory } from '../entities/notification-history.entity';
import { UsageRecord } from '../entities/usage-record.entity';
import { RiskAnalysisModule } from '../risk-analysis/risk-analysis.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationHistory, UsageRecord]),
    RiskAnalysisModule,
  ],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
