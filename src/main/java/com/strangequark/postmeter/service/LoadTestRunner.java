package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.HttpExchangeResult;
import com.strangequark.postmeter.model.LoadTestConfig;
import com.strangequark.postmeter.model.LoadTestResult;
import com.strangequark.postmeter.model.RequestModel;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class LoadTestRunner {
    private final HttpRequestExecutor requestExecutor;

    public LoadTestRunner(HttpRequestExecutor requestExecutor) {
        this.requestExecutor = requestExecutor;
    }

    public LoadTestResult run(RequestModel request, EnvironmentModel environment, LoadTestConfig config) {
        ExecutorService executorService = Executors.newFixedThreadPool(config.getConcurrency());
        List<Future<Sample>> futures = new ArrayList<>();
        long started = System.nanoTime();

        try {
            for (int i = 0; i < config.getTotalRequests(); i++) {
                futures.add(executorService.submit(newRequestTask(request, environment)));
            }
        } finally {
            executorService.shutdown();
        }

        List<Sample> samples = new ArrayList<>();
        for (Future<Sample> future : futures) {
            try {
                samples.add(future.get());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                samples.add(Sample.failure("Load test interrupted."));
                break;
            } catch (ExecutionException e) {
                samples.add(Sample.failure(rootMessage(e)));
            }
        }

        long elapsedNanos = System.nanoTime() - started;
        return summarize(samples, elapsedNanos);
    }

    private Callable<Sample> newRequestTask(RequestModel request, EnvironmentModel environment) {
        return () -> {
            try {
                HttpExchangeResult result = requestExecutor.send(request, environment);
                return Sample.success(result.getStatusCode(), result.getDurationMillis());
            } catch (Exception e) {
                return Sample.failure(rootMessage(e));
            }
        };
    }

    private LoadTestResult summarize(List<Sample> samples, long elapsedNanos) {
        LoadTestResult result = new LoadTestResult();
        result.setTotalRequests(samples.size());
        if (samples.isEmpty()) {
            return result;
        }

        List<Long> latencies = new ArrayList<>();
        Map<Integer, Integer> statusCounts = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        int successful = 0;
        int failed = 0;

        for (Sample sample : samples) {
            if (sample.success()) {
                successful++;
                latencies.add(sample.durationMillis());
                statusCounts.merge(sample.statusCode(), 1, Integer::sum);
            } else {
                failed++;
                if (errors.size() < 10 && sample.error() != null && !sample.error().isBlank()) {
                    errors.add(sample.error());
                }
            }
        }

        Collections.sort(latencies);
        result.setSuccessfulRequests(successful);
        result.setFailedRequests(failed);
        result.setStatusCounts(statusCounts);
        result.setErrors(errors);

        if (!latencies.isEmpty()) {
            long sum = 0L;
            for (Long latency : latencies) {
                sum += latency;
            }
            result.setMinMillis(latencies.getFirst());
            result.setMaxMillis(latencies.getLast());
            result.setAverageMillis((double) sum / latencies.size());
            int p95Index = Math.min(latencies.size() - 1, (int) Math.ceil(latencies.size() * 0.95) - 1);
            result.setP95Millis(latencies.get(p95Index));
        }

        double elapsedSeconds = Math.max(Duration.ofNanos(elapsedNanos).toMillis() / 1000.0, 0.001);
        result.setRequestsPerSecond(samples.size() / elapsedSeconds);
        return result;
    }

    private String rootMessage(Throwable throwable) {
        Throwable cursor = throwable;
        while (cursor.getCause() != null) {
            cursor = cursor.getCause();
        }
        String message = cursor.getMessage();
        return message == null || message.isBlank() ? cursor.getClass().getSimpleName() : message;
    }

    private record Sample(boolean success, int statusCode, long durationMillis, String error) {
        static Sample success(int statusCode, long durationMillis) {
            return new Sample(true, statusCode, durationMillis, null);
        }

        static Sample failure(String error) {
            return new Sample(false, 0, 0L, error);
        }
    }
}
