package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class LoadTestResult {
    private int requestedRequests;
    private int totalRequests;
    private int successfulRequests;
    private int failedRequests;
    private boolean cancelled;
    private long minMillis;
    private long maxMillis;
    private double averageMillis;
    private long p50Millis;
    private long p90Millis;
    private long p95Millis;
    private long p99Millis;
    private double errorRate;
    private double requestsPerSecond;
    private Map<Integer, Integer> statusCounts = new LinkedHashMap<>();
    private List<String> errors = new ArrayList<>();

    public int getRequestedRequests() {
        return requestedRequests;
    }

    public void setRequestedRequests(int requestedRequests) {
        this.requestedRequests = requestedRequests;
    }

    public int getTotalRequests() {
        return totalRequests;
    }

    public void setTotalRequests(int totalRequests) {
        this.totalRequests = totalRequests;
    }

    public int getSuccessfulRequests() {
        return successfulRequests;
    }

    public void setSuccessfulRequests(int successfulRequests) {
        this.successfulRequests = successfulRequests;
    }

    public int getFailedRequests() {
        return failedRequests;
    }

    public void setFailedRequests(int failedRequests) {
        this.failedRequests = failedRequests;
    }

    public boolean isCancelled() {
        return cancelled;
    }

    public void setCancelled(boolean cancelled) {
        this.cancelled = cancelled;
    }

    public long getMinMillis() {
        return minMillis;
    }

    public void setMinMillis(long minMillis) {
        this.minMillis = minMillis;
    }

    public long getMaxMillis() {
        return maxMillis;
    }

    public void setMaxMillis(long maxMillis) {
        this.maxMillis = maxMillis;
    }

    public double getAverageMillis() {
        return averageMillis;
    }

    public void setAverageMillis(double averageMillis) {
        this.averageMillis = averageMillis;
    }

    public long getP50Millis() {
        return p50Millis;
    }

    public void setP50Millis(long p50Millis) {
        this.p50Millis = p50Millis;
    }

    public long getP90Millis() {
        return p90Millis;
    }

    public void setP90Millis(long p90Millis) {
        this.p90Millis = p90Millis;
    }

    public long getP95Millis() {
        return p95Millis;
    }

    public void setP95Millis(long p95Millis) {
        this.p95Millis = p95Millis;
    }

    public long getP99Millis() {
        return p99Millis;
    }

    public void setP99Millis(long p99Millis) {
        this.p99Millis = p99Millis;
    }

    public double getErrorRate() {
        return errorRate;
    }

    public void setErrorRate(double errorRate) {
        this.errorRate = errorRate;
    }

    public double getRequestsPerSecond() {
        return requestsPerSecond;
    }

    public void setRequestsPerSecond(double requestsPerSecond) {
        this.requestsPerSecond = requestsPerSecond;
    }

    public Map<Integer, Integer> getStatusCounts() {
        return statusCounts;
    }

    public void setStatusCounts(Map<Integer, Integer> statusCounts) {
        this.statusCounts = statusCounts == null ? new LinkedHashMap<>() : statusCounts;
    }

    public List<String> getErrors() {
        return errors;
    }

    public void setErrors(List<String> errors) {
        this.errors = errors == null ? new ArrayList<>() : errors;
    }
}
