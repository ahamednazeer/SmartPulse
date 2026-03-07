import { Injectable } from '@nestjs/common';
import { PreprocessingService } from '../preprocessing/preprocessing.service';
import { RiskAnalysisService } from '../risk-analysis/risk-analysis.service';
import { GroqInsightService } from '../ai/groq-insight.service';

export interface RecommendationItem {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'SCREEN_TIME' | 'NIGHT_USAGE' | 'SOCIAL_MEDIA' | 'WELLBEING';
}

export interface RecommendationResult {
  generatedAt: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  recommendations: RecommendationItem[];
}

@Injectable()
export class RecommendationService {
  constructor(
    private readonly preprocessingService: PreprocessingService,
    private readonly riskAnalysisService: RiskAnalysisService,
    private readonly groqInsightService: GroqInsightService,
  ) {}

  async getLatestRecommendations(
    userId: string,
  ): Promise<RecommendationResult> {
    const [analysis, profile] = await Promise.all([
      this.riskAnalysisService.getLatestAnalysis(userId),
      this.preprocessingService.preprocessUserData(userId),
    ]);

    const recommendations: RecommendationItem[] = [];

    const aiRecommendation =
      (await this.groqInsightService.generateRecommendationInsight({
        riskLevel: analysis.riskLevel,
        avgScreenTimeMinutes: profile.features.avgScreenTimeMinutes,
        avgNightUsageMinutes: profile.features.avgNightUsageMinutes,
        avgSocialMediaMinutes: profile.features.avgSocialMediaMinutes,
        avgUnlockCount: profile.features.avgUnlockCount,
      })) ?? null;

    if (aiRecommendation) {
      recommendations.push({
        id: 'ai_personalized_focus',
        title: 'AI Personalized Action',
        description: aiRecommendation,
        priority: analysis.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        category: 'WELLBEING',
      });
    }

    if (profile.features.avgScreenTimeMinutes >= 300) {
      recommendations.push({
        id: 'screen_time_limit',
        title: 'Set a daily screen-time cap',
        description:
          `Your current average is ${Math.round(profile.features.avgScreenTimeMinutes)} minutes/day. ` +
          'Set a phone-level limit 15-20% lower for the next week.',
        priority: analysis.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        category: 'SCREEN_TIME',
      });
    }

    if (profile.features.avgNightUsageMinutes >= 60) {
      recommendations.push({
        id: 'night_cutoff',
        title: 'Create a night-time cutoff window',
        description:
          'Avoid phone usage after 10 PM and keep charging away from the bed to reduce late-night relapses.',
        priority: 'HIGH',
        category: 'NIGHT_USAGE',
      });
    }

    if (profile.features.avgSocialMediaMinutes >= 150) {
      recommendations.push({
        id: 'social_media_blocks',
        title: 'Introduce social media blocks',
        description:
          'Use app timers and restrict social apps into 2-3 scheduled windows instead of continuous access.',
        priority: analysis.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        category: 'SOCIAL_MEDIA',
      });
    }

    if (
      profile.features.psychologicalStressScore >= 60 ||
      profile.features.sleepDisruptionScore >= 60
    ) {
      recommendations.push({
        id: 'stress_sleep_recovery',
        title: 'Add a short wellbeing recovery routine',
        description:
          'Use a 10-minute wind-down routine (breathing, journaling, or walk) before peak craving periods.',
        priority: 'MEDIUM',
        category: 'WELLBEING',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'maintain_habits',
        title: 'Maintain current healthy habits',
        description:
          'Your recent profile appears stable. Continue weekly checks to catch early behavioral drift.',
        priority: 'LOW',
        category: 'WELLBEING',
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      riskLevel: analysis.riskLevel,
      recommendations,
    };
  }
}
