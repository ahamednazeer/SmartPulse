import { Injectable, Logger } from '@nestjs/common';

interface GroqChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface GroqChoice {
  message?: {
    content?: string;
  };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

@Injectable()
export class GroqInsightService {
  private readonly logger = new Logger(GroqInsightService.name);

  async generateRiskInsight(payload: {
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    riskScore: number;
    patterns: Array<{ message: string; severity: string }>;
    stressScore: number;
    sleepDisruptionScore: number;
  }): Promise<string | null> {
    const patternSummary = payload.patterns
      .slice(0, 5)
      .map((item) => `${item.severity}: ${item.message}`)
      .join('; ');

    const prompt =
      'Generate one concise behavioral explanation for a smartphone-addiction user. ' +
      'Keep it under 45 words, second person, supportive and actionable, and avoid diagnosis jargon.\n' +
      `Risk Level: ${payload.riskLevel}\n` +
      `Risk Score: ${payload.riskScore}\n` +
      `Stress Score: ${payload.stressScore}\n` +
      `Sleep Disruption Score: ${payload.sleepDisruptionScore}\n` +
      `Patterns: ${patternSummary || 'No major patterns detected'}`;

    return this.queryGroq([
      {
        role: 'system',
        content:
          'You are a digital wellbeing assistant. Provide short, concrete, non-alarmist guidance.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);
  }

  async generateRecommendationInsight(payload: {
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    avgScreenTimeMinutes: number;
    avgNightUsageMinutes: number;
    avgSocialMediaMinutes: number;
    avgUnlockCount: number;
  }): Promise<string | null> {
    const prompt =
      'Generate one personalized smartphone habit recommendation. ' +
      'Return plain text only, no markdown, no bullets, max 35 words.\n' +
      `Risk Level: ${payload.riskLevel}\n` +
      `Screen Time: ${payload.avgScreenTimeMinutes} min/day\n` +
      `Night Usage: ${payload.avgNightUsageMinutes} min/day\n` +
      `Social Media: ${payload.avgSocialMediaMinutes} min/day\n` +
      `Unlock Count: ${payload.avgUnlockCount}/day`;

    return this.queryGroq([
      {
        role: 'system',
        content:
          'You generate realistic digital wellbeing interventions that users can execute today.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);
  }

  private async queryGroq(messages: GroqChatMessage[]): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return null;
    }

    const timeoutMs = this.getTimeoutMs();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            temperature: 0.2,
            max_tokens: 140,
            messages,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn(`Groq request failed with status ${response.status}`);
        return null;
      }

      const data = (await response.json()) as GroqResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        return null;
      }

      const cleaned = content.replace(/\s+/g, ' ').trim();
      return cleaned.length > 0 ? cleaned : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Groq insight fallback triggered: ${message}`);
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private getTimeoutMs(): number {
    const configured = Number(process.env.GROQ_TIMEOUT_MS ?? '1800');
    if (!Number.isFinite(configured) || configured < 500) {
      return 1800;
    }
    return Math.min(configured, 6000);
  }
}
