import { isNativePlatform } from '@/lib/mobile/capacitorBridge';
import { getPreference, removePreference, setPreference } from '@/lib/mobile/preferences';
import { CapacitorHttp } from '@capacitor/core';

function isCapacitorLocalhostRuntime(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const { protocol, hostname, port } = window.location;
    const bridge = (window as unknown as {
        Capacitor?: {
            getPlatform?: () => string;
        };
    }).Capacitor;
    const platform =
        bridge && typeof bridge.getPlatform === 'function'
            ? bridge.getPlatform()
            : 'web';

    return (
        protocol === 'https:' &&
        hostname === 'localhost' &&
        port === '' &&
        platform !== 'web'
    );
}

function isNativeLikeRuntime(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return isNativePlatform() || isCapacitorLocalhostRuntime();
}

function getRawApiBase(): string {
    const browserDefault = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const mobileOverride = process.env.NEXT_PUBLIC_API_URL_MOBILE?.trim();

    if (typeof window !== 'undefined' && mobileOverride) {
        if (isNativeLikeRuntime()) {
            return mobileOverride;
        }
    }

    return browserDefault;
}

function normalizeApiBase(rawBase: string): string {
    const trimmed = rawBase.trim();
    const fallback = 'http://localhost:3001/api';
    if (!trimmed) {
        return fallback;
    }

    try {
        const url = new URL(trimmed);
        const inBrowser = typeof window !== 'undefined';
        const nativeRuntime = inBrowser && isNativePlatform();
        const isLocalHost =
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1' ||
            url.hostname === '0.0.0.0';

        if (inBrowser && url.hostname === '0.0.0.0') {
            url.hostname = window.location.hostname || 'localhost';
        }

        if (
            inBrowser &&
            !nativeRuntime &&
            window.location.protocol === 'https:' &&
            url.protocol === 'http:' &&
            isLocalHost
        ) {
            // Prevent mixed-content calls when frontend is loaded via HTTPS localhost.
            url.protocol = 'https:';
        }

        return url.toString().replace(/\/$/, '');
    } catch {
        return fallback;
    }
}

export interface PermissionSettings {
    screenUsageMonitoring: boolean;
    appUsageStatistics: boolean;
    notificationAccess: boolean;
    backgroundActivityTracking: boolean;
    locationTracking: boolean;
}

export interface UserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName?: string | null;
    avatar?: string | null;
    role: string;
    permissionsConfigured: boolean;
    createdAt: string;
    permission?: PermissionSettings | null;
}

export interface ActiveInterventionState {
    id: string;
    startedAt: number;
    endsAt: number;
}

export interface BehaviorSyncState {
    actionTracker: Record<string, boolean>;
    completedDates: string[];
    activeIntervention: ActiveInterventionState | null;
    updatedAt: string;
}

export interface AuthResponse {
    user: UserProfile;
    token: string;
}

export interface SurveyResponse {
    id: string;
    createdAt: string;
    [key: string]: unknown;
}

export interface UsageRecord {
    id: string;
    date: string;
    screenTimeMinutes: number;
    unlockCount: number;
    appUsage: Record<string, number> | null;
    socialMediaMinutes: number;
    nightUsageMinutes: number;
    peakUsageHour: number | null;
    longestSessionMinutes: number;
    notificationCount: number;
    appCategoryTimeline: Record<string, unknown> | null;
    sessionEvents: unknown[] | null;
    notificationInteraction: Record<string, unknown> | null;
    sleepProxies: Record<string, unknown> | null;
    activityContext: Record<string, unknown> | null;
    batteryContext: Record<string, unknown> | null;
    connectivityContext: Record<string, unknown> | null;
    locationContext: Record<string, unknown> | null;
    microCheckins: unknown[] | null;
    interventionOutcomes: unknown[] | null;
    createdAt: string;
}

export interface UsageSummary {
    totalDays: number;
    avgScreenTime: number;
    avgUnlocks: number;
    avgSocialMedia: number;
    avgNightUsage: number;
    totalRecords: number;
}

export interface PredictionResult {
    id: string;
    date: string;
    riskScore: number;
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    randomForestScore: number;
    extraTreesScore: number;
    svmScore: number;
    featureVector: Record<string, unknown> | null;
    insights: string[];
    modelWeights?: {
        randomForest: number;
        extraTrees: number;
        svm: number;
    };
    createdAt: string;
    updatedAt: string;
}

export interface RiskAnalysis {
    generatedAt: string;
    riskScore: number;
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    patterns: Array<{
        key: string;
        severity: 'LOW' | 'MODERATE' | 'HIGH';
        message: string;
        value: number;
        threshold: number;
    }>;
    insights: string[];
    aiInsight?: string | null;
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

export interface RecommendationResponse {
    generatedAt: string;
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    recommendations: Array<{
        id: string;
        title: string;
        description: string;
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
        category: 'SCREEN_TIME' | 'NIGHT_USAGE' | 'SOCIAL_MEDIA' | 'WELLBEING';
    }>;
}

export interface NotificationRecord {
    id: string;
    date: string;
    type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    isRead: boolean;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export interface AnalyticsDashboardResponse {
    generatedAt: string;
    usageDashboard: {
        currentDailyScreenTime: number;
        weeklyAverageScreenTime: number;
        weeklyAverageUnlocks: number;
        weeklyAverageNightUsage: number;
    };
    trends: {
        usageTrend: Array<{
            date: string;
            screenTimeMinutes: number;
            unlockCount: number;
            socialMediaMinutes: number;
            nightUsageMinutes: number;
        }>;
        riskTrend: Array<{
            date: string;
            riskScore: number;
            riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
        }>;
    };
    risk: {
        score: number;
        level: 'LOW' | 'MODERATE' | 'HIGH';
        date: string;
    } | null;
    latestSurvey: Record<string, unknown> | null;
    featureScores: {
        addictionBehaviorScore: number;
        psychologicalStressScore: number;
        sleepDisruptionScore: number;
        socialMediaDependencyScore: number;
    };
    notifications: {
        unreadCount: number;
    };
}

export interface PredictionTrainingSummary {
    trainedAt: string;
    dataset: {
        totalSamples: number;
        trainSamples: number;
        validationSamples: number;
        testSamples: number;
        classDistribution: {
            LOW: number;
            MODERATE: number;
            HIGH: number;
        };
    };
    split: {
        trainRatio: number;
        validationRatio: number;
        testRatio: number;
    };
    bestWeights: {
        randomForest: number;
        extraTrees: number;
        svm: number;
    };
    validationMetrics: {
        accuracy: number;
        precision: number;
        recall: number;
        f1Score: number;
        rocAuc: number;
    };
    testMetrics: {
        accuracy: number;
        precision: number;
        recall: number;
        f1Score: number;
        rocAuc: number;
    };
    crossValidationF1: number;
    gridSearch: Array<{
        weights: {
            randomForest: number;
            extraTrees: number;
            svm: number;
        };
        validationF1: number;
    }>;
    notes: string[];
}

export interface GroundTruthLabelRecord {
    id: string;
    date: string;
    label: 'LOW' | 'MODERATE' | 'HIGH';
    source: string;
    confidence: number | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ModelMonitoringResponse {
    generatedAt: string;
    evaluationWindowDays: number;
    evaluatedSampleCount: number;
    calibration: {
        brierScore: number;
        expectedCalibrationError: number;
        bins: Array<{
            binStart: number;
            binEnd: number;
            count: number;
            avgPredictedHighProbability: number;
            observedHighRate: number;
        }>;
    };
    backtest: {
        windowMetrics: Array<{
            windowDays: number;
            sampleCount: number;
            metrics: {
                accuracy: number;
                precision: number;
                recall: number;
                f1Score: number;
                rocAuc: number;
            };
        }>;
    };
    drift: {
        flaggedFeatures: string[];
        featureShift: Record<string, number>;
    };
    fairnessAudit: {
        segments: Array<{
            segment: string;
            sampleCount: number;
            accuracy: number;
            falsePositiveRate: number;
            falseNegativeRate: number;
            predictedHighRate: number;
            observedHighRate: number;
        }>;
        maxAccuracyGap: number;
        maxFalsePositiveRateGap: number;
    };
}

class ApiClient {
    private token: string | null = null;
    private readonly tokenKey = 'smartpulse_token';
    private readonly apiBaseKey = 'smartpulse_api_base';

    constructor() {
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem(this.tokenKey);
        }
        if (typeof window !== 'undefined' && isNativePlatform()) {
            void getPreference(this.tokenKey)
                .then((value) => {
                    if (!value || this.token) {
                        return;
                    }
                    this.token = value;
                    localStorage.setItem(this.tokenKey, value);
                })
                .catch(() => {
                    // Ignore preference hydration failures.
                });
        }
    }

    getToken(): string | null {
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem(this.tokenKey);
        }
        return this.token;
    }

    setToken(token: string) {
        this.token = token;
        if (typeof window !== 'undefined') {
            localStorage.setItem(this.tokenKey, token);
        }
        if (typeof window !== 'undefined' && isNativePlatform()) {
            void setPreference(this.tokenKey, token);
        }
    }

    clearToken() {
        this.token = null;
        if (typeof window !== 'undefined') {
            localStorage.removeItem(this.tokenKey);
        }
        if (typeof window !== 'undefined' && isNativePlatform()) {
            void removePreference(this.tokenKey);
        }
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
    ): Promise<T> {
        const apiBase = normalizeApiBase(getRawApiBase());
        const requestUrl = `${apiBase}${endpoint}`;
        if (typeof window !== 'undefined' && isNativePlatform()) {
            void setPreference(this.apiBaseKey, apiBase);
        }
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        if (isNativeLikeRuntime()) {
            const method = (options.method || 'GET').toUpperCase();
            let data: unknown = undefined;
            if (typeof options.body === 'string' && options.body.length > 0) {
                try {
                    data = JSON.parse(options.body);
                } catch {
                    data = options.body;
                }
            }

            const response = await CapacitorHttp.request({
                url: requestUrl,
                method,
                headers,
                data,
            });

            if (response.status < 200 || response.status >= 300) {
                const dataObject =
                    response.data && typeof response.data === 'object'
                        ? (response.data as { message?: string })
                        : {};
                const dataMessage =
                    typeof response.data === 'string' ? response.data : undefined;
                throw new Error(
                    dataObject.message ||
                    dataMessage ||
                    `Request failed with status ${response.status}`,
                );
            }

            if (typeof response.data === 'string') {
                try {
                    return JSON.parse(response.data) as T;
                } catch {
                    return response.data as T;
                }
            }

            return response.data as T;
        }

        const response = await fetch(requestUrl, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorData = (await response
                .json()
                .catch(() => ({}))) as { message?: string };
            throw new Error(
                errorData.message || `Request failed with status ${response.status}`,
            );
        }

        return response.json();
    }

    // Auth endpoints
    async register(data: {
        email: string;
        firstName: string;
        lastName?: string;
        password: string;
    }) {
        const result = await this.request<AuthResponse>('/auth/register', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        this.setToken(result.token);
        return result;
    }

    async login(email: string, password: string) {
        const result = await this.request<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        this.setToken(result.token);
        return result;
    }

    // User endpoints
    async getMe() {
        return this.request<UserProfile>('/user/me');
    }

    async updateProfile(data: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
    }) {
        return this.request<UserProfile>('/user/profile', {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async changePassword(currentPassword: string, newPassword: string) {
        return this.request<{ message: string }>('/user/password', {
            method: 'PATCH',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
    }

    // Permission endpoints
    async getPermissions() {
        return this.request<PermissionSettings>('/user/permissions');
    }

    async updatePermissions(data: {
        screenUsageMonitoring?: boolean;
        appUsageStatistics?: boolean;
        notificationAccess?: boolean;
        backgroundActivityTracking?: boolean;
    }) {
        return this.request<PermissionSettings>('/user/permissions', {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async getBehaviorSync() {
        return this.request<BehaviorSyncState>('/user/behavior-sync');
    }

    async updateBehaviorSync(data: {
        actionTracker?: Record<string, boolean>;
        completedDates?: string[];
        activeIntervention?: ActiveInterventionState | null;
    }) {
        return this.request<BehaviorSyncState>('/user/behavior-sync', {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    // Survey endpoints
    async createSurvey(data: {
        stressLevel: number;
        anxietyLevel: number;
        depressionLevel: number;
        sleepQuality: number;
        sleepHours: number;
        socialInteraction: number;
        dailyProductivity: number;
        phoneDependence: number;
        mood: number;
        notes?: string;
    }) {
        return this.request<SurveyResponse>('/survey', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async getSurveys(limit = 20) {
        return this.request<SurveyResponse[]>(`/survey?limit=${limit}`);
    }

    async getLatestSurvey() {
        return this.request<SurveyResponse>('/survey/latest');
    }

    // Usage endpoints
    async submitUsageRecord(data: {
        date: string;
        screenTimeMinutes: number;
        unlockCount: number;
        appUsageJson?: string;
        socialMediaMinutes?: number;
        nightUsageMinutes?: number;
        peakUsageHour?: number;
        longestSessionMinutes?: number;
        notificationCount?: number;
        appCategoryTimelineJson?: string;
        sessionEventsJson?: string;
        notificationInteractionJson?: string;
        sleepProxyJson?: string;
        activityContextJson?: string;
        batteryContextJson?: string;
        connectivityContextJson?: string;
        locationContextJson?: string;
        microCheckinsJson?: string;
        interventionOutcomesJson?: string;
    }) {
        return this.request<UsageRecord>('/usage', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async submitUsageBatch(records: Array<{
        date: string;
        screenTimeMinutes: number;
        unlockCount: number;
        appUsageJson?: string;
        socialMediaMinutes?: number;
        nightUsageMinutes?: number;
        peakUsageHour?: number;
        longestSessionMinutes?: number;
        notificationCount?: number;
        appCategoryTimelineJson?: string;
        sessionEventsJson?: string;
        notificationInteractionJson?: string;
        sleepProxyJson?: string;
        activityContextJson?: string;
        batteryContextJson?: string;
        connectivityContextJson?: string;
        locationContextJson?: string;
        microCheckinsJson?: string;
        interventionOutcomesJson?: string;
    }>) {
        return this.request<UsageRecord[]>('/usage/batch', {
            method: 'POST',
            body: JSON.stringify({ records }),
        });
    }

    async submitMicroCheckin(data: {
        date?: string;
        mood: number;
        craving: number;
        stress?: number;
        focus?: number;
        note?: string;
    }) {
        return this.request<UsageRecord>('/usage/micro-checkin', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async submitInterventionEvent(data: {
        date?: string;
        interventionId: string;
        title: string;
        eventType: 'STARTED' | 'STOPPED' | 'COMPLETED';
        startedAt?: number;
        endedAt?: number;
        durationMinutes?: number;
    }) {
        return this.request<UsageRecord>('/usage/intervention-event', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async getUsageRecords(days = 30) {
        return this.request<UsageRecord[]>(`/usage?days=${days}`);
    }

    async getUsageSummary() {
        return this.request<UsageSummary>('/usage/summary');
    }

    // Prediction module endpoints
    async runPrediction() {
        return this.request<PredictionResult>('/prediction/run', {
            method: 'POST',
        });
    }

    async trainPredictionModel() {
        return this.request<PredictionTrainingSummary>('/prediction/train', {
            method: 'POST',
        });
    }

    async getLatestPrediction() {
        return this.request<PredictionResult | null>('/prediction/latest');
    }

    async getPredictionHistory(limit = 30) {
        return this.request<PredictionResult[]>(`/prediction/history?limit=${limit}`);
    }

    async getPredictionMonitoring(days = 90) {
        return this.request<ModelMonitoringResponse>(
            `/prediction/monitor?days=${days}`,
        );
    }

    async getPredictionTrainingSummary() {
        return this.request<PredictionTrainingSummary | null>(
            '/prediction/training-summary',
        );
    }

    // Risk analysis endpoints
    async getRiskAnalysis() {
        return this.request<RiskAnalysis>('/risk-analysis/latest');
    }

    // Recommendation endpoints
    async getRecommendations() {
        return this.request<RecommendationResponse>('/recommendation/latest');
    }

    // Notification endpoints
    async evaluateNotifications() {
        return this.request<{
            date: string;
            createdCount: number;
            notifications: NotificationRecord[];
        }>('/notification/evaluate', {
            method: 'POST',
        });
    }

    async getNotifications(limit = 30) {
        return this.request<NotificationRecord[]>(`/notification?limit=${limit}`);
    }

    async getUnreadNotificationCount() {
        return this.request<{ unreadCount: number }>('/notification/unread-count');
    }

    async markNotificationRead(id: string) {
        return this.request<NotificationRecord>(`/notification/${id}/read`, {
            method: 'PATCH',
        });
    }

    // Analytics/reporting endpoints
    async getAnalyticsDashboard() {
        return this.request<AnalyticsDashboardResponse>('/analytics/dashboard');
    }

    async getResearchExport(days = 30) {
        return this.request<Record<string, unknown>>(
            `/analytics/research-export?days=${days}`,
        );
    }

    async upsertGroundTruthLabel(data: {
        date?: string;
        label: 'LOW' | 'MODERATE' | 'HIGH';
        source?: string;
        confidence?: number;
        notes?: string;
    }) {
        return this.request<GroundTruthLabelRecord>('/ground-truth/label', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async getGroundTruthLabels(limit = 90) {
        return this.request<GroundTruthLabelRecord[]>(
            `/ground-truth?limit=${limit}`,
        );
    }

    async getLatestGroundTruthLabel() {
        return this.request<GroundTruthLabelRecord | null>('/ground-truth/latest');
    }
}

export const api = new ApiClient();
