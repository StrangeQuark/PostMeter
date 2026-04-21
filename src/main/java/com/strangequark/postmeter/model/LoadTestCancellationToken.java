package com.strangequark.postmeter.model;

import java.util.concurrent.atomic.AtomicBoolean;

public class LoadTestCancellationToken {
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public void cancel() {
        cancelled.set(true);
    }

    public boolean isCancelled() {
        return cancelled.get();
    }
}
