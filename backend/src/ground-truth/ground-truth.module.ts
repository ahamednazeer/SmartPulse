import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroundTruthLabel } from '../entities/ground-truth-label.entity';
import { User } from '../entities/user.entity';
import { GroundTruthController } from './ground-truth.controller';
import { GroundTruthService } from './ground-truth.service';

@Module({
  imports: [TypeOrmModule.forFeature([GroundTruthLabel, User])],
  controllers: [GroundTruthController],
  providers: [GroundTruthService],
  exports: [GroundTruthService],
})
export class GroundTruthModule {}

