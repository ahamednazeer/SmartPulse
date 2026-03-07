'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DeviceMobile,
    BellRinging,
    BatteryCharging,
    ArrowClockwise,
    CheckCircle,
    Warning,
    ArrowRight,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { isNativePlatform } from '@/lib/mobile/capacitorBridge';
import { checkPushPermission, requestPushPermission } from '@/lib/mobile/pushNotifications';
import {
    checkBatteryOptimizationState,
    hasUsageAccess,
    openBatteryOptimizationSettings,
    openUsageAccessSettings,
} from '@/lib/mobile/usageStats';
import { useRouter } from 'next/navigation';

interface NativeChecklistStatus {
    usageAccess: boolean;
    notificationAccess: boolean;
    batteryOptimizationExempt: boolean | null;
    batteryStatusAvailable: boolean;
}

interface NativeSetupChecklistProps {
    backPath?: string;
    backLabel?: string;
    showBackAction?: boolean;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export default function NativeSetupChecklist({
    backPath,
    backLabel,
    showBackAction = true,
}: NativeSetupChecklistProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<NativeChecklistStatus>({
        usageAccess: false,
        notificationAccess: false,
        batteryOptimizationExempt: null,
        batteryStatusAvailable: false,
    });
    const [actionBusy, setActionBusy] = useState(false);

    const native = isNativePlatform();

    const refreshStatus = useCallback(async () => {
        if (!native) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [usage, notification, battery] = await Promise.all([
                hasUsageAccess(),
                checkPushPermission(),
                checkBatteryOptimizationState(),
            ]);

            setStatus({
                usageAccess: usage,
                notificationAccess: notification.granted,
                batteryOptimizationExempt: battery.available ? battery.ignoring : null,
                batteryStatusAvailable: battery.available,
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to refresh native permission status'));
        } finally {
            setLoading(false);
        }
    }, [native]);

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    const completedRequired = useMemo(() => {
        return Number(status.usageAccess) + Number(status.notificationAccess);
    }, [status]);

    const totalRequired = 2;

    const runAction = async (action: () => Promise<void>) => {
        setActionBusy(true);
        try {
            await action();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Action failed'));
        } finally {
            setActionBusy(false);
        }
    };

    if (!native) {
        return (
            <div className="card max-w-2xl mx-auto">
                <h3 className="font-chivo font-bold text-lg uppercase tracking-wider mb-2">
                    Native Setup Checklist
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                    This checklist is available only in the Android Capacitor app.
                </p>
                {showBackAction && backPath && backLabel && (
                    <button
                        onClick={() => router.push(backPath)}
                        className="btn-primary flex items-center gap-2"
                    >
                        {backLabel}
                        <ArrowRight size={16} />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-5">
            <div className="card border-blue-800/40 bg-gradient-to-r from-blue-950/40 to-slate-800/40">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="font-chivo font-bold text-base sm:text-lg uppercase tracking-wider">
                            Native Setup Checklist
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                            Complete Android permissions before enabling SmartPulse tracking toggles.
                        </p>
                    </div>
                    <button
                        onClick={() => void refreshStatus()}
                        disabled={loading || actionBusy}
                        className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2"
                    >
                        <ArrowClockwise size={16} />
                        Refresh
                    </button>
                </div>
                <div className="mt-4 text-xs font-mono uppercase tracking-wider text-slate-400">
                    Required steps complete: {completedRequired}/{totalRequired}
                </div>
            </div>

            <div className="space-y-3">
                <div className="card border-slate-700/70">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-sm bg-blue-600/20 text-blue-400">
                            <DeviceMobile size={20} weight="duotone" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <div>
                                    <h4 className="font-chivo font-bold text-sm uppercase tracking-wider">
                                        Usage Access (Required)
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Required for screen time, app usage, unlock count, and background tracking.
                                    </p>
                                </div>
                                {status.usageAccess ? (
                                    <span className="text-xs font-mono uppercase text-green-400 flex items-center gap-1">
                                        <CheckCircle size={14} weight="fill" /> Enabled
                                    </span>
                                ) : (
                                    <span className="text-xs font-mono uppercase text-yellow-400 flex items-center gap-1">
                                        <Warning size={14} /> Missing
                                    </span>
                                )}
                            </div>
                            <div className="mt-3">
                                <button
                                    onClick={() =>
                                        void runAction(async () => {
                                            const opened = await openUsageAccessSettings();
                                            if (!opened) {
                                                toast.error('Usage settings shortcut is unavailable in this build');
                                                return;
                                            }
                                            toast.info('Enable Usage Access for SmartPulse, then return and tap Refresh');
                                        })
                                    }
                                    disabled={actionBusy}
                                    className="btn-secondary w-full sm:w-auto"
                                >
                                    Open Usage Access Settings
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card border-slate-700/70">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-sm bg-blue-600/20 text-blue-400">
                            <BellRinging size={20} weight="duotone" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <div>
                                    <h4 className="font-chivo font-bold text-sm uppercase tracking-wider">
                                        Notification Permission (Required)
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Needed for usage alerts, risk notifications, and daily summaries.
                                    </p>
                                </div>
                                {status.notificationAccess ? (
                                    <span className="text-xs font-mono uppercase text-green-400 flex items-center gap-1">
                                        <CheckCircle size={14} weight="fill" /> Enabled
                                    </span>
                                ) : (
                                    <span className="text-xs font-mono uppercase text-yellow-400 flex items-center gap-1">
                                        <Warning size={14} /> Missing
                                    </span>
                                )}
                            </div>
                            <div className="mt-3">
                                <button
                                    onClick={() =>
                                        void runAction(async () => {
                                            const result = await requestPushPermission();
                                            if (!result.granted) {
                                                toast.error(result.reason ?? 'Notification permission not granted');
                                                return;
                                            }
                                            toast.success('Notification permission enabled');
                                            await refreshStatus();
                                        })
                                    }
                                    disabled={actionBusy}
                                    className="btn-secondary w-full sm:w-auto"
                                >
                                    Request Notification Permission
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card border-slate-700/70">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-sm bg-blue-600/20 text-blue-400">
                            <BatteryCharging size={20} weight="duotone" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <div>
                                    <h4 className="font-chivo font-bold text-sm uppercase tracking-wider">
                                        Battery Optimization Exemption (Recommended)
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Helps keep 6-hour sync stable when app is idle in background.
                                    </p>
                                </div>
                                {status.batteryStatusAvailable ? (
                                    status.batteryOptimizationExempt ? (
                                        <span className="text-xs font-mono uppercase text-green-400 flex items-center gap-1">
                                            <CheckCircle size={14} weight="fill" /> Exempt
                                        </span>
                                    ) : (
                                        <span className="text-xs font-mono uppercase text-yellow-400 flex items-center gap-1">
                                            <Warning size={14} /> Restricted
                                        </span>
                                    )
                                ) : (
                                    <span className="text-xs font-mono uppercase text-slate-500">Unknown</span>
                                )}
                            </div>
                            <div className="mt-3">
                                <button
                                    onClick={() =>
                                        void runAction(async () => {
                                            const opened = await openBatteryOptimizationSettings();
                                            if (!opened) {
                                                toast.error('Battery settings shortcut is unavailable in this build');
                                                return;
                                            }
                                            toast.info('Disable battery restrictions for SmartPulse, then tap Refresh');
                                        })
                                    }
                                    disabled={actionBusy}
                                    className="btn-secondary w-full sm:w-auto"
                                >
                                    Open Battery Settings
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {showBackAction && backPath && backLabel && (
                    <button
                        onClick={() => router.push(backPath)}
                        className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                    >
                        {backLabel}
                        <ArrowRight size={16} />
                    </button>
                )}
                <button
                    onClick={() => void refreshStatus()}
                    disabled={loading || actionBusy}
                    className="btn-secondary w-full sm:w-auto"
                >
                    Re-check Now
                </button>
            </div>
        </div>
    );
}
