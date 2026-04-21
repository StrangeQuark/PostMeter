package com.strangequark.postmeter.service;

import com.strangequark.postmeter.model.EnvironmentModel;
import com.strangequark.postmeter.model.HttpExchangeResult;
import com.strangequark.postmeter.model.LoadTestCancellationToken;
import com.strangequark.postmeter.model.LoadTestConfig;
import com.strangequark.postmeter.model.LoadTestProgress;
import com.strangequark.postmeter.model.LoadTestResult;
import com.strangequark.postmeter.model.RequestModel;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class LoadTestRunner {
    private final HttpRequestExecutor requestExecutor;

    public LoadTestRunner(HttpRequestExecutor requestExecutor) {
        this.requestExecutor = requestExecutor;
    }

    public LoadTestResult run(RequestModel request, EnvironmentModel environment, LoadTestConfig config) {
        return run(request, environment, config, new LoadTestCancellationToken(), LoadTestProgressListener.noop());
    }

    public LoadTestResult run(
            RequestModel request,
            EnvironmentModel environment,
            LoadTestConfig config,
            LoadTestCancellationToken cancellationToken,
            LoadTestProgressListener progressListener
    ) {
        ExecutorService executorService = Executors.newFixedThreadPool(config.getConcurrency());
        CompletionService<Sample> completionService = new ExecutorCompletionService<>(executorService);
        List<Future<Sample>> futures = new ArrayList<>();
        long started = System.nanoTime();
        int submitted = 0;

        try {
            for (int i = 0; i < config.getTotalRequests(); i++) {
                if (cancellationToken.isCancelled()) {
                    break;
                }
                futures.add(completionService.submit(newRequestTask(request, environment, cancellationToken)));
                submitted++;
            }

            List<Sample> samples = new ArrayList<>();
            int completed = 0;
            while (completed < submitted) {
                if (cancellationToken.isCancelled()) {
                    cancelOutstanding(futures);
                    break;
                }

                Future<Sample> future;
                try {
                    future = completionService.poll(100, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    cancellationToken.cancel();
                    samples.add(Sample.failure("Load test interrupted."));
                    cancelOutstanding(futures);
                    break;
                }

                if (future == null) {
                    continue;
                }

                try {
                    samples.add(future.get());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    cancellationToken.cancel();
                    samples.add(Sample.failure("Load test interrupted."));
                    cancelOutstanding(futures);
                    break;
                } catch (ExecutionException e) {
                    samples.add(Sample.failure(rootMessage(e)));
                }

                completed++;
                progressListener.onProgress(new LoadTestProgress(completed, config.getTotalRequests()));
            }

            long elapsedNanos = System.nanoTime() - started;
            return summarize(samples, elapsedNanos, config.getTotalRequests(), cancellationToken.isCancelled());
        } finally {
            if (cancellationToken.isCancelled()) {
                executorService.shutdownNow();
            } else {
                executorService.shutdown();
            }
        }
    }

    private Callable<Sample> newRequestTask(
            RequestModel request,
            EnvironmentModel environment,
            LoadTestCancellationToken cancellationToken
    ) {
        return () -> {
            if (cancellationToken.isCancelled()) {
                return Sample.failure("Load test cancelled.");
            }
            try {
                HttpExchangeResult result = requestExecutor.send(request, environment);
                return Sample.success(result.getStatusCode(), result.getDurationMillis());
            } catch (Exception e) {
                return Sample.failure(rootMessage(e));
            }
        };
    }

    private LoadTestResult summarize(List<Sample> samples, long elapsedNanos, int requestedRequests, boolean cancelled) {
        LoadTestResult result = new LoadTestResult();
        result.setRequestedRequests(requestedRequests);
        result.setTotalRequests(samples.size());
        result.setCancelled(cancelled);
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
        result.setErrorRate((double) failed / samples.size());

        if (!latencies.isEmpty()) {
            long sum = 0L;
            for (Long latency : latencies) {
                sum += latency;
            }
            result.setMinMillis(latencies.getFirst());
            result.setMaxMillis(latencies.getLast());
            result.setAverageMillis((double) sum / latencies.size());
            result.setP50Millis(percentile(latencies, 0.50));
            result.setP90Millis(percentile(latencies, 0.90));
            result.setP95Millis(percentile(latencies, 0.95));
            result.setP99Millis(percentile(latencies, 0.99));
        }

        double elapsedSeconds = Math.max(Duration.ofNanos(elapsedNanos).toMillis() / 1000.0, 0.001);
        result.setRequestsPerSecond(samples.size() / elapsedSeconds);
        return result;
    }

    private void cancelOutstanding(List<Future<Sample>> futures) {
        for (Future<Sample> future : futures) {
            if (!future.isDone()) {
                future.cancel(true);
            }
        }
    }

    private long percentile(List<Long> sortedLatencies, double percentile) {
        int index = Math.min(sortedLatencies.size() - 1, (int) Math.ceil(sortedLatencies.size() * percentile) - 1);
        return sortedLatencies.get(Math.max(index, 0));
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
