'use client';

import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { UserProfile } from '@/lib/api';
import { useUsageSync } from '@/hooks/useUsageSync';
import { useNotificationAlerts } from '@/hooks/useNotificationAlerts';
import {
    Heartbeat,
    SignOut,
    UserCircle,
    List,
    ShieldCheck,
    ChartLineUp,
    ChartBar,
    ListChecks,
    Brain,
} from '@phosphor-icons/react';

interface MenuItem {
    icon: React.ElementType;
    label: string;
    path: string;
}

interface DashboardLayoutProps {
    children: ReactNode;
}

const MIN_WIDTH = 60;
const COLLAPSED_WIDTH = 64;
const DEFAULT_WIDTH = 220;
const MAX_WIDTH = 320;

const menuItems: MenuItem[] = [
    { icon: ChartLineUp, label: 'Risk Overview', path: '/dashboard/analysis' },
    { icon: ChartBar, label: 'Trends', path: '/dashboard/analysis/trends' },
    { icon: ListChecks, label: 'Actions', path: '/dashboard/analysis/actions' },
    { icon: Brain, label: 'Model Ops', path: '/dashboard/analysis/model-ops' },
    { icon: ShieldCheck, label: 'Permissions', path: '/dashboard/permissions' },
    { icon: UserCircle, label: 'Profile', path: '/dashboard/profile' },
];

function resolveCurrentMenu(pathname: string): MenuItem {
    const active = menuItems
        .filter(
            (item) =>
                pathname === item.path || pathname.startsWith(`${item.path}/`),
        )
        .sort((left, right) => right.path.length - left.path.length);

    return active[0] ?? menuItems[0];
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const [isHidden, setIsHidden] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    useUsageSync(Boolean(user));
    useNotificationAlerts(Boolean(user));

    useEffect(() => {
        const savedWidth = localStorage.getItem('sp_sidebarWidth');
        const savedHidden = localStorage.getItem('sp_sidebarHidden');

        if (savedWidth) {
            const parsedWidth = Number.parseInt(savedWidth, 10);
            if (Number.isFinite(parsedWidth)) {
                setSidebarWidth(Math.min(MAX_WIDTH, Math.max(COLLAPSED_WIDTH, parsedWidth)));
            }
        }

        if (savedHidden === 'true') {
            setIsHidden(true);
        }
    }, []);

    useEffect(() => {
        if (!isResizing) {
            localStorage.setItem('sp_sidebarWidth', sidebarWidth.toString());
            localStorage.setItem('sp_sidebarHidden', isHidden.toString());
        }
    }, [sidebarWidth, isHidden, isResizing]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (e: MouseEvent) => {
            if (isResizing && sidebarRef.current) {
                const newWidth = e.clientX;
                if (newWidth < MIN_WIDTH) {
                    setIsHidden(true);
                    setSidebarWidth(COLLAPSED_WIDTH);
                } else {
                    setIsHidden(false);
                    const clampedWidth = Math.min(MAX_WIDTH, Math.max(COLLAPSED_WIDTH, newWidth));
                    setSidebarWidth(clampedWidth);
                }
            }
        },
        [isResizing],
    );

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    useEffect(() => {
        async function checkAuth() {
            try {
                const userData = await api.getMe();
                setUser(userData);
            } catch (error) {
                console.error('Auth check failed', error);
                router.replace('/');
            } finally {
                setLoading(false);
            }
        }

        void checkAuth();
    }, [router]);

    const handleLogout = () => {
        api.clearToken();
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Heartbeat size={48} className="text-blue-500 animate-pulse mx-auto" />
                    <div className="text-slate-500 font-mono text-sm animate-pulse">
                        VERIFYING CREDENTIALS...
                    </div>
                </div>
            </div>
        );
    }

    const name = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'User';
    const email = user?.email || 'user@smartpulse.io';
    const isCollapsed = sidebarWidth < 150;
    const showLabels = sidebarWidth >= 150 && !isHidden;

    const currentMenu = resolveCurrentMenu(pathname);

    return (
        <div className="min-h-screen bg-slate-950">
            <div className="scanlines hidden lg:block" />

            <div className="min-h-screen xl:flex">
                <aside
                    ref={sidebarRef}
                    className={`print:hidden hidden xl:flex bg-slate-900 border-r border-slate-800 h-screen sticky top-0 flex-col z-50 transition-all ${isResizing ? 'transition-none' : 'duration-200'
                        } ${isHidden ? 'w-0 overflow-hidden border-0' : ''}`}
                    style={{ width: isHidden ? 0 : sidebarWidth }}
                >
                    <div
                        className={`p-4 border-b border-slate-800 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}
                    >
                        <Heartbeat size={28} weight="duotone" className="text-blue-400 flex-shrink-0" />
                        {showLabels && (
                            <div className="overflow-hidden">
                                <h1 className="font-chivo font-bold text-sm uppercase tracking-wider whitespace-nowrap">
                                    SmartPulse
                                </h1>
                                <p className="text-xs text-slate-500 font-mono">MONITOR</p>
                            </div>
                        )}
                    </div>

                    <nav className="flex-1 p-2 overflow-y-auto overflow-x-hidden">
                        <ul className="space-y-1">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = currentMenu.path === item.path;
                                return (
                                    <li key={item.path}>
                                        <button
                                            onClick={() => router.push(item.path)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all duration-150 text-sm font-medium ${isCollapsed ? 'justify-center' : ''
                                                } ${isActive
                                                    ? 'text-blue-400 bg-blue-950/50 border-l-2 border-blue-400'
                                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                                                }`}
                                            title={isCollapsed ? item.label : undefined}
                                        >
                                            <Icon size={20} weight="duotone" className="flex-shrink-0" />
                                            {showLabels && <span className="truncate">{item.label}</span>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    <div className="p-2 border-t border-slate-800">
                        <button
                            onClick={handleLogout}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-sm transition-all duration-150 text-sm font-medium ${isCollapsed ? 'justify-center' : ''
                                }`}
                            title={isCollapsed ? 'Sign Out' : undefined}
                        >
                            <SignOut size={20} className="flex-shrink-0" />
                            {showLabels && 'Sign Out'}
                        </button>
                    </div>

                    <div
                        className="absolute right-0 top-0 h-full w-1 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-50"
                        onMouseDown={startResizing}
                        style={{ transform: 'translateX(50%)' }}
                    />
                </aside>

                <main className="relative z-10 flex-1 overflow-x-hidden pb-[calc(4.6rem+env(safe-area-inset-bottom))] xl:pb-0">
                    <div className="print:hidden sticky top-0 z-40 backdrop-blur-md bg-slate-950/90 border-b border-slate-700 pt-[env(safe-area-inset-top,0px)]">
                        <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
                            <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                <Heartbeat
                                    size={22}
                                    weight="duotone"
                                    className="text-blue-400 flex-shrink-0 md:hidden"
                                />
                                {isHidden && (
                                    <button
                                        onClick={() => {
                                            setIsHidden(false);
                                            setSidebarWidth(DEFAULT_WIDTH);
                                        }}
                                        className="hidden xl:inline-flex p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                        title="Show Sidebar"
                                    >
                                        <List size={24} />
                                    </button>
                                )}
                                <div className="min-w-0">
                                    <h2 className="font-chivo font-bold text-base sm:text-lg md:text-xl uppercase tracking-wider truncate">
                                        {currentMenu.label}
                                    </h2>
                                    <p className="text-[11px] md:text-xs text-slate-400 font-mono mt-1 truncate">
                                        Welcome back, {name}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 md:gap-4">
                                <div className="text-right hidden lg:block">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">
                                        Logged in as
                                    </p>
                                    <p className="text-sm font-mono text-slate-300">{email}</p>
                                </div>
                                <button
                                    onClick={() => router.push('/dashboard/profile')}
                                    className="h-9 w-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg overflow-hidden"
                                    title="View Profile"
                                >
                                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                                        {name?.charAt(0).toUpperCase() || 'U'}
                                    </div>
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="xl:hidden h-9 w-9 rounded-full flex items-center justify-center text-red-300 hover:text-red-200 hover:bg-red-950/40 transition-colors"
                                    title="Sign Out"
                                >
                                    <SignOut size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-4 sm:px-5 md:p-6">{children}</div>
                </main>
            </div>

            <nav className="xl:hidden fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-950/95 backdrop-blur-xl">
                <ul
                    className="grid gap-1 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)]"
                    style={{ gridTemplateColumns: `repeat(${menuItems.length}, minmax(0, 1fr))` }}
                >
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentMenu.path === item.path;
                        return (
                            <li key={item.path}>
                                <button
                                    onClick={() => router.push(item.path)}
                                    className={`w-full h-14 rounded-sm flex flex-col items-center justify-center gap-1 transition-all ${isActive
                                        ? 'text-blue-400 bg-blue-950/40'
                                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                                        }`}
                                >
                                    <Icon size={18} weight={isActive ? 'fill' : 'duotone'} />
                                    <span className="text-[10px] font-mono uppercase tracking-wide">
                                        {item.label.split(' ')[0]}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {isResizing && (
                <div className="fixed inset-0 z-[100] hidden xl:block cursor-ew-resize" />
            )}
        </div>
    );
}
