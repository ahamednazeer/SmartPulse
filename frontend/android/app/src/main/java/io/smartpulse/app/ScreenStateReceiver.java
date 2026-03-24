package io.smartpulse.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class ScreenStateReceiver extends BroadcastReceiver {
    
    private static final String PREFS_NAME = "SmartPulseScreenPrefs";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        
        // Reset daily counters if date has changed
        resetIfNewDay(prefs, now);
        
        if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
            prefs.edit().putLong("lastScreenOn", now).apply();
        } else if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
            long lastOn = prefs.getLong("lastScreenOn", 0);
            if (lastOn > 0 && now > lastOn) {
                long durationMs = now - lastOn;
                long existingTotal = prefs.getLong("totalScreenTimeMs", 0);
                prefs.edit()
                    .putLong("totalScreenTimeMs", existingTotal + durationMs)
                    .putLong("lastScreenOn", 0)
                    .putLong("lastSessionDurationMs", durationMs)
                    .apply();
            }
        }
    }

    private void resetIfNewDay(SharedPreferences prefs, long nowMs) {
        String today = getDateKey(nowMs);
        String storedDate = prefs.getString("screenDate", "");
        if (!today.equals(storedDate)) {
            prefs.edit()
                .putString("screenDate", today)
                .putLong("totalScreenTimeMs", 0)
                .putLong("lastScreenOn", 0)
                .putLong("lastSessionDurationMs", 0)
                .apply();
        }
    }

    private String getDateKey(long timestampMs) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.setTimeInMillis(timestampMs);
        return String.format(java.util.Locale.US, "%04d-%02d-%02d",
            cal.get(java.util.Calendar.YEAR),
            cal.get(java.util.Calendar.MONTH) + 1,
            cal.get(java.util.Calendar.DAY_OF_MONTH));
    }
}
