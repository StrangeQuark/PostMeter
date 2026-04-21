package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.BodyType;
import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.HttpExchangeResult;
import com.strangequark.postmeter.model.KeyValuePair;
import com.strangequark.postmeter.model.RequestModel;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class HttpRequestExecutor {
    private static final Pattern HEADER_NAME = Pattern.compile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$");
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> MANAGED_HEADERS = Set.of("content-length");

    private final HttpClient client;
    private final EnvironmentResolver environmentResolver;

    public HttpRequestExecutor() {
        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build(), new EnvironmentResolver());
    }

    public HttpRequestExecutor(HttpClient client, EnvironmentResolver environmentResolver) {
        this.client = client;
        this.environmentResolver = environmentResolver;
    }

    public CompletableFuture<HttpExchangeResult> sendAsync(RequestModel request, EnvironmentModel environment) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return send(request, environment);
            } catch (IOException e) {
                throw new RequestExecutionException("Request failed: " + e.getMessage(), e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RequestExecutionException("Request was interrupted.", e);
            }
        });
    }

    public HttpExchangeResult send(RequestModel request, EnvironmentModel environment)
            throws IOException, InterruptedException {
        List<String> validationErrors = validate(request, environment);
        if (!validationErrors.isEmpty()) {
            throw new IllegalArgumentException(String.join(" ", validationErrors));
        }
        URI uri = buildUri(request, environment);
        HttpRequest httpRequest = buildRequest(request, environment, uri);

        long started = System.nanoTime();
        HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        long durationMillis = Duration.ofNanos(System.nanoTime() - started).toMillis();
        String body = response.body() == null ? "" : response.body();
        long bytes = body.getBytes(StandardCharsets.UTF_8).length;

        return new HttpExchangeResult(
                response.statusCode(),
                response.headers().map(),
                body,
                durationMillis,
                bytes,
                uri.toString()
        );
    }

    public List<String> validate(RequestModel request, EnvironmentModel environment) {
        List<String> errors = new ArrayList<>();
        if (request == null) {
            errors.add("Request is required.");
            return errors;
        }
        if (!RequestModel.SUPPORTED_METHODS.contains(request.getMethod())) {
            errors.add("Unsupported HTTP method: " + request.getMethod() + ".");
        }
        if (request.getUrl() == null || request.getUrl().isBlank()) {
            errors.add("Request URL is required.");
        } else {
            try {
                buildUri(request, environment);
            } catch (IllegalArgumentException e) {
                errors.add(e.getMessage());
            }
        }

        for (KeyValuePair header : request.getHeaders()) {
            if (!header.isEnabled() || !header.hasKey()) {
                continue;
            }
            String name = environmentResolver.resolve(header.getKey().trim(), environment);
            try {
                validateHeader(name);
            } catch (IllegalArgumentException e) {
                errors.add(e.getMessage());
            }
        }
        return errors;
    }

    public URI buildUri(RequestModel request, EnvironmentModel environment) {
        String resolvedUrl = environmentResolver.resolve(request.getUrl(), environment).trim();
        URI baseUri;
        try {
            baseUri = URI.create(resolvedUrl);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("URL is not a valid URI.", e);
        }

        String scheme = baseUri.getScheme() == null ? "" : baseUri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new IllegalArgumentException("Only http and https URLs are supported.");
        }
        if (baseUri.getHost() == null || baseUri.getHost().isBlank()) {
            throw new IllegalArgumentException("URL must include a host.");
        }

        String query = request.getQueryParams().stream()
                .filter(KeyValuePair::isEnabled)
                .filter(KeyValuePair::hasKey)
                .map(pair -> encode(environmentResolver.resolve(pair.getKey().trim(), environment))
                        + "="
                        + encode(environmentResolver.resolve(pair.getValue(), environment)))
                .collect(Collectors.joining("&"));

        if (query.isBlank()) {
            return baseUri;
        }

        String urlWithoutFragment = resolvedUrl;
        String fragment = "";
        int fragmentStart = resolvedUrl.indexOf('#');
        if (fragmentStart >= 0) {
            urlWithoutFragment = resolvedUrl.substring(0, fragmentStart);
            fragment = resolvedUrl.substring(fragmentStart);
        }

        String separator = urlWithoutFragment.contains("?")
                ? (urlWithoutFragment.endsWith("?") || urlWithoutFragment.endsWith("&") ? "" : "&")
                : "?";
        return URI.create(urlWithoutFragment + separator + query + fragment);
    }

    private HttpRequest buildRequest(RequestModel request, EnvironmentModel environment, URI uri) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(60));

        boolean hasContentType = false;
        for (KeyValuePair header : request.getHeaders()) {
            if (!header.isEnabled() || !header.hasKey()) {
                continue;
            }
            String name = environmentResolver.resolve(header.getKey().trim(), environment);
            String value = environmentResolver.resolve(header.getValue(), environment);
            validateHeader(name);
            if (MANAGED_HEADERS.contains(name.toLowerCase(Locale.ROOT))) {
                continue;
            }
            if (name.equalsIgnoreCase("content-type")) {
                hasContentType = true;
            }
            builder.header(name, value);
        }

        BodyType bodyType = request.getBodyType();
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        String body = environmentResolver.resolve(request.getBody(), environment);
        boolean sendBody = bodyType != BodyType.NONE && BODY_METHODS.contains(method);

        if (sendBody && !hasContentType) {
            builder.header("Content-Type", bodyType == BodyType.RAW_JSON ? "application/json" : "text/plain; charset=utf-8");
        }

        HttpRequest.BodyPublisher publisher = sendBody
                ? HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)
                : HttpRequest.BodyPublishers.noBody();
        builder.method(method, publisher);
        return builder.build();
    }

    private void validateHeader(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Header name cannot be blank.");
        }
        if (!HEADER_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid header name: " + name);
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    public static class RequestExecutionException extends RuntimeException {
        public RequestExecutionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
