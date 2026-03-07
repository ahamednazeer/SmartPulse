import { getPlugin, hasPluginMethod, invokePlugin } from './capacitorBridge';

interface AppStateResult {
    isActive?: boolean;
}

export interface AppStateSnapshot {
    isActive: boolean;
    source: 'capacitor' | 'web';
}

export type AppStateListener = (state: AppStateSnapshot) => void;

export async function getCurrentAppState(): Promise<AppStateSnapshot> {
    if (hasPluginMethod('App', 'getState')) {
        const result = await invokePlugin<AppStateResult>('App', 'getState');
        return {
            isActive: Boolean(result.isActive),
            source: 'capacitor',
        };
    }

    const isActive = typeof document === 'undefined' ? true : !document.hidden;
    return {
        isActive,
        source: 'web',
    };
}

export function subscribeToAppState(listener: AppStateListener): () => void {
    const cleanups: Array<() => void> = [];

    const appPlugin = getPlugin('App');
    if (appPlugin && typeof appPlugin.addListener === 'function') {
        const maybeHandle = (appPlugin.addListener as (event: string, cb: (state: AppStateResult) => void) => unknown)(
            'appStateChange',
            (state: AppStateResult) => {
                listener({
                    isActive: Boolean(state.isActive),
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

    if (typeof document !== 'undefined') {
        const onVisibilityChange = () => {
            listener({
                isActive: !document.hidden,
                source: 'web',
            });
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
    }

    if (typeof window !== 'undefined') {
        const onFocus = () => listener({ isActive: true, source: 'web' });
        const onBlur = () => listener({ isActive: false, source: 'web' });

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        cleanups.push(() => window.removeEventListener('focus', onFocus));
        cleanups.push(() => window.removeEventListener('blur', onBlur));
    }

    return () => {
        cleanups.forEach((cleanup) => cleanup());
    };
}
