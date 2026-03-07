import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';
import { GroundTruthService } from './ground-truth.service';
import { UpsertGroundTruthLabelDto } from './dto/ground-truth.dto';

@Controller('ground-truth')
@UseGuards(JwtAuthGuard)
export class GroundTruthController {
  constructor(private readonly groundTruthService: GroundTruthService) {}

  @Post('label')
  async upsertLabel(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpsertGroundTruthLabelDto,
  ) {
    return this.groundTruthService.upsertLabel(req.user.id, dto);
  }

  @Get()
  async getLabels(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.groundTruthService.getLabels(
      req.user.id,
      limit ? parseInt(limit, 10) : 90,
    );
  }

  @Get('latest')
  async getLatest(@Request() req: AuthenticatedRequest) {
    return this.groundTruthService.getLatestLabel(req.user.id);
  }
}

