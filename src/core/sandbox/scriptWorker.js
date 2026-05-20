const {
  MAX_SCRIPT_RESULT_BYTES,
  runPostmanScriptAsync
} = require('./scriptRuntime');
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL_VERSION = 1;
const FILE_TRANSPORT_POLL_MILLIS = 10;
const MAX_FILE_TRANSPORT_MESSAGE_BYTES = MAX_SCRIPT_RESULT_BYTES * 2;
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
  if (process.argv.includes('--postmeter-file-worker')) {
    return createFileTransport();
  }
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

function createFileTransport() {
  const transportDir = process.env.POSTMETER_SCRIPT_WORKER_TRANSPORT_DIR || '';
  if (!transportDir) {
    process.exit(1);
  }
  let messageHandler = () => {};
  let sequence = 0;
  const incomingState = { nextSequence: 1 };
  const poll = () => {
    for (const message of readTransportMessages(transportDir, 'to-worker-', incomingState)) {
      messageHandler(message);
    }
  };
  setInterval(() => {
    try {
      poll();
    } catch {
      process.exit(1);
    }
  }, FILE_TRANSPORT_POLL_MILLIS);
  const transport = {
    onMessage(handler) {
      messageHandler = handler;
      try {
        poll();
      } catch {
        process.exit(1);
      }
    },
    send(message) {
      try {
        writeTransportMessage(transportDir, `to-parent-${++sequence}.json`, message);
      } catch {
        process.exit(1);
      }
    }
  };
  transport.send({ type: 'worker:ready', version: PROTOCOL_VERSION });
  return transport;
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

function writeTransportMessage(transportDir, basename, message) {
  const target = path.join(transportDir, basename);
  const ready = readyPathForMessage(target);
  fs.writeFileSync(target, JSON.stringify(message), 'utf8');
  fs.writeFileSync(ready, '1', 'utf8');
}

function readTransportMessages(transportDir, prefix, incomingState = { nextSequence: 1 }) {
  const messages = [];
  while (true) {
    const sequence = incomingState.nextSequence || 1;
    const readyPath = path.join(transportDir, `${prefix}${sequence}.ready`);
    const filePath = path.join(transportDir, `${prefix}${sequence}.json`);
    let text;
    try {
      const readyStat = fs.statSync(readyPath);
      if (readyStat.size <= 0) {
        break;
      }
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_TRANSPORT_MESSAGE_BYTES) {
        process.exit(1);
      }
      text = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        break;
      }
      throw error;
    }
    messages.push(JSON.parse(text));
    incomingState.nextSequence = sequence + 1;
  }
  return messages;
}

function readyPathForMessage(messagePath) {
  return messagePath.replace(/\.json$/, '.ready');
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
