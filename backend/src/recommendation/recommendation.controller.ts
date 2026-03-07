import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecommendationService } from './recommendation.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('recommendation')
@UseGuards(JwtAuthGuard)
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('latest')
  async getLatest(@Request() req: AuthenticatedRequest) {
    return this.recommendationService.getLatestRecommendations(req.user.id);
  }
}
