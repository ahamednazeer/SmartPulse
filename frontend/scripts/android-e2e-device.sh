#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE_NAME="io.smartpulse.app"
MAIN_ACTIVITY="$PACKAGE_NAME/.MainActivity"

SKIP_WEB_BUILD=0
SKIP_APK_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --skip-web-build)
      SKIP_WEB_BUILD=1
      ;;
    --skip-apk-build)
      SKIP_APK_BUILD=1
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./scripts/android-e2e-device.sh [--skip-web-build] [--skip-apk-build]"
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_cmd npm
require_cmd adb

cd "$ROOT_DIR"

echo "[1/7] Verifying frontend dependencies"
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "node_modules not found, installing dependencies..."
  npm install
fi

if [[ "$SKIP_WEB_BUILD" -eq 0 ]]; then
  echo "[2/7] Building web assets"
  npm run build
else
  echo "[2/7] Skipping web build (--skip-web-build)"
fi

echo "[3/7] Syncing Capacitor Android"
npm run cap:sync

if [[ "$SKIP_APK_BUILD" -eq 0 ]]; then
  echo "[4/7] Building debug APK"
  (
    cd "$ANDROID_DIR"
    ./gradlew :app:assembleDebug
  )
else
  echo "[4/7] Skipping APK build (--skip-apk-build)"
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "Debug APK not found at $APK_PATH"
  exit 1
fi

echo "[5/7] Checking connected Android device"
adb start-server >/dev/null
DEVICE_COUNT="$(adb devices | awk 'NR>1 && $2=="device" {count++} END {print count+0}')"
if [[ "$DEVICE_COUNT" -eq 0 ]]; then
  echo "No connected Android device found. Connect a device or start an emulator first."
  exit 1
fi

echo "[6/7] Installing APK on connected device"
adb install -r "$APK_PATH" >/dev/null

echo "[7/7] Launching SmartPulse"
adb shell am start -n "$MAIN_ACTIVITY" >/dev/null

cat <<'CHECKLIST'

Quick Device E2E Checklist
1. Log in to SmartPulse on the device.
2. Open Native Setup Checklist (from Permission Setup or Dashboard sidebar).
3. Tap "Open Usage Access Settings" and grant SmartPulse usage access.
4. Tap "Request Notification Permission" and allow notifications.
5. Open Permissions page and enable all four SmartPulse permissions.
6. Keep app open for at least 1 minute, then close/reopen to trigger resume sync.
7. Confirm dashboard/analysis pages start showing usage summary data.

Useful adb commands
- View app logs:
  adb logcat | rg "SmartPulseUsage|Capacitor"
- Relaunch app:
  adb shell am start -n io.smartpulse.app/.MainActivity
- Open Usage Access settings directly:
  adb shell am start -a android.settings.USAGE_ACCESS_SETTINGS
CHECKLIST
