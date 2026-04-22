const { fork } = require('node:child_process');
const path = require('node:path');
const { DEFAULT_SCRIPT_TIMEOUT_MILLIS, MAX_SCRIPT_LENGTH, runPostmanScript } = require('./scriptRuntime');

const WORKER_SHUTDOWN_GRACE_MILLIS = 50;
const DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 64;
const MIN_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 16;
const MAX_SCRIPT_WORKER_MAX_OLD_SPACE_MB = 512;

function runPostmanScriptIsolated(scriptText, context = {}, options = {}) {
  const source = String(scriptText || '');
  if (!source.trim()) {
    return Promise.resolve({
      result: runPostmanScript(source, context, options),
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      localVariables: context.localVariables || []
    });
  }
  if (source.length > MAX_SCRIPT_LENGTH) {
    return Promise.resolve({
      result: runPostmanScript(source, context, options),
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      localVariables: context.localVariables || []
    });
  }

  const timeoutMillis = Number(options.timeoutMillis || DEFAULT_SCRIPT_TIMEOUT_MILLIS);
  const workerTimeoutMillis = Math.max(
    1,
    Number.isFinite(Number(options.workerTimeoutMillis))
      ? Number(options.workerTimeoutMillis)
      : timeoutMillis + 250
  );
  const workerPath = path.join(__dirname, 'scriptWorker.js');
  const payload = {
    scriptText: source,
    context: cloneForWorker(context),
    options: {
      filename: options.filename,
      timeoutMillis
    }
  };

  return new Promise((resolve) => {
    const child = fork(workerPath, [], {
      env: scriptWorkerEnv(options),
      execArgv: scriptWorkerExecArgv(options),
      serialization: 'json',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (!child.killed) {
        child.disconnect?.();
        setTimeout(() => {
          if (!child.killed && child.exitCode == null) {
            child.kill('SIGKILL');
          }
        }, WORKER_SHUTDOWN_GRACE_MILLIS).unref?.();
      }
      resolve(value);
    };
    const fail = (error) => finish({
      result: {
        passed: false,
        tests: [],
        error: error.message || String(error),
        logs: []
      },
      environmentVariables: context.environment?.variables || [],
      collectionVariables: context.collectionVariables || [],
      localVariables: context.localVariables || []
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error('Script worker timed out and was terminated.'));
    }, workerTimeoutMillis);
    timeout.unref?.();
    const onAbort = () => {
      child.kill('SIGKILL');
      fail(new Error('Script execution cancelled.'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', fail);
    child.once('message', (message) => {
      if (!message?.ok) {
        finish({
          result: {
            passed: false,
            tests: [],
            error: message?.error || 'Script worker failed.',
            logs: []
          },
          environmentVariables: message?.environmentVariables || context.environment?.variables || [],
          collectionVariables: message?.collectionVariables || context.collectionVariables || [],
          localVariables: message?.localVariables || context.localVariables || []
        });
        return;
      }
      finish({
        result: message.result,
        environmentVariables: message.environmentVariables || [],
        collectionVariables: message.collectionVariables || [],
        localVariables: message.localVariables || []
      });
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        fail(new Error(`Script worker exited before returning a result (${signal || code}).`));
      }
    });
    child.send(payload);
  });
}

function scriptWorkerExecArgv(options = {}) {
  const args = [`--max-old-space-size=${scriptWorkerMaxOldSpaceMb(options)}`];
  if (process.env.POSTMETER_DISABLE_NODE_PERMISSION === '1') {
    return args;
  }
  if (!process.allowedNodeEnvironmentFlags?.has?.('--permission')) {
    return args;
  }
  return [
    ...args,
    '--permission',
    `--allow-fs-read=${__dirname}`
  ];
}

function scriptWorkerMaxOldSpaceMb(options = {}) {
  const raw = options.maxOldSpaceMb ?? process.env.POSTMETER_SCRIPT_WORKER_MAX_OLD_SPACE_MB;
  const value = Number(raw || DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB);
  if (!Number.isFinite(value)) {
    return DEFAULT_SCRIPT_WORKER_MAX_OLD_SPACE_MB;
  }
  return Math.min(
    MAX_SCRIPT_WORKER_MAX_OLD_SPACE_MB,
    Math.max(MIN_SCRIPT_WORKER_MAX_OLD_SPACE_MB, Math.floor(value))
  );
}

function scriptWorkerEnv() {
  const env = { POSTMETER_SCRIPT_WORKER: '1' };
  if (process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

function cloneForWorker(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

module.exports = {
  runPostmanScriptIsolated,
  scriptWorkerExecArgv,
  scriptWorkerEnv,
  scriptWorkerMaxOldSpaceMb
};
