import { api } from '@/lib/api';
import { isNativePlatform } from './capacitorBridge';
import {
    getCurrentNetworkStatus,
    type NetworkStatusSnapshot,
} from './network';
import {
    getPreference,
    getJsonPreference,
    setJsonPreference,
    setPreference,
} from './preferences';
import { collectUsageSnapshot, hasUsageAccess } from './usageStats';
import type { UsageUploadRecord } from './types';

const USAGE_BUFFER_KEY = 'usage_buffer_v1';
const LAST_SYNC_KEY = 'usage_last_sync_iso';
const NETWORK_TRACE_KEY = 'usage_network_trace_v1';

export const USAGE_SYNC_INTERVAL_MS = 20 * 60 * 1000;

interface SyncResult {
    collected: boolean;
    uploaded: number;
    reason?: string;
}

interface NetworkTraceEntry {
    ts: number;
    connected: boolean;
    connectionType: string;
}

interface ConnectivitySummary {
    transitionCount: number;
    connectedMinutes: number;
    offlineMinutes: number;
    wifiMinutes: number;
    cellularMinutes: number;
    unknownMinutes: number;
    longestOfflineStreakMinutes: number;
    currentConnectionType: string;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function now(): Date {
    return new Date();
}

function toTraceEntry(status: NetworkStatusSnapshot): NetworkTraceEntry {
    return {
        ts: Date.now(),
        connected: status.connected,
        connectionType: status.connectionType || 'unknown',
    };
}

function minuteDiff(startMs: number, endMs: number): number {
    return Math.max(0, (endMs - startMs) / (60 * 1000));
}

function normalizeConnectionType(connectionType: string): 'wifi' | 'cellular' | 'none' | 'unknown' {
    const normalized = connectionType.toLowerCase();
    if (normalized.includes('wifi')) {
        return 'wifi';
    }

    if (
        normalized.includes('cellular') ||
        normalized.includes('mobile') ||
        normalized.includes('4g') ||
        normalized.includes('5g')
    ) {
        return 'cellular';
    }

    if (normalized.includes('none') || normalized.includes('offline')) {
        return 'none';
    }

    return 'unknown';
}

async function readBuffer(): Promise<UsageUploadRecord[]> {
    return getJsonPreference<UsageUploadRecord[]>(USAGE_BUFFER_KEY, []);
}

async function writeBuffer(records: UsageUploadRecord[]): Promise<void> {
    await setJsonPreference(USAGE_BUFFER_KEY, records);
}

async function enqueueRecord(record: UsageUploadRecord): Promise<void> {
    const buffer = await readBuffer();
    const withoutSameDate = buffer.filter((item) => item.date !== record.date);
    withoutSameDate.push(record);

    withoutSameDate.sort((a, b) => a.date.localeCompare(b.date));
    await writeBuffer(withoutSameDate);
}

async function readNetworkTrace(): Promise<NetworkTraceEntry[]> {
    const trace = await getJsonPreference<unknown[]>(NETWORK_TRACE_KEY, []);
    const result: NetworkTraceEntry[] = [];

    for (const item of trace) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }

        const candidate = item as {
            ts?: unknown;
            connected?: unknown;
            connectionType?: unknown;
        };

        if (
            typeof candidate.ts !== 'number' ||
            !Number.isFinite(candidate.ts) ||
            typeof candidate.connected !== 'boolean' ||
            typeof candidate.connectionType !== 'string'
        ) {
            continue;
        }

        result.push({
            ts: Math.floor(candidate.ts),
            connected: candidate.connected,
            connectionType: candidate.connectionType,
        });
    }

    result.sort((a, b) => a.ts - b.ts);
    return result;
}

async function writeNetworkTrace(entries: NetworkTraceEntry[]): Promise<void> {
    await setJsonPreference(NETWORK_TRACE_KEY, entries);
}

function trimNetworkTrace(entries: NetworkTraceEntry[]): NetworkTraceEntry[] {
    const maxEntries = 1600;
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;

    const filtered = entries.filter((entry) => entry.ts >= cutoff);
    if (filtered.length <= maxEntries) {
        return filtered;
    }

    return filtered.slice(filtered.length - maxEntries);
}

export async function recordNetworkTraceSample(
    status: NetworkStatusSnapshot,
): Promise<void> {
    const trace = await readNetworkTrace();
    const nextEntry = toTraceEntry(status);

    const last = trace[trace.length - 1] ?? null;
    if (
        last &&
        last.connected === nextEntry.connected &&
        last.connectionType === nextEntry.connectionType
    ) {
        // Refresh heartbeat every 5 minutes max, skip noisy duplicate updates.
        if (nextEntry.ts - last.ts < 5 * 60 * 1000) {
            return;
        }
    }

    trace.push(nextEntry);
    await writeNetworkTrace(trimNetworkTrace(trace));
}

async function summarizeConnectivityContext(
    startTimeMs: number,
    endTimeMs: number,
): Promise<ConnectivitySummary> {
    const trace = await readNetworkTrace();
    const currentStatus = await getCurrentNetworkStatus();

    const summary: ConnectivitySummary = {
        transitionCount: 0,
        connectedMinutes: 0,
        offlineMinutes: 0,
        wifiMinutes: 0,
        cellularMinutes: 0,
        unknownMinutes: 0,
        longestOfflineStreakMinutes: 0,
        currentConnectionType: currentStatus.connectionType,
    };

    const inRange = trace.filter((entry) => entry.ts >= startTimeMs && entry.ts <= endTimeMs);

    const latestBeforeStart = [...trace]
        .reverse()
        .find((entry) => entry.ts < startTimeMs) ?? null;

    const stitched: NetworkTraceEntry[] = [];
    if (latestBeforeStart) {
        stitched.push({ ...latestBeforeStart, ts: startTimeMs });
    }

    stitched.push(...inRange);

    if (stitched.length === 0) {
        stitched.push({
            ts: startTimeMs,
            connected: currentStatus.connected,
            connectionType: currentStatus.connectionType,
        });
    }

    let maxOfflineMs = 0;

    for (let i = 0; i < stitched.length; i += 1) {
        const current = stitched[i];
        const next =
            i + 1 < stitched.length
                ? stitched[i + 1]
                : {
                    ts: endTimeMs,
                    connected: currentStatus.connected,
                    connectionType: currentStatus.connectionType,
                };

        const segmentStart = Math.max(startTimeMs, current.ts);
        const segmentEnd = Math.min(endTimeMs, next.ts);
        if (segmentEnd <= segmentStart) {
            continue;
        }

        const minutes = minuteDiff(segmentStart, segmentEnd);

        if (current.connected) {
            summary.connectedMinutes += minutes;
        } else {
            summary.offlineMinutes += minutes;
            maxOfflineMs = Math.max(maxOfflineMs, segmentEnd - segmentStart);
        }

        const bucket = normalizeConnectionType(current.connectionType);
        if (bucket === 'wifi') {
            summary.wifiMinutes += minutes;
        } else if (bucket === 'cellular') {
            summary.cellularMinutes += minutes;
        } else {
            summary.unknownMinutes += minutes;
        }

        if (
            i + 1 < stitched.length &&
            (stitched[i + 1].connected !== current.connected ||
                stitched[i + 1].connectionType !== current.connectionType)
        ) {
            summary.transitionCount += 1;
        }
    }

    summary.connectedMinutes = Math.round(summary.connectedMinutes);
    summary.offlineMinutes = Math.round(summary.offlineMinutes);
    summary.wifiMinutes = Math.round(summary.wifiMinutes);
    summary.cellularMinutes = Math.round(summary.cellularMinutes);
    summary.unknownMinutes = Math.round(summary.unknownMinutes);
    summary.longestOfflineStreakMinutes = Math.round(maxOfflineMs / (60 * 1000));

    return summary;
}

function serializeObject(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    if (Object.keys(value as Record<string, unknown>).length === 0) {
        return undefined;
    }

    return JSON.stringify(value);
}

function serializeArray(value: unknown): string | undefined {
    if (!Array.isArray(value) || value.length === 0) {
        return undefined;
    }

    return JSON.stringify(value);
}

export async function collectTodayUsageRecord(): Promise<UsageUploadRecord | null> {
    if (!isNativePlatform()) {
        return null;
    }

    const usageAccess = await hasUsageAccess();
    if (!usageAccess) {
        return null;
    }

    const today = now();
    const start = startOfDay(today);

    const snapshot = await collectUsageSnapshot(start.getTime(), today.getTime());
    if (!snapshot) {
        return null;
    }

    const connectivitySummary = await summarizeConnectivityContext(
        start.getTime(),
        today.getTime(),
    );

    const mergedConnectivityContext = {
        ...(snapshot.connectivityContext ?? {}),
        ...connectivitySummary,
    };

    return {
        date: formatDate(today),
        screenTimeMinutes: snapshot.screenTimeMinutes,
        unlockCount: snapshot.unlockCount,
        appUsageJson:
            Object.keys(snapshot.appUsage).length > 0
                ? JSON.stringify(snapshot.appUsage)
                : undefined,
        socialMediaMinutes: snapshot.socialMediaMinutes,
        nightUsageMinutes: snapshot.nightUsageMinutes,
        peakUsageHour:
            snapshot.peakUsageHour === null
                ? undefined
                : snapshot.peakUsageHour,
        longestSessionMinutes: snapshot.longestSessionMinutes,
        notificationCount: snapshot.notificationCount,
        appCategoryTimelineJson: serializeObject(snapshot.appCategoryTimeline),
        sessionEventsJson: serializeArray(snapshot.sessionEvents),
        notificationInteractionJson: serializeObject(snapshot.notificationInteraction),
        sleepProxyJson: serializeObject(snapshot.sleepProxies),
        activityContextJson: serializeObject(snapshot.activityContext),
        batteryContextJson: serializeObject(snapshot.batteryContext),
        connectivityContextJson: serializeObject(mergedConnectivityContext),
        locationContextJson: serializeObject(snapshot.locationContext),
    };
}

export async function flushUsageBuffer(): Promise<{
    uploaded: number;
    reason?: string;
}> {
    const token = api.getToken();
    if (!token) {
        return { uploaded: 0, reason: 'No authenticated user token' };
    }

    const networkStatus = await getCurrentNetworkStatus();
    await recordNetworkTraceSample(networkStatus);

    if (!networkStatus.connected) {
        return { uploaded: 0, reason: 'Device is offline' };
    }

    const buffer = await readBuffer();
    if (buffer.length === 0) {
        return { uploaded: 0, reason: 'No buffered records' };
    }

    await api.submitUsageBatch(buffer);
    await writeBuffer([]);

    const syncedAt = new Date().toISOString();
    await setPreference(LAST_SYNC_KEY, syncedAt);

    return { uploaded: buffer.length };
}

export async function runUsageSyncCycle(): Promise<SyncResult> {
    if (!isNativePlatform()) {
        return {
            collected: false,
            uploaded: 0,
            reason: 'Not running on a native platform',
        };
    }

    const status = await getCurrentNetworkStatus();
    await recordNetworkTraceSample(status);

    let collected = false;
    const record = await collectTodayUsageRecord();
    if (record) {
        collected = true;
        await enqueueRecord(record);
    }

    const flushResult = await flushUsageBuffer();

    return {
        collected,
        uploaded: flushResult.uploaded,
        reason: flushResult.reason,
    };
}

export async function getLastUsageSyncTime(): Promise<string | null> {
    return getPreference(LAST_SYNC_KEY);
}
