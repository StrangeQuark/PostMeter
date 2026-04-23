const http = require('node:http');
const path = require('node:path');
const {
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  pollOAuthDeviceToken,
  requestOAuthDeviceAuthorization
} = require('../src/core/auth');

const OAUTH_CUSTOM_SCHEME = 'postmeter';
const OAUTH_CALLBACK_TIMEOUT_MILLIS = 5 * 60 * 1000;

function createOAuthFlowController(options = {}) {
  const {
    app,
    shell,
    emitProgress = () => {},
    env = process.env
  } = options;
  const activeOAuthFlows = new Map();

  async function startPkce(id, auth, environment, strategy) {
    const redirectStrategy = strategy === 'customScheme' ? 'customScheme' : 'loopback';
    const abortController = new AbortController();
    activeOAuthFlows.set(id, { abortController, type: 'pkce', strategy: redirectStrategy });
    let loopbackServer = null;
    try {
      emitProgress(id, {
        type: 'pkce',
        status: 'starting',
        message: 'Preparing OAuth authorization-code PKCE flow.'
      });
      const redirectUri = redirectStrategy === 'customScheme'
        ? `${OAUTH_CUSTOM_SCHEME}://oauth/callback`
        : (loopbackServer = await createLoopbackCallbackServer(abortController.signal)).redirectUri;
      const session = createOAuthPkceSession(auth, environment, { redirectUri });
      const flow = activeOAuthFlows.get(id);
      if (flow) {
        flow.state = session.state;
      }
      const customCallbackPromise = redirectStrategy === 'customScheme'
        ? waitForCustomOAuthCallback(id, session.state, abortController.signal)
        : null;
      emitProgress(id, {
        type: 'pkce',
        status: 'waitingForAuthorization',
        message: 'Opening browser for OAuth authorization.',
        redirectUri
      });
      await openOAuthAuthorizationUrl(session.authorizationUrl);
      const callbackUrl = redirectStrategy === 'customScheme'
        ? await customCallbackPromise
        : await loopbackServer.waitForCallback();
      emitProgress(id, {
        type: 'pkce',
        status: 'exchangingToken',
        message: 'Authorization received. Exchanging code for tokens.'
      });
      const updatedAuth = await exchangeOAuthAuthorizationCode(auth, session, callbackUrl, environment, {
        signal: abortController.signal
      });
      emitProgress(id, {
        type: 'pkce',
        status: 'completed',
        message: 'OAuth authorization-code flow completed.'
      });
      return { cancelled: false, auth: updatedAuth };
    } catch (error) {
      if (abortController.signal.aborted) {
        emitProgress(id, {
          type: 'pkce',
          status: 'cancelled',
          message: 'OAuth authorization-code flow cancelled.'
        });
        return { cancelled: true };
      }
      emitProgress(id, {
        type: 'pkce',
        status: 'failed',
        message: error.message || String(error)
      });
      throw error;
    } finally {
      loopbackServer?.close();
      activeOAuthFlows.delete(id);
    }
  }

  async function startDevice(id, auth, environment) {
    const abortController = new AbortController();
    activeOAuthFlows.set(id, { abortController, type: 'device' });
    try {
      emitProgress(id, {
        type: 'device',
        status: 'starting',
        message: 'Requesting OAuth device authorization.'
      });
      const pendingAuth = await requestOAuthDeviceAuthorization(auth, environment, {
        signal: abortController.signal
      });
      const verificationUrl = pendingAuth.verificationUriComplete || pendingAuth.verificationUri;
      emitProgress(id, {
        type: 'device',
        status: 'waitingForUser',
        message: 'Complete authorization in your browser.',
        userCode: pendingAuth.userCode,
        verificationUri: pendingAuth.verificationUri,
        verificationUriComplete: pendingAuth.verificationUriComplete,
        expiresAt: pendingAuth.deviceCodeExpiresAt
      });
      if (verificationUrl) {
        await openOAuthExternalUrl(verificationUrl);
      }
      const updatedAuth = await pollOAuthDeviceToken(pendingAuth, environment, {
        signal: abortController.signal,
        onProgress: (progress) => emitProgress(id, {
          type: 'device',
          status: progress.status,
          message: 'Waiting for OAuth device authorization.',
          nextAttemptAt: progress.nextAttemptAt,
          userCode: pendingAuth.userCode,
          verificationUri: pendingAuth.verificationUri,
          verificationUriComplete: pendingAuth.verificationUriComplete,
          expiresAt: pendingAuth.deviceCodeExpiresAt
        })
      });
      emitProgress(id, {
        type: 'device',
        status: 'completed',
        message: 'OAuth device authorization completed.'
      });
      return { cancelled: false, auth: updatedAuth };
    } catch (error) {
      if (abortController.signal.aborted) {
        emitProgress(id, {
          type: 'device',
          status: 'cancelled',
          message: 'OAuth device authorization cancelled.'
        });
        return { cancelled: true };
      }
      emitProgress(id, {
        type: 'device',
        status: 'failed',
        message: error.message || String(error)
      });
      throw error;
    } finally {
      activeOAuthFlows.delete(id);
    }
  }

  function cancelFlow(id) {
    const flow = activeOAuthFlows.get(id);
    if (!flow) {
      return false;
    }
    flow.abortController.abort();
    return true;
  }

  async function openOAuthAuthorizationUrl(url) {
    if (isTestOAuthHoldOpen(url)) {
      return true;
    }
    if (env.POSTMETER_TEST_OAUTH_AUTOCOMPLETE === '1') {
      await followTestOAuthRedirect(url);
      return true;
    }
    return openOAuthExternalUrl(url);
  }

  function isTestOAuthHoldOpen(url) {
    if (env.POSTMETER_TEST_OAUTH_AUTOCOMPLETE !== '1') {
      return false;
    }
    try {
      return new URL(url).searchParams.get('mode') === 'wait-cancel';
    } catch {
      return false;
    }
  }

  async function openOAuthExternalUrl(url) {
    if (env.POSTMETER_TEST_OAUTH_SKIP_EXTERNAL === '1') {
      return true;
    }
    await shell.openExternal(url);
    return true;
  }

  async function followTestOAuthRedirect(url) {
    const response = await fetch(url, { redirect: 'manual' });
    if (response.status < 300 || response.status > 399) {
      throw new Error(`Test OAuth authorization endpoint did not redirect. HTTP ${response.status}.`);
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Test OAuth authorization endpoint did not return a redirect location.');
    }
    const redirected = new URL(location, url).toString();
    if (redirected.startsWith('http://127.0.0.1:') || redirected.startsWith('http://localhost:')) {
      await fetch(redirected).catch(() => {});
      return;
    }
    handleCallbackUrl(redirected);
  }

  function registerProtocol() {
    registerOAuthProtocol(app);
  }

  function handleCallbackUrl(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (parsed.protocol !== `${OAUTH_CUSTOM_SCHEME}:`) {
      return false;
    }
    const state = parsed.searchParams.get('state');
    if (!state) {
      return false;
    }
    for (const [id, flow] of activeOAuthFlows.entries()) {
      if (flow.type === 'pkce' && flow.strategy === 'customScheme' && flow.state === state && flow.resolveCallback) {
        flow.resolveCallback(rawUrl);
        emitProgress(id, {
          type: 'pkce',
          status: 'callbackReceived',
          message: 'OAuth callback received.'
        });
        return true;
      }
    }
    return false;
  }

  function waitForCustomOAuthCallback(id, state, signal) {
    const flow = activeOAuthFlows.get(id);
    if (!flow) {
      return Promise.reject(new Error('OAuth authorization flow is not active.'));
    }
    flow.state = state;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('OAuth authorization callback timed out.'));
      }, OAUTH_CALLBACK_TIMEOUT_MILLIS);
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        if (flow.resolveCallback === onCallback) {
          delete flow.resolveCallback;
        }
      };
      const onAbort = () => {
        cleanup();
        reject(new Error('OAuth authorization flow cancelled.'));
      };
      const onCallback = (url) => {
        cleanup();
        resolve(url);
      };
      flow.resolveCallback = onCallback;
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  return {
    cancelFlow,
    findCallbackArg: findOAuthCallbackArg,
    handleCallbackUrl,
    registerProtocol,
    startDevice,
    startPkce
  };
}

function registerOAuthProtocol(app) {
  try {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(OAUTH_CUSTOM_SCHEME, process.execPath, [path.resolve(process.argv[1] || '.')]);
    } else {
      app.setAsDefaultProtocolClient(OAUTH_CUSTOM_SCHEME);
    }
  } catch {
    // Protocol registration can fail in restricted environments; loopback PKCE remains available.
  }
}

function findOAuthCallbackArg(argv) {
  return (argv || []).find((value) => typeof value === 'string' && value.startsWith(`${OAUTH_CUSTOM_SCHEME}://`)) || '';
}

async function createLoopbackCallbackServer(signal) {
  let server;
  let resolveCallback;
  let rejectCallback;
  const callbackPromise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname !== '/oauth/callback') {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>PostMeter OAuth</title><p>Authorization received. You can return to PostMeter.</p>');
    resolveCallback(`http://127.0.0.1:${server.address().port}${request.url}`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const onAbort = () => {
    rejectCallback(new Error('OAuth authorization flow cancelled.'));
    server.close();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    redirectUri: `http://127.0.0.1:${server.address().port}/oauth/callback`,
    waitForCallback() {
      return Promise.race([
        callbackPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('OAuth authorization callback timed out.')), OAUTH_CALLBACK_TIMEOUT_MILLIS))
      ]);
    },
    close() {
      signal?.removeEventListener('abort', onAbort);
      server.close();
    }
  };
}

module.exports = {
  createOAuthFlowController,
  findOAuthCallbackArg,
  OAUTH_CUSTOM_SCHEME,
  registerOAuthProtocol
};
