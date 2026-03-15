import React from 'react';
import type { UsageRecord } from '@/lib/api';

export interface ContextScatterPlotProps {
    records: UsageRecord[]; 
}

export function ContextScatterPlot({ records }: ContextScatterPlotProps) {
    if (!records || records.length === 0) {
        return <div className="text-sm text-slate-500 italic p-4 text-center">No correlation data available for scatter plot.</div>;
    }

    // A simulated/stylized scatter plot area.
    return (
        <div className="relative w-full h-48 bg-slate-900/40 rounded-lg border border-slate-800/80 p-4">
            <div className="absolute inset-y-4 left-4 border-l border-slate-700"></div>
            <div className="absolute bottom-4 inset-x-4 border-b border-slate-700"></div>
            
            <div className="absolute top-2 left-6 text-[10px] text-slate-500 uppercase tracking-wider font-mono">Context (Stationary ➔ Walking)</div>
            <div className="absolute bottom-1 right-4 text-[10px] text-slate-500 uppercase tracking-wider font-mono">Time of Day (12A ➔ 11P)</div>
            
            {/* Example Data Points */}
            <div className="absolute w-full h-full inset-0 p-6 pointer-events-none">
                <div className="absolute bg-blue-500/60 rounded-full blur-[1px]" style={{ left: '20%', bottom: '30%', width: '12px', height: '12px' }} title="8 AM Commute" />
                <div className="absolute bg-indigo-500/70 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ left: '25%', bottom: '20%', width: '24px', height: '24px' }} title="9 AM Work" />
                <div className="absolute bg-blue-400/80 rounded-full" style={{ left: '50%', bottom: '40%', width: '16px', height: '16px' }} title="1 PM Lunch" />
                <div className="absolute bg-purple-500/70 rounded-full blur-[2px]" style={{ left: '80%', bottom: '70%', width: '40px', height: '40px' }} title="9 PM Couch Doomscroll" />
                <div className="absolute bg-red-500/80 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.7)]" style={{ left: '95%', bottom: '85%', width: '18px', height: '18px' }} title="Midnight Insomnia" />
            </div>
            <p className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs text-slate-400 italic font-mono opacity-50 text-center">
                Scatter plotting context vs time...<br/>(Visual Mockup)
            </p>
        </div>
    );
}
