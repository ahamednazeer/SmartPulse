import React from 'react';
import { Anchor } from '@phosphor-icons/react';

export interface DoomscrollGaugeProps {
    longestSessionMinutes: number;
}

export function DoomscrollGauge({ longestSessionMinutes }: DoomscrollGaugeProps) {

    // Determine Depth
    let depthLevel = 'Surface';
    let depthColor = 'bg-blue-400';
    let depthBg = 'from-blue-500/30 to-blue-900/30';
    let textColor = 'text-blue-300';
    let percentage = 0;

    if (longestSessionMinutes <= 15) {
        depthLevel = 'Surface (Safe)';
        depthColor = 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]';
        depthBg = 'from-cyan-900/30 to-blue-900/30';
        textColor = 'text-cyan-300';
        percentage = Math.max((longestSessionMinutes / 15) * 33, 5);
    } else if (longestSessionMinutes <= 45) {
        depthLevel = 'Twilight Zone (Warning)';
        depthColor = 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]';
        depthBg = 'from-blue-900/40 to-indigo-950/60';
        textColor = 'text-indigo-300';
        percentage = 33 + ((longestSessionMinutes - 15) / 30) * 33;
    } else {
        depthLevel = 'The Abyss (Critical)';
        depthColor = 'bg-slate-950 border border-slate-700 shadow-[0_0_20px_rgba(0,0,0,0.8)]';
        depthBg = 'from-indigo-950/60 to-black';
        textColor = 'text-slate-500';
        percentage = 66 + Math.min(((longestSessionMinutes - 45) / 60) * 34, 34);
    }

    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className={`relative w-24 h-48 rounded-full border border-slate-700 overflow-hidden bg-gradient-to-b ${depthBg} flex items-end justify-center pb-2 transition-all duration-1000`}>
                
                {/* The "Water" Level */}
                <div className={`absolute bottom-0 w-full ${depthColor} transition-all duration-1000 ease-out flex flex-col items-center justify-start pt-2`} style={{ height: `${Math.max(percentage, 10)}%` }}>
                   <div className="w-16 h-1 bg-white/30 rounded-full mb-1"></div>
                   <div className="w-10 h-1 bg-white/20 rounded-full"></div>
                </div>

                {/* The Submarine / Diver Indicator */}
                <div className="absolute z-10 flex flex-col items-center" style={{ bottom: `${Math.max(percentage - 5, 5)}%` }}>
                    <span className={`font-chivo font-bold text-2xl drop-shadow-md ${textColor}`}>{longestSessionMinutes}m</span>
                    <Anchor size={20} weight="fill" className={`${textColor} drop-shadow-lg opacity-80 mt-1`} />
                </div>

                {/* Tick Marks */}
                <div className="absolute inset-y-0 left-2 w-2 flex flex-col justify-between py-6 opacity-30">
                    <div className="h-0.5 w-full bg-slate-300"></div>
                    <div className="h-0.5 w-full bg-slate-300"></div>
                    <div className="h-0.5 w-full bg-slate-400"></div>
                    <div className="h-0.5 w-full bg-slate-500"></div>
                </div>
            </div>
            
            <div className="mt-4 text-center">
                <div className={`text-sm font-bold uppercase tracking-widest ${textColor}`}>{depthLevel}</div>
                <div className="text-xs text-slate-500 mt-1">Longest Uninterrupted Session</div>
            </div>
        </div>
    );
}
