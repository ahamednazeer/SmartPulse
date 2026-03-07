'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NativeSetupDashboardPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/permissions');
    }, [router]);

    return null;
}
