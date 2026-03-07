import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateUsageRecordDto,
  CreateMicroCheckinDto,
  CreateInterventionEventDto,
} from './dto/usage.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Post()
  async createRecord(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateUsageRecordDto,
  ) {
    return this.usageService.createOrUpdateRecord(req.user.id, dto);
  }

  @Post('batch')
  async batchUpload(
    @Request() req: AuthenticatedRequest,
    @Body() body: { records: CreateUsageRecordDto[] },
  ) {
    return this.usageService.batchUpload(req.user.id, body.records);
  }

  @Post('micro-checkin')
  async addMicroCheckin(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateMicroCheckinDto,
  ) {
    return this.usageService.appendMicroCheckin(req.user.id, dto);
  }

  @Post('intervention-event')
  async addInterventionEvent(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateInterventionEventDto,
  ) {
    return this.usageService.appendInterventionOutcome(req.user.id, dto);
  }

  @Get()
  async getRecords(
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    return this.usageService.getRecords(
      req.user.id,
      days ? parseInt(days) : 30,
    );
  }

  @Get('summary')
  async getSummary(@Request() req: AuthenticatedRequest) {
    return this.usageService.getSummary(req.user.id);
  }

  @Get('date/:date')
  async getByDate(
    @Request() req: AuthenticatedRequest,
    @Param('date') date: string,
  ) {
    return this.usageService.getRecordByDate(req.user.id, date);
  }
}
