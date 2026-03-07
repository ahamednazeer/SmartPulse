import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SurveyService } from './survey.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSurveyDto } from './dto/survey.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request.type';

@Controller('survey')
@UseGuards(JwtAuthGuard)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post()
  async createSurvey(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateSurveyDto,
  ) {
    return this.surveyService.createSurvey(req.user.id, dto);
  }

  @Get()
  async getSurveys(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.surveyService.getSurveys(
      req.user.id,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('latest')
  async getLatestSurvey(@Request() req: AuthenticatedRequest) {
    return this.surveyService.getLatestSurvey(req.user.id);
  }

  @Get(':id')
  async getSurveyById(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.surveyService.getSurveyById(req.user.id, id);
  }
}
