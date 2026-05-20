(function attachRendererEntityDisplay(global) {
  function fileNameFromLocalPath(filePath) {
    const text = String(filePath || '');
    return text.split(/[\\/]/).filter(Boolean).pop() || text || 'file';
  }

function workspaceDisplayName(workspaceItem, fallbackPath = '') {
  if (workspaceItem?.name && String(workspaceItem.name).trim()) {
    return String(workspaceItem.name).trim();
  }
  const filename = String(workspaceItem?.path || fallbackPath || '').split(/[\\/]/).filter(Boolean).pop();
  if (!filename) {
    return 'Workspace';
  }
  return filename.replace(/\.json$/i, '') || 'Workspace';
}

  function requestDisplayName(request) {
    return String(request?.name || '').trim() || 'Untitled Request';
  }

  function runnerDisplayName(runner) {
    return String(runner?.name || '').trim() || 'Untitled Runner';
  }

  function performanceTestDisplayName(test) {
    return String(test?.name || '').trim() || 'Untitled Performance Test';
  }

  function valueFrom(getter) {
    return typeof getter === 'function' ? getter() : getter;
  }

  function createRendererEntityDisplay(context = {}) {
    return {
      fileNameFromLocalPath,
      performanceTestDisplayName(test = valueFrom(context.activePerformanceTest)) {
        return performanceTestDisplayName(test);
      },
      requestDisplayName(request = valueFrom(context.activeRequest)) {
        return requestDisplayName(request);
      },
      runnerDisplayName(runner = valueFrom(context.activeRunner)) {
        return runnerDisplayName(runner);
      },
      workspaceDisplayName(workspaceItem = valueFrom(context.activeWorkspaceItem)) {
        return workspaceDisplayName(workspaceItem, valueFrom(context.workspacePath));
      }
    };
  }

  const exported = {
    createRendererEntityDisplay,
    fileNameFromLocalPath,
    performanceTestDisplayName,
    requestDisplayName,
    runnerDisplayName,
    workspaceDisplayName
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  global.PostMeterRendererEntityDisplay = exported;
})(typeof window !== 'undefined' ? window : globalThis);
