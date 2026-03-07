'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NativeSetupPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/setup-permissions');
    }, [router]);

    return null;
}
