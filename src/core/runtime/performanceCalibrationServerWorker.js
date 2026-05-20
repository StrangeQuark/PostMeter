const http = require('node:http');
const { parentPort, workerData } = require('node:worker_threads');

const responseDelayMillis = Math.max(0, Number(workerData?.responseDelayMillis || 0));

const server = http.createServer((_request, response) => {
  const send = () => {
    response.writeHead(204, {
      'Content-Length': '0',
      Connection: 'keep-alive'
    });
    response.end();
  };
  if (responseDelayMillis > 0) {
    setTimeout(send, responseDelayMillis);
    return;
  }
  send();
});

server.on('error', (error) => {
  parentPort.postMessage({
    type: 'error',
    message: error?.message || String(error)
  });
});

parentPort.on('message', (message) => {
  if (message?.type !== 'close') {
    return;
  }
  server.close(() => {
    parentPort.postMessage({ type: 'closed' });
    process.exit(0);
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  parentPort.postMessage({
    type: 'listening',
    port: address?.port
  });
});
