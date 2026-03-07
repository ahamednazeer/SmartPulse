# SmartPulse Capacitor Android Integration

This document defines how SmartPulse should integrate Capacitor for Android usage telemetry and backend sync.

## 1) Required Capacitor Plugins

Install in `frontend`:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/app @capacitor/device @capacitor/network @capacitor/preferences @capacitor/local-notifications
npm install @capacitor/background-runner
```

Then initialize/sync Android:

```bash
npx cap add android
npm run android:build
```

## 2) Runtime Responsibilities in SmartPulse

`frontend/src/lib/mobile` now contains wrappers for:

- `Device` metadata collection (model/os/device id/platform)
- `App` lifecycle observation (foreground/background)
- `Network` connectivity checks and listeners
- `Preferences` local buffering for offline sync
- `LocalNotifications` permission flow and local alert delivery
- `SmartPulseUsage` (custom Android plugin contract)

The dashboard layout starts a background cycle via `useUsageSync`:

- collect usage snapshot from start-of-day to now
- enqueue locally
- upload to `/usage/batch` every 6 hours or app-foreground resume

## 3) Custom Android Plugin Contract

Frontend expects a Capacitor plugin named `SmartPulseUsage` with methods:

- `checkUsageAccess() -> { granted: boolean }`
- `openUsageAccessSettings() -> void`
- `checkBatteryOptimization() -> { available: boolean, ignoring: boolean }`
- `openBatteryOptimizationSettings() -> void`
- `collectUsageSnapshot({ startTimeMs: number, endTimeMs: number }) -> { snapshot: UsageSnapshot | null }`

`UsageSnapshot` shape:

```json
{
  "screenTimeMinutes": 0,
  "unlockCount": 0,
  "appUsage": {
    "com.instagram.android": 90
  },
  "socialMediaMinutes": 0,
  "nightUsageMinutes": 0,
  "peakUsageHour": 21,
  "longestSessionMinutes": 0,
  "notificationCount": 0
}
```

## 4) Android Native Implementation (UsageStatsManager)

Create plugin class:

`android/app/src/main/java/io/smartpulse/app/SmartPulseUsagePlugin.java`

```java
package io.smartpulse.app;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Process;
import android.provider.Settings;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "SmartPulseUsage")
public class SmartPulseUsagePlugin extends Plugin {

    @PluginMethod
    public void checkUsageAccess(PluginCall call) {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            getContext().getPackageName()
        );

        JSObject result = new JSObject();
        result.put("granted", mode == AppOpsManager.MODE_ALLOWED);
        call.resolve(result);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void collectUsageSnapshot(PluginCall call) {
        Long startMs = call.getLong("startTimeMs");
        Long endMs = call.getLong("endTimeMs");

        if (startMs == null || endMs == null) {
            call.reject("startTimeMs and endTimeMs are required");
            return;
        }

        UsageStatsManager usageStatsManager =
            (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);

        List<UsageStats> stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startMs,
            endMs
        );

        Map<String, Double> appUsageMinutes = new HashMap<>();
        double screenTimeMinutes = 0.0;

        for (UsageStats stat : stats) {
            double minutes = stat.getTotalTimeInForeground() / 60000.0;
            if (minutes <= 0.0) continue;
            screenTimeMinutes += minutes;
            appUsageMinutes.put(stat.getPackageName(), minutes);
        }

        int unlockCount = 0;
        UsageEvents events = usageStatsManager.queryEvents(startMs, endMs);
        UsageEvents.Event event = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            if (event.getEventType() == UsageEvents.Event.KEYGUARD_HIDDEN) {
                unlockCount++;
            }
        }

        JSObject snapshot = new JSObject();
        snapshot.put("screenTimeMinutes", Math.round(screenTimeMinutes));
        snapshot.put("unlockCount", unlockCount);
        snapshot.put("socialMediaMinutes", 0);
        snapshot.put("nightUsageMinutes", 0);
        snapshot.put("peakUsageHour", null);
        snapshot.put("longestSessionMinutes", 0);
        snapshot.put("notificationCount", 0);

        JSObject appUsage = new JSObject();
        for (Map.Entry<String, Double> entry : appUsageMinutes.entrySet()) {
            appUsage.put(entry.getKey(), Math.round(entry.getValue()));
        }
        snapshot.put("appUsage", appUsage);

        JSObject result = new JSObject();
        result.put("snapshot", snapshot);
        call.resolve(result);
    }
}
```

Add plugin package registration if your Capacitor version requires manual registration in `MainActivity`.

## 5) Android Manifest + Permissions

`android/app/src/main/AndroidManifest.xml` should include:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
    tools:ignore="ProtectedPermissions" />
```

Recommended optional permissions:

```xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

## 6) Backend Data Sync

SmartPulse sync strategy:

- collect + enqueue usage data locally
- flush every 6 hours
- retry automatically when app resumes or reconnects

Upload endpoint already used:

- `POST /api/usage/batch`

Payload shape:

```json
{
  "records": [
    {
      "date": "2026-03-04",
      "screenTimeMinutes": 320,
      "unlockCount": 118,
      "appUsageJson": "{\"com.instagram.android\":135}",
      "socialMediaMinutes": 180,
      "nightUsageMinutes": 42,
      "peakUsageHour": 22,
      "longestSessionMinutes": 48,
      "notificationCount": 210
    }
  ]
}
```

## 7) User Permission Flow in App

In UI, permission toggles now do native checks before enabling:

- screen usage/app statistics/background tracking -> verify Usage Access
- notification access -> request push permission

If access is missing, SmartPulse opens Android settings and prompts user to return.

Dedicated checklist screens:

- `/native-setup` (during onboarding before permission submit)
- `/dashboard/native-setup` (from dashboard navigation for later re-checks)

## 8) Verification Checklist

- Login/register works on web and native builds
- Permission setup enables only when Android permission is granted
- Usage snapshots are generated and buffered offline
- Buffered records upload after connectivity returns
- Dashboard overview and analysis pages show backend summary data
- `npm run android:e2e` completes and launches app on a connected device
