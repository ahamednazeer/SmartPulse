import { Injectable } from '@nestjs/common';
import { PreprocessingService } from '../preprocessing/preprocessing.service';
import {
  PredictionService,
  PredictionResultView,
} from '../prediction/prediction.service';
import { GroqInsightService } from '../ai/groq-insight.service';

export interface PatternFinding {
  key: string;
  severity: 'LOW' | 'MODERATE' | 'HIGH';
  message: string;
  value: number;
  threshold: number;
}

export interface RiskAnalysisResult {
  generatedAt: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  patterns: PatternFinding[];
  insights: string[];
  aiInsight: string | null;
  keyMetrics: {
    avgScreenTimeMinutes: number;
    avgUnlockCount: number;
    avgNightUsageMinutes: number;
    avgSocialMediaMinutes: number;
    psychologicalStressScore: number;
    sleepDisruptionScore: number;
  };
  modelBreakdown: {
    randomForestScore: number;
    extraTreesScore: number;
    svmScore: number;
  };
}

@Injectable()
export class RiskAnalysisService {
  constructor(
    private readonly predictionService: PredictionService,
    private readonly preprocessingService: PreprocessingService,
    private readonly groqInsightService: GroqInsightService,
  ) {}

  async getLatestAnalysis(userId: string): Promise<RiskAnalysisResult> {
    let prediction = await this.predictionService.getLatestPrediction(userId);

    if (!prediction) {
      prediction = await this.predictionService.runPrediction(userId);
    }

    const profile = await this.preprocessingService.preprocessUserData(userId);
    const patterns = this.detectPatterns(profile.features);
    const fallbackInsight = this.buildFallbackAiInsight(
      prediction.riskLevel,
      patterns,
      profile.features,
    );
    const aiInsight =
      (await this.groqInsightService.generateRiskInsight({
        riskLevel: prediction.riskLevel,
        riskScore: prediction.riskScore,
        patterns: patterns.map((item) => ({
          message: item.message,
          severity: item.severity,
        })),
        stressScore: profile.features.psychologicalStressScore,
        sleepDisruptionScore: profile.features.sleepDisruptionScore,
      })) ?? fallbackInsight;

    return {
      generatedAt: new Date().toISOString(),
      riskScore: prediction.riskScore,
      riskLevel: prediction.riskLevel,
      patterns,
      insights: this.buildInsights(prediction, patterns, aiInsight),
      aiInsight,
      keyMetrics: {
        avgScreenTimeMinutes: profile.features.avgScreenTimeMinutes,
        avgUnlockCount: profile.features.avgUnlockCount,
        avgNightUsageMinutes: profile.features.avgNightUsageMinutes,
        avgSocialMediaMinutes: profile.features.avgSocialMediaMinutes,
        psychologicalStressScore: profile.features.psychologicalStressScore,
        sleepDisruptionScore: profile.features.sleepDisruptionScore,
      },
      modelBreakdown: {
        randomForestScore: prediction.randomForestScore,
        extraTreesScore: prediction.extraTreesScore,
        svmScore: prediction.svmScore,
      },
    };
  }

  private detectPatterns(features: {
    avgScreenTimeMinutes: number;
    avgUnlockCount: number;
    avgNightUsageMinutes: number;
    avgSocialMediaMinutes: number;
    lateNightUsageScore: number;
    socialMediaDependencyScore: number;
    psychologicalStressScore: number;
    sleepDisruptionScore: number;
  }): PatternFinding[] {
    const patterns: PatternFinding[] = [];

    if (features.avgScreenTimeMinutes >= 360) {
      patterns.push({
        key: 'high_screen_time',
        severity: 'HIGH',
        message: `Daily screen time is elevated at ${Math.round(features.avgScreenTimeMinutes)} minutes`,
        value: Math.round(features.avgScreenTimeMinutes),
        threshold: 360,
      });
    }

    if (features.avgUnlockCount >= 100) {
      patterns.push({
        key: 'frequent_unlocks',
        severity: features.avgUnlockCount >= 140 ? 'HIGH' : 'MODERATE',
        message: `Phone unlock frequency is high (${Math.round(features.avgUnlockCount)} unlocks/day)`,
        value: Math.round(features.avgUnlockCount),
        threshold: 100,
      });
    }

    if (
      features.avgNightUsageMinutes >= 90 ||
      features.lateNightUsageScore >= 65
    ) {
      patterns.push({
        key: 'night_usage',
        severity:
          features.avgNightUsageMinutes >= 120 ||
          features.lateNightUsageScore >= 80
            ? 'HIGH'
            : 'MODERATE',
        message: `Late-night usage exceeds healthy limits (${Math.round(features.avgNightUsageMinutes)} min/night)`,
        value: Math.round(features.avgNightUsageMinutes),
        threshold: 90,
      });
    }

    if (
      features.avgSocialMediaMinutes >= 180 ||
      features.socialMediaDependencyScore >= 70
    ) {
      patterns.push({
        key: 'social_media_dependency',
        severity:
          features.avgSocialMediaMinutes >= 240 ||
          features.socialMediaDependencyScore >= 80
            ? 'HIGH'
            : 'MODERATE',
        message: `Social media exposure is elevated (${Math.round(features.avgSocialMediaMinutes)} min/day)`,
        value: Math.round(features.avgSocialMediaMinutes),
        threshold: 180,
      });
    }

    if (features.psychologicalStressScore >= 65) {
      patterns.push({
        key: 'psychological_stress',
        severity: features.psychologicalStressScore >= 80 ? 'HIGH' : 'MODERATE',
        message:
          'Survey responses suggest elevated stress and emotional burden',
        value: Math.round(features.psychologicalStressScore),
        threshold: 65,
      });
    }

    if (features.sleepDisruptionScore >= 60) {
      patterns.push({
        key: 'sleep_disruption',
        severity: features.sleepDisruptionScore >= 75 ? 'HIGH' : 'MODERATE',
        message: 'Sleep quality/hours indicate notable sleep disruption',
        value: Math.round(features.sleepDisruptionScore),
        threshold: 60,
      });
    }

    return patterns;
  }

  private buildInsights(
    prediction: PredictionResultView,
    patterns: PatternFinding[],
    aiInsight: string | null,
  ): string[] {
    const insights: string[] = [];

    insights.push(
      `Current addiction risk is ${prediction.riskLevel} (${prediction.riskScore}/100).`,
    );

    if (patterns.length === 0) {
      insights.push(
        'Recent behavior and survey indicators are currently within safe bounds.',
      );
      return insights;
    }

    const highPatterns = patterns.filter((item) => item.severity === 'HIGH');
    if (highPatterns.length > 0) {
      insights.push(
        `${highPatterns.length} high-severity behavioral pattern(s) detected.`,
      );
    }

    if (aiInsight) {
      insights.push(aiInsight);
    }

    patterns.slice(0, 3).forEach((pattern) => {
      insights.push(pattern.message);
    });

    return insights;
  }

  private buildFallbackAiInsight(
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH',
    patterns: PatternFinding[],
    features: {
      avgScreenTimeMinutes: number;
      avgUnlockCount: number;
      avgNightUsageMinutes: number;
      avgSocialMediaMinutes: number;
      sleepDisruptionScore: number;
    },
  ): string {
    if (riskLevel === 'LOW') {
      return 'Your current pattern looks stable. Keep a consistent bedtime and preserve app limits to avoid drift.';
    }

    if (patterns.length === 0) {
      return 'Risk is rising from combined behavior signals. Use shorter app sessions and add scheduled phone-free blocks.';
    }

    if (
      features.avgNightUsageMinutes >= 120 ||
      features.sleepDisruptionScore >= 70
    ) {
      return 'Late-night phone activity appears to be affecting recovery. Set a strict evening cutoff and keep your phone away from your bed.';
    }

    if (features.avgUnlockCount >= 120) {
      return 'Frequent checking suggests impulsive usage loops. Add lockscreen friction and batch phone checks into fixed windows.';
    }

    if (features.avgSocialMediaMinutes >= 180) {
      return 'Social usage concentration is high. Move social apps to scheduled windows and replace one session with an offline activity.';
    }

    if (features.avgScreenTimeMinutes >= 360) {
      return 'Your total screen load is elevated. Aim to reduce daily usage by 15% this week using app timers.';
    }

    return 'Your recent pattern shows moderate risk. Start with one concrete habit change today and track it for seven days.';
  }
}
