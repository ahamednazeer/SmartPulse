import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PredictionService } from './prediction.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('prediction')
@UseGuards(JwtAuthGuard)
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Post('run')
  async runPrediction(@Request() req: AuthenticatedRequest) {
    return this.predictionService.runPrediction(req.user.id);
  }

  @Post('train')
  async trainModel(@Request() req: AuthenticatedRequest) {
    return this.predictionService.trainModel(req.user.id);
  }

  @Get('latest')
  async getLatest(@Request() req: AuthenticatedRequest) {
    return this.predictionService.getLatestPrediction(req.user.id);
  }

  @Get('history')
  async getHistory(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.predictionService.getPredictionHistory(
      req.user.id,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('monitor')
  async getMonitoring(
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.predictionService.getModelMonitoring(
      req.user.id,
      days ? parseInt(days, 10) : 90,
    );
  }
}
