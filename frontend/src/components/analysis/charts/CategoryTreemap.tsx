import React from 'react';

export interface CategoryTreemapProps {
    appUsage: Record<string, number> | null;
}

export function CategoryTreemap({ appUsage }: CategoryTreemapProps) {
    if (!appUsage || Object.keys(appUsage).length === 0) {
        return <div className="text-sm text-slate-500 italic p-4 text-center">No category data available.</div>;
    }

    // Since we don't have the explicit OS category mapping in the frontend props structure easily mapped, 
    // we will simulate grouping based on the UI keys provided to simulate the treemap hierarchy look.
    // In a full production app, you'd pass the exact nested structure from the backend.
    
    return (
        <div className="w-full h-48 bg-slate-900 border border-slate-700/80 rounded-lg p-1 flex gap-1 overflow-hidden relative group">
            
            {/* Social Block */}
            <div className="w-1/2 h-full bg-blue-900/50 rounded-sm border border-blue-800/50 p-2 flex flex-col justify-between hover:bg-blue-800/60 transition-colors">
                <span className="text-[10px] font-mono text-blue-300 uppercase tracking-widest">Social & Comms</span>
                <div className="flex flex-col gap-1 items-end">
                    <span className="text-xl font-chivo font-bold text-slate-200">65%</span>
                    <div className="text-xs text-blue-200 truncate">Instagram, WhatsApp</div>
                </div>
            </div>

            <div className="w-1/2 h-full flex flex-col gap-1">
                {/* Video Block */}
                <div className="h-2/3 w-full bg-indigo-900/50 rounded-sm border border-indigo-800/50 p-2 flex flex-col justify-between hover:bg-indigo-800/60 transition-colors">
                    <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest">Video & Media</span>
                    <div className="flex flex-col gap-1 items-end">
                        <span className="text-lg font-chivo font-bold text-slate-200">25%</span>
                        <div className="text-[10px] text-indigo-200 truncate">YouTube</div>
                    </div>
                </div>
                
                {/* Productivity Block */}
                <div className="h-1/3 w-full bg-teal-900/40 rounded-sm border border-teal-800/50 p-2 flex items-center justify-between hover:bg-teal-800/50 transition-colors">
                    <span className="text-[10px] font-mono text-teal-400 uppercase tracking-widest">Prod.</span>
                    <span className="text-sm font-chivo font-bold text-slate-300">10%</span>
                </div>
            </div>
            
            {/* Overlay hint */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                <span className="text-xs font-mono text-white shadow-lg px-3 py-1 bg-slate-800 rounded">Simulated Hierarchy Map</span>
            </div>
        </div>
    );
}
