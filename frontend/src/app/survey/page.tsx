'use client';

import React, { useEffect, useState } from 'react';
import { Brain, ArrowRight, Heartbeat } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface SurveyState {
    stressLevel: number;
    anxietyLevel: number;
    depressionLevel: number;
    sleepQuality: number;
    sleepHours: number;
    socialInteraction: number;
    dailyProductivity: number;
    phoneDependence: number;
    mood: number;
    notes: string;
}

const DEFAULT_SURVEY: SurveyState = {
    stressLevel: 5,
    anxietyLevel: 5,
    depressionLevel: 5,
    sleepQuality: 6,
    sleepHours: 7,
    socialInteraction: 6,
    dailyProductivity: 6,
    phoneDependence: 5,
    mood: 3,
    notes: '',
};

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export default function SurveyPage() {
    const router = useRouter();
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [loading, setLoading] = useState(false);
    const [survey, setSurvey] = useState<SurveyState>(DEFAULT_SURVEY);

    useEffect(() => {
        async function checkAuthAndPreload() {
            try {
                const token = api.getToken();
                if (!token) {
                    router.replace('/');
                    return;
                }

                await api.getMe();
                const latest = await api.getLatestSurvey().catch(() => null);
                if (latest) {
                    setSurvey((prev) => ({
                        ...prev,
                        stressLevel: Number(latest.stressLevel ?? prev.stressLevel),
                        anxietyLevel: Number(latest.anxietyLevel ?? prev.anxietyLevel),
                        depressionLevel: Number(latest.depressionLevel ?? prev.depressionLevel),
                        sleepQuality: Number(latest.sleepQuality ?? prev.sleepQuality),
                        sleepHours: Number(latest.sleepHours ?? prev.sleepHours),
                        socialInteraction: Number(latest.socialInteraction ?? prev.socialInteraction),
                        dailyProductivity: Number(latest.dailyProductivity ?? prev.dailyProductivity),
                        phoneDependence: Number(latest.phoneDependence ?? prev.phoneDependence),
                        mood: Number(latest.mood ?? prev.mood),
                        notes: typeof latest.notes === 'string' ? latest.notes : prev.notes,
                    }));
                }

                setCheckingAuth(false);
            } catch {
                api.clearToken();
                router.replace('/');
            }
        }

        void checkAuthAndPreload();
    }, [router]);

    const updateField = <K extends keyof SurveyState>(key: K, value: SurveyState[K]) => {
        setSurvey((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);

        try {
            await api.createSurvey({
                stressLevel: survey.stressLevel,
                anxietyLevel: survey.anxietyLevel,
                depressionLevel: survey.depressionLevel,
                sleepQuality: survey.sleepQuality,
                sleepHours: survey.sleepHours,
                socialInteraction: survey.socialInteraction,
                dailyProductivity: survey.dailyProductivity,
                phoneDependence: survey.phoneDependence,
                mood: survey.mood,
                notes: survey.notes.trim() || undefined,
            });

            toast.success('Survey submitted successfully');
            const profile = await api.getMe();
            if (!profile.permissionsConfigured) {
                router.push('/setup-permissions');
            } else {
                router.push('/dashboard/analysis');
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to submit survey'));
        } finally {
            setLoading(false);
        }
    };

    if (checkingAuth) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Heartbeat size={48} className="text-blue-500 animate-pulse mx-auto" />
                    <div className="text-slate-500 font-mono text-sm animate-pulse">LOADING...</div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen relative px-4 py-6 sm:py-8"
            style={{
                backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
            }}
        >
            <div className="scanlines hidden md:block" />
            <div className="relative z-10 max-w-3xl mx-auto space-y-6 animate-slide-up">
                <div className="card border-purple-800/40 bg-gradient-to-r from-purple-950/40 to-slate-800/40">
                    <div className="flex items-start gap-3 sm:items-center">
                        <div className="p-2.5 rounded-sm bg-purple-600/20">
                            <Brain size={24} weight="duotone" className="text-purple-400" />
                        </div>
                        <div>
                            <h1 className="font-chivo font-bold text-base sm:text-lg uppercase tracking-wider">
                                Psychological Survey
                            </h1>
                            <p className="text-sm text-slate-400 mt-1">
                                This helps SmartPulse model stress, sleep, and emotional dependence patterns.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="card space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <RangeField
                            label="Stress Level"
                            min={1}
                            max={10}
                            value={survey.stressLevel}
                            onChange={(value) => updateField('stressLevel', value)}
                        />
                        <RangeField
                            label="Anxiety Level"
                            min={1}
                            max={10}
                            value={survey.anxietyLevel}
                            onChange={(value) => updateField('anxietyLevel', value)}
                        />
                        <RangeField
                            label="Depression Indicators"
                            min={1}
                            max={10}
                            value={survey.depressionLevel}
                            onChange={(value) => updateField('depressionLevel', value)}
                        />
                        <RangeField
                            label="Sleep Quality"
                            min={1}
                            max={10}
                            value={survey.sleepQuality}
                            onChange={(value) => updateField('sleepQuality', value)}
                        />
                        <NumberField
                            label="Sleep Hours"
                            min={0}
                            max={24}
                            step={0.5}
                            value={survey.sleepHours}
                            onChange={(value) => updateField('sleepHours', value)}
                        />
                        <RangeField
                            label="Social Interaction"
                            min={1}
                            max={10}
                            value={survey.socialInteraction}
                            onChange={(value) => updateField('socialInteraction', value)}
                        />
                        <RangeField
                            label="Daily Productivity"
                            min={1}
                            max={10}
                            value={survey.dailyProductivity}
                            onChange={(value) => updateField('dailyProductivity', value)}
                        />
                        <RangeField
                            label="Phone Dependence"
                            min={1}
                            max={10}
                            value={survey.phoneDependence}
                            onChange={(value) => updateField('phoneDependence', value)}
                        />
                        <RangeField
                            label="Mood"
                            min={1}
                            max={5}
                            value={survey.mood}
                            onChange={(value) => updateField('mood', value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                            Notes (Optional)
                        </label>
                        <textarea
                            value={survey.notes}
                            onChange={(event) => updateField('notes', event.target.value)}
                            rows={3}
                            className="input-modern"
                            placeholder="Any context about your current stress, sleep, or phone habits"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                    >
                        {loading ? 'Submitting...' : 'Submit Survey'}
                        <ArrowRight size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}

interface RangeFieldProps {
    label: string;
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
}

function RangeField({ label, min, max, value, onChange }: RangeFieldProps) {
    return (
        <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                {label} <span className="text-blue-400">{value}</span>
            </label>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
}

interface NumberFieldProps {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}

function NumberField({
    label,
    min,
    max,
    step,
    value,
    onChange,
}: NumberFieldProps) {
    return (
        <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                {label}
            </label>
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="input-modern"
            />
        </div>
    );
}
