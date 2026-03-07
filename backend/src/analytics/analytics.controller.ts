import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(@Request() req: AuthenticatedRequest) {
    return this.analyticsService.getDashboard(req.user.id);
  }

  @Get('research-export')
  async getResearchExport(
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getResearchExport(
      req.user.id,
      days ? parseInt(days, 10) : 30,
    );
  }
}
