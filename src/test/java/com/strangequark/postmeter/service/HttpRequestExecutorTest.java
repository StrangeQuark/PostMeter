package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.BodyType;
import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.HttpExchangeResult;
import com.strangequark.postmeter.model.KeyValuePair;
import com.strangequark.postmeter.model.RequestModel;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HttpRequestExecutorTest {
    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/echo", exchange -> {
            byte[] requestBody = exchange.getRequestBody().readAllBytes();
            String response = """
                    {"method":"%s","query":"%s","header":"%s","body":"%s"}
                    """.formatted(
                    exchange.getRequestMethod(),
                    exchange.getRequestURI().getRawQuery(),
                    exchange.getRequestHeaders().getFirst("X-Test"),
                    new String(requestBody, StandardCharsets.UTF_8).replace("\"", "\\\"")
            );
            byte[] responseBytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(201, responseBytes.length);
            exchange.getResponseBody().write(responseBytes);
            exchange.close();
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsMethodHeadersQueryParamsAndBody() throws Exception {
        EnvironmentModel environment = new EnvironmentModel("Test");
        environment.getVariables().add(new KeyValuePair("baseUrl", baseUrl));

        RequestModel request = new RequestModel("Echo", "POST", "{{baseUrl}}/echo");
        request.getQueryParams().add(new KeyValuePair("search", "hello world"));
        request.getHeaders().add(new KeyValuePair("X-Test", "present"));
        request.setBodyType(BodyType.RAW_JSON);
        request.setBody("{\"ok\":true}");

        HttpExchangeResult result = new HttpRequestExecutor().send(request, environment);

        assertEquals(201, result.getStatusCode());
        assertTrue(result.getBody().contains("\"method\":\"POST\""));
        assertTrue(result.getBody().contains("search=hello+world"));
        assertTrue(result.getBody().contains("\"header\":\"present\""));
        assertTrue(result.getBody().contains("\\\"ok\\\":true"));
    }
}
