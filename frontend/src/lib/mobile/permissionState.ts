import type { PermissionSettings } from '@/lib/api';

const PERMISSION_CACHE_KEY = 'smartpulse_permission_state_v1';

function hasWindow(): boolean {
    return typeof window !== 'undefined';
}

function isPermissionSettings(value: unknown): value is PermissionSettings {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.screenUsageMonitoring === 'boolean' &&
        typeof candidate.appUsageStatistics === 'boolean' &&
        typeof candidate.notificationAccess === 'boolean' &&
        typeof candidate.backgroundActivityTracking === 'boolean'
    );
}

export function readCachedPermissionState(): PermissionSettings | null {
    if (!hasWindow()) {
        return null;
    }

    const raw = window.localStorage.getItem(PERMISSION_CACHE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isPermissionSettings(parsed)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeCachedPermissionState(value: PermissionSettings): void {
    if (!hasWindow()) {
        return;
    }

    window.localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(value));
}
