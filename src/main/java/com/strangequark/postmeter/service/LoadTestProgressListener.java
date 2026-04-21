package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.LoadTestProgress;

@FunctionalInterface
public interface LoadTestProgressListener {
    void onProgress(LoadTestProgress progress);

    static LoadTestProgressListener noop() {
        return progress -> {
        };
    }
}
