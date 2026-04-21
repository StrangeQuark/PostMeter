package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class LoadTestResult {
    private int totalRequests;
    private int successfulRequests;
    private int failedRequests;
    private long minMillis;
    private long maxMillis;
    private double averageMillis;
    private long p95Millis;
    private double requestsPerSecond;
    private Map<Integer, Integer> statusCounts = new LinkedHashMap<>();
    private List<String> errors = new ArrayList<>();

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

    public long getP95Millis() {
        return p95Millis;
    }

    public void setP95Millis(long p95Millis) {
        this.p95Millis = p95Millis;
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
