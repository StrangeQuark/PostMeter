function workspaceRecoveryDiagnosticEvent(error) {
  return {
    type: 'workspace.recovery.completed',
    level: 'warn',
    outcome: 'completed',
    failureCode: 'workspace_recovered_from_unreadable_file',
    fields: { error: error?.message || String(error || 'Workspace recovered.') }
  };
}

function startupFailureDiagnosticEvent(error, title = 'PostMeter could not start') {
  return {
    type: 'app.startup.failed',
    level: 'error',
    outcome: 'failed',
    failureCode: 'startup_failed',
    fields: {
      error: error?.message || String(error || 'Startup failed.'),
      title
    }
  };
}

module.exports = {
  startupFailureDiagnosticEvent,
  workspaceRecoveryDiagnosticEvent
};
