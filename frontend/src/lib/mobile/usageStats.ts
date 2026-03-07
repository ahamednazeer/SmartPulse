import { hasPluginMethod, invokePlugin } from './capacitorBridge';
import type { UsageSnapshot } from './types';

const SMARTPULSE_USAGE_PLUGIN = 'SmartPulseUsage';

interface UsageAccessResult {
    granted?: boolean;
}

interface SnapshotResult {
    snapshot?: Partial<UsageSnapshot> | null;
}

interface BatteryOptimizationResult {
    ignoring?: boolean;
    available?: boolean;
}

function normalizeUsageSnapshot(input: Partial<UsageSnapshot>): UsageSnapshot {
    return {
        screenTimeMinutes: Number(input.screenTimeMinutes ?? 0),
        unlockCount: Number(input.unlockCount ?? 0),
        appUsage: input.appUsage ?? {},
        socialMediaMinutes: Number(input.socialMediaMinutes ?? 0),
        nightUsageMinutes: Number(input.nightUsageMinutes ?? 0),
        peakUsageHour:
            input.peakUsageHour === null || input.peakUsageHour === undefined
                ? null
                : Number(input.peakUsageHour),
        longestSessionMinutes: Number(input.longestSessionMinutes ?? 0),
        notificationCount: Number(input.notificationCount ?? 0),
        appCategoryTimeline:
            input.appCategoryTimeline &&
                typeof input.appCategoryTimeline === 'object' &&
                !Array.isArray(input.appCategoryTimeline)
                ? input.appCategoryTimeline
                : {},
        sessionEvents: Array.isArray(input.sessionEvents)
            ? input.sessionEvents
            : [],
        notificationInteraction:
            input.notificationInteraction &&
                typeof input.notificationInteraction === 'object' &&
                !Array.isArray(input.notificationInteraction)
                ? input.notificationInteraction
                : {},
        sleepProxies:
            input.sleepProxies &&
                typeof input.sleepProxies === 'object' &&
                !Array.isArray(input.sleepProxies)
                ? input.sleepProxies
                : {},
        activityContext:
            input.activityContext &&
                typeof input.activityContext === 'object' &&
                !Array.isArray(input.activityContext)
                ? input.activityContext
                : {},
        batteryContext:
            input.batteryContext &&
                typeof input.batteryContext === 'object' &&
                !Array.isArray(input.batteryContext)
                ? input.batteryContext
                : {},
        connectivityContext:
            input.connectivityContext &&
                typeof input.connectivityContext === 'object' &&
                !Array.isArray(input.connectivityContext)
                ? input.connectivityContext
                : {},
        locationContext:
            input.locationContext &&
                typeof input.locationContext === 'object' &&
                !Array.isArray(input.locationContext)
                ? input.locationContext
                : {},
    };
}

export async function hasUsageAccess(): Promise<boolean> {
    if (!hasPluginMethod(SMARTPULSE_USAGE_PLUGIN, 'checkUsageAccess')) {
        return false;
    }

    const result = await invokePlugin<UsageAccessResult>(
        SMARTPULSE_USAGE_PLUGIN,
        'checkUsageAccess',
    );

    return Boolean(result.granted);
}

export async function openUsageAccessSettings(): Promise<boolean> {
    if (!hasPluginMethod(SMARTPULSE_USAGE_PLUGIN, 'openUsageAccessSettings')) {
        return false;
    }

    await invokePlugin<void>(SMARTPULSE_USAGE_PLUGIN, 'openUsageAccessSettings');
    return true;
}

export async function collectUsageSnapshot(
    startTimeMs: number,
    endTimeMs: number,
): Promise<UsageSnapshot | null> {
    if (!hasPluginMethod(SMARTPULSE_USAGE_PLUGIN, 'collectUsageSnapshot')) {
        return null;
    }

    const result = await invokePlugin<SnapshotResult>(
        SMARTPULSE_USAGE_PLUGIN,
        'collectUsageSnapshot',
        {
            startTimeMs,
            endTimeMs,
        },
    );

    if (!result.snapshot) {
        return null;
    }

    return normalizeUsageSnapshot(result.snapshot);
}

export async function checkBatteryOptimizationState(): Promise<{
    available: boolean;
    ignoring: boolean;
}> {
    if (!hasPluginMethod(SMARTPULSE_USAGE_PLUGIN, 'checkBatteryOptimization')) {
        return {
            available: false,
            ignoring: false,
        };
    }

    const result = await invokePlugin<BatteryOptimizationResult>(
        SMARTPULSE_USAGE_PLUGIN,
        'checkBatteryOptimization',
    );

    return {
        available: Boolean(result.available),
        ignoring: Boolean(result.ignoring),
    };
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
    if (
        !hasPluginMethod(
            SMARTPULSE_USAGE_PLUGIN,
            'openBatteryOptimizationSettings',
        )
    ) {
        return false;
    }

    await invokePlugin<void>(
        SMARTPULSE_USAGE_PLUGIN,
        'openBatteryOptimizationSettings',
    );
    return true;
}
