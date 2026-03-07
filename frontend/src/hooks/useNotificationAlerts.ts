'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { NotificationRecord } from '@/lib/api';
import { subscribeToAppState } from '@/lib/mobile/appState';
import { getCurrentNetworkStatus } from '@/lib/mobile/network';
import {
    sendLocalAlertNotification,
} from '@/lib/mobile/pushNotifications';
import { getJsonPreference, setJsonPreference } from '@/lib/mobile/preferences';

const ALERT_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const SHOWN_ALERT_IDS_KEY = 'alert_shown_ids_v1';
const MAX_STORED_ALERT_IDS = 250;

function sortByCreatedAt(notifications: NotificationRecord[]): NotificationRecord[] {
    return [...notifications].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime;
    });
}

function showInAppAlert(notification: NotificationRecord): void {
    const toastOptions = {
        description: notification.message,
        duration: notification.severity === 'CRITICAL' ? 12_000 : 8_000,
    };

    if (notification.severity === 'CRITICAL') {
        toast.error(notification.title, toastOptions);
        return;
    }

    if (notification.severity === 'WARNING') {
        toast.warning(notification.title, toastOptions);
        return;
    }

    toast(notification.title, toastOptions);
}

async function loadShownAlertIds(): Promise<Set<string>> {
    const rawIds = await getJsonPreference<unknown[]>(SHOWN_ALERT_IDS_KEY, []);
    const filteredIds = rawIds.filter((item): item is string => typeof item === 'string');
    return new Set(filteredIds);
}

async function persistShownAlertIds(ids: Set<string>): Promise<void> {
    const values = Array.from(ids);
    const start = Math.max(values.length - MAX_STORED_ALERT_IDS, 0);
    await setJsonPreference(SHOWN_ALERT_IDS_KEY, values.slice(start));
}

export function useNotificationAlerts(enabled: boolean): void {
    const inFlightRef = useRef(false);
    const initializedRef = useRef(false);
    const shownIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return;
        }

        let disposed = false;

        const handleNewNotifications = async (
            notifications: NotificationRecord[],
        ): Promise<void> => {
            let hasUpdates = false;
            const ordered = sortByCreatedAt(notifications);

            for (const notification of ordered) {
                if (shownIdsRef.current.has(notification.id)) {
                    continue;
                }

                shownIdsRef.current.add(notification.id);
                hasUpdates = true;

                showInAppAlert(notification);
                await sendLocalAlertNotification({
                    id: notification.id,
                    title: notification.title,
                    message: notification.message,
                    severity: notification.severity,
                });
            }

            if (hasUpdates) {
                await persistShownAlertIds(shownIdsRef.current);
            }
        };

        const runAlertCycle = async (): Promise<void> => {
            if (disposed || inFlightRef.current || !initializedRef.current) {
                return;
            }

            if (!api.getToken()) {
                return;
            }

            inFlightRef.current = true;
            try {
                const networkStatus = await getCurrentNetworkStatus();
                if (!networkStatus.connected) {
                    return;
                }

                const result = await api.evaluateNotifications();
                if (result.notifications.length === 0) {
                    return;
                }

                await handleNewNotifications(result.notifications);
            } catch (error) {
                console.error('Notification alert cycle failed', error);
            } finally {
                inFlightRef.current = false;
            }
        };

        const bootstrap = async (): Promise<void> => {
            shownIdsRef.current = await loadShownAlertIds();
            initializedRef.current = true;
            await runAlertCycle();
        };

        void bootstrap();

        const intervalId = window.setInterval(() => {
            void runAlertCycle();
        }, ALERT_SYNC_INTERVAL_MS);

        const unsubscribeAppState = subscribeToAppState((state) => {
            if (state.isActive) {
                void runAlertCycle();
            }
        });

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            unsubscribeAppState();
        };
    }, [enabled]);
}
