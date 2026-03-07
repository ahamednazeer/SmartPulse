'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPermissionsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/permissions');
    }, [router]);

    return null;
}
