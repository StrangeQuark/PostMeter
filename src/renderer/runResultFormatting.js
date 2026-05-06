(function attachRunResultFormatting(global) {
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

  global.PostMeterRunFormatting = {
    formatRunnerResult,
    oauthProgressDetail,
    oauthStatusText
  };
})(window);
