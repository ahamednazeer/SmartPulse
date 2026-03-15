import React from 'react';

export interface TopAppsBarChartProps {
    appUsage: Record<string, number> | null;
}

export function TopAppsBarChart({ appUsage }: TopAppsBarChartProps) {
    if (!appUsage || Object.keys(appUsage).length === 0) {
        return <div className="text-sm text-slate-500 italic p-4 text-center">No app usage data available for chart.</div>;
    }

    const sortedApps = Object.entries(appUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const maxTime = Math.max(...sortedApps.map(a => a[1]), 1);

    return (
        <div className="flex flex-col gap-3">
            {sortedApps.map(([app, minutes]) => {
                const percentage = Math.max((minutes / maxTime) * 100, 2);
                return (
                    <div key={app} className="relative group">
                        <div className="flex justify-between items-end mb-1 text-xs px-1">
                            <span className="font-semibold text-slate-200 truncate pr-2">{app}</span>
                            <span className="font-mono text-blue-400 whitespace-nowrap">{minutes} min</span>
                        </div>
                        <div className="h-4 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50">
                            <div
                                className="h-full bg-gradient-to-r from-blue-600 to-indigo-400 rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
