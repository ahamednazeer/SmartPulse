import React from 'react';
import { ArrowsLeftRight } from '@phosphor-icons/react';

export interface HabitFlowchartProps {
    habitSequence: string[] | null;
}

export function HabitFlowchart({ habitSequence }: HabitFlowchartProps) {
    if (!habitSequence || habitSequence.length < 2) {
        return <div className="text-sm text-slate-500 italic text-center p-4">Not enough session sequence data recorded yet.</div>;
    }

    // Process the sequence into flow pairs
    const pairs: Record<string, number> = {};
    for (let i = 0; i < habitSequence.length - 1; i++) {
        const from = habitSequence[i].split('.').pop()?.substring(0, 12) || 'unknown';
        const to = habitSequence[i + 1].split('.').pop()?.substring(0, 12) || 'unknown';
        if (from === to) continue; 
        
        const key = `${from} → ${to}`;
        pairs[key] = (pairs[key] || 0) + 1;
    }

    const topFlows = Object.entries(pairs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    if (topFlows.length === 0) {
        return <div className="text-sm text-slate-500 italic p-4 text-center">No distinct flows detected.</div>;
    }

    const maxFlow = Math.max(...topFlows.map(f => f[1]), 1);

    return (
        <div className="flex flex-col gap-4 py-2">
            {topFlows.map(([flow, count], idx) => {
                const parts = flow.split(' → ');
                const thickness = Math.max((count / maxFlow) * 8, 2);
                
                return (
                    <div key={idx} className="flex items-center justify-between group">
                        <div className="w-[40%] bg-slate-800/80 rounded-md p-2 text-center text-xs text-slate-300 font-semibold border border-slate-700/50 truncate">
                            {parts[0]}
                        </div>
                        
                        <div className="w-[20%] flex flex-col items-center justify-center relative">
                            <span className="text-[10px] text-blue-400 absolute -top-4 font-mono">{count}x</span>
                            <div className="w-full bg-gradient-to-r from-slate-600 to-blue-500 rounded-full" style={{ height: `${thickness}px` }}></div>
                            <ArrowsLeftRight size={14} className="text-blue-400 absolute bg-slate-900 rounded-full p-0.5" />
                        </div>

                        <div className="w-[40%] bg-blue-900/30 rounded-md p-2 text-center text-xs text-blue-200 font-semibold border border-blue-800/50 truncate drop-shadow-[0_0_8px_rgba(59,130,246,0.15)]">
                            {parts[1]}
                        </div>
                    </div>
                );
            })}
            <p className="text-[10px] text-slate-500 text-center mt-2 font-mono uppercase tracking-widest">Dominant App Transition Loops</p>
        </div>
    );
}
