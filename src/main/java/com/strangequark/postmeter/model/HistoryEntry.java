package com.strangequark.postmeter.model;

import java.time.Instant;

public class HistoryEntry {
    private String timestamp = Instant.now().toString();
    private String method = "GET";
    private String url = "";
    private int statusCode;
    private long durationMillis;

    public HistoryEntry() {
    }

    public HistoryEntry(String method, String url, int statusCode, long durationMillis) {
        this.timestamp = Instant.now().toString();
        this.method = method;
        this.url = url;
        this.statusCode = statusCode;
        this.durationMillis = durationMillis;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp == null ? Instant.now().toString() : timestamp;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method == null ? "GET" : method;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url == null ? "" : url;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public void setStatusCode(int statusCode) {
        this.statusCode = statusCode;
    }

    public long getDurationMillis() {
        return durationMillis;
    }

    public void setDurationMillis(long durationMillis) {
        this.durationMillis = durationMillis;
    }

    @Override
    public String toString() {
        String status = statusCode == 0 ? "ERR" : Integer.toString(statusCode);
        return method + " " + status + " " + url;
    }
}
