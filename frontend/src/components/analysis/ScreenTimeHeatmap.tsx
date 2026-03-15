import React from 'react';

export interface ScreenTimeHeatmapProps {
    appUsageTimeline: Record<string, unknown> | null; 
    // Fallback if full timeline is unavailable
    peakHour: number | null;
}

export function ScreenTimeHeatmap({ appUsageTimeline, peakHour }: ScreenTimeHeatmapProps) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    // Simulate a heatmap distribution around the peak hour to demonstrate the UI 
    // since we might not have millisecond-granular historical data for all hours yet
    const getIntensity = (hour: number) => {
        if (!appUsageTimeline && peakHour !== null) {
            const distance = Math.min(Math.abs(hour - peakHour), 24 - Math.abs(hour - peakHour));
            if (distance === 0) return 4;
            if (distance <= 2) return 3;
            if (distance <= 4) return 2;
            if (distance <= 8) return 1;
            return 0;
        }
        return 0; // default empty
    };

    const colors = [
        'bg-slate-800/40', // 0
        'bg-indigo-900/60', // 1
        'bg-indigo-600/80', // 2
        'bg-blue-500', // 3
        'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]' // 4 (Hot)
    ];

    return (
        <div className="py-4">
            <div className="flex items-end gap-1 overflow-x-auto pb-4 hide-scrollbar">
                {hours.map(hour => {
                    const intensity = getIntensity(hour);
                    const isFocus = intensity >= 3;
                    return (
                        <div key={hour} className="flex flex-col items-center flex-1 min-w-[12px] group">
                            <div 
                                className={`w-full rounded-sm transition-all duration-300 ${colors[intensity]} hover:bg-blue-300`} 
                                style={{ height: `${(intensity + 1) * 12}px` }} 
                            />
                            <span className={`text-[9px] mt-2 font-mono transition-colors ${isFocus ? 'text-blue-300 font-bold' : 'text-slate-600'}`}>
                                {hour === 0 ? '12A' : hour === 12 ? '12P' : hour > 12 ? `${hour - 12}P` : `${hour}A`}
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center text-xs mt-2 px-1">
                <span className="text-slate-500">Midnight</span>
                <span className="text-slate-500">Noon</span>
                <span className="text-slate-500">Midnight</span>
            </div>
        </div>
    );
}
