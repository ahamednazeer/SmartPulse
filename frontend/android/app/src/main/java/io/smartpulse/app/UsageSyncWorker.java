package io.smartpulse.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class UsageSyncWorker extends Worker {
    public UsageSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Here we could trigger a background fetch, but since Capacitor manages JS plugins,
        // it requires waking up the Capacitor bridge which might not be fully headless yet.
        // For accurate 20 min interval, the background runner capacitor plugin would be better.
        // We will log the worker execution for native background triggering.
        return Result.success();
    }
}
