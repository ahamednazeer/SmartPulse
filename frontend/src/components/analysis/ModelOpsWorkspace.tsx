'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type {
    GroundTruthLabelRecord,
    ModelMonitoringResponse,
    PredictionTrainingSummary,
} from '@/lib/api';
import {
    ArrowsClockwise,
    Brain,
    CheckCircle,
    FloppyDisk,
    Gauge,
    Pulse,
    ShieldCheck,
    TrendUp,
} from '@phosphor-icons/react';

type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

interface LabelFormState {
    date: string;
    label: RiskLevel;
    source: string;
    confidence: string;
    notes: string;
}

const DEFAULT_LABEL_FORM: LabelFormState = {
    date: new Date().toISOString().split('T')[0],
    label: 'MODERATE',
    source: 'CLINICAL_ASSESSMENT',
    confidence: '',
    notes: '',
};

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
}

function toRiskPillClass(level: RiskLevel): string {
    if (level === 'HIGH') {
        return 'bg-red-500/10 text-red-300 border border-red-500/30';
    }
    if (level === 'LOW') {
        return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
    }
    return 'bg-amber-500/10 text-amber-300 border border-amber-500/30';
}

function formatIso(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleString();
}

export default function ModelOpsWorkspace() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [submittingLabel, setSubmittingLabel] = useState(false);
    const [training, setTraining] = useState(false);

    const [labels, setLabels] = useState<GroundTruthLabelRecord[]>([]);
    const [monitoring, setMonitoring] = useState<ModelMonitoringResponse | null>(null);
    const [trainingSummary, setTrainingSummary] = useState<PredictionTrainingSummary | null>(
        null,
    );
    const [labelForm, setLabelForm] = useState<LabelFormState>(DEFAULT_LABEL_FORM);

    const loadWorkspaceData = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!opts?.silent) {
                setRefreshing(true);
            }

            try {
                const [labelData, monitoringData] = await Promise.all([
                    api.getGroundTruthLabels(90),
                    api.getPredictionMonitoring(120),
                ]);

                setLabels(labelData);
                setMonitoring(monitoringData);
            } catch (error) {
                toast.error(getErrorMessage(error, 'Failed to load model operations data'));
            } finally {
                setRefreshing(false);
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        void loadWorkspaceData({ silent: true });
    }, [loadWorkspaceData]);

    const handleLabelSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmittingLabel(true);

        try {
            const confidenceTrimmed = labelForm.confidence.trim();
            const confidenceValue =
                confidenceTrimmed.length === 0
                    ? undefined
                    : Number.parseFloat(confidenceTrimmed);

            await api.upsertGroundTruthLabel({
                date: labelForm.date || undefined,
                label: labelForm.label,
                source: labelForm.source.trim() || undefined,
                confidence:
                    typeof confidenceValue === 'number' && Number.isFinite(confidenceValue)
                        ? confidenceValue
                        : undefined,
                notes: labelForm.notes.trim() || undefined,
            });

            toast.success('Ground-truth label saved');
            setLabelForm((prev) => ({
                ...prev,
                notes: '',
                confidence: '',
            }));
            await loadWorkspaceData({ silent: true });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to save ground-truth label'));
        } finally {
            setSubmittingLabel(false);
        }
    };

    const handleRetrain = async () => {
        setTraining(true);
        try {
            const summary = await api.trainPredictionModel();
            setTrainingSummary(summary);
            toast.success('Model retraining completed');
            await loadWorkspaceData({ silent: true });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to retrain model'));
        } finally {
            setTraining(false);
        }
    };

    const highPriorityFlags = useMemo(() => {
        if (!monitoring) {
            return [];
        }

        const items: string[] = [];
        if (monitoring.calibration.expectedCalibrationError >= 0.1) {
            items.push(
                `Calibration drift: ECE=${monitoring.calibration.expectedCalibrationError.toFixed(3)}`,
            );
        }
        if (monitoring.fairnessAudit.maxFalsePositiveRateGap >= 15) {
            items.push(
                `Fairness warning: max FPR gap ${monitoring.fairnessAudit.maxFalsePositiveRateGap.toFixed(1)}%`,
            );
        }
        if (monitoring.drift.flaggedFeatures.length > 0) {
            items.push(
                `Feature drift detected in ${monitoring.drift.flaggedFeatures.length} feature(s)`,
            );
        }
        return items;
    }, [monitoring]);

    if (loading) {
        return (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-8 text-center text-slate-300">
                Loading model operations workspace...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <p className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                            <Brain size={16} weight="duotone" />
                            Model Operations
                        </p>
                        <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                            Clinician/Admin Labeling and Reliability Monitor
                        </h3>
                        <p className="text-sm text-slate-400">
                            Submit validated labels, retrain the model, and inspect calibration,
                            drift, and fairness diagnostics.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void loadWorkspaceData()}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <ArrowsClockwise
                                size={16}
                                className={refreshing ? 'animate-spin' : ''}
                            />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={handleRetrain}
                            disabled={training}
                            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <TrendUp size={16} />
                            {training ? 'Retraining...' : 'Retrain Model'}
                        </button>
                    </div>
                </div>

                {highPriorityFlags.length > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">
                            Active Warnings
                        </p>
                        <ul className="space-y-1 text-sm text-amber-100">
                            {highPriorityFlags.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
                <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                    <h4 className="mb-4 text-lg font-semibold text-slate-100">
                        Submit Ground-Truth Label
                    </h4>
                    <form onSubmit={handleLabelSubmit} className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-wide text-slate-400">
                                    Date
                                </span>
                                <input
                                    type="date"
                                    value={labelForm.date}
                                    onChange={(event) =>
                                        setLabelForm((prev) => ({
                                            ...prev,
                                            date: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                                />
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-wide text-slate-400">
                                    Label
                                </span>
                                <select
                                    value={labelForm.label}
                                    onChange={(event) =>
                                        setLabelForm((prev) => ({
                                            ...prev,
                                            label: event.target.value as RiskLevel,
                                        }))
                                    }
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                                >
                                    <option value="LOW">LOW</option>
                                    <option value="MODERATE">MODERATE</option>
                                    <option value="HIGH">HIGH</option>
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-wide text-slate-400">
                                    Source
                                </span>
                                <input
                                    type="text"
                                    value={labelForm.source}
                                    onChange={(event) =>
                                        setLabelForm((prev) => ({
                                            ...prev,
                                            source: event.target.value,
                                        }))
                                    }
                                    placeholder="CLINICAL_ASSESSMENT"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                                />
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-wide text-slate-400">
                                    Confidence (0..1)
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={labelForm.confidence}
                                    onChange={(event) =>
                                        setLabelForm((prev) => ({
                                            ...prev,
                                            confidence: event.target.value,
                                        }))
                                    }
                                    placeholder="0.85"
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                                />
                            </label>
                        </div>

                        <label className="block space-y-2 text-sm text-slate-300">
                            <span className="text-xs uppercase tracking-wide text-slate-400">
                                Notes
                            </span>
                            <textarea
                                value={labelForm.notes}
                                onChange={(event) =>
                                    setLabelForm((prev) => ({
                                        ...prev,
                                        notes: event.target.value,
                                    }))
                                }
                                rows={3}
                                placeholder="Clinical interpretation or observation notes..."
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={submittingLabel}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <FloppyDisk size={16} />
                            {submittingLabel ? 'Saving...' : 'Save Label'}
                        </button>
                    </form>
                </article>

                <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                    <h4 className="mb-4 text-lg font-semibold text-slate-100">
                        Recent Ground-Truth Labels
                    </h4>
                    {labels.length === 0 ? (
                        <p className="rounded-lg border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">
                            No labels submitted yet.
                        </p>
                    ) : (
                        <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-800">
                            <table className="min-w-full divide-y divide-slate-800 text-sm">
                                <thead className="sticky top-0 bg-slate-950/95">
                                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Label</th>
                                        <th className="px-3 py-2">Source</th>
                                        <th className="px-3 py-2">Confidence</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                                    {labels.slice(0, 20).map((item) => (
                                        <tr key={item.id} className="text-slate-300">
                                            <td className="px-3 py-2 whitespace-nowrap">{item.date}</td>
                                            <td className="px-3 py-2">
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toRiskPillClass(item.label)}`}
                                                >
                                                    {item.label}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">{item.source}</td>
                                            <td className="px-3 py-2">
                                                {item.confidence === null
                                                    ? '--'
                                                    : item.confidence.toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </article>
            </section>

            <section className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-lg font-semibold text-slate-100">
                        Reliability and Fairness Monitoring
                    </h4>
                    {monitoring && (
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                            Generated: {formatIso(monitoring.generatedAt)}
                        </p>
                    )}
                </div>

                {!monitoring ? (
                    <p className="rounded-lg border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-400">
                        Monitoring data unavailable.
                    </p>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-400">
                                    Evaluated Samples
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-slate-100">
                                    {monitoring.evaluatedSampleCount}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Window: {monitoring.evaluationWindowDays} days
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                                    <Gauge size={14} />
                                    Brier Score
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-slate-100">
                                    {monitoring.calibration.brierScore.toFixed(4)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                                    <Pulse size={14} />
                                    Expected Calibration Error
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-slate-100">
                                    {monitoring.calibration.expectedCalibrationError.toFixed(4)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                                    <ShieldCheck size={14} />
                                    Max FPR Gap
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-slate-100">
                                    {monitoring.fairnessAudit.maxFalsePositiveRateGap.toFixed(2)}%
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-2">
                            <article className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <h5 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
                                    Backtest Windows
                                </h5>
                                <div className="space-y-3">
                                    {monitoring.backtest.windowMetrics.map((windowItem) => (
                                        <div
                                            key={windowItem.windowDays}
                                            className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                                        >
                                            <p className="text-xs uppercase tracking-wide text-slate-400">
                                                Last {windowItem.windowDays} Days ({windowItem.sampleCount}{' '}
                                                samples)
                                            </p>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-300">
                                                <span>Accuracy: {windowItem.metrics.accuracy.toFixed(2)}%</span>
                                                <span>F1: {windowItem.metrics.f1Score.toFixed(2)}%</span>
                                                <span>Precision: {windowItem.metrics.precision.toFixed(2)}%</span>
                                                <span>Recall: {windowItem.metrics.recall.toFixed(2)}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            <article className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <h5 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
                                    Feature Drift
                                </h5>
                                {monitoring.drift.flaggedFeatures.length === 0 ? (
                                    <p className="inline-flex items-center gap-2 text-sm text-emerald-300">
                                        <CheckCircle size={16} />
                                        No major drift flags in current window.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {monitoring.drift.flaggedFeatures.map((feature) => (
                                            <div
                                                key={feature}
                                                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
                                            >
                                                {feature}: {monitoring.drift.featureShift[feature]?.toFixed(3)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </article>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-2">
                            <article className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <h5 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
                                    Calibration Bins
                                </h5>
                                <div className="overflow-auto rounded-lg border border-slate-800">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-950/95">
                                            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                                                <th className="px-3 py-2">Bin</th>
                                                <th className="px-3 py-2">Count</th>
                                                <th className="px-3 py-2">Predicted</th>
                                                <th className="px-3 py-2">Observed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                                            {monitoring.calibration.bins.map((bin) => (
                                                <tr key={`${bin.binStart}-${bin.binEnd}`} className="text-slate-300">
                                                    <td className="px-3 py-2">
                                                        {(bin.binStart * 100).toFixed(0)}-
                                                        {(bin.binEnd * 100).toFixed(0)}%
                                                    </td>
                                                    <td className="px-3 py-2">{bin.count}</td>
                                                    <td className="px-3 py-2">
                                                        {(bin.avgPredictedHighProbability * 100).toFixed(1)}%
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {(bin.observedHighRate * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </article>

                            <article className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                                <h5 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
                                    Fairness Segment Audit
                                </h5>
                                <div className="overflow-auto rounded-lg border border-slate-800">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-950/95">
                                            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                                                <th className="px-3 py-2">Segment</th>
                                                <th className="px-3 py-2">N</th>
                                                <th className="px-3 py-2">Acc</th>
                                                <th className="px-3 py-2">FPR</th>
                                                <th className="px-3 py-2">FNR</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                                            {monitoring.fairnessAudit.segments.map((segment) => (
                                                <tr key={segment.segment} className="text-slate-300">
                                                    <td className="px-3 py-2">{segment.segment}</td>
                                                    <td className="px-3 py-2">{segment.sampleCount}</td>
                                                    <td className="px-3 py-2">
                                                        {segment.accuracy.toFixed(2)}%
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {segment.falsePositiveRate.toFixed(2)}%
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {segment.falseNegativeRate.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </article>
                        </div>
                    </>
                )}
            </section>

            {trainingSummary && (
                <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
                    <h4 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-slate-100">
                        <TrendUp size={20} />
                        Latest Training Result
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                            Validation F1: {trainingSummary.validationMetrics.f1Score.toFixed(2)}%
                        </p>
                        <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                            Test F1: {trainingSummary.testMetrics.f1Score.toFixed(2)}%
                        </p>
                        <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                            Cross-Validation F1: {trainingSummary.crossValidationF1.toFixed(2)}%
                        </p>
                        <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                            Samples: {trainingSummary.dataset.totalSamples}
                        </p>
                    </div>
                </section>
            )}
        </div>
    );
}

