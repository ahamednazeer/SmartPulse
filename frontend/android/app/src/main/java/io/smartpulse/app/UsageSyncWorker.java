package io.smartpulse.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Process;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public class UsageSyncWorker extends Worker {
    private static final String WORK_NAME = "smartpulse_usage_sync";
    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String TOKEN_KEY = "smartpulse_token";
    private static final String API_BASE_KEY = "smartpulse_api_base";
    private static final int MINUTES_IN_MILLIS = 60 * 1000;
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

    public UsageSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String token = readPreference(context, TOKEN_KEY);
        String apiBase = readPreference(context, API_BASE_KEY);

        if (token == null || token.isEmpty() || apiBase == null || apiBase.isEmpty()) {
            return Result.success();
        }

        if (!hasUsageAccess(context)) {
            return Result.success();
        }

        long nowMs = System.currentTimeMillis();
        long startMs = startOfDay(nowMs);
        UsageSnapshot snapshot = collectSnapshot(context, startMs, nowMs);
        if (snapshot == null) {
            return Result.success();
        }

        JSONObject payload = buildPayload(snapshot, formatDate(startMs));
        if (payload == null) {
            return Result.success();
        }

        int status = postJson(apiBase + "/usage/batch", token, payload.toString());
        if (status >= 200 && status < 300) {
            return Result.success();
        }

        if (status >= 500 || status == 0) {
            return Result.retry();
        }

        return Result.failure();
    }

    public static void schedule(@NonNull Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            UsageSyncWorker.class,
            6,
            TimeUnit.HOURS
        ).setConstraints(constraints).build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }

    private static String readPreference(Context context, String key) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        return prefs.getString(key, null);
    }

    private static boolean hasUsageAccess(Context context) {
        AppOpsManager appOps = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null) {
            return false;
        }

        int mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.getPackageName()
        );

        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private static long startOfDay(long nowMs) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(nowMs);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTimeInMillis();
    }

    private static String formatDate(long timestampMs) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestampMs);
        int year = calendar.get(Calendar.YEAR);
        int month = calendar.get(Calendar.MONTH) + 1;
        int day = calendar.get(Calendar.DAY_OF_MONTH);
        return String.format(Locale.US, "%04d-%02d-%02d", year, month, day);
    }

    private static UsageSnapshot collectSnapshot(
        Context context,
        long startTimeMs,
        long endTimeMs
    ) {
        try {
            android.app.usage.UsageStatsManager usm =
                (android.app.usage.UsageStatsManager) context.getSystemService(
                    Context.USAGE_STATS_SERVICE
                );
            android.app.usage.UsageEvents events = usm.queryEvents(startTimeMs, endTimeMs);
            UsageSnapshot snapshot = new UsageSnapshot();

            Map<String, Long> appUsageMap = new HashMap<>();
            Map<String, Long> lastTimeUsedMap = new HashMap<>();
            Map<Integer, Double> hourlyMinutes = new HashMap<>();
            Map<String, CategoryBucket> categoryTimeline = new HashMap<>();

            LinkedList<String> habitSequence = new LinkedList<>();
            long lastNotificationTimeMs = 0;
            long totalReactionLatencyMs = 0;
            int reactedNotifications = 0;

            int unlockCount = 0;
            int shortSessionCount = 0;
            int commuteShortSessionCount = 0;
            long longestSessionMs = 0;
            int notificationCount = 0;

            android.app.usage.UsageEvents.Event currentEvent =
                new android.app.usage.UsageEvents.Event();

            while (events.hasNextEvent()) {
                events.getNextEvent(currentEvent);
                String pkg = currentEvent.getPackageName();
                int eventType = currentEvent.getEventType();

                if (eventType == android.app.usage.UsageEvents.Event.KEYGUARD_HIDDEN) {
                    unlockCount++;
                }

                if (eventType == EVENT_NOTIFICATION_INTERRUPTION || eventType == 12) {
                    notificationCount++;
                    lastNotificationTimeMs = currentEvent.getTimeStamp();
                } else if (eventType == android.app.usage.UsageEvents.Event.ACTIVITY_RESUMED) {
                    lastTimeUsedMap.put(pkg, currentEvent.getTimeStamp());

                    if (habitSequence.size() == 0 || !habitSequence.getLast().equals(pkg)) {
                        habitSequence.add(pkg);
                        if (habitSequence.size() > 50) habitSequence.removeFirst();
                    }

                    if (lastNotificationTimeMs > 0 &&
                        currentEvent.getTimeStamp() - lastNotificationTimeMs < 60000) {
                        totalReactionLatencyMs +=
                            (currentEvent.getTimeStamp() - lastNotificationTimeMs);
                        reactedNotifications++;
                        lastNotificationTimeMs = 0;
                    }
                } else if (eventType == android.app.usage.UsageEvents.Event.ACTIVITY_PAUSED ||
                    eventType == android.app.usage.UsageEvents.Event.ACTIVITY_STOPPED) {
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

                        String category = categorizePackage(pkg, resolveAppLabel(context, pkg));
                        distributeSession(startTime, endTime, category, hourlyMinutes, categoryTimeline);
                    }
                }
            }

            int totalScreenTimeMinutes = 0;
            int socialTimeMinutes = 0;

            for (Map.Entry<String, Long> entry : appUsageMap.entrySet()) {
                String pkg = entry.getKey();
                long millis = entry.getValue();
                if (millis < 60000) continue;

                String appLabel = resolveAppLabel(context, pkg);
                int appMinutes = (int) (millis / 60000);
                totalScreenTimeMinutes += appMinutes;
                snapshot.appUsage.put(appLabel, appMinutes);

                String category = categorizePackage(pkg, appLabel);
                if ("social".equals(category)) {
                    socialTimeMinutes += appMinutes;
                }
            }

            SharedPreferences screenPrefs =
                context.getSharedPreferences("SmartPulseScreenPrefs", Context.MODE_PRIVATE);
            long lastSessionDurationMs = screenPrefs.getLong("lastSessionDurationMs", 0);
            if (lastSessionDurationMs > 0) {
                longestSessionMs = Math.max(longestSessionMs, lastSessionDurationMs);
            }

            int avgLatencySec = reactedNotifications > 0
                ? (int) ((totalReactionLatencyMs / reactedNotifications) / 1000)
                : 0;
            int stepCount = screenPrefs.getInt("dailyStepCount", 0);

            int nightUsageMinutes = roundMinutes(sumNightMinutes(hourlyMinutes));
            Integer peakUsageHour = findPeakHour(hourlyMinutes);
            int longestSessionMinutes = longestSessionMs > 0
                ? (int) Math.round(longestSessionMs / 60000.0)
                : 0;

            snapshot.screenTimeMinutes = totalScreenTimeMinutes;
            snapshot.socialMediaMinutes = socialTimeMinutes;
            snapshot.nightUsageMinutes = nightUsageMinutes;
            snapshot.peakUsageHour = peakUsageHour;
            snapshot.longestSessionMinutes = longestSessionMinutes;
            snapshot.notificationCount = notificationCount;
            snapshot.unlockCount = unlockCount;

            JSONObject advancedStats = new JSONObject();
            advancedStats.put("avgLatencySec", avgLatencySec);
            advancedStats.put("stepCount", stepCount);
            JSONArray habitArray = new JSONArray();
            for (String s : habitSequence) habitArray.put(s);
            advancedStats.put("habitSequence", habitArray);

            snapshot.activityContext = buildActivityContext(
                totalScreenTimeMinutes,
                shortSessionCount,
                commuteShortSessionCount
            );
            snapshot.activityContext.put("advancedSensors", advancedStats);

            snapshot.locationContext = buildLocationContext(hourlyMinutes);

            JSONObject timelineJson = new JSONObject();
            for (Map.Entry<String, CategoryBucket> entry : categoryTimeline.entrySet()) {
                if (entry.getValue().hasRoundedUsage()) {
                    timelineJson.put(entry.getKey(), entry.getValue().toJson());
                }
            }
            snapshot.appCategoryTimeline = timelineJson;

            return snapshot;
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject buildPayload(UsageSnapshot snapshot, String dateKey) {
        try {
            JSONObject record = new JSONObject();
            record.put("date", dateKey);
            record.put("screenTimeMinutes", snapshot.screenTimeMinutes);
            record.put("unlockCount", snapshot.unlockCount);
            record.put("socialMediaMinutes", snapshot.socialMediaMinutes);
            record.put("nightUsageMinutes", snapshot.nightUsageMinutes);
            if (snapshot.peakUsageHour != null) {
                record.put("peakUsageHour", snapshot.peakUsageHour);
            }
            record.put("longestSessionMinutes", snapshot.longestSessionMinutes);
            record.put("notificationCount", snapshot.notificationCount);

            if (!snapshot.appUsage.isEmpty()) {
                record.put("appUsageJson", new JSONObject(snapshot.appUsage).toString());
            }
            if (snapshot.appCategoryTimeline.length() > 0) {
                record.put("appCategoryTimelineJson", snapshot.appCategoryTimeline.toString());
            }
            if (snapshot.sessionEvents.length() > 0) {
                record.put("sessionEventsJson", snapshot.sessionEvents.toString());
            }
            if (snapshot.activityContext.length() > 0) {
                record.put("activityContextJson", snapshot.activityContext.toString());
            }
            if (snapshot.locationContext.length() > 0) {
                record.put("locationContextJson", snapshot.locationContext.toString());
            }

            JSONArray records = new JSONArray();
            records.put(record);
            JSONObject payload = new JSONObject();
            payload.put("records", records);
            return payload;
        } catch (Exception e) {
            return null;
        }
    }

    private static int postJson(String urlString, String token, String body) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);

            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);

            try (OutputStream os = connection.getOutputStream()) {
                os.write(payload);
            }

            return connection.getResponseCode();
        } catch (Exception e) {
            return 0;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static int resolveUsageEventConstant(String fieldName) {
        try {
            return android.app.usage.UsageEvents.Event.class.getField(fieldName).getInt(null);
        } catch (NoSuchFieldException | IllegalAccessException ignored) {
            return Integer.MIN_VALUE;
        }
    }

    private static int roundMinutes(double minutes) {
        return (int) Math.round(minutes);
    }

    private static boolean isNightHour(int hour) {
        return hour >= 22 || hour < 6;
    }

    private static boolean isHourInRange(long timestampMs, int startHourInclusive, int endHourExclusive) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestampMs);
        int hour = calendar.get(Calendar.HOUR_OF_DAY);

        if (startHourInclusive <= endHourExclusive) {
            return hour >= startHourInclusive && hour < endHourExclusive;
        }

        return hour >= startHourInclusive || hour < endHourExclusive;
    }

    private static boolean isCommuteHour(long timestampMs) {
        return isHourInRange(timestampMs, 7, 9) || isHourInRange(timestampMs, 17, 20);
    }

    private static void distributeSession(
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
            CategoryBucket bucket = categoryTimeline.computeIfAbsent(
                bucketKey,
                key -> new CategoryBucket()
            );
            bucket.add(category, segmentMinutes);

            cursor = segmentEnd;
        }
    }

    private static double sumNightMinutes(Map<Integer, Double> hourlyMinutes) {
        double total = 0;
        for (Map.Entry<Integer, Double> entry : hourlyMinutes.entrySet()) {
            if (isNightHour(entry.getKey())) {
                total += entry.getValue();
            }
        }
        return total;
    }

    private static Integer findPeakHour(Map<Integer, Double> hourlyMinutes) {
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

    private static String resolveAppLabel(Context context, String packageName) {
        PackageManager packageManager = context.getPackageManager();
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

    private static String categorizePackage(String packageName, String appLabel) {
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

    private static JSONObject buildActivityContext(
        int screenTimeMinutes,
        int shortSessionCount,
        int commuteShortSessionCount
    ) throws Exception {
        JSONObject activity = new JSONObject();

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

    private static JSONObject buildLocationContext(Map<Integer, Double> hourlyMinutes)
        throws Exception {
        JSONObject location = new JSONObject();

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

        JSONObject toJson() throws Exception {
            JSONObject json = new JSONObject();
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

    private static class UsageSnapshot {
        int screenTimeMinutes = 0;
        int unlockCount = 0;
        Map<String, Integer> appUsage = new HashMap<>();
        int socialMediaMinutes = 0;
        int nightUsageMinutes = 0;
        Integer peakUsageHour = null;
        int longestSessionMinutes = 0;
        int notificationCount = 0;
        JSONObject appCategoryTimeline = new JSONObject();
        JSONArray sessionEvents = new JSONArray();
        JSONObject activityContext = new JSONObject();
        JSONObject locationContext = new JSONObject();
    }
}
