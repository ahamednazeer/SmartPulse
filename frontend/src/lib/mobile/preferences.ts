import { hasPluginMethod, invokePlugin } from './capacitorBridge';

interface PreferencesGetResult {
    value?: string | null;
}

const FALLBACK_PREFIX = 'smartpulse_pref_';

function fallbackKey(key: string): string {
    return `${FALLBACK_PREFIX}${key}`;
}

export async function getPreference(key: string): Promise<string | null> {
    if (hasPluginMethod('Preferences', 'get')) {
        const result = await invokePlugin<PreferencesGetResult>('Preferences', 'get', { key });
        return result.value ?? null;
    }

    if (typeof window === 'undefined') {
        return null;
    }

    return localStorage.getItem(fallbackKey(key));
}

export async function setPreference(key: string, value: string): Promise<void> {
    if (hasPluginMethod('Preferences', 'set')) {
        await invokePlugin<void>('Preferences', 'set', { key, value });
        return;
    }

    if (typeof window === 'undefined') {
        return;
    }

    localStorage.setItem(fallbackKey(key), value);
}

export async function removePreference(key: string): Promise<void> {
    if (hasPluginMethod('Preferences', 'remove')) {
        await invokePlugin<void>('Preferences', 'remove', { key });
        return;
    }

    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem(fallbackKey(key));
}

export async function getJsonPreference<T>(
    key: string,
    fallbackValue: T,
): Promise<T> {
    const raw = await getPreference(key);
    if (!raw) {
        return fallbackValue;
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallbackValue;
    }
}

export async function setJsonPreference<T>(key: string, value: T): Promise<void> {
    await setPreference(key, JSON.stringify(value));
}
