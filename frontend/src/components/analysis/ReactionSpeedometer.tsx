import React from 'react';
import { Gauge } from '@phosphor-icons/react';

export interface ReactionSpeedometerProps {
    avgLatencySec: number;
}

export function ReactionSpeedometer({ avgLatencySec }: ReactionSpeedometerProps) {
    if (avgLatencySec <= 0) {
        return <div className="text-sm text-slate-500 italic text-center p-4">Not enough notification reaction data.</div>;
    }

    // Determine scale: 0s to 60s
    const maxScale = 60;
    const clampedLatency = Math.min(Math.max(avgLatencySec, 0), maxScale);
    const percentage = 100 - (clampedLatency / maxScale) * 100; // 100% means very fast (high impulsivity)

    let statusLabel = 'Calculated Response';
    let statusColor = 'text-green-400';
    let gradientFrom = 'from-green-500';

    if (avgLatencySec < 10) {
        statusLabel = 'Highly Impulsive';
        statusColor = 'text-red-400';
        gradientFrom = 'from-red-500';
    } else if (avgLatencySec < 20) {
        statusLabel = 'Reflexive Driven';
        statusColor = 'text-orange-400';
        gradientFrom = 'from-orange-500';
    } else if (avgLatencySec < 40) {
        statusLabel = 'Moderate Control';
        statusColor = 'text-yellow-400';
        gradientFrom = 'from-yellow-400';
    }

    return (
        <div className="flex flex-col items-center justify-center py-6 bg-slate-900/40 rounded-lg border border-slate-800/80 drop-shadow-md">
            <div className="relative flex items-center justify-center w-36 h-36">
                {/* SVG Gauge Background */}
                <svg className="absolute w-full h-full transform -rotate-90">
                    <circle cx="72" cy="72" r="60" stroke="currentColor" fill="transparent" strokeWidth="8" className="text-slate-800" strokeDasharray="377" strokeDashoffset="0" />
                    <circle cx="72" cy="72" r="60" stroke="currentColor" fill="transparent" strokeWidth="10" className={`${statusColor} opacity-80 transition-all duration-1000 ease-out`} strokeDasharray="377" strokeDashoffset={377 - (377 * percentage) / 100} strokeLinecap="round" />
                </svg>
                <div className="flex flex-col items-center text-center z-10">
                    <span className={`text-4xl font-chivo font-extrabold bg-clip-text text-transparent bg-gradient-to-br ${gradientFrom} to-slate-200`}>
                        {avgLatencySec}s
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-1">Reaction<br/>Latency</span>
                </div>
            </div>
            
            <div className="mt-4 flex items-center gap-2">
                <Gauge size={16} className={statusColor} />
                <span className={`text-sm font-semibold tracking-wide ${statusColor}`}>{statusLabel}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center max-w-[200px]">
                Time taken to open an app after a notification chimes.
            </p>
        </div>
    );
}
