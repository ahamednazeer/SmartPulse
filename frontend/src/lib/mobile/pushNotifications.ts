import { getPlatform, hasPluginMethod, invokePlugin } from './capacitorBridge';

interface PushPermissionResult {
    display?: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
    receive?: 'granted' | 'denied' | 'prompt';
}

export interface PushPermissionState {
    granted: boolean;
    source: 'capacitor' | 'web';
    reason?: string;
}

export interface LocalAlertNotification {
    id: string;
    title: string;
    message: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

const LOCAL_ALERT_CHANNEL_ID = 'smartpulse-alerts';
let channelSetupPromise: Promise<void> | null = null;

function isNotificationPermissionGranted(result: PushPermissionResult): boolean {
    return result.display === 'granted' || result.receive === 'granted';
}

function toStableNotificationId(sourceId: string): number {
    let hash = 0;
    for (let i = 0; i < sourceId.length; i += 1) {
        hash = (hash << 5) - hash + sourceId.charCodeAt(i);
        hash |= 0;
    }

    const positiveHash = Math.abs(hash);
    return (positiveHash % 2_000_000_000) + 1;
}

async function ensureAndroidLocalChannel(): Promise<void> {
    if (getPlatform() !== 'android') {
        return;
    }

    if (!hasPluginMethod('LocalNotifications', 'createChannel')) {
        return;
    }

    if (channelSetupPromise) {
        await channelSetupPromise;
        return;
    }

    channelSetupPromise = (async () => {
        try {
            await invokePlugin<void>('LocalNotifications', 'createChannel', {
                id: LOCAL_ALERT_CHANNEL_ID,
                name: 'SmartPulse Alerts',
                description: 'Behavior risk and daily usage alerts from SmartPulse',
                importance: 5,
                visibility: 1,
            });
        } catch {
            // Ignore channel creation errors; app can still attempt default channel delivery.
        }
    })();

    await channelSetupPromise;
}

export async function checkPushPermission(): Promise<PushPermissionState> {
    if (!hasPluginMethod('LocalNotifications', 'checkPermissions')) {
        if (typeof Notification !== 'undefined') {
            return {
                granted: Notification.permission === 'granted',
                source: 'web',
                reason:
                    Notification.permission === 'granted'
                        ? undefined
                        : 'Browser notification permission is not granted',
            };
        }

        return {
            granted: false,
            source: 'web',
            reason: 'Local notifications are unavailable on this platform',
        };
    }

    const permissions = await invokePlugin<PushPermissionResult>(
        'LocalNotifications',
        'checkPermissions',
    );

    return {
        granted: isNotificationPermissionGranted(permissions),
        source: 'capacitor',
        reason:
            isNotificationPermissionGranted(permissions)
                ? undefined
                : 'Notification permission not granted',
    };
}

export async function requestPushPermission(): Promise<PushPermissionState> {
    if (hasPluginMethod('LocalNotifications', 'requestPermissions')) {
        const permissions = await invokePlugin<PushPermissionResult>(
            'LocalNotifications',
            'requestPermissions',
        );

        if (!isNotificationPermissionGranted(permissions)) {
            return {
                granted: false,
                source: 'capacitor',
                reason: 'Notification permission not granted',
            };
        }

        await ensureAndroidLocalChannel();
        return {
            granted: true,
            source: 'capacitor',
        };
    }

    if (typeof Notification === 'undefined') {
        return {
            granted: false,
            source: 'web',
            reason: 'Local notifications are unavailable on this platform',
        };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return {
            granted: false,
            source: 'web',
            reason: 'Notification permission not granted',
        };
    }

    return {
        granted: true,
        source: 'web',
    };
}

export async function sendLocalAlertNotification(
    input: LocalAlertNotification,
): Promise<boolean> {
    if (!hasPluginMethod('LocalNotifications', 'schedule')) {
        return false;
    }

    const permission = await checkPushPermission();
    if (!permission.granted) {
        return false;
    }

    await ensureAndroidLocalChannel();

    try {
        await invokePlugin<void>('LocalNotifications', 'schedule', {
            notifications: [
                {
                    id: toStableNotificationId(input.id),
                    title: input.title.trim() || 'SmartPulse Alert',
                    body: input.message.trim(),
                    channelId: getPlatform() === 'android' ? LOCAL_ALERT_CHANNEL_ID : undefined,
                    schedule: {
                        at: new Date(Date.now() + 250),
                    },
                    extra: {
                        id: input.id,
                        severity: input.severity,
                    },
                },
            ],
        });
        return true;
    } catch {
        return false;
    }
}
