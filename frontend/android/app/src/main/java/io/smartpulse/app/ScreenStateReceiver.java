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
        
        if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
            prefs.edit().putLong("lastScreenOn", now).apply();
            // Optional: increment unlock count if interacting directly
        } else if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
            long lastOn = prefs.getLong("lastScreenOn", 0);
            if (lastOn > 0 && now > lastOn) {
                long durationMs = now - lastOn;
                long existingTotal = prefs.getLong("totalScreenTimeMs", 0);
                prefs.edit()
                    .putLong("totalScreenTimeMs", existingTotal + durationMs)
                    .putLong("lastScreenOn", 0) // reset
                    .apply();
                
                // Store recent session duration
                prefs.edit().putLong("lastSessionDurationMs", durationMs).apply();
            }
        }
    }
}
