package io.smartpulse.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom in-app plugin before bridge initialization.
        registerPlugin(SmartPulseUsagePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
