package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.LoadTestCancellationToken;
import com.strangequark.postmeter.model.LoadTestConfig;
import com.strangequark.postmeter.model.LoadTestResult;
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

class LoadTestRunnerTest {
    private HttpServer server;
    private String url;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ok", exchange -> {
            byte[] response = "ok".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/ok";
    }

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void aggregatesSuccessfulRequests() {
        RequestModel request = new RequestModel("Load", "GET", url);

        LoadTestResult result = new LoadTestRunner(new HttpRequestExecutor())
                .run(request, null, new LoadTestConfig(2, 5));

        assertEquals(5, result.getTotalRequests());
        assertEquals(5, result.getSuccessfulRequests());
        assertEquals(0, result.getFailedRequests());
        assertEquals(5, result.getStatusCounts().get(200));
        assertEquals(5, result.getRequestedRequests());
        assertEquals(0.0, result.getErrorRate());
        assertTrue(result.getP50Millis() >= 0);
        assertTrue(result.getP90Millis() >= 0);
        assertTrue(result.getP95Millis() >= 0);
        assertTrue(result.getP99Millis() >= 0);
        assertTrue(result.getRequestsPerSecond() > 0);
    }

    @Test
    void returnsCancelledResultWhenCancelledBeforeStart() {
        RequestModel request = new RequestModel("Load", "GET", url);
        LoadTestCancellationToken cancellationToken = new LoadTestCancellationToken();
        cancellationToken.cancel();

        LoadTestResult result = new LoadTestRunner(new HttpRequestExecutor())
                .run(request, null, new LoadTestConfig(2, 5), cancellationToken, LoadTestProgressListener.noop());

        assertEquals(5, result.getRequestedRequests());
        assertEquals(0, result.getTotalRequests());
        assertTrue(result.isCancelled());
    }
}
