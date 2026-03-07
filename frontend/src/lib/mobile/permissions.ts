import { isNativePlatform } from './capacitorBridge';
import { requestPushPermission } from './pushNotifications';
import { hasUsageAccess, openUsageAccessSettings } from './usageStats';
import type { SmartPulsePermissionField } from './types';

export interface PermissionCheckResult {
    granted: boolean;
    message?: string;
}

export async function ensureNativePermission(
    field: SmartPulsePermissionField,
): Promise<PermissionCheckResult> {
    if (!isNativePlatform()) {
        return { granted: true };
    }

    if (
        field === 'screenUsageMonitoring' ||
        field === 'appUsageStatistics' ||
        field === 'backgroundActivityTracking'
    ) {
        const hasAccess = await hasUsageAccess();
        if (hasAccess) {
            return { granted: true };
        }

        const settingsOpened = await openUsageAccessSettings();
        return {
            granted: false,
            message: settingsOpened
                ? 'Enable Usage Access for SmartPulse in Android settings, then return and toggle again.'
                : 'Usage Access plugin is unavailable on this device build.',
        };
    }

    if (field === 'notificationAccess') {
        const permission = await requestPushPermission();
        return {
            granted: permission.granted,
            message: permission.granted
                ? undefined
                : permission.reason ?? 'Notification permission was not granted.',
        };
    }

    return { granted: true };
}
