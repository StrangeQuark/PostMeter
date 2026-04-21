package com.strangequark.postmeter.model;

import java.util.List;
import java.util.Map;

public class HttpExchangeResult {
    private final int statusCode;
    private final Map<String, List<String>> headers;
    private final String body;
    private final long durationMillis;
    private final long responseBytes;
    private final String finalUrl;

    public HttpExchangeResult(
            int statusCode,
            Map<String, List<String>> headers,
            String body,
            long durationMillis,
            long responseBytes,
            String finalUrl
    ) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
        this.durationMillis = durationMillis;
        this.responseBytes = responseBytes;
        this.finalUrl = finalUrl;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public Map<String, List<String>> getHeaders() {
        return headers;
    }

    public String getBody() {
        return body;
    }

    public long getDurationMillis() {
        return durationMillis;
    }

    public long getResponseBytes() {
        return responseBytes;
    }

    public String getFinalUrl() {
        return finalUrl;
    }
}
