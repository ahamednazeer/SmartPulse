import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyResponse } from '../entities/survey-response.entity';
import { User } from '../entities/user.entity';
import { CreateSurveyDto } from './dto/survey.dto';

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(SurveyResponse)
    private readonly surveyRepository: Repository<SurveyResponse>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createSurvey(userId: string, dto: CreateSurveyDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const survey = this.surveyRepository.create({
      user,
      ...dto,
    });

    const saved = await this.surveyRepository.save(survey);
    return this.sanitize(saved);
  }

  async getSurveys(userId: string, limit = 20) {
    const surveys = await this.surveyRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return surveys.map((s) => this.sanitize(s));
  }

  async getLatestSurvey(userId: string) {
    const survey = await this.surveyRepository.findOne({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });

    if (!survey) return null;
    return this.sanitize(survey);
  }

  async getSurveyById(userId: string, surveyId: string) {
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId, user: { id: userId } },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    return this.sanitize(survey);
  }

  private sanitize(survey: SurveyResponse) {
    return {
      id: survey.id,
      stressLevel: survey.stressLevel,
      anxietyLevel: survey.anxietyLevel,
      depressionLevel: survey.depressionLevel,
      sleepQuality: survey.sleepQuality,
      sleepHours: survey.sleepHours,
      socialInteraction: survey.socialInteraction,
      dailyProductivity: survey.dailyProductivity,
      phoneDependence: survey.phoneDependence,
      mood: survey.mood,
      notes: survey.notes,
      createdAt: survey.createdAt,
    };
  }
}
