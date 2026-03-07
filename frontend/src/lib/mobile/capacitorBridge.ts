export type PluginArgs = unknown[];

interface CapacitorPlugin {
    [method: string]: unknown;
}

interface CapacitorBridge {
    Plugins?: Record<string, CapacitorPlugin>;
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
}

function getBridge(): CapacitorBridge | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor ?? null;
}

export function isNativePlatform(): boolean {
    const bridge = getBridge();
    if (!bridge) {
        return false;
    }

    if (typeof bridge.isNativePlatform === 'function') {
        return Boolean(bridge.isNativePlatform());
    }

    if (typeof bridge.getPlatform === 'function') {
        return bridge.getPlatform() !== 'web';
    }

    return false;
}

export function getPlatform(): string {
    const bridge = getBridge();
    if (!bridge) {
        return 'web';
    }

    if (typeof bridge.getPlatform === 'function') {
        return bridge.getPlatform();
    }

    return isNativePlatform() ? 'native' : 'web';
}

export function hasPluginMethod(pluginName: string, method: string): boolean {
    const bridge = getBridge();
    const plugin = bridge?.Plugins?.[pluginName];
    if (!plugin) {
        return false;
    }

    return typeof plugin[method] === 'function';
}

export function getPlugin(pluginName: string): CapacitorPlugin | null {
    const bridge = getBridge();
    return bridge?.Plugins?.[pluginName] ?? null;
}

export async function invokePlugin<T>(
    pluginName: string,
    method: string,
    ...args: PluginArgs
): Promise<T> {
    const plugin = getPlugin(pluginName);
    if (!plugin) {
        throw new Error(`Capacitor plugin '${pluginName}' is unavailable`);
    }

    const pluginMethod = plugin[method];
    if (typeof pluginMethod !== 'function') {
        throw new Error(`Capacitor plugin method '${pluginName}.${method}' is unavailable`);
    }

    const result = (pluginMethod as (...params: PluginArgs) => unknown)(...args);
    return (await Promise.resolve(result)) as T;
}
