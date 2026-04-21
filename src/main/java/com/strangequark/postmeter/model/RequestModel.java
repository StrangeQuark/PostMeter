package com.strangequark.postmeter.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public class RequestModel {
    public static final Set<String> SUPPORTED_METHODS = Set.of(
            "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"
    );

    private String id = UUID.randomUUID().toString();
    private String name = "Untitled Request";
    private String method = "GET";
    private String url = "";
    private List<KeyValuePair> queryParams = new ArrayList<>();
    private List<KeyValuePair> headers = new ArrayList<>();
    private BodyType bodyType = BodyType.NONE;
    private String body = "";

    public RequestModel() {
    }

    public RequestModel(String name, String method, String url) {
        setName(name);
        setMethod(method);
        setUrl(url);
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = isBlank(id) ? UUID.randomUUID().toString() : id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = isBlank(name) ? "Untitled Request" : name.trim();
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        String candidate = isBlank(method) ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        this.method = SUPPORTED_METHODS.contains(candidate) ? candidate : "GET";
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url == null ? "" : url.trim();
    }

    public List<KeyValuePair> getQueryParams() {
        if (queryParams == null) {
            queryParams = new ArrayList<>();
        }
        return queryParams;
    }

    public void setQueryParams(List<KeyValuePair> queryParams) {
        this.queryParams = queryParams == null ? new ArrayList<>() : queryParams;
    }

    public List<KeyValuePair> getHeaders() {
        if (headers == null) {
            headers = new ArrayList<>();
        }
        return headers;
    }

    public void setHeaders(List<KeyValuePair> headers) {
        this.headers = headers == null ? new ArrayList<>() : headers;
    }

    public BodyType getBodyType() {
        return bodyType == null ? BodyType.NONE : bodyType;
    }

    public void setBodyType(BodyType bodyType) {
        this.bodyType = bodyType == null ? BodyType.NONE : bodyType;
    }

    public String getBody() {
        return body == null ? "" : body;
    }

    public void setBody(String body) {
        this.body = body == null ? "" : body;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
