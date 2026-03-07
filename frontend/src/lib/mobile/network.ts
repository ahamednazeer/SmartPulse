import { getPlugin, hasPluginMethod, invokePlugin } from './capacitorBridge';

interface NetworkStatusResult {
    connected?: boolean;
    connectionType?: string;
}

export interface NetworkStatusSnapshot {
    connected: boolean;
    connectionType: string;
    source: 'capacitor' | 'web';
}

export type NetworkStatusListener = (status: NetworkStatusSnapshot) => void;

export async function getCurrentNetworkStatus(): Promise<NetworkStatusSnapshot> {
    if (hasPluginMethod('Network', 'getStatus')) {
        const result = await invokePlugin<NetworkStatusResult>('Network', 'getStatus');
        return {
            connected: Boolean(result.connected),
            connectionType: result.connectionType ?? 'unknown',
            source: 'capacitor',
        };
    }

    return {
        connected: typeof navigator === 'undefined' ? true : navigator.onLine,
        connectionType: 'unknown',
        source: 'web',
    };
}

export function subscribeToNetworkStatus(listener: NetworkStatusListener): () => void {
    const cleanups: Array<() => void> = [];

    const networkPlugin = getPlugin('Network');
    if (networkPlugin && typeof networkPlugin.addListener === 'function') {
        const maybeHandle = (networkPlugin.addListener as (event: string, cb: (status: NetworkStatusResult) => void) => unknown)(
            'networkStatusChange',
            (status: NetworkStatusResult) => {
                listener({
                    connected: Boolean(status.connected),
                    connectionType: status.connectionType ?? 'unknown',
                    source: 'capacitor',
                });
            },
        );

        Promise.resolve(maybeHandle)
            .then((handle) => {
                if (handle && typeof (handle as { remove?: unknown }).remove === 'function') {
                    cleanups.push(() => {
                        const remove = (handle as { remove: () => Promise<void> | void }).remove;
                        void remove();
                    });
                }
            })
            .catch(() => {
                // Ignore listener registration errors and rely on browser events.
            });
    }

    if (typeof window !== 'undefined') {
        const onOnline = () =>
            listener({
                connected: true,
                connectionType: 'unknown',
                source: 'web',
            });

        const onOffline = () =>
            listener({
                connected: false,
                connectionType: 'none',
                source: 'web',
            });

        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        cleanups.push(() => window.removeEventListener('online', onOnline));
        cleanups.push(() => window.removeEventListener('offline', onOffline));
    }

    return () => {
        cleanups.forEach((cleanup) => cleanup());
    };
}
