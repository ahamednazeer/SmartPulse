# SmartPulse Module Architecture (Modules 2-11)

This document summarizes current SmartPulse behavior based on implementation.

## Module 2 - Psychological Survey Module

### Purpose
Collect psychological risk indicators.

### Data
- stress, anxiety, depression
- sleep quality and sleep hours
- social interaction, productivity
- phone dependence, mood, optional notes

### API
- `POST /api/survey`
- `GET /api/survey`
- `GET /api/survey/latest`

## Module 3 - Smartphone Usage Monitoring Module

### Purpose
Collect behavioral telemetry from Android usage stats and events.

### Data
- screen time, unlock count, social minutes, night minutes
- app usage and category timeline
- session events and notification interaction
- sleep/activity/battery/connectivity/location context

### Flow
1. Native plugin captures usage snapshot.
2. Frontend buffers record locally.
3. Sync cycle uploads batch every 6 hours and on app resume.

### API
- `POST /api/usage`
- `POST /api/usage/batch`
- `GET /api/usage`
- `GET /api/usage/summary`

## Module 4 - Data Preprocessing Module

### Purpose
Convert raw behavioral + survey data into ML-ready vectors.

### Core behavior
- dedup by date and strict validation bounds
- survey fallback defaults when missing
- normalization + engineered scores
- contextual feature extraction from telemetry JSON
- feature selection using essential/importance/variance rules

### Output
- selected feature vector
- quality metadata
- derived addiction label (`LOW`/`MODERATE`/`HIGH`)

### Storage
- `feature_store_records`

### API
- `POST /api/preprocessing/run`
- `GET /api/preprocessing/feature-store`

## Module 5 - Prediction and Training Module

### Purpose
Compute addiction risk and train user-specific scoring artifacts.

### Inference
- three scorer channels (`randomForest`, `extraTrees`, `svm`)
- learned tree-ensemble scorers if available
- deterministic fallback formulas otherwise
- weighted ensemble risk score (`0..100`) and class

### Algorithms used
- deterministic weighted feature engineering in preprocessing
- three channel scorers:
  - RandomForest-like weighted additive heuristic
  - ExtraTrees-like heuristic with feature interaction term `screenTime x unlockCount`
  - SVM-like linear margin heuristic
- optional learned non-linear tree ensembles per channel using:
  - recursive squared-error split optimization
  - best-split or random-threshold split strategies
  - bootstrap/subsample tree construction
- ensemble weight grid search over fixed candidate weight sets
- macro classification metrics and high-risk ROC-AUC

### Training
- sample assembly from feature store + prediction history
- ground-truth override by date when present
- 70/15/15 train-validation-test split
- learned tree-ensemble fitting
- ensemble weight grid search
- metrics: accuracy, precision, recall, F1, ROC-AUC

### Storage
- `prediction_results`
- `model_profiles` (weights, learned models, feature importance, monitoring)

### API
- `POST /api/prediction/run`
- `POST /api/prediction/train`
- `GET /api/prediction/latest`
- `GET /api/prediction/history?limit=30`
- `GET /api/prediction/monitor?days=90`
- `GET /api/prediction/training-summary`

## Module 6 - Risk Analysis Module

### Purpose
Explain model outputs as behavioral patterns.

### Behavior
- threshold-based pattern detection
- optional Groq-generated insight
- deterministic fallback insight

### API
- `GET /api/risk-analysis/latest`

## Module 7 - Alert and Notification Module

### Purpose
Generate actionable alerts from thresholds and risk levels.

### Behavior
- threshold + risk-based candidate generation
- de-duplication by `(date, type)`
- unread tracking

### API
- `POST /api/notification/evaluate`
- `GET /api/notification?limit=30`
- `GET /api/notification/unread-count`
- `PATCH /api/notification/:id/read`

## Module 8 - Recommendation Engine Module

### Purpose
Return intervention recommendations using risk + profile signals.

### Behavior
- rule-based actions for screen/night/social/wellbeing
- optional Groq personalized recommendation

### API
- `GET /api/recommendation/latest`

## Module 9 - Data Storage Module

### Primary tables
- `users`
- `permissions`
- `survey_responses`
- `usage_records`
- `feature_store_records`
- `prediction_results`
- `model_profiles`
- `ground_truth_labels`
- `notification_history`

## Module 10 - Analytics and Reporting Module

### Purpose
Power dashboard trends and research export.

### API
- `GET /api/analytics/dashboard`
- `GET /api/analytics/research-export?days=30`

## Module 11 - Ground-Truth and Model Governance Module

### Purpose
Capture validated labels and expose model reliability diagnostics.

### Behavior
- upsert/list/latest ground-truth labels
- monitoring output with:
  - calibration
  - rolling backtest
  - drift flags
  - fairness segment audit

### Algorithms used
- calibration: Brier score + Expected Calibration Error with 5 bins
- drift: relative mean shift between recent and baseline feature windows
- fairness: demographic segment-wise confusion-matrix audit using `HIGH` as positive class, with behavioral fallback when demographic coverage is insufficient

### API
- `POST /api/ground-truth/label`
- `GET /api/ground-truth`
- `GET /api/ground-truth/latest`

## End-to-end flow

1. User completes survey and grants permissions.
2. App collects and syncs usage telemetry.
3. Preprocessing creates selected feature vectors.
4. Prediction module computes risk and persists outputs.
5. Risk analysis, recommendations, and notifications are produced.
6. Ground-truth labels can be submitted for supervised correction.
7. Training updates learned scorer models and weights.
8. Monitoring reports calibration/backtest/drift/fairness health.
