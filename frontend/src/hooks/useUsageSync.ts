'use client';

import { useEffect, useRef } from 'react';
import { subscribeToAppState } from '@/lib/mobile/appState';
import {
    getCurrentNetworkStatus,
    subscribeToNetworkStatus,
} from '@/lib/mobile/network';
import {
    recordNetworkTraceSample,
    runUsageSyncCycle,
    USAGE_SYNC_INTERVAL_MS,
} from '@/lib/mobile/usageSync';

export function useUsageSync(enabled: boolean): void {
    const inFlightRef = useRef(false);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return;
        }

        let disposed = false;

        const runCycle = async () => {
            if (disposed || inFlightRef.current) {
                return;
            }

            inFlightRef.current = true;
            try {
                await runUsageSyncCycle();
            } catch (error) {
                console.error('Usage sync cycle failed', error);
            } finally {
                inFlightRef.current = false;
            }
        };

        void runCycle();

        void getCurrentNetworkStatus()
            .then((status) => recordNetworkTraceSample(status))
            .catch((error) => {
                console.error('Failed to read initial network status', error);
            });

        const intervalId = window.setInterval(() => {
            void runCycle();
        }, USAGE_SYNC_INTERVAL_MS);

        const unsubscribeAppState = subscribeToAppState((state) => {
            if (state.isActive) {
                void runCycle();
            }
        });

        const unsubscribeNetwork = subscribeToNetworkStatus((status) => {
            void recordNetworkTraceSample(status).catch((error) => {
                console.error('Failed to store network transition', error);
            });
        });

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            unsubscribeAppState();
            unsubscribeNetwork();
        };
    }, [enabled]);
}
