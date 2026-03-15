'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChartLineUp,
    Brain,
    Warning,
    Clock,
    DeviceMobile,
    MoonStars,
    ListChecks,
    Lightbulb,
    ArrowsClockwise,
    CheckCircle,
    Circle,
    ArrowRight,
    BellRinging,
    ShieldCheck,
    Pulse,
    ChartBar,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { TopAppsBarChart } from './TopAppsBarChart';
import { ReactionSpeedometer } from './ReactionSpeedometer';
import { ScreenTimeHeatmap } from './ScreenTimeHeatmap';
import { HabitFlowchart } from './HabitFlowchart';
import { ContextScatterPlot } from './charts/ContextScatterPlot';
import { HabitRadarChart } from './charts/HabitRadarChart';
import { DoomscrollGauge } from './charts/DoomscrollGauge';
import { CategoryTreemap } from './charts/CategoryTreemap';
import { CauseAndEffectChart } from './charts/CauseAndEffectChart';
import type {
    UsageSummary,
    UsageRecord,
    RiskAnalysis,
    RecommendationResponse,
    PermissionSettings,
    ActiveInterventionState,
    BehaviorSyncState,
} from '@/lib/api';
import { readCachedPermissionState } from '@/lib/mobile/permissionState';
import { sendLocalAlertNotification } from '@/lib/mobile/pushNotifications';

const ACTION_TRACKER_KEY = 'smartpulse_recommendation_tracker_v1';
const ACTION_STREAK_KEY = 'smartpulse_action_streak_v1';
const INTERVENTION_STATE_KEY = 'smartpulse_intervention_mode_v1';
const JIT_ALERT_STATE_KEY = 'smartpulse_jit_alert_state_v1';

interface RiskDriver {
    id: string;
    title: string;
    detail: string;
    impact: 'UP' | 'DOWN' | 'NEUTRAL';
    value: string;
}

interface ForecastResult {
    score: number;
    level: 'Low' | 'Moderate' | 'High';
    confidence: number;
    summary: string;
    delta: number;
}

interface RelapseResult {
    status: 'Relapse Risk' | 'Improving' | 'Stable';
    message: string;
    screenDelta: number;
    unlockDelta: number;
    nightDelta: number;
}

interface WeeklyReport {
    avgScreen: number;
    avgUnlocks: number;
    avgNight: number;
    totalScreenMinutes: number;
    lightestDay: string | null;
    heaviestDay: string | null;
    highlight: string;
}

interface InterventionMode {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    trigger: string;
}

interface ActionStreakState {
    completedDates: string[];
}

type ActionTrackerState = Record<string, boolean>;
type JitAlertState = Record<string, string>;

interface MicroCheckinFormState {
    mood: number;
    craving: number;
    stress: number;
    focus: number;
    note: string;
}

type AnalysisView = 'overview' | 'trends' | 'actions' | 'details';

interface AnalysisWorkspaceProps {
    view: AnalysisView;
}

interface AnalysisTab {
    id: AnalysisView;
    label: string;
    path: string;
    icon: React.ElementType;
}

const DEFAULT_PERMISSIONS: PermissionSettings = {
    screenUsageMonitoring: false,
    appUsageStatistics: false,
    notificationAccess: false,
    backgroundActivityTracking: false,
    locationTracking: false,
};

const INTERVENTION_MODES: InterventionMode[] = [
    {
        id: 'focus-sprint',
        title: 'Focus Sprint',
        description: 'Run a strict no-social 25-minute work sprint.',
        durationMinutes: 25,
        trigger: 'Best when unlock count is spiking.',
    },
    {
        id: 'social-cooldown',
        title: 'Social Cooldown',
        description: 'Pause social apps for 60 minutes and reset dopamine loop.',
        durationMinutes: 60,
        trigger: 'Best when social usage trends upward.',
    },
    {
        id: 'sleep-shield',
        title: 'Sleep Shield',
        description: 'Activate an 8-hour bedtime protection window.',
        durationMinutes: 8 * 60,
        trigger: 'Best when late-night usage is high.',
    },
];

const ANALYSIS_TABS: AnalysisTab[] = [
    {
        id: 'overview',
        label: 'Risk Overview',
        path: '/dashboard/analysis',
        icon: ChartLineUp,
    },
    {
        id: 'trends',
        label: 'Trends',
        path: '/dashboard/analysis/trends',
        icon: ChartBar,
    },
    {
        id: 'actions',
        label: 'Actions',
        path: '/dashboard/analysis/actions',
        icon: Lightbulb,
    },
    {
        id: 'details',
        label: 'Deep Dive',
        path: '/dashboard/analysis/details',
        icon: ListChecks,
    },
];

function toDisplayRiskLevel(level: 'LOW' | 'MODERATE' | 'HIGH' | null): 'Low' | 'Moderate' | 'High' | 'Pending' {
    if (!level) {
        return 'Pending';
    }

    if (level === 'LOW') {
        return 'Low';
    }

    if (level === 'MODERATE') {
        return 'Moderate';
    }

    return 'High';
}

function toRiskClass(level: string): string {
    if (level === 'High') {
        return 'text-red-400';
    }
    if (level === 'Moderate') {
        return 'text-yellow-400';
    }
    if (level === 'Low') {
        return 'text-green-400';
    }
    return 'text-slate-400';
}

function toRiskSummary(level: string): string {
    if (level === 'High') {
        return 'Your usage pattern needs immediate correction this week.';
    }
    if (level === 'Moderate') {
        return 'Risk is rising. Early intervention now can prevent escalation.';
    }
    if (level === 'Low') {
        return 'Current behavior is stable. Maintain these habits consistently.';
    }
    return 'Collect more usage data to unlock full risk insights.';
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function classifyRiskScore(score: number): 'Low' | 'Moderate' | 'High' {
    if (score >= 70) {
        return 'High';
    }
    if (score >= 40) {
        return 'Moderate';
    }
    return 'Low';
}

function formatDateLabel(date: string): string {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toDurationLabel(totalSeconds: number): string {
    const clamped = Math.max(totalSeconds, 0);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = clamped % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m ${seconds}s`;
}

function readJsonStorage<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') {
        return fallback;
    }

    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return fallback;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed as T;
    } catch {
        return fallback;
    }
}

function writeJsonStorage<T>(key: string, value: T): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
}

function readTrackerState(): ActionTrackerState {
    const parsed = readJsonStorage<unknown>(ACTION_TRACKER_KEY, {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }

    const result: ActionTrackerState = {};
    for (const [key, value] of Object.entries(parsed)) {
        result[key] = Boolean(value);
    }

    return result;
}

function writeTrackerState(state: ActionTrackerState): void {
    writeJsonStorage(ACTION_TRACKER_KEY, state);
}

function readStreakState(): ActionStreakState {
    const parsed = readJsonStorage<unknown>(ACTION_STREAK_KEY, { completedDates: [] });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { completedDates: [] };
    }

    const candidate = parsed as { completedDates?: unknown };
    if (!Array.isArray(candidate.completedDates)) {
        return { completedDates: [] };
    }

    return {
        completedDates: candidate.completedDates.filter(
            (item): item is string => typeof item === 'string',
        ),
    };
}

function writeStreakState(state: ActionStreakState): void {
    writeJsonStorage(ACTION_STREAK_KEY, state);
}

function readActiveIntervention(): ActiveInterventionState | null {
    const parsed = readJsonStorage<unknown>(INTERVENTION_STATE_KEY, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    const candidate = parsed as {
        id?: unknown;
        startedAt?: unknown;
        endsAt?: unknown;
    };

    if (
        typeof candidate.id !== 'string' ||
        typeof candidate.startedAt !== 'number' ||
        typeof candidate.endsAt !== 'number'
    ) {
        return null;
    }

    return {
        id: candidate.id,
        startedAt: candidate.startedAt,
        endsAt: candidate.endsAt,
    };
}

function writeActiveIntervention(value: ActiveInterventionState | null): void {
    if (!value) {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(INTERVENTION_STATE_KEY);
        }
        return;
    }

    writeJsonStorage(INTERVENTION_STATE_KEY, value);
}

function readJitAlertState(): JitAlertState {
    const parsed = readJsonStorage<unknown>(JIT_ALERT_STATE_KEY, {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }

    const result: JitAlertState = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
            result[key] = value;
        }
    }

    return result;
}

function writeJitAlertState(state: JitAlertState): void {
    writeJsonStorage(JIT_ALERT_STATE_KEY, state);
}

function computeRiskDrivers(
    analysis: RiskAnalysis | null,
    summary: UsageSummary | null,
): RiskDriver[] {
    if (!analysis && !summary) {
        return [];
    }

    const avgScreenTime =
        summary?.avgScreenTime ?? analysis?.keyMetrics.avgScreenTimeMinutes ?? 0;
    const avgUnlocks =
        summary?.avgUnlocks ?? analysis?.keyMetrics.avgUnlockCount ?? 0;
    const avgNight =
        summary?.avgNightUsage ?? analysis?.keyMetrics.avgNightUsageMinutes ?? 0;
    const avgSocial =
        summary?.avgSocialMedia ?? analysis?.keyMetrics.avgSocialMediaMinutes ?? 0;

    const drivers: RiskDriver[] = [
        {
            id: 'screen',
            title: 'Screen Load',
            detail:
                avgScreenTime >= 300
                    ? 'Above healthy threshold (300m/day).'
                    : 'Within manageable daily range.',
            impact: avgScreenTime >= 300 ? 'UP' : 'DOWN',
            value: `${Math.round(avgScreenTime)}m/day`,
        },
        {
            id: 'unlocks',
            title: 'Compulsive Checks',
            detail:
                avgUnlocks >= 80
                    ? 'Frequent unlock bursts indicate impulse checks.'
                    : 'Unlock pattern is relatively controlled.',
            impact: avgUnlocks >= 80 ? 'UP' : 'DOWN',
            value: `${Math.round(avgUnlocks)} unlocks/day`,
        },
        {
            id: 'night',
            title: 'Night Usage',
            detail:
                avgNight >= 60
                    ? 'Late-night sessions are disrupting recovery windows.'
                    : 'Night usage remains near safe levels.',
            impact: avgNight >= 60 ? 'UP' : 'DOWN',
            value: `${Math.round(avgNight)}m/night`,
        },
        {
            id: 'social',
            title: 'Social App Pull',
            detail:
                avgSocial >= 180
                    ? 'High social-media exposure is amplifying risk.'
                    : 'Social-media usage remains below high-risk line.',
            impact: avgSocial >= 180 ? 'UP' : 'NEUTRAL',
            value: `${Math.round(avgSocial)}m/day`,
        },
    ];

    return drivers;
}

function computeForecast(
    riskScore: number,
    records: UsageRecord[],
): ForecastResult {
    if (records.length < 3) {
        return {
            score: riskScore,
            level: classifyRiskScore(riskScore),
            confidence: 45,
            summary: 'Need at least 3 recent records for reliable forecast drift.',
            delta: 0,
        };
    }

    const ordered = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const recent = ordered.slice(0, 3);
    const older = ordered.slice(3, 6);

    const safeOlder = older.length > 0 ? older : recent;

    const avg = (values: number[]): number => {
        if (values.length === 0) {
            return 0;
        }
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const recentScreen = avg(recent.map((item) => item.screenTimeMinutes));
    const oldScreen = avg(safeOlder.map((item) => item.screenTimeMinutes));
    const recentNight = avg(recent.map((item) => item.nightUsageMinutes));
    const oldNight = avg(safeOlder.map((item) => item.nightUsageMinutes));
    const recentUnlocks = avg(recent.map((item) => item.unlockCount));
    const oldUnlocks = avg(safeOlder.map((item) => item.unlockCount));

    const drift =
        (recentScreen - oldScreen) * 0.05 +
        (recentNight - oldNight) * 0.12 +
        (recentUnlocks - oldUnlocks) * 0.08;

    const forecastScore = clamp(Math.round(riskScore + drift), 0, 100);
    const level = classifyRiskScore(forecastScore);
    const confidence = clamp(52 + records.length * 6, 52, 92);

    const summary =
        drift >= 6
            ? 'Usage drift is upward. Risk likely to increase this week.'
            : drift <= -6
                ? 'Usage drift is improving. Risk likely to reduce if maintained.'
                : 'Usage drift is stable. Risk likely to stay near current range.';

    return {
        score: forecastScore,
        level,
        confidence,
        summary,
        delta: Math.round(drift),
    };
}

function computeRelapseSignal(records: UsageRecord[]): RelapseResult | null {
    if (records.length < 6) {
        return null;
    }

    const ordered = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const recent = ordered.slice(0, 3);
    const previous = ordered.slice(3, 6);

    const avg = (values: number[]): number =>
        values.reduce((sum, value) => sum + value, 0) / values.length;

    const screenDelta = Math.round(
        avg(recent.map((item) => item.screenTimeMinutes)) -
        avg(previous.map((item) => item.screenTimeMinutes)),
    );
    const unlockDelta = Math.round(
        avg(recent.map((item) => item.unlockCount)) -
        avg(previous.map((item) => item.unlockCount)),
    );
    const nightDelta = Math.round(
        avg(recent.map((item) => item.nightUsageMinutes)) -
        avg(previous.map((item) => item.nightUsageMinutes)),
    );

    const risingSignals =
        Number(screenDelta >= 30) +
        Number(unlockDelta >= 12) +
        Number(nightDelta >= 20);

    const improvingSignals =
        Number(screenDelta <= -30) +
        Number(unlockDelta <= -12) +
        Number(nightDelta <= -20);

    if (risingSignals >= 2) {
        return {
            status: 'Relapse Risk',
            message: 'Recent behavior is regressing versus the previous 3-day window.',
            screenDelta,
            unlockDelta,
            nightDelta,
        };
    }

    if (improvingSignals >= 2) {
        return {
            status: 'Improving',
            message: 'Recent behavior is improving compared with the previous window.',
            screenDelta,
            unlockDelta,
            nightDelta,
        };
    }

    return {
        status: 'Stable',
        message: 'No strong relapse signal detected in the latest 6-day trend.',
        screenDelta,
        unlockDelta,
        nightDelta,
    };
}

function computeWeeklyReport(records: UsageRecord[]): WeeklyReport | null {
    if (records.length === 0) {
        return null;
    }

    const ordered = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

    const totalScreenMinutes = ordered.reduce(
        (sum, item) => sum + item.screenTimeMinutes,
        0,
    );

    const avgScreen = Math.round(totalScreenMinutes / ordered.length);
    const avgUnlocks = Math.round(
        ordered.reduce((sum, item) => sum + item.unlockCount, 0) / ordered.length,
    );
    const avgNight = Math.round(
        ordered.reduce((sum, item) => sum + item.nightUsageMinutes, 0) / ordered.length,
    );

    const lightest = [...ordered].sort(
        (a, b) => a.screenTimeMinutes - b.screenTimeMinutes,
    )[0];
    const heaviest = [...ordered].sort(
        (a, b) => b.screenTimeMinutes - a.screenTimeMinutes,
    )[0];

    const highlight =
        avgNight >= 70
            ? 'Priority: reduce late-night usage for better recovery and lower risk.'
            : avgUnlocks >= 90
                ? 'Priority: reduce compulsive unlock checks with focused app blocks.'
                : avgScreen >= 320
                    ? 'Priority: cut total screen time by 15-20% this week.'
                    : 'Strong week. Keep your current routine and monitor drift daily.';

    return {
        avgScreen,
        avgUnlocks,
        avgNight,
        totalScreenMinutes,
        lightestDay: lightest ? formatDateLabel(lightest.date) : null,
        heaviestDay: heaviest ? formatDateLabel(heaviest.date) : null,
        highlight,
    };
}

async function maybeTriggerJitAlerts(
    riskScore: number,
    riskLevel: string,
    records: UsageRecord[],
    analysis: RiskAnalysis | null,
    summary: UsageSummary | null,
): Promise<void> {
    const today = toDateKey(new Date());
    const currentState = readJitAlertState();

    const latest = [...records].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    const avgNight = summary?.avgNightUsage ?? analysis?.keyMetrics.avgNightUsageMinutes ?? 0;

    const candidates: Array<{
        key: string;
        title: string;
        message: string;
        severity: 'INFO' | 'WARNING' | 'CRITICAL';
    }> = [];

    if (riskScore >= 70 || riskLevel === 'High') {
        candidates.push({
            key: 'high-risk',
            title: 'Risk Alert: High Zone',
            message:
                'Your current behavior pattern is in high-risk range. Start an intervention mode now.',
            severity: 'CRITICAL',
        });
    }

    if (avgNight >= 90) {
        candidates.push({
            key: 'night-usage',
            title: 'Late-Night Usage Spike',
            message:
                'Night usage is elevated. Activate Sleep Shield tonight to protect your recovery window.',
            severity: 'WARNING',
        });
    }

    if (latest && latest.unlockCount >= 120) {
        candidates.push({
            key: 'unlock-burst',
            title: 'Unlock Burst Detected',
            message:
                'Frequent unlock checks detected today. Start a 25-minute Focus Sprint now.',
            severity: 'WARNING',
        });
    }

    if (latest && latest.longestSessionMinutes >= 120) {
        candidates.push({
            key: 'long-session',
            title: 'Long Session Warning',
            message:
                'A long uninterrupted session was detected. Take a 10-minute break away from the phone.',
            severity: 'INFO',
        });
    }

    if (candidates.length === 0) {
        return;
    }

    const nextState: JitAlertState = { ...currentState };

    for (const candidate of candidates) {
        if (nextState[candidate.key] === today) {
            continue;
        }

        const sent = await sendLocalAlertNotification({
            id: `jit-${candidate.key}-${today}`,
            title: candidate.title,
            message: candidate.message,
            severity: candidate.severity,
        });

        if (sent) {
            nextState[candidate.key] = today;
        }
    }

    writeJitAlertState(nextState);
}

export default function AnalysisWorkspace({ view }: AnalysisWorkspaceProps) {
    const router = useRouter();
    const [summary, setSummary] = useState<UsageSummary | null>(null);
    const [records, setRecords] = useState<UsageRecord[]>([]);
    const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
    const [recommendations, setRecommendations] =
        useState<RecommendationResponse | null>(null);
    const [permissionState, setPermissionState] = useState<PermissionSettings>(
        readCachedPermissionState() ?? DEFAULT_PERMISSIONS,
    );
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionTracker, setActionTracker] = useState<ActionTrackerState>({});
    const [streakState, setStreakState] = useState<ActionStreakState>({
        completedDates: [],
    });
    const [activeIntervention, setActiveIntervention] =
        useState<ActiveInterventionState | null>(null);
    const [nowMs, setNowMs] = useState(Date.now());
    const [jitAlertChecked, setJitAlertChecked] = useState(false);
    const [checkinSubmitting, setCheckinSubmitting] = useState(false);
    const [microCheckin, setMicroCheckin] = useState<MicroCheckinFormState>({
        mood: 3,
        craving: 3,
        stress: 3,
        focus: 3,
        note: '',
    });

    const syncBehaviorPatch = useCallback(
        (payload: {
            actionTracker?: Record<string, boolean>;
            completedDates?: string[];
            activeIntervention?: ActiveInterventionState | null;
        }) => {
            void api.updateBehaviorSync(payload).catch((error) => {
                console.error('Failed to sync behavior state', error);
            });
        },
        [],
    );

    const logInterventionEvent = useCallback(
        (payload: {
            interventionId: string;
            title: string;
            eventType: 'STARTED' | 'STOPPED' | 'COMPLETED';
            startedAt?: number;
            endedAt?: number;
            durationMinutes?: number;
        }) => {
            const sourceTimestamp =
                payload.startedAt ??
                payload.endedAt ??
                Date.now();

            void api.submitInterventionEvent({
                ...payload,
                date: toDateKey(new Date(sourceTimestamp)),
            }).catch((error) => {
                console.error('Failed to log intervention event', error);
            });
        },
        [],
    );

    useEffect(() => {
        setActionTracker(readTrackerState());
        setStreakState(readStreakState());
        setActiveIntervention(readActiveIntervention());
    }, []);

    useEffect(() => {
        async function fetchAnalysisData() {
            try {
                const [
                    summaryData,
                    recordData,
                    analysisData,
                    recommendationData,
                    permissionData,
                    behaviorSyncData,
                ] = await Promise.all([
                    api.getUsageSummary().catch(() => null),
                    api.getUsageRecords(14).catch(() => []),
                    api.getRiskAnalysis().catch(() => null),
                    api.getRecommendations().catch(() => null),
                    api.getPermissions().catch(() => null),
                    api.getBehaviorSync().catch(() => null),
                ]);

                setSummary(summaryData);
                setRecords(recordData);
                setAnalysis(analysisData);
                setRecommendations(recommendationData);
                setPermissionState(
                    permissionData ?? readCachedPermissionState() ?? DEFAULT_PERMISSIONS,
                );

                const localActionTracker = readTrackerState();
                const localStreakState = readStreakState();
                const localIntervention = readActiveIntervention();

                const syncedBehaviorState: BehaviorSyncState | null = behaviorSyncData;

                if (syncedBehaviorState) {
                    const syncedActionTracker = syncedBehaviorState.actionTracker ?? {};
                    const syncedStreakState: ActionStreakState = {
                        completedDates: Array.isArray(syncedBehaviorState.completedDates)
                            ? syncedBehaviorState.completedDates.filter(
                                (item): item is string => typeof item === 'string',
                            )
                            : [],
                    };
                    const syncedIntervention =
                        syncedBehaviorState.activeIntervention ?? null;

                    setActionTracker(syncedActionTracker);
                    writeTrackerState(syncedActionTracker);
                    setStreakState(syncedStreakState);
                    writeStreakState(syncedStreakState);
                    setActiveIntervention(syncedIntervention);
                    writeActiveIntervention(syncedIntervention);
                } else {
                    setActionTracker(localActionTracker);
                    setStreakState(localStreakState);
                    setActiveIntervention(localIntervention);

                    syncBehaviorPatch({
                        actionTracker: localActionTracker,
                        completedDates: localStreakState.completedDates,
                        activeIntervention: localIntervention,
                    });
                }

                setJitAlertChecked(false);
            } catch (error) {
                console.error('Failed to load analysis data', error);
                toast.error('Failed to load risk analytics');
            } finally {
                setLoading(false);
            }
        }

        void fetchAnalysisData();
    }, [syncBehaviorPatch]);

    useEffect(() => {
        if (!activeIntervention) {
            return;
        }

        const timerId = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(timerId);
        };
    }, [activeIntervention]);

    useEffect(() => {
        if (!activeIntervention) {
            return;
        }

        if (activeIntervention.endsAt > nowMs) {
            return;
        }

        const mode = INTERVENTION_MODES.find((item) => item.id === activeIntervention.id);
        if (mode) {
            toast.success(`${mode.title} completed`);
            logInterventionEvent({
                interventionId: mode.id,
                title: mode.title,
                eventType: 'COMPLETED',
                startedAt: activeIntervention.startedAt,
                endedAt: activeIntervention.endsAt,
                durationMinutes: Math.max(
                    0,
                    Math.round(
                        (activeIntervention.endsAt - activeIntervention.startedAt) /
                        (60 * 1000),
                    ),
                ),
            });
        }

        setActiveIntervention(null);
        writeActiveIntervention(null);
        syncBehaviorPatch({
            activeIntervention: null,
        });
    }, [activeIntervention, logInterventionEvent, nowMs, syncBehaviorPatch]);

    useEffect(() => {
        if (loading || jitAlertChecked) {
            return;
        }

        const riskScore = clamp(Math.round(analysis?.riskScore ?? 0), 0, 100);
        const riskLevel = toDisplayRiskLevel(analysis?.riskLevel ?? null);

        void maybeTriggerJitAlerts(riskScore, riskLevel, records, analysis, summary).finally(() => {
            setJitAlertChecked(true);
        });
    }, [analysis, jitAlertChecked, loading, records, summary]);

    const refreshRiskInsights = async () => {
        setRefreshing(true);
        try {
            await api.runPrediction();
            const [
                summaryData,
                recordData,
                analysisData,
                recommendationData,
                permissionData,
                behaviorSyncData,
            ] = await Promise.all([
                api.getUsageSummary().catch(() => null),
                api.getUsageRecords(14).catch(() => []),
                api.getRiskAnalysis().catch(() => null),
                api.getRecommendations().catch(() => null),
                api.getPermissions().catch(() => null),
                api.getBehaviorSync().catch(() => null),
            ]);

            setSummary(summaryData);
            setRecords(recordData);
            setAnalysis(analysisData);
            setRecommendations(recommendationData);
            setPermissionState(
                permissionData ?? readCachedPermissionState() ?? DEFAULT_PERMISSIONS,
            );
            if (behaviorSyncData) {
                setActionTracker(behaviorSyncData.actionTracker ?? {});
                writeTrackerState(behaviorSyncData.actionTracker ?? {});

                const refreshedStreakState: ActionStreakState = {
                    completedDates: Array.isArray(behaviorSyncData.completedDates)
                        ? behaviorSyncData.completedDates.filter(
                            (item): item is string => typeof item === 'string',
                        )
                        : [],
                };
                setStreakState(refreshedStreakState);
                writeStreakState(refreshedStreakState);

                const refreshedIntervention =
                    behaviorSyncData.activeIntervention ?? null;
                setActiveIntervention(refreshedIntervention);
                writeActiveIntervention(refreshedIntervention);
            }
            setJitAlertChecked(false);
            toast.success('Risk analysis refreshed');
        } catch (error) {
            console.error('Failed to refresh risk analysis', error);
            toast.error('Unable to refresh analysis right now');
        } finally {
            setRefreshing(false);
        }
    };

    const toggleAction = (id: string) => {
        setActionTracker((prev) => {
            const next = {
                ...prev,
                [id]: !prev[id],
            };
            writeTrackerState(next);
            syncBehaviorPatch({
                actionTracker: next,
            });
            return next;
        });
    };

    const startIntervention = (modeId: string) => {
        const mode = INTERVENTION_MODES.find((item) => item.id === modeId);
        if (!mode) {
            return;
        }

        const startedAt = Date.now();
        const next: ActiveInterventionState = {
            id: mode.id,
            startedAt,
            endsAt: startedAt + mode.durationMinutes * 60 * 1000,
        };

        setActiveIntervention(next);
        writeActiveIntervention(next);
        syncBehaviorPatch({
            activeIntervention: next,
        });
        logInterventionEvent({
            interventionId: mode.id,
            title: mode.title,
            eventType: 'STARTED',
            startedAt,
        });
        setNowMs(startedAt);
        toast.success(`${mode.title} started`);
    };

    const stopIntervention = () => {
        if (activeIntervention) {
            const mode =
                INTERVENTION_MODES.find((item) => item.id === activeIntervention.id) ??
                null;
            if (mode) {
                logInterventionEvent({
                    interventionId: mode.id,
                    title: mode.title,
                    eventType: 'STOPPED',
                    startedAt: activeIntervention.startedAt,
                    endedAt: Date.now(),
                    durationMinutes: Math.max(
                        0,
                        Math.round((Date.now() - activeIntervention.startedAt) / (60 * 1000)),
                    ),
                });
            }
        }

        setActiveIntervention(null);
        writeActiveIntervention(null);
        syncBehaviorPatch({
            activeIntervention: null,
        });
        toast.info('Intervention mode stopped');
    };

    const submitMicroCheckin = async () => {
        setCheckinSubmitting(true);
        try {
            await api.submitMicroCheckin({
                date: toDateKey(new Date()),
                mood: microCheckin.mood,
                craving: microCheckin.craving,
                stress: microCheckin.stress,
                focus: microCheckin.focus,
                note: microCheckin.note.trim() || undefined,
            });

            setMicroCheckin((prev) => ({
                ...prev,
                note: '',
            }));

            toast.success('Micro check-in saved');
            await refreshRiskInsights();
        } catch (error) {
            console.error('Failed to submit micro check-in', error);
            toast.error('Failed to submit check-in');
        } finally {
            setCheckinSubmitting(false);
        }
    };

    const riskLevel = toDisplayRiskLevel(analysis?.riskLevel ?? null);
    const riskClass = toRiskClass(riskLevel);
    const riskScore = clamp(Math.round(analysis?.riskScore ?? 0), 0, 100);

    const recentRecords = useMemo(() => {
        return [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    }, [records]);

    const maxScreenTime = useMemo(() => {
        if (recentRecords.length === 0) {
            return 1;
        }
        return Math.max(...recentRecords.map((item) => item.screenTimeMinutes), 1);
    }, [recentRecords]);

    const completedActionCount = useMemo(() => {
        if (!recommendations) {
            return 0;
        }

        return recommendations.recommendations.filter((item) => actionTracker[item.id]).length;
    }, [actionTracker, recommendations]);

    const recommendationCount = recommendations?.recommendations.length ?? 0;
    const actionCompletionScore =
        recommendationCount > 0
            ? Math.round((completedActionCount / recommendationCount) * 100)
            : 0;
    const dailyTarget = recommendationCount > 0 ? Math.min(3, recommendationCount) : 0;

    useEffect(() => {
        if (dailyTarget === 0) {
            return;
        }

        if (completedActionCount < dailyTarget) {
            return;
        }

        const today = toDateKey(new Date());
        setStreakState((prev) => {
            if (prev.completedDates.includes(today)) {
                return prev;
            }

            const nextDates = [...prev.completedDates, today].slice(-90);
            const next = { completedDates: nextDates };
            writeStreakState(next);
            syncBehaviorPatch({
                completedDates: next.completedDates,
            });
            return next;
        });
    }, [completedActionCount, dailyTarget, syncBehaviorPatch]);

    const currentActionStreak = useMemo(() => {
        const completedSet = new Set(streakState.completedDates);
        let streak = 0;
        const cursor = new Date();

        while (completedSet.has(toDateKey(cursor))) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }

        return streak;
    }, [streakState]);

    const forecast = useMemo(
        () => computeForecast(riskScore, recentRecords),
        [recentRecords, riskScore],
    );

    const relapseSignal = useMemo(
        () => computeRelapseSignal(recentRecords),
        [recentRecords],
    );

    const weeklyReport = useMemo(
        () => computeWeeklyReport(recentRecords),
        [recentRecords],
    );

    const riskDrivers = useMemo(
        () => computeRiskDrivers(analysis, summary),
        [analysis, summary],
    );

    const missingCriticalPermissions = useMemo(() => {
        const missing: string[] = [];

        if (!permissionState.screenUsageMonitoring) {
            missing.push('Screen Usage');
        }

        if (!permissionState.appUsageStatistics) {
            missing.push('App Statistics');
        }

        if (!permissionState.notificationAccess) {
            missing.push('Notifications');
        }

        return missing;
    }, [permissionState]);

    const activeInterventionMode =
        activeIntervention
            ? INTERVENTION_MODES.find((item) => item.id === activeIntervention.id) ?? null
            : null;

    const interventionRemainingSeconds =
        activeIntervention && activeIntervention.endsAt > nowMs
            ? Math.ceil((activeIntervention.endsAt - nowMs) / 1000)
            : 0;

    const hasUsageRecords = Boolean(summary && summary.totalRecords > 0);
    const showOverview = view === 'overview';
    const showTrends = view === 'trends';
    const showActions = view === 'actions';
    const showDetails = view === 'details';
    const heroTitle = showOverview
        ? 'Risk Analysis Hub'
        : showTrends
            ? 'Trend Intelligence'
            : showActions
                ? 'Action Center'
                : 'Deep Dive Metrics';
    const heroSummary = showOverview
        ? toRiskSummary(riskLevel)
        : showTrends
            ? 'Track weekly patterns, timeline drift, and early behavior shifts.'
            : showActions
                ? 'Complete interventions, log check-ins, and lock in better habits.'
                : 'Highly accurate, granular usage data powered by native device sensors.';

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="card animate-shimmer h-28" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-5 animate-slide-up">
            <div className="grid grid-cols-3 gap-2">
                {ANALYSIS_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === view;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => router.push(tab.path)}
                            className={`rounded-sm border px-3 py-3 text-left transition-colors ${
                                isActive
                                    ? 'border-blue-600/70 bg-blue-950/40 text-blue-300'
                                    : 'border-slate-700/60 bg-slate-900/30 text-slate-400'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon size={14} />
                                <span className="text-[11px] font-mono uppercase tracking-wider">
                                    {tab.label}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {missingCriticalPermissions.length > 0 && (
                <div className="card border-yellow-700/50 bg-yellow-950/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <Warning size={20} className="text-yellow-400 mt-0.5" />
                            <div>
                                <h3 className="font-chivo font-bold text-sm uppercase tracking-wider text-yellow-200">
                                    Permission Health Watchdog
                                </h3>
                                <p className="text-xs text-yellow-100/80 mt-1">
                                    Missing critical permissions: {missingCriticalPermissions.join(', ')}.
                                    Risk quality and alerts may degrade until restored.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/permissions')}
                            className="btn-secondary w-full sm:w-auto"
                        >
                            Fix Permissions
                        </button>
                    </div>
                </div>
            )}

            <div className="card border-blue-800/40 bg-gradient-to-r from-blue-950/40 to-slate-800/40">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-sm bg-blue-600/20">
                                <Brain size={28} weight="duotone" className="text-blue-400" />
                            </div>
                            <div>
                                <h2 className="font-chivo font-bold text-base sm:text-lg uppercase tracking-wider">
                                    {heroTitle}
                                </h2>
                                <p className="text-slate-400 text-sm mt-1">
                                    {heroSummary}
                                </p>
                            </div>
                        </div>
                        <div className="w-full sm:w-auto sm:min-w-56">
                            <div className="rounded-sm border border-slate-700/70 bg-slate-900/40 p-3">
                                <div className="flex items-baseline gap-2">
                                    <span className={`font-chivo font-bold text-3xl ${riskClass}`}>
                                        {analysis ? riskScore : '—'}
                                    </span>
                                    <span className="text-xs font-mono text-slate-500">/100</span>
                                </div>
                                <div className={`text-sm font-mono uppercase ${riskClass}`}>{riskLevel}</div>
                                <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                                    <div
                                        className={`h-full ${riskLevel === 'High'
                                            ? 'bg-red-500'
                                            : riskLevel === 'Moderate'
                                                ? 'bg-yellow-500'
                                                : 'bg-green-500'
                                            }`}
                                        style={{ width: `${riskScore}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => void refreshRiskInsights()}
                            disabled={refreshing}
                            className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2"
                        >
                            <ArrowsClockwise size={16} />
                            {refreshing ? 'Refreshing...' : 'Refresh Analysis'}
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/permissions')}
                            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                        >
                            Permission Controls
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {(showOverview || showTrends || showDetails) && !hasUsageRecords ? (
                <div className="card text-center py-10">
                    <ChartLineUp
                        size={56}
                        weight="duotone"
                        className="text-slate-600 mx-auto mb-4"
                    />
                    <h3 className="font-chivo font-bold text-lg uppercase tracking-wider text-slate-300 mb-2">
                        Analysis Pending
                    </h3>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
                        SmartPulse needs at least a few days of usage records to produce detailed risk scoring and recommendations.
                    </p>
                    <div className="inline-flex items-center gap-2 text-xs font-mono text-yellow-400 bg-yellow-950/30 border border-yellow-800/40 rounded-sm px-4 py-2">
                        <Warning size={14} />
                        DATA COLLECTION IN PROGRESS
                    </div>
                </div>
            ) : (
                <>
                    {showOverview && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <ChartLineUp size={14} /> 7-Day Forecast
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <div className="text-2xl font-chivo font-bold text-slate-100">
                                            {forecast.score}
                                        </div>
                                        <div className={`text-sm font-mono uppercase mb-1 ${toRiskClass(forecast.level)}`}>
                                            {forecast.level}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">{forecast.summary}</p>
                                    <div className="mt-3 flex items-center justify-between text-[11px] font-mono uppercase text-slate-500">
                                        <span>Confidence {forecast.confidence}%</span>
                                        <span>{forecast.delta >= 0 ? '+' : ''}{forecast.delta} drift</span>
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <Pulse size={14} /> Relapse Detector
                                    </div>
                                    {relapseSignal ? (
                                        <>
                                            <div
                                                className={`text-lg font-chivo font-bold ${relapseSignal.status === 'Relapse Risk'
                                                    ? 'text-red-400'
                                                    : relapseSignal.status === 'Improving'
                                                        ? 'text-green-400'
                                                        : 'text-slate-200'
                                                    }`}
                                            >
                                                {relapseSignal.status}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">{relapseSignal.message}</p>
                                            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] font-mono text-slate-500">
                                                <div>Screen {relapseSignal.screenDelta >= 0 ? '+' : ''}{relapseSignal.screenDelta}</div>
                                                <div>Unlock {relapseSignal.unlockDelta >= 0 ? '+' : ''}{relapseSignal.unlockDelta}</div>
                                                <div>Night {relapseSignal.nightDelta >= 0 ? '+' : ''}{relapseSignal.nightDelta}</div>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-slate-500">
                                            Need at least 6 days of records for relapse signal.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <Clock size={14} /> Avg Screen Time
                                    </div>
                                    <div className="text-2xl font-chivo font-bold text-slate-100">
                                        {Math.round(
                                            summary?.avgScreenTime ??
                                            analysis?.keyMetrics.avgScreenTimeMinutes ??
                                            0,
                                        )}
                                        m
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">per day</div>
                                </div>
                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <DeviceMobile size={14} /> Avg Unlocks
                                    </div>
                                    <div className="text-2xl font-chivo font-bold text-slate-100">
                                        {Math.round(
                                            summary?.avgUnlocks ??
                                            analysis?.keyMetrics.avgUnlockCount ??
                                            0,
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">checks per day</div>
                                </div>
                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <ChartBar size={14} /> Social Usage
                                    </div>
                                    <div className="text-2xl font-chivo font-bold text-slate-100">
                                        {Math.round(
                                            summary?.avgSocialMedia ??
                                            analysis?.keyMetrics.avgSocialMediaMinutes ??
                                            0,
                                        )}
                                        m
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">per day</div>
                                </div>
                                <div className="card">
                                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono uppercase mb-2">
                                        <MoonStars size={14} /> Night Usage
                                    </div>
                                    <div className="text-2xl font-chivo font-bold text-slate-100">
                                        {Math.round(
                                            summary?.avgNightUsage ??
                                            analysis?.keyMetrics.avgNightUsageMinutes ??
                                            0,
                                        )}
                                        m
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">10 PM - 6 AM</div>
                                </div>
                            </div>

                            <div className="card">
                                <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <ShieldCheck size={16} />
                                    Risk Drivers
                                </h3>
                                {riskDrivers.length === 0 ? (
                                    <p className="text-sm text-slate-500">Risk drivers will appear after enough records are collected.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {riskDrivers.map((driver) => (
                                            <div
                                                key={driver.id}
                                                className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-semibold text-slate-200">{driver.title}</div>
                                                    <span
                                                        className={`text-[11px] font-mono uppercase ${driver.impact === 'UP'
                                                            ? 'text-red-400'
                                                            : driver.impact === 'DOWN'
                                                                ? 'text-green-400'
                                                                : 'text-slate-400'
                                                            }`}
                                                    >
                                                        {driver.impact}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1">{driver.detail}</div>
                                                <div className="text-[11px] font-mono text-blue-400 mt-1">{driver.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Top 5 Behavioral Sinks</h3>
                                {records.length > 0 ? (
                                    <TopAppsBarChart appUsage={recentRecords[0]?.appUsage || null} />
                                ) : (
                                    <p className="text-sm text-slate-500">Wait for background syncs to capture app usage.</p>
                                )}
                            </div>

                            <div className="card">
                                <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <ListChecks size={16} />
                                    Behavioral Patterns
                                </h3>
                                {analysis?.aiInsight ? (
                                    <div className="mb-4 p-3 border border-blue-700/40 rounded-sm bg-blue-950/20 text-xs text-blue-200">
                                        {analysis.aiInsight}
                                    </div>
                                ) : null}
                                {!analysis || analysis.patterns.length === 0 ? (
                                    <p className="text-sm text-slate-500">
                                        No critical behavior patterns are currently flagged.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {analysis.patterns.map((pattern) => (
                                            <div
                                                key={pattern.key}
                                                className="flex items-start justify-between gap-3 py-2 border-b border-slate-800"
                                            >
                                                <span className="text-sm text-slate-300">{pattern.message}</span>
                                                <span
                                                    className={`text-xs font-mono ${pattern.severity === 'HIGH'
                                                        ? 'text-red-400'
                                                        : pattern.severity === 'MODERATE'
                                                            ? 'text-yellow-400'
                                                            : 'text-green-400'
                                                        }`}
                                                >
                                                    {pattern.severity}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {showTrends && (
                        <div className="card">
                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4">
                            7-Day Timeline
                        </h3>
                        {recentRecords.length === 0 ? (
                            <p className="text-sm text-slate-500">
                                Recent daily records are not available yet.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {recentRecords.map((record) => (
                                    <div key={record.id} className="rounded-sm border border-slate-700/60 p-3 bg-slate-900/30">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <div className="text-xs font-mono uppercase text-slate-400">
                                                {formatDateLabel(record.date)}
                                            </div>
                                            <div className="text-xs font-mono text-blue-400">
                                                {record.screenTimeMinutes}m screen time
                                            </div>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500"
                                                style={{
                                                    width: `${Math.round((record.screenTimeMinutes / maxScreenTime) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] text-slate-500 font-mono">
                                            <div>Unlocks: {record.unlockCount}</div>
                                            <div>Night: {record.nightUsageMinutes}m</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                    )}

                    {showActions && (
                        <div className="card">
                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Lightbulb size={16} />
                            Action Plan Engine
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                            <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                <div className="text-[11px] font-mono uppercase text-slate-500">Completion</div>
                                <div className="text-xl font-chivo font-bold text-blue-300 mt-1">{actionCompletionScore}%</div>
                            </div>
                            <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                <div className="text-[11px] font-mono uppercase text-slate-500">Daily Target</div>
                                <div className="text-xl font-chivo font-bold text-slate-100 mt-1">{dailyTarget || 0}</div>
                            </div>
                            <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                <div className="text-[11px] font-mono uppercase text-slate-500">Current Streak</div>
                                <div className="text-xl font-chivo font-bold text-green-400 mt-1">{currentActionStreak}d</div>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 mb-4">
                            Action tracker: {completedActionCount}/{recommendationCount} completed
                        </p>

                        {!recommendations || recommendations.recommendations.length === 0 ? (
                            <p className="text-sm text-slate-500">
                                Personalized recommendations will appear after the next risk analysis refresh.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {recommendations.recommendations.map((item) => {
                                    const completed = Boolean(actionTracker[item.id]);
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => toggleAction(item.id)}
                                            className={`w-full text-left p-3 border rounded-sm transition-all ${completed
                                                ? 'border-green-700/50 bg-green-950/20'
                                                : 'border-slate-700/60 bg-slate-900/30'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 text-blue-400">
                                                    {completed ? (
                                                        <CheckCircle size={18} weight="fill" className="text-green-400" />
                                                    ) : (
                                                        <Circle size={18} />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <h4 className="text-sm font-semibold text-slate-200">
                                                            {item.title}
                                                        </h4>
                                                        <span className="text-[11px] font-mono text-blue-400 uppercase">
                                                            {item.priority}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        </div>
                    )}

                    {showActions && (
                        <div className="card">
                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Brain size={16} />
                            Micro Check-In
                        </h3>
                        <p className="text-xs text-slate-500 mb-4">
                            Quick self-report to link behavior with mood and craving patterns.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="text-xs text-slate-400">
                                Mood ({microCheckin.mood}/5)
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={microCheckin.mood}
                                    onChange={(event) =>
                                        setMicroCheckin((prev) => ({
                                            ...prev,
                                            mood: Number(event.target.value),
                                        }))
                                    }
                                    className="w-full mt-2"
                                />
                            </label>

                            <label className="text-xs text-slate-400">
                                Craving ({microCheckin.craving}/5)
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={microCheckin.craving}
                                    onChange={(event) =>
                                        setMicroCheckin((prev) => ({
                                            ...prev,
                                            craving: Number(event.target.value),
                                        }))
                                    }
                                    className="w-full mt-2"
                                />
                            </label>

                            <label className="text-xs text-slate-400">
                                Stress ({microCheckin.stress}/5)
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={microCheckin.stress}
                                    onChange={(event) =>
                                        setMicroCheckin((prev) => ({
                                            ...prev,
                                            stress: Number(event.target.value),
                                        }))
                                    }
                                    className="w-full mt-2"
                                />
                            </label>

                            <label className="text-xs text-slate-400">
                                Focus ({microCheckin.focus}/5)
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={microCheckin.focus}
                                    onChange={(event) =>
                                        setMicroCheckin((prev) => ({
                                            ...prev,
                                            focus: Number(event.target.value),
                                        }))
                                    }
                                    className="w-full mt-2"
                                />
                            </label>
                        </div>

                        <label className="block mt-3 text-xs text-slate-400">
                            Note (optional)
                            <textarea
                                value={microCheckin.note}
                                onChange={(event) =>
                                    setMicroCheckin((prev) => ({
                                        ...prev,
                                        note: event.target.value.slice(0, 200),
                                    }))
                                }
                                rows={2}
                                className="mt-2 w-full rounded-sm border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
                                placeholder="What triggered usage right now?"
                            />
                        </label>

                        <button
                            onClick={() => void submitMicroCheckin()}
                            disabled={checkinSubmitting}
                            className="mt-3 btn-secondary w-full sm:w-auto"
                        >
                            {checkinSubmitting ? 'Saving...' : 'Save Check-In'}
                        </button>
                        </div>
                    )}

                    {showActions && (
                        <div className="card">
                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BellRinging size={16} />
                            Intervention Modes
                        </h3>
                        {activeInterventionMode ? (
                            <div className="mb-4 rounded-sm border border-blue-700/50 bg-blue-950/20 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-blue-200">
                                            {activeInterventionMode.title} Active
                                        </div>
                                        <div className="text-xs text-blue-100/80 mt-1">
                                            Remaining: {toDurationLabel(interventionRemainingSeconds)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={stopIntervention}
                                        className="btn-secondary w-full sm:w-auto"
                                    >
                                        Stop Mode
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-4 text-xs text-slate-500">
                                No active mode. Start one when risk rises or cravings spike.
                            </div>
                        )}

                        <div className="space-y-2">
                            {INTERVENTION_MODES.map((mode) => {
                                const isActive = activeIntervention?.id === mode.id;
                                return (
                                    <div
                                        key={mode.id}
                                        className={`rounded-sm border p-3 ${isActive
                                            ? 'border-blue-700/60 bg-blue-950/20'
                                            : 'border-slate-700/60 bg-slate-900/30'
                                            }`}
                                    >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-200">{mode.title}</div>
                                                <div className="text-xs text-slate-400 mt-1">{mode.description}</div>
                                                <div className="text-[11px] font-mono text-slate-500 mt-1">
                                                    {mode.durationMinutes} min • {mode.trigger}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => startIntervention(mode.id)}
                                                disabled={Boolean(activeIntervention) && !isActive}
                                                className="btn-secondary w-full sm:w-auto"
                                            >
                                                {isActive ? 'Running' : 'Start'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </div>
                    )}

                    {showTrends && (
                        <div className="card">
                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                            <ChartLineUp size={16} />
                            Weekly Report Card
                        </h3>
                        {!weeklyReport ? (
                            <p className="text-sm text-slate-500">
                                Weekly report will appear after at least one day of records.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                        <div className="text-[11px] font-mono uppercase text-slate-500">Avg Screen</div>
                                        <div className="text-lg font-chivo font-bold text-slate-100 mt-1">
                                            {weeklyReport.avgScreen}m
                                        </div>
                                    </div>
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                        <div className="text-[11px] font-mono uppercase text-slate-500">Avg Unlocks</div>
                                        <div className="text-lg font-chivo font-bold text-slate-100 mt-1">
                                            {weeklyReport.avgUnlocks}
                                        </div>
                                    </div>
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                        <div className="text-[11px] font-mono uppercase text-slate-500">Avg Night</div>
                                        <div className="text-lg font-chivo font-bold text-slate-100 mt-1">
                                            {weeklyReport.avgNight}m
                                        </div>
                                    </div>
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3">
                                        <div className="text-[11px] font-mono uppercase text-slate-500">Total Screen</div>
                                        <div className="text-lg font-chivo font-bold text-slate-100 mt-1">
                                            {weeklyReport.totalScreenMinutes}m
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3 text-slate-400">
                                        Lightest Day: {weeklyReport.lightestDay ?? '—'}
                                    </div>
                                    <div className="rounded-sm border border-slate-700/60 bg-slate-900/30 p-3 text-slate-400">
                                        Heaviest Day: {weeklyReport.heaviestDay ?? '—'}
                                    </div>
                                </div>
                                <div className="rounded-sm border border-blue-700/40 bg-blue-950/20 p-3 text-xs text-blue-100">
                                    {weeklyReport.highlight}
                                </div>
                            </div>
                        )}
                        </div>
                    )}
                    {showDetails && (
                        <div className="space-y-4">
                            <div className="card border-blue-800/40 bg-gradient-to-r from-slate-900/60 to-blue-950/20">
                                <h3 className="font-chivo font-bold text-lg uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Clock size={20} className="text-blue-400" />
                                    Detailed Averages Overview
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="p-4 rounded border border-slate-700/60 bg-slate-900/50">
                                        <div className="text-sm font-mono uppercase text-slate-400">Total Screen Time</div>
                                        <div className="text-3xl font-chivo font-bold text-slate-100 mt-2">
                                            {Math.round(records[0]?.screenTimeMinutes ?? summary?.avgScreenTime ?? 0)}m
                                        </div>
                                    </div>
                                    <div className="p-4 rounded border border-slate-700/60 bg-slate-900/50">
                                        <div className="text-sm font-mono uppercase text-slate-400">Unlock Count</div>
                                        <div className="text-3xl font-chivo font-bold text-slate-100 mt-2">
                                            {Math.round(records[0]?.unlockCount ?? summary?.avgUnlocks ?? 0)}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded border border-slate-700/60 bg-slate-900/50">
                                        <div className="text-sm font-mono uppercase text-slate-400">Social Usage</div>
                                        <div className="text-3xl font-chivo font-bold text-slate-100 mt-2">
                                            {Math.round(records[0]?.socialMediaMinutes ?? summary?.avgSocialMedia ?? 0)}m
                                        </div>
                                    </div>
                                    <div className="p-4 rounded border border-slate-700/60 bg-slate-900/50">
                                        <div className="text-sm font-mono uppercase text-slate-400">Night Usage</div>
                                        <div className="text-3xl font-chivo font-bold text-slate-100 mt-2">
                                            {Math.round(records[0]?.nightUsageMinutes ?? summary?.avgNightUsage ?? 0)}m
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="card">
                                <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4">Location & Activity Context (Native Sensors)</h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Highly accurate context derived from Android FusedLocationProvider and Activity Recognition APIs.
                                </p>
                                {records.length > 0 ? (
                                    <div className="space-y-3">
                                        {recentRecords.slice(0, 3).map(rec => (
                                            <div key={rec.id} className="p-3 bg-slate-900/30 rounded border border-slate-800">
                                                <div className="text-xs text-blue-400 font-mono mb-2">{formatDateLabel(rec.date)}</div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                                                    <div>Location Context: <span className="text-slate-100">{rec.locationContext ? String(rec.locationContext.dominantZone || 'Heuristic') : 'N/A'}</span></div>
                                                    <div>Activity Context: <span className="text-slate-100">{rec.activityContext ? String(rec.activityContext.currentActivity || 'Stationary') : 'N/A'}</span></div>
                                                    <div>App Categories: <span className="text-slate-100">{rec.appCategoryTimeline ? 'OS Accurate' : 'Fallback Keyword-based'}</span></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500">Wait for background syncs to capture rich sensor data.</div>
                                )}
                            </div>

                            {/* ADVANCED VISUALISATIONS DASHBOARD */}
                            {records.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Top 5 Behavioral Sinks</h3>
                                        <TopAppsBarChart appUsage={recentRecords[0]?.appUsage || null} />
                                    </div>
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Impulsivity Speedometer</h3>
                                        <ReactionSpeedometer 
                                            avgLatencySec={
                                                ((recentRecords[0]?.activityContext as Record<string, unknown>)?.advancedSensors as { avgLatencySec?: number })?.avgLatencySec || 0
                                            } 
                                        />
                                    </div>
                                    <div className="card md:col-span-2">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">24-Hour Intensity Heatmap</h3>
                                        <ScreenTimeHeatmap appUsageTimeline={recentRecords[0]?.appCategoryTimeline || null} peakHour={recentRecords[0]?.peakUsageHour || 14} />
                                    </div>
                                    <div className="card md:col-span-2">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Subconscious Habit Loops</h3>
                                        <HabitFlowchart 
                                            habitSequence={
                                                ((recentRecords[0]?.activityContext as Record<string, unknown>)?.advancedSensors as { habitSequence?: string[] })?.habitSequence || null
                                            } 
                                        />
                                    </div>

                                    {/* ULTIMATE VISUALIZATIONS */}
                                    <div className="card md:col-span-2">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Where & When: The Context Matrix</h3>
                                        <ContextScatterPlot records={recentRecords} />
                                    </div>
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Consistency Radar</h3>
                                        <HabitRadarChart scores={{
                                            screenTime: summary?.avgScreenTime || 0,
                                            unlocks: summary?.avgUnlocks || 0,
                                            social: summary?.avgSocialMedia || 0,
                                            latency: ((recentRecords[0]?.activityContext as Record<string, unknown>)?.advancedSensors as { avgLatencySec?: number })?.avgLatencySec || 15,
                                            night: summary?.avgNightUsage || 0
                                        }} />
                                    </div>
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">The Doomscroll Depth Gauge</h3>
                                        <DoomscrollGauge longestSessionMinutes={Math.max(...recentRecords.map(r => r.longestSessionMinutes || 0), 10)} />
                                    </div>
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Attention Hierarchy</h3>
                                        <CategoryTreemap appUsage={recentRecords[0]?.appUsage || null} />
                                    </div>
                                    <div className="card">
                                        <h3 className="font-chivo font-bold text-sm uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Cause & Effect: Impulsivity vs Duration</h3>
                                        <CauseAndEffectChart records={recentRecords} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
