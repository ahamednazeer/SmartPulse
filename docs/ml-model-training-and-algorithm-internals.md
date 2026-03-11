# SmartPulse ML Model Training and Algorithm Internals

Last updated: 2026-03-11

This document reflects the current implementation in backend and frontend after the modeling upgrades (ground-truth ingestion, trainable scorers, contextual features, calibration/backtest monitoring, and fairness audit).

## 1) Current model architecture

SmartPulse now uses a hybrid scoring architecture:

1. Deterministic feature engineering and preprocessing.
2. Ensemble prediction (`randomForest`, `extraTrees`, `svm`) with configurable weights.
3. Learned per-user scorers from training history (tree ensembles with a regularized linear fallback for small sample sizes).
4. Deterministic fallback formulas only when no trainable model exists yet (cold start).

Key services:

- `backend/src/preprocessing/preprocessing.service.ts`
- `backend/src/prediction/prediction.service.ts`
- `backend/src/risk-analysis/risk-analysis.service.ts`

## 2) Data considered by the algorithm

### 2.1 Behavioral and survey inputs

Core fields used in prediction:

- Usage: `screenTimeMinutes`, `unlockCount`, `socialMediaMinutes`, `nightUsageMinutes`, `longestSessionMinutes`
- Survey: `stressLevel`, `anxietyLevel`, `depressionLevel`, `sleepQuality`, `sleepHours`, `socialInteraction`, `dailyProductivity`, `phoneDependence`, `mood`

### 2.2 Contextual telemetry now integrated

SmartPulse now parses and uses contextual JSON payloads from `usage_records`:

- `notificationInteractionJson` -> notification response rate
- `sleepProxyJson` -> sleep regularity, wake checks, midnight sessions
- `connectivityContextJson` -> transition count, offline minutes, longest offline streak
- `activityContextJson` -> short session count
- `locationContextJson` -> commute minutes
- `notificationCount` -> raw notification load

### 2.3 Ground-truth labels

External validated labels are stored in `ground_truth_labels` and linked by date:

- `label` (`LOW`, `MODERATE`, `HIGH`)
- `source` (for example `CLINICAL_ASSESSMENT`)
- `confidence` (`0..1`, optional)
- `notes` (optional)

Training prefers ground-truth labels over internally derived labels when both exist for the same date.

### 2.4 Pretrained data usage

SmartPulse does **not** use external pretrained model weights for prediction.

- learned models are trained per user from SmartPulse-collected history
- labels come from `ground_truth_labels` when present, otherwise derived labels
- inference falls back to deterministic formulas when trainable models are unavailable

## 3) Preprocessing internals

### 3.1 Data quality pipeline

For each preprocessing run:

- lookback window clamped to `7..180` days (default `30`)
- duplicate usage rows dropped by date (latest kept)
- strict bounds enforced for usage values
- relational invalid rows removed (`socialMedia > screenTime`, etc.)
- missing/incomplete survey replaced by neutral defaults

### 3.2 Normalization and engineered features

Existing engineered features remain (addiction behavior, digital dependency, stress, sleep disruption, etc.) and new contextual features were added:

- `notificationLoadScore`
- `sleepRegularityRiskScore`
- `connectivityDisruptionScore`
- `activityFragmentationScore`
- `commuteImpulseScore`
- context averages: `avgNotificationCount`, `avgNotificationResponseRate`, `avgSleepRegularityScore`, `avgConnectivityTransitions`, `avgOfflineMinutes`, `avgShortSessionCount`, `avgCommuteMinutes`

Key normalization rules currently used in code:

- `screenTimeNorm = normalize(avgScreenTimeMinutes, 0, 720)`
- `unlockNorm = normalize(avgUnlockCount, 0, 180)`
- `socialNorm = normalize(avgSocialMediaMinutes, 0, 360)`
- `nightNorm = normalize(avgNightUsageMinutes, 0, 180)`
- `sessionNorm = normalize(avgLongestSessionMinutes, 0, 120)`
- `notificationNorm = normalize(avgNotificationCount, 0, 300)`
- `notificationResponseNorm = clamp(avgNotificationResponseRate / 100, 0, 1)`
- `sleepRegularityRiskNorm = clamp((100 - avgSleepRegularityScore) / 100, 0, 1)`
- `connectivityDisruptionNorm = clamp(normalize(avgOfflineMinutes, 0, 480) * 0.6 + normalize(avgConnectivityTransitions, 0, 40) * 0.4, 0, 1)`
- `activityFragmentationNorm = clamp(normalize(avgShortSessionCount, 0, 80), 0, 1)`
- `commuteImpulseNorm = clamp(normalize(avgCommuteMinutes, 0, 240), 0, 1)`
- `stressNorm = clamp((stressLevel + anxietyLevel + depressionLevel) / 30, 0, 1)`
- `dependenceNorm = normalize(phoneDependence, 1, 10)`
- `compulsiveCheckingNorm = normalize(avgUnlockCount / activeHoursEstimate, 0, 18)`
- `socialIntensityNorm = clamp(avgSocialMediaMinutes / max(avgScreenTimeMinutes, 1), 0, 1)`
- `nightRatioNorm = clamp(avgNightUsageMinutes / max(avgScreenTimeMinutes, 1), 0, 1)`

Sleep normalization:

- `sleepHourPenalty = normalize(7 - sleepHours, 0, 4)` when `sleepHours < 7`
- otherwise `sleepHourPenalty = normalize(sleepHours - 9, 0, 4) * 0.4`
- `sleepQualityPenalty = normalize(10 - sleepQuality, 0, 9)`
- `sleepDisruptionNorm = clamp(sleepHourPenalty * 0.6 + sleepQualityPenalty * 0.4, 0, 1)`

Supporting estimate:

- `activeHoursEstimate = clamp((avgScreenTimeMinutes / 60) * 1.6 + 3.2, 4, 18)`

Engineered feature formulas:

- `lateNightUsageScore = (nightNorm * 0.7 + nightRatioNorm * 0.3) * 100`
- `socialMediaDependencyScore = (socialNorm * 0.55 + socialIntensityNorm * 0.25 + dependenceNorm * 0.2) * 100`
- `notificationLoadScore = (notificationNorm * 0.7 + notificationResponseNorm * 0.3) * 100`
- `sleepRegularityRiskScore = sleepRegularityRiskNorm * 100`
- `connectivityDisruptionScore = connectivityDisruptionNorm * 100`
- `activityFragmentationScore = activityFragmentationNorm * 100`
- `commuteImpulseScore = commuteImpulseNorm * 100`
- `moodRiskScore = normalize(5 - mood, 0, 4) * 100`
- `productivityRiskScore = normalize(10 - dailyProductivity, 0, 9) * 100`
- `addictionBehaviorScore = (screenTimeNorm * 0.27 + unlockNorm * 0.2 + compulsiveCheckingNorm * 0.16 + socialNorm * 0.17 + nightNorm * 0.12 + sessionNorm * 0.08) * 100`
- `digitalDependencyScore = (screenTimeNorm * 0.24 + unlockNorm * 0.2 + compulsiveCheckingNorm * 0.2 + socialIntensityNorm * 0.16 + nightRatioNorm * 0.1 + dependenceNorm * 0.1) * 100`
- `overallRiskSignal = addictionBehaviorScore * 0.39 + digitalDependencyScore * 0.17 + socialMediaDependencyScore * 0.12 + psychologicalStressScore * 0.12 + sleepDisruptionScore * 0.06 + notificationLoadScore * 0.04 + sleepRegularityRiskScore * 0.04 + connectivityDisruptionScore * 0.02 + activityFragmentationScore * 0.01 + commuteImpulseScore * 0.01 + moodRiskScore * 0.01 + productivityRiskScore * 0.01`

Overall risk signal now blends behavior, psychological, and contextual features:

- behavior core (addiction/digital/social/night)
- psychology (stress/sleep/mood/productivity)
- context (notification/sleep regularity/connectivity/activity/commute)

### 3.3 Feature selection

Feature selection still keeps features by:

- essential feature set membership
- static importance threshold
- or variance threshold

Selected vectors are stored in `feature_store_records.featureVectorJson`.

## 4) Prediction internals

### 4.1 Runtime scoring path

At inference:

1. Load user feature profile from preprocessing.
2. Load ensemble weights (`model_profiles.weightsJson` or defaults).
3. Load learned scorer coefficients (`model_profiles.learnedModelJson`) if available.
4. Score each model channel:
   - learned tree-ensemble scorer if available
   - otherwise deterministic fallback formula
5. Combine with ensemble weights into `riskScore` (`0..100`).
6. Classify:
   - `HIGH >= 70`
   - `MODERATE >= 40`
   - else `LOW`

Deterministic fallback scorer formulas:

- `randomForestScore = addictionBehaviorScore * 0.33 + digitalDependencyScore * 0.18 + socialMediaDependencyScore * 0.16 + lateNightUsageScore * 0.1 + sleepDisruptionScore * 0.07 + notificationLoadScore * 0.06 + sleepRegularityRiskScore * 0.06 + connectivityDisruptionScore * 0.04`
- `extraTreesScore = addictionBehaviorScore * 0.3 + compulsiveCheckingScore * 1.6 + psychologicalStressScore * 0.17 + productivityRiskScore * 0.08 + socialMediaIntensity * 0.09 + activityFragmentationScore * 0.08 + commuteImpulseScore * 0.04 + notificationLoadScore * 0.06 + bound(((avgScreenTimeMinutes / 720) * (avgUnlockCount / 180) * 100)) * 0.14`
- `svmScore = overallRiskSignal * 0.5 + digitalDependencyScore * 0.15 + psychologicalStressScore * 0.14 + sleepDisruptionScore * 0.08 + notificationLoadScore * 0.05 + sleepRegularityRiskScore * 0.04 + connectivityDisruptionScore * 0.04`

Ensemble combination:

- `riskScore = randomForestScore * w_rf + extraTreesScore * w_et + svmScore * w_svm`

Default weights:

- `w_rf = 0.40`
- `w_et = 0.35`
- `w_svm = 0.25`

### 4.2 Persisted prediction outputs

Saved in `prediction_results`:

- `riskScore`, `riskLevel`
- channel scores (`randomForestScore`, `extraTreesScore`, `svmScore`)
- `featureVectorJson`
- generated insights

## 5) Training internals (`POST /api/prediction/train`)

### 5.1 Sample assembly and label precedence

Training samples are built from:

- `feature_store_records`
- historical `prediction_results` (fallback when feature-store date missing)
- `ground_truth_labels` override label by date when present

Label source is tracked in training summary:

- `GROUND_TRUTH`
- `DERIVED_FEATURE`
- `DERIVED_PREDICTION`

### 5.2 Learned scorer fitting

Training now fits per-user non-linear tree ensembles (one per scorer channel):

- `randomForest` channel model (bagged trees, best split search)
- `extraTrees` channel model (randomized split search)
- `svm` channel model (shallow tree ensemble replacing linear learned margin)

Algorithm details:

- target mapping remains ordinal:
  - `LOW -> 20`
  - `MODERATE -> 55`
  - `HIGH -> 85`
- each tree recursively minimizes squared error
- per split, feature subsets are sampled (`featureSubsampleRatio`)
- split candidates are generated either:
  - deterministically (`BEST`, midpoint candidates), or
  - randomly (`RANDOM`, extra-trees style thresholds)
- stopping conditions:
  - `maxDepth` reached
  - or branch size below `2 * minSamplesLeaf`
  - or no meaningful gain
- ensemble prediction = weighted average of tree leaf outputs

Channel-specific tree settings:

- `randomForest`: `29` trees, `maxDepth=5`, `minSamplesLeaf=3`, `featureSubsampleRatio=0.65`, `splitCandidatesPerFeature=10`, `splitStrategy=BEST`, `bootstrap=true`
- `extraTrees`: `35` trees, `maxDepth=5`, `minSamplesLeaf=2`, `featureSubsampleRatio=0.8`, `splitCandidatesPerFeature=14`, `splitStrategy=RANDOM`, `bootstrap=false`
- `svm`: `21` trees, `maxDepth=4`, `minSamplesLeaf=3`, `featureSubsampleRatio=0.55`, `splitCandidatesPerFeature=8`, `splitStrategy=BEST`, `bootstrap=true`

Preferred feature sets by learned channel:

- `randomForest`: addiction behavior, digital dependency, social dependency, late-night usage, sleep disruption, notification load, sleep regularity risk, connectivity disruption
- `extraTrees`: addiction behavior, compulsive checking, psychological stress, activity fragmentation, commute impulse, notification load, social intensity, avg screen time, avg unlock count
- `svm`: overall risk signal, digital dependency, psychological stress, sleep disruption, notification load, sleep regularity risk, connectivity disruption

### 5.3 Ensemble weight search

After learned scorer fitting, SmartPulse performs grid search on ensemble weights over validation F1 (accuracy tie-breaker), then evaluates on test split.

Weight grid currently searched:

- `{0.45, 0.35, 0.20}`
- `{0.40, 0.35, 0.25}`
- `{0.35, 0.40, 0.25}`
- `{0.30, 0.45, 0.25}`
- `{0.40, 0.30, 0.30}`
- `{0.50, 0.25, 0.25}`
- `{0.33, 0.33, 0.34}`

### 5.4 Stored training artifacts

Saved to `model_profiles`:

- `weightsJson`
- `searchSummaryJson`
- `metricsJson`
- `learnedModelJson`
- `featureImportanceJson` (data-driven from split gain / legacy coefficient fallback)
- `monitoringJson` (calibration/backtest/drift/fairness snapshot)

## 6) Monitoring, calibration, drift, and fairness

### 6.1 Monitoring endpoint

`GET /api/prediction/monitor?days=90`

Returns:

- calibration metrics
- rolling backtest metrics (7/14/30 windows)
- feature drift summary
- fairness segment audit

### 6.2 Calibration metrics

- Brier score
- Expected Calibration Error (ECE)
- reliability bins (`predicted HIGH probability` vs `observed HIGH rate`)

Current implementation:

- probability proxy = `clamp(riskScore / 100, 0, 1)`
- positive class = `actualLabel === HIGH`
- Brier score = average squared error between predicted probability and binary outcome
- ECE uses `5` equal-width bins over `[0, 1]`
- each bin stores:
  - average predicted HIGH probability
  - observed HIGH rate
  - sample count

### 6.3 Drift metrics

Compares recent feature-store means vs baseline means and flags features with large relative shift.

Current implementation:

- recent window = last `14` feature-store rows
- baseline window = previous `30` rows before that
- relative shift = `(recentMean - baselineMean) / max(abs(baselineMean), 1)`
- drift flag threshold = `abs(shift) >= 0.35`

### 6.4 Fairness audit (current segmentation)

Audit now prioritizes demographic group segmentation across cohort rows in the monitoring window.

Demographic axes used when enough coverage exists:

- `gender`
- `ageBand`
- `region`
- `educationLevel`
- `occupation`

Eligibility rules:

- minimum `8` samples per demographic segment
- at least `2` eligible groups in an axis before that axis is included
- if demographic coverage is insufficient, fallback behavioral segments are used (`weekday/weekend`, `high_stress/low_stress`)

Reported:

- accuracy
- false positive rate
- false negative rate
- predicted vs observed high-risk rates
- max disparity gaps

Current implementation treats `HIGH` as the positive class:

- `FPR = FP / (FP + TN)`
- `FNR = FN / (FN + TP)`
- `predictedHighRate = (TP + FP) / N`
- `observedHighRate = (TP + FN) / N`

### 6.5 Periodic refresh

Monitoring snapshots are refreshed automatically when stale during prediction runs and also during training.

## 7) Ground-truth labeling API

Base: `/api/ground-truth`

- `POST /label` -> upsert label for date
- `GET /` -> list labels
- `GET /latest` -> latest label

## 8) Frontend model-ops workspace

New route: `/dashboard/analysis/model-ops`

Capabilities:

- submit ground-truth labels
- trigger retraining
- inspect calibration/backtest/drift/fairness diagnostics

Primary UI component:

- `frontend/src/components/analysis/ModelOpsWorkspace.tsx`

## 9) Current caveats

1. Learned models are shallow tree ensembles, not deep neural networks.
2. Demographic fairness depends on user-provided demographic coverage and sample balance.
3. Context features depend on telemetry availability/quality on device.
4. Ground-truth coverage quality directly affects supervised performance.
