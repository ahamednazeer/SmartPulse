import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Controller('health')
export class HealthController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  async check() {
    // Run a lightweight query to keep the Turso Hrana stream alive.
    let dbStatus = 'ok';
    try {
      await this.userRepository.query('SELECT 1');
    } catch {
      dbStatus = 'degraded';
    }

    return {
      status: 'ok',
      db: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
