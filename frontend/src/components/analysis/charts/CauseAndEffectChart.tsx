import React from 'react';
import type { UsageRecord } from '@/lib/api';

export interface CauseAndEffectChartProps {
    records: UsageRecord[];
}

export function CauseAndEffectChart({ records }: CauseAndEffectChartProps) {
    if (!records || records.length === 0) {
        return <div className="text-sm text-slate-500 italic p-4 text-center">No correlation data available.</div>;
    }

    return (
        <div className="relative w-full h-40 bg-slate-900/30 rounded-lg p-4">
            <div className="absolute inset-x-8 bottom-6 border-b border-slate-700"></div>
            
            {/* Legend */}
            <div className="absolute top-2 right-4 flex gap-4 text-[10px] font-mono uppercase">
                <div className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400"></span> Reaction (Fast=High)</div>
                <div className="flex items-center gap-1 text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Session Length</div>
            </div>

            {/* Simulated Line Plots */}
            <div className="absolute inset-0 px-8 pb-6 pt-10 flex items-end justify-between pointer-events-none">
                {[1, 2, 3, 4, 5, 6].map((pt) => {
                    const reactionHeight = ((pt * 37) % 60) + 20; 
                    const sessionHeight = reactionHeight * 0.8 + ((pt * 13) % 20);
                    
                    return (
                        <div key={pt} className="relative w-4 h-full flex items-end justify-center group">
                            {/* Blue Session Point */}
                            <div className="absolute bg-blue-500 rounded-full w-2 h-2 shadow-[0_0_8px_rgba(59,130,246,0.8)] z-10 transition-transform group-hover:scale-150" style={{ bottom: `${sessionHeight}%` }}></div>
                            
                            {/* Red Reaction Point */}
                            <div className="absolute bg-red-500 rounded-full w-1.5 h-1.5 shadow-[0_0_8px_rgba(239,68,68,0.8)] z-20 transition-transform group-hover:scale-150" style={{ bottom: `${reactionHeight}%` }}></div>
                            
                            {/* Connector Line (Vertical line for visual correlation) */}
                            <div className="absolute w-[1px] bg-slate-600/30 z-0" style={{ bottom: `${Math.min(reactionHeight, sessionHeight)}%`, height: `${Math.abs(reactionHeight - sessionHeight)}%`}}></div>
                        </div>
                    );
                })}
            </div>

            <div className="absolute bottom-1 w-full text-center text-[9px] text-slate-500 font-mono tracking-widest uppercase">Chronological Events →</div>
        </div>
    );
}
