# SmartPulse Frontend

SmartPulse frontend is a Next.js app with web + Capacitor Android integration for collecting smartphone usage telemetry.

## Environment

Use `frontend/.env.example` as the reference for runtime variables.

- `NEXT_PUBLIC_API_URL`: backend API base URL (default local: `http://localhost:3001/api`)
- `NEXT_PUBLIC_API_URL_MOBILE`: optional override used in native Capacitor runtime (recommended: `http://<your-lan-ip>:3001/api`)
If frontend is served from `https://localhost`, use an HTTPS `NEXT_PUBLIC_API_URL` to avoid mixed-content blocking.

## Local Web Development

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Mobile Build (Capacitor Android)

1. Install Capacitor dependencies (see doc below).
2. Build exported web assets.
3. Sync Android project.

```bash
npm run android:build
npm run cap:open
```

Capacitor config is in `frontend/capacitor.config.json`.

## Device E2E Smoke Test

Run a full Android device smoke flow (build, sync, APK install, launch):

```bash
npm run android:e2e
```

Optional flags:

```bash
./scripts/android-e2e-device.sh --skip-web-build --skip-apk-build
```

## Integration Guide

Detailed Android plugin, permissions, and sync architecture:

- `frontend/docs/capacitor-android-integration.md`

## Key Runtime Modules

- `src/lib/mobile/usageSync.ts`: 6-hour collection + batch sync cycle
- `src/lib/mobile/permissions.ts`: native permission checks for UI toggles
- `src/hooks/useUsageSync.ts`: starts sync loop from dashboard shell
