import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { PreprocessingService } from './preprocessing.service';

@Controller('preprocessing')
@UseGuards(JwtAuthGuard)
export class PreprocessingController {
  constructor(private readonly preprocessingService: PreprocessingService) {}

  @Post('run')
  async run(
    @Request() req: AuthenticatedRequest,
    @Query('lookbackDays') lookbackDays?: string,
  ) {
    return this.preprocessingService.preprocessUserData(req.user.id, {
      persist: true,
      lookbackDays: lookbackDays ? parseInt(lookbackDays, 10) : undefined,
    });
  }

  @Get('feature-store')
  async getFeatureStore(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.preprocessingService.getFeatureStoreRecords(
      req.user.id,
      limit ? parseInt(limit, 10) : 90,
    );
  }
}
