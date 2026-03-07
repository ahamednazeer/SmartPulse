# SmartPulse Module Architecture (Modules 2-10)

This document maps the SmartPulse module design to implementation-level behavior and API surfaces.

## Module 2 - Psychological Survey Module

### Purpose
Collect psychological indicators affecting smartphone addiction risk.

### Data Collected
- stress level
- anxiety level
- depression indicators
- sleep quality and hours
- social interaction
- daily productivity
- emotional dependence on phone
- mood and optional notes

### Flow
1. Survey initializes after account setup (`/survey`).
2. User answers questionnaire fields.
3. Backend validation enforces required ranges.
4. Survey data is submitted to backend.
5. Data is stored in `survey_responses`.

### Output
Per-user psychological profile dataset.

## Module 3 - Smartphone Usage Monitoring Module

### Purpose
Track behavior patterns automatically from Android telemetry.

### Data Collected
- screen time
- unlock frequency
- app usage duration
- time-of-day usage
- night usage
- social media usage

### Flow
1. Usage tracking starts after permission approval.
2. Native plugin collects foreground and unlock events.
3. Raw events are aggregated into daily metrics.
4. Data is buffered locally.
5. Data uploads to backend every 6 hours (or on app resume).

### Output
Structured behavioral dataset in `usage_records`.

## Module 4 - Data Preprocessing Module

### Purpose
Clean and normalize raw data before ML inference.

### Inputs
- behavioral data (`usage_records`)
- psychological data (`survey_responses`)

### Flow
1. Raw usage events are ingested from API-backed records.
2. Validation removes unrealistic values (for example, `screenTime > 1440` minutes/day).
3. Cleaning removes duplicate records by date and incomplete survey inputs.
4. Metrics are normalized to consistent scales.
5. Engineered scores are produced:
   - addiction behavior score
   - digital dependency score
   - compulsive checking score
   - late-night usage score
   - night usage ratio
   - social media intensity
   - social media dependency score
   - psychological stress score
   - sleep disruption score
6. Feature selection applies importance + variance checks.
7. Final ML-ready rows are persisted to feature store.

### Output
ML-ready feature vector.

### Implementation
- Service: `backend/src/preprocessing/preprocessing.service.ts`
- Entity: `backend/src/entities/feature-store-record.entity.ts`

## Module 5 - Machine Learning Prediction Module

### Purpose
Predict addiction risk using ensemble-style model scoring.

### Flow
1. Preprocessed features are generated.
2. Training workflow supports:
   - 70/15/15 train-validation-test split
   - grid-search over ensemble weights
   - macro precision/recall/F1 and ROC-AUC metrics
3. Three model-style scores are computed at inference:
   - Random Forest-like score
   - Extra Trees-like score
   - SVM-like score
4. Weighted ensemble risk score (0-100) is computed.
5. User is classified: `LOW` / `MODERATE` / `HIGH`.
6. Result is persisted.

### Output
Addiction risk score and class in `prediction_results`.

### API
- `POST /api/prediction/run`
- `POST /api/prediction/train`
- `GET /api/prediction/latest`
- `GET /api/prediction/history?limit=30`

## Module 6 - Risk Analysis Module

### Purpose
Interpret model outputs into understandable risk insights.

### Flow
1. Latest prediction is loaded/generated.
2. Behavioral pattern checks run:
   - high screen time
   - frequent unlocks
   - night usage
   - social media dependency
   - stress/sleep disruption
3. Groq AI insight generation runs when `GROQ_API_KEY` is configured.
4. Human-readable insights are generated (Groq output with deterministic fallback).

### Output
Risk interpretation with patterns and metrics.

### API
- `GET /api/risk-analysis/latest`

## Module 7 - Alert and Notification Module

### Purpose
Trigger awareness alerts based on thresholds and risk.

### Trigger Sources
- daily screen-time threshold
- unlock frequency threshold
- night usage threshold
- high addiction risk prediction

### Flow
1. Evaluate latest usage + risk.
2. Generate alert candidates from thresholds + risk-state changes + AI insight text.
3. De-duplicate per `date + type`.
4. Persist alert history.

### Output
Notification history and unread counts.

### Storage
- `notification_history`

### API
- `POST /api/notification/evaluate`
- `GET /api/notification?limit=30`
- `GET /api/notification/unread-count`
- `PATCH /api/notification/:id/read`

## Module 8 - Recommendation Engine Module

### Purpose
Provide personalized behavior-reduction actions.

### Flow
1. Analyze latest risk + feature profile.
2. Generate recommendations by category:
   - screen-time reduction
   - night-time cutoff
   - social media scheduling
   - wellbeing recovery routine
3. Optionally enrich recommendations with Groq-generated personalized coaching line.
4. Prioritize recommendations by risk level.

### Output
Personalized recommendation list.

### API
- `GET /api/recommendation/latest`

## Module 9 - Data Storage Module

### Stored Data
- user profile and permission state
- psychological surveys
- behavioral usage metrics
- prediction results
- notification history

### Primary Tables
- `users`
- `permissions`
- `survey_responses`
- `usage_records`
- `prediction_results`
- `notification_history`

## Module 10 - Analytics & Reporting Module

### Purpose
Provide dashboards and exportable insight datasets.

### Flow
1. Build dashboard aggregates and trends.
2. Return usage and risk trend arrays.
3. Generate anonymized research export bundle.

### Output
Dashboard analytics and anonymized export payload.

### API
- `GET /api/analytics/dashboard`
- `GET /api/analytics/research-export?days=30`

## End-to-End System Flow

1. User registers/login in mobile app.
2. User completes psychological survey.
3. App collects smartphone usage data.
4. Usage data syncs to backend periodically.
5. Preprocessing builds integrated feature vectors.
6. Prediction engine computes addiction risk.
7. Risk analysis explains key behavior patterns.
8. Alerts and recommendations are generated.
9. Dashboard surfaces trends and risk updates.
10. Data is retained for analytics and future learning.
