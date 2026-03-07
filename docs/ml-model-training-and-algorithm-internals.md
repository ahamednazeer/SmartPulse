# SmartPulse ML Model Training and Algorithm Internals

Last updated: 2026-03-06

This document explains how SmartPulse currently performs risk modeling, what data is used, how the training flow works, and what internal steps run before and after prediction.

## Implementation update (2026-03-06)

The following upgrades are now implemented in code:

1. Ground-truth label ingestion API (`/api/ground-truth/*`) and training integration.
2. Trainable per-user linear scorer coefficients persisted in `model_profiles.learnedModelJson`.
3. Data-driven feature importance persisted in `model_profiles.featureImportanceJson`.
4. Contextual telemetry features integrated into preprocessing and scoring.
5. Calibration/backtesting/drift/fairness diagnostics endpoint (`/api/prediction/monitor`).

## 1) What the "ML model" is in SmartPulse today

SmartPulse currently uses a **deterministic ensemble scoring system** implemented in backend services, not a library-trained model (for example, no TensorFlow, PyTorch, scikit-learn).

The pipeline has:

1. Data ingestion from survey + usage telemetry.
2. Preprocessing and feature engineering.
3. Three model-style scorers (RandomForest-like, ExtraTrees-like, SVM-like).
4. Weighted ensemble score (0-100) and risk class (`LOW`/`MODERATE`/`HIGH`).
5. Optional weight tuning via grid search (`POST /api/prediction/train`).

Code locations:

- `backend/src/preprocessing/preprocessing.service.ts`
- `backend/src/prediction/prediction.service.ts`
- `backend/src/risk-analysis/risk-analysis.service.ts`
- `backend/src/recommendation/recommendation.service.ts`

## 2) Data considered by the algorithm

### 2.1 Core behavioral data used directly for risk prediction

From `usage_records`, the prediction pipeline currently uses:

- `screenTimeMinutes`
- `unlockCount`
- `socialMediaMinutes`
- `nightUsageMinutes`
- `longestSessionMinutes`

### 2.2 Psychological data used directly for risk prediction

From `survey_responses`, the preprocessing pipeline uses the latest survey only:

- `stressLevel`
- `anxietyLevel`
- `depressionLevel`
- `sleepQuality`
- `sleepHours`
- `socialInteraction`
- `dailyProductivity`
- `phoneDependence`
- `mood`

### 2.3 Additional telemetry collected and stored (not part of current scoring)

Also stored in `usage_records`:

- `appUsageJson`
- `appCategoryTimelineJson`
- `sessionEventsJson`
- `notificationInteractionJson`
- `sleepProxyJson`
- `activityContextJson`
- `batteryContextJson`
- `connectivityContextJson`
- `locationContextJson`
- `microCheckinsJson`
- `interventionOutcomesJson`
- `notificationCount`
- `peakUsageHour`

These enrich analytics and future model potential, but are **not currently consumed** by the scoring equations in `PredictionService`.

### 2.4 How the mobile app captures data

Android plugin (`SmartPulseUsagePlugin`) builds daily snapshots from `UsageStatsManager` + usage events:

- Foreground minutes per app -> total screen time.
- `KEYGUARD_HIDDEN` events -> unlock count.
- Category keyword matching on package/app label -> social/video/games/productivity buckets.
- Night usage from hourly distribution (`22:00-06:00`).
- Longest continuous session from foreground/background pairs.
- Session timeline and notification interaction telemetry.
- Heuristic context objects (sleep/activity/location/battery/connectivity).

Usage sync behavior:

- App collects and buffers daily records locally.
- Sync cycle runs every 6 hours and on app resume.
- Batch upload endpoint: `POST /api/usage/batch`.

## 3) Preprocessing and feature engineering internals

### 3.1 Windowing and record cleanup

For each preprocess call:

- Lookback days are clamped to `7..180` (default `30`).
- Usage records are deduplicated by date (latest `createdAt` kept).
- Invalid usage rows are dropped if:
  - date format is invalid (`YYYY-MM-DD` required),
  - values are out of strict bounds,
  - relational checks fail (`socialMedia > screenTime`, etc.).

Strict bounds:

- `screenTimeMinutes`: `0..1440`
- `unlockCount`: `0..2000`
- `socialMediaMinutes`: `0..1440`
- `nightUsageMinutes`: `0..720`
- `longestSessionMinutes`: `0..720`
- `peakUsageHour`: `0..23` (nullable)

### 3.2 Survey validation fallback behavior

- If latest survey is missing or malformed, SmartPulse uses neutral defaults:
  - stress/anxiety/depression/sleepQuality/socialInteraction/dailyProductivity/phoneDependence = `5`
  - sleepHours = `7`
  - mood = `3`
- A quality warning is recorded.

### 3.3 Normalization

Usage averages are computed across cleaned lookback records.

Supporting value:

- `activeHoursEstimate = clamp((avgScreenTimeMinutes / 60) * 1.6 + 3.2, 4, 18)`

Key normalized values:

- `screenTimeNorm = normalize(avgScreenTimeMinutes, 0, 720)`
- `unlockNorm = normalize(avgUnlockCount, 0, 180)`
- `socialNorm = normalize(avgSocialMediaMinutes, 0, 360)`
- `nightNorm = normalize(avgNightUsageMinutes, 0, 180)`
- `sessionNorm = normalize(avgLongestSessionMinutes, 0, 120)`
- `stressNorm = clamp((stress + anxiety + depression) / 30, 0, 1)`
- `dependenceNorm = normalize(phoneDependence, 1, 10)`
- `compulsiveCheckingNorm = normalize(avgUnlockCount / activeHoursEstimate, 0, 18)`
- `socialIntensityNorm = clamp(avgSocialMediaMinutes / max(avgScreenTimeMinutes,1), 0, 1)`
- `nightRatioNorm = clamp(avgNightUsageMinutes / max(avgScreenTimeMinutes,1), 0, 1)`

Sleep disruption normalization:

- `sleepHourPenalty = normalize(7 - sleepHours, 0, 4)` when `sleepHours < 7`
- else `sleepHourPenalty = normalize(sleepHours - 9, 0, 4) * 0.4`
- `sleepQualityPenalty = normalize(10 - sleepQuality, 0, 9)`
- `sleepDisruptionNorm = clamp(sleepHourPenalty * 0.6 + sleepQualityPenalty * 0.4, 0, 1)`

### 3.4 Engineered feature set

Main engineered scores (0-100 style unless noted):

- `lateNightUsageScore = (nightNorm*0.7 + nightRatioNorm*0.3) * 100`
- `socialMediaDependencyScore = (socialNorm*0.55 + socialIntensityNorm*0.25 + dependenceNorm*0.2) * 100`
- `addictionBehaviorScore = (screenTimeNorm*0.27 + unlockNorm*0.2 + compulsiveCheckingNorm*0.16 + socialNorm*0.17 + nightNorm*0.12 + sessionNorm*0.08) * 100`
- `digitalDependencyScore = (screenTimeNorm*0.24 + unlockNorm*0.2 + compulsiveCheckingNorm*0.2 + socialIntensityNorm*0.16 + nightRatioNorm*0.1 + dependenceNorm*0.1) * 100`
- `psychologicalStressScore = stressNorm * 100`
- `sleepDisruptionScore = sleepDisruptionNorm * 100`
- `moodRiskScore = normalize(5 - mood, 0, 4) * 100`
- `productivityRiskScore = normalize(10 - dailyProductivity, 0, 9) * 100`
- `nightUsageRatio = nightRatioNorm * 100`
- `socialMediaIntensity = socialIntensityNorm * 100`
- `compulsiveCheckingScore = avgUnlockCount / activeHoursEstimate`

Combined risk signal from preprocessing:

- `overallRiskSignal = addictionBehaviorScore*0.43 + digitalDependencyScore*0.19 + socialMediaDependencyScore*0.13 + psychologicalStressScore*0.13 + sleepDisruptionScore*0.07 + moodRiskScore*0.03 + productivityRiskScore*0.02`

### 3.5 Feature selection logic

Selection uses three rules:

- Keep if feature is marked essential.
- Keep if static importance >= `0.7`.
- Keep if variance signal >= `0.02`.

Variance signals are computed from historical usage variation (normalized variance). Some survey-only features have variance set to `0` and are kept by importance/essential rules.

Outputs saved:

- selected feature vector
- dropped keys
- importance and variance maps
- per-feature selection reason

### 3.6 Preprocessing label generation

Each feature snapshot also gets a derived class:

- `HIGH` if `overallRiskSignal >= 70`
- `MODERATE` if `>= 40`
- else `LOW`

This label is stored as `addictionLabel` in `feature_store_records`.

## 4) Prediction algorithm internals

### 4.1 Three model-style scorers

Given engineered features:

1. RandomForest-like score

`rf = addictionBehaviorScore*0.42 + digitalDependencyScore*0.23 + socialMediaDependencyScore*0.2 + lateNightUsageScore*0.1 + sleepDisruptionScore*0.05`

2. ExtraTrees-like score

- Interaction term: `behaviorInteraction = (avgScreenTimeMinutes/720) * (avgUnlockCount/180) * 100`
- Score:
`et = addictionBehaviorScore*0.35 + compulsiveCheckingScore*1.8 + psychologicalStressScore*0.2 + productivityRiskScore*0.1 + socialMediaIntensity*0.1 + bound(behaviorInteraction)*0.15`

3. SVM-like score

`svm = overallRiskSignal*0.58 + digitalDependencyScore*0.17 + psychologicalStressScore*0.15 + sleepDisruptionScore*0.1`

All bounded to `0..100` and rounded.

### 4.2 Ensemble combination

`riskScore = rf*w_rf + et*w_et + svm*w_svm`

Default weights:

- `w_rf = 0.40`
- `w_et = 0.35`
- `w_svm = 0.25`

Risk class:

- `HIGH` if `riskScore >= 70`
- `MODERATE` if `riskScore >= 40`
- else `LOW`

### 4.3 Prediction insights generated from rules

Rule-based insights are added when thresholds fire, for example:

- unlocks >= 100
- night usage >= 90 min/day
- social media >= 180 min/day
- compulsive checking >= 10 unlocks/active-hour
- psychological stress >= 65

If none fire, a safe-pattern message is added.

### 4.4 Prediction persistence

Stored in `prediction_results`:

- date
- `riskScore`, `riskLevel`
- `randomForestScore`, `extraTreesScore`, `svmScore`
- `featureVectorJson`
- `insightsJson`

## 5) Training flow (`POST /api/prediction/train`)

### 5.1 Sample assembly

Training samples are loaded from:

- `feature_store_records` (selected feature vector + `addictionLabel`)
- historical `prediction_results` (fallback dates not already in feature store map)

Key caveat:

- Labels come from internal derived classes (`addictionLabel` or prior `riskLevel`), not external clinical ground truth.

### 5.2 Dataset split strategy

Samples are date-sorted ascending and split:

- 70% train
- 15% validation
- 15% test

Fallback safeguards ensure non-empty validation/test by copying last available samples when needed.

### 5.3 Weight grid search

Grid candidates:

- `{0.45, 0.35, 0.20}`
- `{0.40, 0.35, 0.25}`
- `{0.35, 0.40, 0.25}`
- `{0.30, 0.45, 0.25}`
- `{0.40, 0.30, 0.30}`
- `{0.50, 0.25, 0.25}`
- `{0.33, 0.33, 0.34}`

Selection objective:

- maximize validation macro F1
- use validation accuracy as tie-breaker

### 5.4 Metrics computed

From validation/test predictions:

- Accuracy
- Macro Precision
- Macro Recall
- Macro F1
- ROC-AUC (binary framing: `HIGH` vs non-`HIGH`)

All are returned in percentage form.

### 5.5 Cross-validation

- 3-fold F1 estimate on training set (`crossValidationF1`).
- If too few samples for folds, value is `0`.

### 5.6 Model profile persistence

Per-user model profile (`model_profiles`) stores:

- selected weights
- grid search summary
- metrics JSON (validation/test/cv)
- trained sample count
- training timestamp

Weights are normalized when read back to ensure sum is 1.

### 5.7 Practical meaning of training in current system

Training does **not** fit tree/SVM parameters. It tunes only ensemble weights over fixed deterministic scorers.

## 6) Internal post-model reasoning layers

### 6.1 Risk pattern analysis

`RiskAnalysisService` detects patterns from features with rule thresholds:

- high screen time: `avgScreenTimeMinutes >= 360`
- frequent unlocks: `>= 100` (high severity from `>= 140`)
- night usage: `avgNightUsageMinutes >= 90` or `lateNightUsageScore >= 65`
- social dependency: `avgSocialMediaMinutes >= 180` or `socialMediaDependencyScore >= 70`
- psychological stress: `>= 65`
- sleep disruption: `>= 60`

It returns:

- pattern list with severity and thresholds
- combined insight text
- model breakdown (`rf`, `et`, `svm`)
- optional AI-generated narrative (Groq) with deterministic fallback

### 6.2 Recommendation generation

`RecommendationService` uses analysis + features and emits category-tagged actions.

Rule examples:

- screen cap recommendation at `avgScreenTimeMinutes >= 300`
- night cutoff at `avgNightUsageMinutes >= 60`
- social media block at `avgSocialMediaMinutes >= 150`
- stress/sleep routine when stress or sleep disruption >= `60`

Optional AI recommendation line is prepended when Groq is configured.

### 6.3 Notification logic

`NotificationService` converts thresholds + risk state into alert candidates and deduplicates by `(user, date, type)`.

Trigger examples:

- screen time >= 300 (critical from >= 420)
- night usage >= 90 (critical from >= 140)
- unlock count >= 100 (critical from >= 150)
- moderate/high risk prediction
- AI insight message

## 7) API surface for modeling lifecycle

- `POST /api/preprocessing/run?lookbackDays=30`
- `GET /api/preprocessing/feature-store?limit=90`
- `POST /api/prediction/run`
- `POST /api/prediction/train`
- `GET /api/prediction/latest`
- `GET /api/prediction/history?limit=30`
- `GET /api/risk-analysis/latest`
- `GET /api/recommendation/latest`
- `POST /api/notification/evaluate`
- `GET /api/analytics/dashboard`
- `GET /api/analytics/research-export?days=30`

## 8) End-to-end internal process flow

1. Mobile plugin collects daily usage snapshot from Android usage events.
2. Frontend sync loop buffers records and uploads via `/usage/batch`.
3. Survey responses are submitted by user and stored.
4. Preprocessing merges latest survey + recent usage window.
5. Features are engineered, selected, labeled, and persisted to feature store.
6. Prediction scorer computes per-model outputs and weighted risk score.
7. Risk-analysis layer converts scores into interpretable patterns and insights.
8. Recommendation and notification modules generate actions and alerts.
9. Optional training endpoint tunes ensemble weights from historical stored samples.

## 9) Current limitations and important caveats

1. Model type: deterministic scoring system, not learned tree/SVM parameters.
2. Label source: training uses internally derived labels, not external ground truth.
3. Drift control: no explicit calibration or concept drift adaptation yet.
4. Feature usage gap: rich telemetry is stored but not yet integrated into scoring.
5. Temporal modeling: no sequence model over session timelines yet.

## 10) Suggested future upgrades (if desired)

1. Introduce ground-truth labels (clinical/validated assessments) for supervised learning.
2. Replace fixed scorers with trainable models and real feature importance from data.
3. Use contextual telemetry (sleep/activity/connectivity/notification interaction) in features.
4. Add calibration monitoring and periodic backtesting.
5. Add fairness and bias audits across user segments.
