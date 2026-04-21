package com.strangequark.postmeter.model;

public class LoadTestProgress {
    private final int completedRequests;
    private final int requestedRequests;

    public LoadTestProgress(int completedRequests, int requestedRequests) {
        this.completedRequests = completedRequests;
        this.requestedRequests = requestedRequests;
    }

    public int getCompletedRequests() {
        return completedRequests;
    }

    public int getRequestedRequests() {
        return requestedRequests;
    }
}
