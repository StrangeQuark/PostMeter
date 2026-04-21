package com.strangequark.postmeter.model;

public class LoadTestConfig {
    public static final int MAX_CONCURRENCY = 512;
    public static final int MAX_TOTAL_REQUESTS = 100_000;

    private final int concurrency;
    private final int totalRequests;

    public LoadTestConfig(int concurrency, int totalRequests) {
        if (concurrency < 1 || concurrency > MAX_CONCURRENCY) {
            throw new IllegalArgumentException("Concurrency must be between 1 and " + MAX_CONCURRENCY + ".");
        }
        if (totalRequests < 1 || totalRequests > MAX_TOTAL_REQUESTS) {
            throw new IllegalArgumentException("Total requests must be between 1 and " + MAX_TOTAL_REQUESTS + ".");
        }
        this.concurrency = concurrency;
        this.totalRequests = totalRequests;
    }

    public int getConcurrency() {
        return concurrency;
    }

    public int getTotalRequests() {
        return totalRequests;
    }
}
