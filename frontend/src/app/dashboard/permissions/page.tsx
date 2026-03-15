'use client';

import React, { useState, useEffect } from 'react';
import {
    DeviceMobile,
    ChartBar,
    BellRinging,
    Pulse,
    CheckCircle,
    ShieldCheck,
    MapPin,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import type { PermissionSettings } from '@/lib/api';
import { isNativePlatform } from '@/lib/mobile/capacitorBridge';
import {
    readCachedPermissionState,
    writeCachedPermissionState,
} from '@/lib/mobile/permissionState';
import { ensureNativePermission } from '@/lib/mobile/permissions';
import { checkPushPermission } from '@/lib/mobile/pushNotifications';
import { hasUsageAccess } from '@/lib/mobile/usageStats';
import NativeSetupChecklist from '@/components/NativeSetupChecklist';
import { toast } from 'sonner';

interface PermissionItem {
    key: string;
    icon: React.ElementType;
    title: string;
    description: string;
    field: 'screenUsageMonitoring' | 'appUsageStatistics' | 'notificationAccess' | 'backgroundActivityTracking' | 'locationTracking';
}

const permissionItems: PermissionItem[] = [
    {
        key: 'screen',
        icon: DeviceMobile,
        title: 'Screen Usage Monitoring',
        description: 'Track screen-on time and usage patterns.',
        field: 'screenUsageMonitoring',
    },
    {
        key: 'app',
        icon: ChartBar,
        title: 'App Usage Statistics',
        description: 'Collect data on app usage duration and frequency.',
        field: 'appUsageStatistics',
    },
    {
        key: 'notification',
        icon: BellRinging,
        title: 'Notification Access',
        description: 'Allow local risk alerts and summary reminders.',
        field: 'notificationAccess',
    },
    {
        key: 'background',
        icon: Pulse,
        title: 'Background Activity Tracking',
        description: 'Track background activities and phone unlock patterns.',
        field: 'backgroundActivityTracking',
    },
    {
        key: 'location',
        icon: MapPin,
        title: 'Location Context Tracking',
        description: 'Collect context on what environments trigger heavy usage.',
        field: 'locationTracking',
    },
];

const DEFAULT_PERMISSIONS: PermissionSettings = {
    screenUsageMonitoring: false,
    appUsageStatistics: false,
    notificationAccess: false,
    backgroundActivityTracking: false,
    locationTracking: false,
};

function combinePermissionSources(
    first: PermissionSettings | null,
    second: PermissionSettings | null,
): PermissionSettings {
    return {
        screenUsageMonitoring:
            Boolean(first?.screenUsageMonitoring) ||
            Boolean(second?.screenUsageMonitoring),
        appUsageStatistics:
            Boolean(first?.appUsageStatistics) ||
            Boolean(second?.appUsageStatistics),
        notificationAccess:
            Boolean(first?.notificationAccess) ||
            Boolean(second?.notificationAccess),
        backgroundActivityTracking:
            Boolean(first?.backgroundActivityTracking) ||
            Boolean(second?.backgroundActivityTracking),
        locationTracking:
            Boolean(first?.locationTracking) ||
            Boolean(second?.locationTracking),
    };
}

function mergeWithNativePermissionState(
    base: PermissionSettings,
    usageGranted: boolean,
    notificationGranted: boolean,
): PermissionSettings {
    const next = { ...base };

    if (usageGranted) {
        next.screenUsageMonitoring = true;
        next.appUsageStatistics = true;
        next.backgroundActivityTracking = true;
    }

    if (notificationGranted) {
        next.notificationAccess = true;
    }

    return next;
}

function hasPermissionDifference(
    left: PermissionSettings,
    right: PermissionSettings,
): boolean {
    return (
        left.screenUsageMonitoring !== right.screenUsageMonitoring ||
        left.appUsageStatistics !== right.appUsageStatistics ||
        left.notificationAccess !== right.notificationAccess ||
        left.backgroundActivityTracking !== right.backgroundActivityTracking
    );
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export default function PermissionsPage() {
    const native = isNativePlatform();
    const cachedPermissionState = readCachedPermissionState();
    const [permissions, setPermissions] = useState<PermissionSettings>(
        cachedPermissionState ?? DEFAULT_PERMISSIONS,
    );
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pendingField, setPendingField] = useState<PermissionItem['field'] | null>(null);

    useEffect(() => {
        async function fetchPermissions() {
            try {
                const cached = readCachedPermissionState();
                const server = await api.getPermissions().catch(() => null);
                const basePermissions = combinePermissionSources(
                    server ?? DEFAULT_PERMISSIONS,
                    cached ?? DEFAULT_PERMISSIONS,
                );

                let resolvedPermissions = basePermissions;

                if (native) {
                    const [usageGranted, notificationPermission] = await Promise.all([
                        hasUsageAccess().catch(() => false),
                        checkPushPermission().catch(() => ({
                            granted: false,
                            source: 'capacitor' as const,
                        })),
                    ]);

                    resolvedPermissions = mergeWithNativePermissionState(
                        basePermissions,
                        usageGranted,
                        notificationPermission.granted,
                    );
                }

                setPermissions(resolvedPermissions);
                writeCachedPermissionState(resolvedPermissions);

                if (server && hasPermissionDifference(server, resolvedPermissions)) {
                    const updated = await api.updatePermissions(resolvedPermissions);
                    setPermissions(updated);
                    writeCachedPermissionState(updated);
                }
            } catch (error) {
                const fallback = readCachedPermissionState();
                if (fallback) {
                    setPermissions(fallback);
                    writeCachedPermissionState(fallback);
                }
                console.error('Failed to fetch permissions', error);
                toast.error('Unable to sync permissions from server. Showing saved local state.');
            } finally {
                setLoading(false);
            }
        }
        void fetchPermissions();
    }, [native]);

    const togglePermission = async (field: PermissionItem['field']) => {
        const currentValue = permissions[field];
        if (!currentValue) {
            setPendingField(field);
            try {
                const permissionResult = await ensureNativePermission(field);
                if (!permissionResult.granted) {
                    toast.info(
                        permissionResult.message ??
                        'Permission must be enabled in Android settings before turning this on.',
                    );
                    return;
                }
            } finally {
                setPendingField(null);
            }
        }

        const newPermissions = {
            ...permissions,
            [field]: !currentValue,
        };
        setPermissions(newPermissions);
        writeCachedPermissionState(newPermissions);
        setSaving(true);
        try {
            const persisted = await api.updatePermissions({
                [field]: newPermissions[field],
            });
            setPermissions(persisted);
            writeCachedPermissionState(persisted);
            toast.success('Permission updated');
        } catch (error: unknown) {
            // Revert on failure
            setPermissions((prev) => {
                const reverted = {
                    ...prev,
                    [field]: !prev[field as keyof typeof prev],
                };
                writeCachedPermissionState(reverted);
                return reverted;
            });
            toast.error(getErrorMessage(error, 'Failed to update permission'));
        } finally {
            setSaving(false);
        }
    };

    const enabledCount = Object.values(permissions).filter(Boolean).length;

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="card animate-shimmer h-20" />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-5 animate-slide-up">
            {/* Header */}
            <div className="card border-blue-800/40 bg-gradient-to-r from-blue-950/40 to-slate-800/40">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="p-3 rounded-sm bg-blue-600/20">
                        <ShieldCheck size={32} weight="duotone" className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-chivo font-bold text-base sm:text-lg uppercase tracking-wider">
                            Permission Management
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            Control which data SmartPulse can collect from your device.
                        </p>
                    </div>
                    <div className="text-left sm:text-right">
                        <div className="text-2xl font-chivo font-bold text-blue-400">{enabledCount}/4</div>
                        <div className="text-xs font-mono text-slate-500 uppercase">Enabled</div>
                    </div>
                </div>
            </div>

            {/* Permission Toggle Cards */}
            <div className="space-y-3">
                {permissionItems.map((item) => {
                    const Icon = item.icon;
                    const isEnabled = permissions[item.field];
                    return (
                        <button
                            key={item.key}
                            onClick={() => void togglePermission(item.field)}
                            disabled={saving || pendingField !== null}
                            className={`w-full text-left p-4 rounded-sm border transition-all duration-200 ${isEnabled
                                ? 'bg-blue-950/30 border-blue-700/60 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                                : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-500'
                                } disabled:opacity-50`}
                        >
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div
                                    className={`p-2.5 rounded-sm transition-colors ${isEnabled ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-700/50 text-slate-400'
                                        }`}
                                >
                                    <Icon size={24} weight="duotone" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-chivo font-bold text-sm uppercase tracking-wider">
                                        {item.title}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isEnabled && (
                                        <CheckCircle size={16} weight="fill" className="text-blue-400" />
                                    )}
                                    <div
                                        className={`toggle-switch ${isEnabled ? 'toggle-switch-on' : 'toggle-switch-off'}`}
                                    >
                                        <span
                                            className={`toggle-knob ${isEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            {native && (
                <NativeSetupChecklist showBackAction={false} />
            )}
        </div>
    );
}
