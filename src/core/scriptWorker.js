const {
  MAX_SCRIPT_RESULT_BYTES,
  runPostmanScriptAsync
} = require('./scriptRuntime');

const PROTOCOL_VERSION = 1;
const pendingBrokerRequests = new Map();
const transport = createWorkerTransport();
let requestSequence = 0;
let running = false;

transport.onMessage((message = {}) => {
  if (message?.type === 'broker:response') {
    settleBrokerResponse(message);
    return;
  }
  if (message?.type !== 'script:start' || running) {
    return;
  }
  running = true;
  runScript(message)
    .catch((error) => {
      transport.send({
        type: 'script:result',
        version: PROTOCOL_VERSION,
        executionId: message.executionId || '',
        ok: false,
        error: error.message || String(error),
        environmentVariables: message.context?.environment?.variables || [],
        collectionVariables: message.context?.collectionVariables || [],
        globals: message.context?.globals || [],
        localVariables: message.context?.localVariables || [],
        cookies: message.context?.cookieJar || []
      });
    });
});

async function runScript(message) {
  const context = message.context || {};
  const originalContext = cloneJson(context);
  const result = await runPostmanScriptAsync(message.scriptText || '', context, {
    ...(message.options || {}),
    broker: {
      request(operation, payload) {
        return brokerRequest(message.executionId || '', operation, payload);
      }
    }
  });
  transport.send(boundedResultMessage({
    type: 'script:result',
    version: PROTOCOL_VERSION,
    executionId: message.executionId || '',
    ok: true,
    result,
    environmentVariables: context.environment?.variables || [],
    collectionVariables: context.collectionVariables || [],
    globals: context.globals || [],
    localVariables: context.localVariables || [],
    cookies: context.cookieJar || [],
    request: result.request || context.request || {}
  }, originalContext));
}

function boundedResultMessage(message, originalContext) {
  if (Buffer.byteLength(JSON.stringify(message), 'utf8') <= MAX_SCRIPT_RESULT_BYTES) {
    return message;
  }
  return {
    type: 'script:result',
    version: PROTOCOL_VERSION,
    executionId: message.executionId || '',
    ok: true,
    result: {
      passed: false,
      tests: [],
      error: 'Script result exceeded the maximum allowed size.',
      logs: [],
      commitSideEffects: false,
      execution: {}
    },
    environmentVariables: originalContext.environment?.variables || [],
    collectionVariables: originalContext.collectionVariables || [],
    globals: originalContext.globals || [],
    localVariables: originalContext.localVariables || [],
    cookies: originalContext.cookieJar || [],
    request: originalContext.request || {}
  };
}

function brokerRequest(executionId, operation, payload = {}) {
  const requestId = `broker-${++requestSequence}`;
  return new Promise((resolve, reject) => {
    pendingBrokerRequests.set(requestId, { resolve, reject });
    transport.send({
      type: 'broker:request',
      version: PROTOCOL_VERSION,
      executionId,
      requestId,
      operation,
      payload
    });
  });
}

function createWorkerTransport() {
  if (process.argv.includes('--postmeter-stdio-worker')) {
    return createStdioTransport();
  }
  return {
    onMessage(handler) {
      process.on('message', handler);
    },
    send(message) {
      process.send?.(message);
    }
  };
}

function createStdioTransport() {
  let buffer = '';
  let messageHandler = () => {};
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        try {
          messageHandler(JSON.parse(line));
        } catch {
          process.exit(1);
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
  return {
    onMessage(handler) {
      messageHandler = handler;
    },
    send(message) {
      process.stdout.write(`${JSON.stringify(message)}\n`);
    }
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function settleBrokerResponse(message) {
  if (message.version !== PROTOCOL_VERSION || !message.requestId) {
    return;
  }
  const pending = pendingBrokerRequests.get(message.requestId);
  if (!pending) {
    return;
  }
  pendingBrokerRequests.delete(message.requestId);
  if (message.ok) {
    pending.resolve(message.payload);
  } else {
    pending.reject(new Error(message.error || 'Broker operation failed.'));
  }
}
