export type SmartPulsePermissionField =
    | 'screenUsageMonitoring'
    | 'appUsageStatistics'
    | 'notificationAccess'
    | 'backgroundActivityTracking';

export interface UsageSnapshot {
    screenTimeMinutes: number;
    unlockCount: number;
    appUsage: Record<string, number>;
    socialMediaMinutes: number;
    nightUsageMinutes: number;
    peakUsageHour: number | null;
    longestSessionMinutes: number;
    notificationCount: number;
    appCategoryTimeline: Record<string, unknown>;
    sessionEvents: unknown[];
    notificationInteraction: Record<string, unknown>;
    sleepProxies: Record<string, unknown>;
    activityContext: Record<string, unknown>;
    batteryContext: Record<string, unknown>;
    connectivityContext: Record<string, unknown>;
    locationContext: Record<string, unknown>;
}

export interface UsageUploadRecord {
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
}
