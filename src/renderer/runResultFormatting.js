(function attachRunResultFormatting(global) {
  function formatLoadProgress(progress) {
    const lines = [
      'Running load test...',
      `Mode: ${progress.mode === 'duration' ? `duration (${progress.durationSeconds}s)` : 'request count'}`,
      `Completed ${progress.completedRequests} of ${progress.requestedRequests} max requests.`,
      `Elapsed: ${progress.elapsedMillis || 0} ms`,
      `Target RPS: ${progress.targetRatePerSecond || 0}`,
      `Rate cap RPS: ${progress.maxRatePerSecond || 0}`,
      `Execution: ${progress.executionMode || 'singleProcess'} (${progress.workerProcesses || 1} process${(progress.workerProcesses || 1) === 1 ? '' : 'es'})`,
      `Active workers: ${progress.activeWorkers || 0}`
    ];
    return lines.join('\n');
  }

  function formatRunnerResult(result) {
    const lines = [
      `Collection: ${result.collectionName || '-'}`,
      `Passed: ${result.passed}`,
      `Completed requests: ${result.totalRequests}`,
      `Passed requests: ${result.passedRequests}`,
      `Failed requests: ${result.failedRequests}`,
      `Cancelled: ${result.cancelled}`
    ];
    for (const item of result.results || []) {
      lines.push('');
      lines.push(`${item.passed ? 'PASS' : 'FAIL'} ${item.requestName} ${item.statusCode ? `(${item.statusCode}, ${item.durationMillis} ms)` : ''}`);
      if (item.error) {
        lines.push(`Error: ${item.error}`);
      }
      for (const assertion of item.assertionResults || []) {
        lines.push(`- ${assertion.passed ? 'PASS' : 'FAIL'} ${assertion.message}`);
      }
      appendScriptResultLines(lines, 'Pre-request', item.preRequestScriptResult);
      appendScriptResultLines(lines, 'Tests', item.testScriptResult);
      for (const variable of item.extractedVariables || []) {
        lines.push(`- Extracted ${variable.key}`);
      }
      const localVariables = visibleVariables(item.localVariables || []);
      for (const variable of localVariables) {
        lines.push(`- Request variable ${variable.key} = ${variableValue(variable)}`);
      }
    }
    appendRuntimeVariableLines(lines, result);
    return lines.join('\n');
  }

  function appendRuntimeVariableLines(lines, result) {
    const collectionVariables = visibleVariables(result.collectionVariables || []);
    const environmentVariables = visibleVariables(result.environment?.variables || []);
    if (!collectionVariables.length && !environmentVariables.length) {
      return;
    }
    lines.push('');
    lines.push('Runtime Variables');
    for (const variable of collectionVariables) {
      lines.push(`- Collection ${variable.key} = ${variableValue(variable)}`);
    }
    for (const variable of environmentVariables) {
      lines.push(`- Environment ${variable.key} = ${variableValue(variable)}`);
    }
  }

  function visibleVariables(variables) {
    return (variables || [])
      .filter((variable) => variable.enabled !== false && variable.key)
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  function variableValue(pair) {
    return pair?.value ?? '';
  }

  function appendScriptResultLines(lines, label, scriptResult) {
    if (!scriptResult) {
      return;
    }
    if (scriptResult.error) {
      lines.push(`- ${label} script error: ${scriptResult.error}`);
    }
    for (const test of scriptResult.tests || []) {
      lines.push(`- ${test.passed ? 'PASS' : 'FAIL'} ${label}: ${test.name}${test.error ? ` (${test.error})` : ''}`);
    }
  }

  function oauthStatusText(progress) {
    const type = progress.type === 'device' ? 'Device code' : 'Authorization code';
    return `${type}: ${progress.status || 'working'}`;
  }

  function oauthProgressDetail(progress) {
    return [
      progress.message || '',
      progress.userCode ? `User code: ${progress.userCode}` : '',
      progress.verificationUriComplete ? `Verification URL: ${progress.verificationUriComplete}` : '',
      !progress.verificationUriComplete && progress.verificationUri ? `Verification URL: ${progress.verificationUri}` : '',
      progress.redirectUri ? `Redirect URI: ${progress.redirectUri}` : '',
      progress.nextAttemptAt ? `Next poll: ${new Date(progress.nextAttemptAt).toLocaleTimeString()}` : '',
      progress.expiresAt ? `Expires: ${new Date(progress.expiresAt).toLocaleTimeString()}` : ''
    ].filter(Boolean).join('\n');
  }

  function formatLoadResult(result) {
    return [
      `Mode: ${result.mode === 'duration' ? `duration (${result.durationSeconds}s)` : 'request count'}`,
      `Requested requests: ${result.requestedRequests}`,
      `Completed requests: ${result.totalRequests}`,
      `Cancelled: ${result.cancelled}`,
      `Elapsed: ${result.elapsedMillis || 0} ms`,
      `Ramp-up: ${result.rampUpSeconds || 0} s`,
      `Target RPS: ${result.targetRatePerSecond || 0}`,
      `Rate cap RPS: ${result.maxRatePerSecond || 0}`,
      `Execution: ${result.executionMode || 'singleProcess'} (${result.workerProcesses || 1} process${(result.workerProcesses || 1) === 1 ? '' : 'es'})`,
      `Successful: ${result.successfulRequests}`,
      `Failed: ${result.failedRequests}`,
      `Error rate: ${(result.errorRate * 100).toFixed(2)}%`,
      `Requests/sec: ${result.requestsPerSecond.toFixed(2)}`,
      `Latency min/avg/p50/p90/p95/p99/max: ${result.minMillis} / ${result.averageMillis.toFixed(2)} / ${result.p50Millis} / ${result.p90Millis} / ${result.p95Millis} / ${result.p99Millis} / ${result.maxMillis} ms`,
      `Latency histogram: ${formatLatencyHistogram(result.latencyHistogram)}`,
      `Status counts: ${JSON.stringify(result.statusCounts)}`,
      Array.isArray(result.policyDecisions) && result.policyDecisions.length ? `Policy decisions:\n- ${result.policyDecisions.map((decision) => decision.message || '').filter(Boolean).join('\n- ')}` : '',
      Array.isArray(result.samples) ? `Samples recorded: ${result.samples.length}${result.sampleLimitReached ? ` (capped at ${result.sampleLimit})` : ''}` : '',
      result.errors?.length ? `Errors:\n- ${result.errors.join('\n- ')}` : ''
    ].filter(Boolean).join('\n');
  }

  function formatLatencyHistogram(histogram) {
    if (!Array.isArray(histogram) || !histogram.length) {
      return 'none';
    }
    return histogram
      .map((bucket) => `${bucket.upperBoundMillis == null ? 'overflow' : `<=${bucket.upperBoundMillis}ms`}:${bucket.count}`)
      .join(' ');
  }

  global.PostMeterRunFormatting = {
    formatLoadProgress,
    formatLoadResult,
    formatRunnerResult,
    oauthProgressDetail,
    oauthStatusText
  };
})(window);
