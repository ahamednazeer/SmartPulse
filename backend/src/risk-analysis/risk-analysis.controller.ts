import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RiskAnalysisService } from './risk-analysis.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('risk-analysis')
@UseGuards(JwtAuthGuard)
export class RiskAnalysisController {
  constructor(private readonly riskAnalysisService: RiskAnalysisService) {}

  @Get('latest')
  async getLatest(@Request() req: AuthenticatedRequest) {
    return this.riskAnalysisService.getLatestAnalysis(req.user.id);
  }
}
