import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { HealthController } from './health.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [HealthController],
})
export class HealthModule {}
