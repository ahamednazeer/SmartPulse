package io.smartpulse.app;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import java.util.LinkedList;
import org.json.JSONArray;


import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.PowerManager;
import android.os.Process;
import android.provider.Settings;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "SmartPulseUsage")
public class SmartPulseUsagePlugin extends Plugin {

    private ScreenStateReceiver screenStateReceiver;
    private SensorManager sensorManager;
    private Sensor stepSensor;
    private int stepCount = 0;

    private SensorEventListener stepListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            stepCount = (int) event.values[0];
            SharedPreferences prefs = getContext().getSharedPreferences("SmartPulseScreenPrefs", Context.MODE_PRIVATE);
            prefs.edit().putInt("dailyStepCount", stepCount).apply();
        }
        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    @Override
    public void load() {
        super.load();
        screenStateReceiver = new ScreenStateReceiver();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        getContext().registerReceiver(screenStateReceiver, filter);

        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
            if (stepSensor != null) {
                sensorManager.registerListener(stepListener, stepSensor, SensorManager.SENSOR_DELAY_UI);
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (screenStateReceiver != null) {
            getContext().unregisterReceiver(screenStateReceiver);
        }
        if (sensorManager != null) {
            sensorManager.unregisterListener(stepListener);
        }
    }


    private static final int MINUTES_IN_MILLIS = 60 * 1000;
    private static final int NOTIFICATION_OPEN_WINDOW_MS = 2 * 60 * 1000;
    private static final int MAX_SESSION_EVENTS = 250;
    private static final int SHORT_SESSION_MAX_MS = 2 * MINUTES_IN_MILLIS;
    private static final int EVENT_NOTIFICATION_INTERRUPTION =
        resolveUsageEventConstant("NOTIFICATION_INTERRUPTION");

    private static final Set<String> SOCIAL_KEYWORDS = new HashSet<String>() {{
        add("instagram");
        add("facebook");
        add("whatsapp");
        add("messenger");
        add("telegram");
        add("snapchat");
        add("twitter");
        add("linkedin");
        add("reddit");
        add("discord");
        add("youtube");
        add("tiktok");
    }};

    private static final Set<String> VIDEO_KEYWORDS = new HashSet<String>() {{
        add("youtube");
        add("netflix");
        add("primevideo");
        add("hotstar");
        add("hulu");
        add("mxplayer");
        add("vimeo");
        add("video");
        add("ott");
    }};

    private static final Set<String> GAMES_KEYWORDS = new HashSet<String>() {{
        add("game");
        add("pubg");
        add("freefire");
        add("cod");
        add("clash");
        add("roblox");
        add("minecraft");
        add("candy");
    }};

    private static final Set<String> PRODUCTIVITY_KEYWORDS = new HashSet<String>() {{
        add("docs");
        add("sheets");
        add("slides");
        add("notion");
        add("calendar");
        add("outlook");
        add("gmail");
        add("slack");
        add("teams");
        add("zoom");
        add("meet");
        add("office");
        add("todo");
        add("task");
        add("drive");
    }};

    @PluginMethod
    public void checkUsageAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasUsageAccess());
        call.resolve(result);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        PowerManager powerManager =
            (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);

        JSObject result = new JSObject();
        if (powerManager == null) {
            result.put("available", false);
            result.put("ignoring", false);
            call.resolve(result);
            return;
        }

        boolean ignoring = powerManager.isIgnoringBatteryOptimizations(
            getContext().getPackageName()
        );
        result.put("available", true);
        result.put("ignoring", ignoring);
        call.resolve(result);
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        Intent appSpecificIntent = new Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + getContext().getPackageName())
        );
        appSpecificIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Intent fallbackIntent = new Intent(
            Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(appSpecificIntent);
            call.resolve();
        } catch (Exception ignored) {
            try {
                getContext().startActivity(fallbackIntent);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Unable to open battery optimization settings", ex);
            }
        }
    }

    @PluginMethod
    public void collectUsageSnapshot(PluginCall call) {
        if (!hasUsageAccess()) {
            call.reject("Usage access is not granted");
            return;
        }

        Long startTimeMs = call.getLong("startTimeMs");
        Long endTimeMs = call.getLong("endTimeMs");

        if (startTimeMs == null || endTimeMs == null) {
            call.reject("startTimeMs and endTimeMs are required");
            return;
        }

        if (endTimeMs <= startTimeMs) {
            call.reject("endTimeMs must be greater than startTimeMs");
            return;
        }

        try {
            UsageSnapshot snapshot = buildSnapshot(startTimeMs, endTimeMs);
            JSObject result = new JSObject();
            result.put("snapshot", snapshot.toJson());
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Failed to collect usage snapshot", ex);
        }
    }

    private boolean hasUsageAccess() {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) {
            return false;
        }

        int mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            getContext().getPackageName()
        );

        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @NonNull

    private UsageSnapshot buildSnapshot(long startTimeMs, long endTimeMs) {
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents events = usm.queryEvents(startTimeMs, endTimeMs);
        UsageSnapshot snapshot = new UsageSnapshot();

        Map<String, Long> appUsageMap = new HashMap<>();
        Map<String, Long> lastTimeUsedMap = new HashMap<>();
        Map<Integer, Double> hourlyMinutes = new HashMap<>();
        Map<String, CategoryBucket> categoryTimeline = new HashMap<>();
        
        // Advanced Trackers
        LinkedList<String> habitSequence = new LinkedList<>(); 
        long lastNotificationTimeMs = 0;
        long totalReactionLatencyMs = 0;
        int reactedNotifications = 0;

        int unlockCount = 0;
        int shortSessionCount = 0;
        int commuteShortSessionCount = 0;
        long longestSessionMs = 0;
        int notificationCount = 0;
        UsageEvents.Event currentEvent = new UsageEvents.Event();

        while (events.hasNextEvent()) {
            events.getNextEvent(currentEvent);
            String pkg = currentEvent.getPackageName();
            int eventType = currentEvent.getEventType();

            if (eventType == UsageEvents.Event.KEYGUARD_HIDDEN) {
                unlockCount++;
            }

            if (eventType == EVENT_NOTIFICATION_INTERRUPTION || eventType == 12) { // NOTIFICATION_INTERRUPTION
                notificationCount++;
                lastNotificationTimeMs = currentEvent.getTimeStamp();
            } else if (eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastTimeUsedMap.put(pkg, currentEvent.getTimeStamp());
                
                // Track habit sequences
                if (habitSequence.size() == 0 || !habitSequence.getLast().equals(pkg)) {
                    habitSequence.add(pkg);
                    if (habitSequence.size() > 50) habitSequence.removeFirst();
                }

                // Reaction Latency
                if (lastNotificationTimeMs > 0 && currentEvent.getTimeStamp() - lastNotificationTimeMs < 60000) {
                    totalReactionLatencyMs += (currentEvent.getTimeStamp() - lastNotificationTimeMs);
                    reactedNotifications++;
                    lastNotificationTimeMs = 0;
                }
            } else if (eventType == UsageEvents.Event.ACTIVITY_PAUSED ||
                    eventType == UsageEvents.Event.ACTIVITY_STOPPED) {
                if (lastTimeUsedMap.containsKey(pkg)) {
                    long startTime = lastTimeUsedMap.get(pkg);
                    long endTime = currentEvent.getTimeStamp();
                    long duration = endTime - startTime;
                    if (duration > 0) {
                        longestSessionMs = Math.max(longestSessionMs, duration);
                        if (duration <= SHORT_SESSION_MAX_MS) {
                            shortSessionCount++;
                            if (isCommuteHour(startTime) || isCommuteHour(endTime)) {
                                commuteShortSessionCount++;
                            }
                        }
                    }
                    appUsageMap.put(pkg, appUsageMap.getOrDefault(pkg, 0L) + duration);
                    lastTimeUsedMap.remove(pkg);
                    
                    String category = categorizePackage(pkg, resolveAppLabel(pkg));
                    distributeSession(startTime, endTime, category, hourlyMinutes, categoryTimeline);
                }
            }
        }

        int totalScreenTimeMinutes = 0;
        int socialTimeMinutes = 0;
        int nightUsageMinutes = roundMinutes(sumNightMinutes(hourlyMinutes));
        Integer peakUsageHour = findPeakHour(hourlyMinutes);
        
        for (Map.Entry<String, Long> entry : appUsageMap.entrySet()) {
            String pkg = entry.getKey();
            long millis = entry.getValue();
            if (millis < 60000) continue; 
            
            String appLabel = resolveAppLabel(pkg);
            int appMinutes = (int) (millis / 60000);
            totalScreenTimeMinutes += appMinutes;
            snapshot.appUsage.put(appLabel, appMinutes);

            String category = categorizePackage(pkg, appLabel);
            if ("social".equals(category)) {
                socialTimeMinutes += appMinutes;
            }
        }

        SharedPreferences screenPrefs = getContext().getSharedPreferences("SmartPulseScreenPrefs", Context.MODE_PRIVATE);
        long lastSessionDurationMs = screenPrefs.getLong("lastSessionDurationMs", 0);
        if (lastSessionDurationMs > 0) {
            longestSessionMs = Math.max(longestSessionMs, lastSessionDurationMs);
        }
        int longestSessionMinutes = longestSessionMs > 0
            ? (int) Math.round(longestSessionMs / 60000.0)
            : 0;

        int avgLatencySec = reactedNotifications > 0 ? (int)((totalReactionLatencyMs / reactedNotifications) / 1000) : 0;
        int stepCount = screenPrefs.getInt("dailyStepCount", 0);
        
        snapshot.screenTimeMinutes = totalScreenTimeMinutes;
        snapshot.socialMediaMinutes = socialTimeMinutes;
        snapshot.nightUsageMinutes = nightUsageMinutes;
        snapshot.peakUsageHour = peakUsageHour;
        snapshot.longestSessionMinutes = longestSessionMinutes;
        snapshot.notificationCount = notificationCount;
        snapshot.unlockCount = unlockCount; 

        try {
            JSObject advancedStats = new JSObject();
            advancedStats.put("avgLatencySec", avgLatencySec);
            advancedStats.put("stepCount", stepCount);
            JSONArray habitArray = new JSONArray();
            for(String s : habitSequence) habitArray.put(s);
            advancedStats.put("habitSequence", habitArray);
            
            snapshot.activityContext = buildActivityContext(
                totalScreenTimeMinutes,
                shortSessionCount,
                commuteShortSessionCount
            );
            snapshot.activityContext.put("advancedSensors", advancedStats);

            snapshot.locationContext = buildLocationContext(hourlyMinutes);
            
            JSObject timelineJson = new JSObject();
            for (Map.Entry<String, CategoryBucket> entry : categoryTimeline.entrySet()) {
                if (entry.getValue().hasRoundedUsage()) {
                    timelineJson.put(entry.getKey(), entry.getValue().toJson());
                }
            }
            snapshot.appCategoryTimeline = timelineJson;
        } catch (Exception e) {}

        return snapshot;
    }

    private static int resolveUsageEventConstant(String fieldName) {
        try {
            return UsageEvents.Event.class.getField(fieldName).getInt(null);
        } catch (NoSuchFieldException | IllegalAccessException ignored) {
            return Integer.MIN_VALUE;
        }
    }

    private boolean isForegroundEvent(int eventType) {
        return eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
            || eventType == UsageEvents.Event.ACTIVITY_RESUMED;
    }

    private boolean isBackgroundEvent(int eventType) {
        return eventType == UsageEvents.Event.MOVE_TO_BACKGROUND
            || eventType == UsageEvents.Event.ACTIVITY_PAUSED;
    }

    private int roundMinutes(double minutes) {
        return (int) Math.round(minutes);
    }

    private boolean isNightHour(int hour) {
        return hour >= 22 || hour < 6;
    }

    private boolean isHourInRange(long timestampMs, int startHourInclusive, int endHourExclusive) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestampMs);
        int hour = calendar.get(Calendar.HOUR_OF_DAY);

        if (startHourInclusive <= endHourExclusive) {
            return hour >= startHourInclusive && hour < endHourExclusive;
        }

        return hour >= startHourInclusive || hour < endHourExclusive;
    }

    private boolean isHourInNightWindow(long timestampMs) {
        return isHourInRange(timestampMs, 20, 24) || isHourInRange(timestampMs, 0, 4);
    }

    private boolean isCommuteHour(long timestampMs) {
        return isHourInRange(timestampMs, 7, 9) || isHourInRange(timestampMs, 17, 20);
    }

    private void maybeSetFirstMorningActivity(long eventTime, Long firstMorningActivityTs) {
        // No-op helper retained for readability in event loop.
    }

    private void distributeSession(
        long sessionStart,
        long sessionEnd,
        String category,
        Map<Integer, Double> hourlyMinutes,
        Map<String, CategoryBucket> categoryTimeline
    ) {
        long cursor = sessionStart;
        while (cursor < sessionEnd) {
            Calendar calendar = Calendar.getInstance();
            calendar.setTimeInMillis(cursor);

            int hour = calendar.get(Calendar.HOUR_OF_DAY);
            int minute = calendar.get(Calendar.MINUTE);
            int quarterStart = (minute / 15) * 15;

            Calendar nextQuarter = (Calendar) calendar.clone();
            nextQuarter.set(Calendar.MINUTE, quarterStart);
            nextQuarter.set(Calendar.SECOND, 0);
            nextQuarter.set(Calendar.MILLISECOND, 0);
            nextQuarter.add(Calendar.MINUTE, 15);

            long segmentEnd = Math.min(sessionEnd, nextQuarter.getTimeInMillis());
            double segmentMinutes = (segmentEnd - cursor) / (double) MINUTES_IN_MILLIS;

            hourlyMinutes.put(hour, hourlyMinutes.getOrDefault(hour, 0.0) + segmentMinutes);

            String bucketKey = String.format(Locale.US, "%02d:%02d", hour, quarterStart);
            CategoryBucket bucket = categoryTimeline.computeIfAbsent(bucketKey, key -> new CategoryBucket());
            bucket.add(category, segmentMinutes);

            cursor = segmentEnd;
        }
    }

    private double sumNightMinutes(Map<Integer, Double> hourlyMinutes) {
        double total = 0;
        for (Map.Entry<Integer, Double> entry : hourlyMinutes.entrySet()) {
            if (isNightHour(entry.getKey())) {
                total += entry.getValue();
            }
        }
        return total;
    }

    private Integer findPeakHour(Map<Integer, Double> hourlyMinutes) {
        if (hourlyMinutes.isEmpty()) {
            return null;
        }

        Integer peakHour = null;
        double maxMinutes = -1;
        for (Map.Entry<Integer, Double> entry : hourlyMinutes.entrySet()) {
            if (entry.getValue() > maxMinutes) {
                maxMinutes = entry.getValue();
                peakHour = entry.getKey();
            }
        }

        return peakHour;
    }

    private String resolveAppLabel(String packageName) {
        PackageManager packageManager = getContext().getPackageManager();
        try {
            ApplicationInfo info = packageManager.getApplicationInfo(packageName, 0);
            CharSequence label = packageManager.getApplicationLabel(info);
            if (label != null) {
                return label.toString();
            }
        } catch (PackageManager.NameNotFoundException ignored) {
            // Fall back to package name when label is unavailable.
        }
        return packageName;
    }

    private String categorizePackage(String packageName, String appLabel) {
        String normalized = (packageName + " " + appLabel).toLowerCase(Locale.US);

        for (String keyword : SOCIAL_KEYWORDS) {
            if (normalized.contains(keyword)) {
                return "social";
            }
        }

        for (String keyword : VIDEO_KEYWORDS) {
            if (normalized.contains(keyword)) {
                return "video";
            }
        }

        for (String keyword : GAMES_KEYWORDS) {
            if (normalized.contains(keyword)) {
                return "games";
            }
        }

        for (String keyword : PRODUCTIVITY_KEYWORDS) {
            if (normalized.contains(keyword)) {
                return "productivity";
            }
        }

        return "other";
    }

    private Map<String, Integer> newCategoryCounter() {
        Map<String, Integer> counter = new HashMap<>();
        counter.put("social", 0);
        counter.put("video", 0);
        counter.put("games", 0);
        counter.put("productivity", 0);
        counter.put("other", 0);
        return counter;
    }

    private Map<String, Double> newCategoryDoubleCounter() {
        Map<String, Double> counter = new HashMap<>();
        counter.put("social", 0.0);
        counter.put("video", 0.0);
        counter.put("games", 0.0);
        counter.put("productivity", 0.0);
        counter.put("other", 0.0);
        return counter;
    }

    private void incrementCounter(Map<String, Integer> counter, String key, int amount) {
        counter.put(key, counter.getOrDefault(key, 0) + amount);
    }

    private void addToCounter(Map<String, Double> counter, String key, double amount) {
        counter.put(key, counter.getOrDefault(key, 0.0) + amount);
    }

    private void appendSessionEvent(
        List<JSObject> sessionEvents,
        long timestampMs,
        String type,
        String packageName,
        String appLabel,
        String category,
        Integer durationMinutes
    ) {
        if (sessionEvents.size() >= MAX_SESSION_EVENTS) {
            return;
        }

        JSObject event = new JSObject();
        event.put("timestampMs", timestampMs);
        event.put("type", type);
        if (packageName != null) {
            event.put("packageName", packageName);
        }
        if (appLabel != null) {
            event.put("appLabel", appLabel);
        }
        if (category != null) {
            event.put("category", category);
        }
        if (durationMinutes != null) {
            event.put("durationMinutes", durationMinutes);
        }

        sessionEvents.add(event);
    }

    private JSONArray toJsonArray(List<JSObject> sessionEvents) {
        JSONArray array = new JSONArray();
        for (JSObject event : sessionEvents) {
            array.put(event);
        }
        return array;
    }

    private JSObject toCategoryTimelineJson(Map<String, CategoryBucket> categoryTimeline) {
        JSObject timeline = new JSObject();
        for (Map.Entry<String, CategoryBucket> entry : categoryTimeline.entrySet()) {
            if (!entry.getValue().hasRoundedUsage()) {
                continue;
            }
            timeline.put(entry.getKey(), entry.getValue().toJson());
        }
        return timeline;
    }

    private NotificationInteractionTelemetry buildNotificationTelemetry(
        Map<String, Integer> posted,
        Map<String, Integer> opened,
        Map<String, Double> delays,
        Map<String, Integer> delaySamples
    ) {
        Map<String, Integer> dismissed = newCategoryCounter();
        Map<String, Integer> avgDelaySeconds = newCategoryCounter();

        int totalPosted = 0;
        for (String category : posted.keySet()) {
            int postedCount = posted.getOrDefault(category, 0);
            int openedCount = opened.getOrDefault(category, 0);
            int dismissedCount = Math.max(0, postedCount - openedCount);
            dismissed.put(category, dismissedCount);

            int sampleCount = delaySamples.getOrDefault(category, 0);
            int avgDelay = sampleCount <= 0
                ? 0
                : (int) Math.round(delays.getOrDefault(category, 0.0) / sampleCount);
            avgDelaySeconds.put(category, avgDelay);

            totalPosted += postedCount;
        }

        return new NotificationInteractionTelemetry(
            posted,
            opened,
            dismissed,
            avgDelaySeconds,
            totalPosted
        );
    }

    private JSObject buildSleepProxies(
        Long firstMorningActivityTs,
        Long lastNightActivityTs,
        int wakeAfterSleepChecks,
        int midnightSessionCount,
        int nightUsageMinutes
    ) {
        JSObject sleep = new JSObject();

        Integer wakeHour = toHour(firstMorningActivityTs);
        Integer bedtimeHour = toHour(lastNightActivityTs);

        int regularity = 100;
        regularity -= Math.min(45, nightUsageMinutes / 2);
        regularity -= Math.min(30, wakeAfterSleepChecks * 3);
        regularity -= Math.min(25, midnightSessionCount * 4);

        sleep.put("estimatedBedtimeHour", bedtimeHour);
        sleep.put("estimatedWakeHour", wakeHour);
        sleep.put("wakeAfterSleepChecks", wakeAfterSleepChecks);
        sleep.put("midnightSessionCount", midnightSessionCount);
        sleep.put("sleepRegularityScore", Math.max(0, Math.min(100, regularity)));
        return sleep;
    }

    private Integer toHour(Long timestampMs) {
        if (timestampMs == null) {
            return null;
        }

        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestampMs);
        return calendar.get(Calendar.HOUR_OF_DAY);
    }

    private JSObject buildActivityContext(
        int screenTimeMinutes,
        int shortSessionCount,
        int commuteShortSessionCount
    ) {
        JSObject activity = new JSObject();

        int walkingEstimate = Math.min(
            (int) Math.round(screenTimeMinutes * 0.4),
            shortSessionCount * 2
        );
        int drivingEstimate = Math.min(
            (int) Math.round(screenTimeMinutes * 0.2),
            commuteShortSessionCount * 2
        );
        int stationaryEstimate = Math.max(
            0,
            screenTimeMinutes - walkingEstimate - drivingEstimate
        );

        activity.put("stationaryMinutes", stationaryEstimate);
        activity.put("walkingMinutes", walkingEstimate);
        activity.put("drivingMinutes", drivingEstimate);
        activity.put("shortSessionCount", shortSessionCount);
        activity.put("source", "heuristic");
        return activity;
    }

    private JSObject readBatteryContext() {
        JSObject battery = new JSObject();
        Intent batteryIntent = getContext().registerReceiver(
            null,
            new IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        );

        if (batteryIntent == null) {
            battery.put("available", false);
            return battery;
        }

        int level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        int plugged = batteryIntent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        int temperature = batteryIntent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1);
        int health = batteryIntent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1);

        boolean isCharging =
            status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL;

        int batteryPct = (level >= 0 && scale > 0)
            ? (int) Math.round((level * 100.0) / scale)
            : -1;

        PowerManager powerManager =
            (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);

        battery.put("available", true);
        battery.put("batteryLevelPct", batteryPct);
        battery.put("isCharging", isCharging);
        battery.put("chargingSource", chargingSourceLabel(plugged));
        battery.put("powerSaveMode", powerManager != null && powerManager.isPowerSaveMode());
        battery.put("temperatureC", temperature > 0 ? temperature / 10.0 : null);
        battery.put("health", batteryHealthLabel(health));
        battery.put("sampledAtMs", System.currentTimeMillis());
        return battery;
    }

    private String chargingSourceLabel(int plugged) {
        if (plugged == BatteryManager.BATTERY_PLUGGED_USB) {
            return "USB";
        }
        if (plugged == BatteryManager.BATTERY_PLUGGED_AC) {
            return "AC";
        }
        if (plugged == BatteryManager.BATTERY_PLUGGED_WIRELESS) {
            return "WIRELESS";
        }
        return "NONE";
    }

    private String batteryHealthLabel(int health) {
        if (health == BatteryManager.BATTERY_HEALTH_GOOD) {
            return "GOOD";
        }
        if (health == BatteryManager.BATTERY_HEALTH_OVERHEAT) {
            return "OVERHEAT";
        }
        if (health == BatteryManager.BATTERY_HEALTH_DEAD) {
            return "DEAD";
        }
        if (health == BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE) {
            return "OVER_VOLTAGE";
        }
        if (health == BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE) {
            return "FAILURE";
        }
        if (health == BatteryManager.BATTERY_HEALTH_COLD) {
            return "COLD";
        }
        return "UNKNOWN";
    }

    private JSObject readConnectivityContext() {
        JSObject connectivity = new JSObject();

        ConnectivityManager manager =
            (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (manager == null) {
            connectivity.put("available", false);
            return connectivity;
        }

        Network activeNetwork = manager.getActiveNetwork();
        NetworkCapabilities capabilities =
            activeNetwork == null ? null : manager.getNetworkCapabilities(activeNetwork);

        String connectionType = "none";
        boolean connected = capabilities != null;

        if (capabilities != null) {
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                connectionType = "wifi";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                connectionType = "cellular";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                connectionType = "ethernet";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) {
                connectionType = "bluetooth";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                connectionType = "vpn";
            } else {
                connectionType = "unknown";
            }
        }

        connectivity.put("available", true);
        connectivity.put("connected", connected);
        connectivity.put("connectionType", connectionType);
        connectivity.put("metered", manager.isActiveNetworkMetered());
        connectivity.put(
            "validated",
            capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        );
        connectivity.put("sampledAtMs", System.currentTimeMillis());
        return connectivity;
    }

    private JSObject buildLocationContext(Map<Integer, Double> hourlyMinutes) {
        JSObject location = new JSObject();

        double homeMinutes = 0;
        double workMinutes = 0;
        double commuteMinutes = 0;
        double otherMinutes = 0;

        for (Map.Entry<Integer, Double> entry : hourlyMinutes.entrySet()) {
            int hour = entry.getKey();
            double minutes = entry.getValue();

            if (hour >= 22 || hour < 6) {
                homeMinutes += minutes;
            } else if (hour >= 9 && hour < 17) {
                workMinutes += minutes;
            } else if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)) {
                commuteMinutes += minutes;
            } else {
                otherMinutes += minutes;
            }
        }

        String dominantZone = "other";
        double dominant = otherMinutes;
        if (homeMinutes > dominant) {
            dominantZone = "home";
            dominant = homeMinutes;
        }
        if (workMinutes > dominant) {
            dominantZone = "work";
            dominant = workMinutes;
        }
        if (commuteMinutes > dominant) {
            dominantZone = "commute";
        }

        location.put("homeMinutes", roundMinutes(homeMinutes));
        location.put("workMinutes", roundMinutes(workMinutes));
        location.put("commuteMinutes", roundMinutes(commuteMinutes));
        location.put("otherMinutes", roundMinutes(otherMinutes));
        location.put("dominantZone", dominantZone);
        location.put("source", "time-window-heuristic");
        return location;
    }

    private static class CategoryBucket {
        double social = 0;
        double video = 0;
        double games = 0;
        double productivity = 0;
        double other = 0;

        void add(String category, double minutes) {
            if ("social".equals(category)) {
                social += minutes;
                return;
            }
            if ("video".equals(category)) {
                video += minutes;
                return;
            }
            if ("games".equals(category)) {
                games += minutes;
                return;
            }
            if ("productivity".equals(category)) {
                productivity += minutes;
                return;
            }
            other += minutes;
        }

        JSObject toJson() {
            JSObject json = new JSObject();
            json.put("social", Math.round(social));
            json.put("video", Math.round(video));
            json.put("games", Math.round(games));
            json.put("productivity", Math.round(productivity));
            json.put("other", Math.round(other));
            json.put("total", Math.round(social + video + games + productivity + other));
            return json;
        }

        boolean hasRoundedUsage() {
            return Math.round(social + video + games + productivity + other) > 0;
        }
    }

    private static class NotificationInteractionTelemetry {
        Map<String, Integer> posted;
        Map<String, Integer> opened;
        Map<String, Integer> dismissed;
        Map<String, Integer> avgOpenDelaySeconds;
        int totalPosted;

        NotificationInteractionTelemetry(
            Map<String, Integer> posted,
            Map<String, Integer> opened,
            Map<String, Integer> dismissed,
            Map<String, Integer> avgOpenDelaySeconds,
            int totalPosted
        ) {
            this.posted = posted;
            this.opened = opened;
            this.dismissed = dismissed;
            this.avgOpenDelaySeconds = avgOpenDelaySeconds;
            this.totalPosted = totalPosted;
        }

        JSObject toJson() {
            JSObject json = new JSObject();
            json.put("postedByCategory", mapToJson(posted));
            json.put("openedByCategory", mapToJson(opened));
            json.put("dismissedByCategory", mapToJson(dismissed));
            json.put("avgOpenDelaySecondsByCategory", mapToJson(avgOpenDelaySeconds));
            json.put("totalPosted", totalPosted);
            return json;
        }

        private JSObject mapToJson(Map<String, Integer> values) {
            JSObject json = new JSObject();
            for (Map.Entry<String, Integer> entry : values.entrySet()) {
                json.put(entry.getKey(), entry.getValue());
            }
            return json;
        }
    }

    private static class UsageSnapshot {
        int screenTimeMinutes = 0;
        int unlockCount = 0;
        Map<String, Integer> appUsage = new HashMap<>();
        int socialMediaMinutes = 0;
        int nightUsageMinutes = 0;
        Integer peakUsageHour = null;
        int longestSessionMinutes = 0;
        int notificationCount = 0;
        JSObject appCategoryTimeline = new JSObject();
        JSONArray sessionEvents = new JSONArray();
        JSObject notificationInteraction = new JSObject();
        JSObject sleepProxies = new JSObject();
        JSObject activityContext = new JSObject();
        JSObject batteryContext = new JSObject();
        JSObject connectivityContext = new JSObject();
        JSObject locationContext = new JSObject();

        JSObject toJson() {
            JSObject json = new JSObject();
            json.put("screenTimeMinutes", screenTimeMinutes);
            json.put("unlockCount", unlockCount);
            json.put("socialMediaMinutes", socialMediaMinutes);
            json.put("nightUsageMinutes", nightUsageMinutes);
            json.put("peakUsageHour", peakUsageHour);
            json.put("longestSessionMinutes", longestSessionMinutes);
            json.put("notificationCount", notificationCount);

            JSObject appUsageObject = new JSObject();
            for (Map.Entry<String, Integer> entry : appUsage.entrySet()) {
                appUsageObject.put(entry.getKey(), entry.getValue());
            }

            json.put("appUsage", appUsageObject);
            json.put("appCategoryTimeline", appCategoryTimeline);
            json.put("sessionEvents", sessionEvents);
            json.put("notificationInteraction", notificationInteraction);
            json.put("sleepProxies", sleepProxies);
            json.put("activityContext", activityContext);
            json.put("batteryContext", batteryContext);
            json.put("connectivityContext", connectivityContext);
            json.put("locationContext", locationContext);
            return json;
        }
    }
}
