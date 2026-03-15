import React from 'react';
import { Polygon } from '@phosphor-icons/react';

export interface HabitRadarChartProps {
    scores: {
        screenTime: number;
        unlocks: number;
        social: number;
        latency: number;
        night: number;
    }
}

export function HabitRadarChart({ scores }: HabitRadarChartProps) {
    return (
        <div className="flex flex-col items-center justify-center py-4 relative group">
            <div className="w-48 h-48 relative flex items-center justify-center">
                {/* Background Web */}
                <div className="absolute inset-0 border border-slate-700/50 rounded-full" />
                <div className="absolute inset-4 border border-slate-700/50 rounded-full" />
                <div className="absolute inset-8 border border-slate-700/50 rounded-full opacity-50" />
                
                {/* Render a simulated polygon to represent the "shape" of usage */}
                <svg viewBox="0 0 100 100" className="w-full h-full text-blue-500/30 overflow-visible drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]">
                    <polygon 
                        points={`50,${Math.max(10, 50 - scores.screenTime/10)} ${Math.min(90, 50 + scores.unlocks)} ,40 ${Math.min(90, 50 + scores.social/2)},90 ${Math.max(10, 50 - scores.night/2)},90 10,${Math.max(10, 50 - scores.latency)}`}
                        fill="currentColor" 
                        stroke="rgb(59 130 246)" 
                        strokeWidth="2" 
                        strokeLinejoin="round" 
                        className="transition-all duration-1000 origin-center scale-90"
                    />
                </svg>

                {/* Axis Labels */}
                <span className="absolute -top-1 font-mono text-[9px] text-slate-400 uppercase tracking-widest">Screen</span>
                <span className="absolute -right-3 font-mono text-[9px] text-slate-400 uppercase tracking-widest">Unlocks</span>
                <span className="absolute -bottom-2 right-4 font-mono text-[9px] text-slate-400 uppercase tracking-widest">Social</span>
                <span className="absolute -bottom-2 left-4 font-mono text-[9px] text-slate-400 uppercase tracking-widest">Night</span>
                <span className="absolute -left-3 font-mono text-[9px] text-slate-400 uppercase tracking-widest">Impulse</span>
            </div>
            
            <div className="mt-4 flex items-center gap-2 text-blue-400">
                <Polygon size={16} />
                <span className="text-sm font-semibold tracking-wide">Consistency Pattern</span>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center max-w-[200px]">
                The tighter and more balanced the shape, the healthier your usage.
            </p>
        </div>
    );
}
