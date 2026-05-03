const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const dns = require('node:dns');
const dgram = require('node:dgram');
const http = require('node:http');
const http2 = require('node:http2');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const test = require('node:test');
const {
  DIAGNOSTICS_SCHEMA_VERSION,
  LocalDiagnosticsLogger,
  defaultDiagnosticsSettings,
  diagnosticsLoggingEnabled,
  exportDiagnosticBundle,
  normalizeDiagnosticsSettings,
  redactText,
  redactTransportReferences,
  sanitizeDiagnosticEvent,
  sanitizeSettingsSummary,
  workspaceSummary
} = require('../../src/core/diagnostics');
const {
  startupFailureDiagnosticEvent,
  workspaceRecoveryDiagnosticEvent
} = require('../../electron/mainDiagnostics');

const EXACT_REQUEST_RESPONSE_ALIAS_CATEGORIES = Object.freeze({
  body: 'bodies',
  bodypreview: 'bodies',
  data: 'bodies',
  example: 'bodies',
  examples: 'bodies',
  formdata: 'bodies',
  graphql: 'bodies',
  payload: 'bodies',
  rawbody: 'bodies',
  renderedresponsetext: 'bodies',
  requestbody: 'bodies',
  requestbodytext: 'bodies',
  responsebody: 'bodies',
  responsebodytext: 'bodies',
  responsetext: 'bodies',
  text: 'bodies',
  variables: 'bodies',
  formdataparts: 'bodies',
  graphqlvariables: 'bodies',
  grpc: 'protocolMessages',
  message: 'protocolMessages',
  messages: 'protocolMessages',
  grpcmetadata: 'headers',
  metadata: 'headers',
  requestmetadata: 'headers',
  responsemetadata: 'headers',
  protocolmessage: 'protocolMessages',
  protocolmessages: 'protocolMessages',
  cookie: 'cookies',
  cookies: 'cookies',
  cookiejar: 'cookies',
  setcookie: 'cookies',
  setcookies: 'cookies',
  header: 'headers',
  headers: 'headers',
  httpstatus: 'headers',
  httpstatuscode: 'headers',
  method: 'headers',
  protocol: 'headers',
  requestheaders: 'headers',
  requestmethod: 'headers',
  responseheaders: 'headers',
  responsestatus: 'headers',
  responsestatuscategory: 'headers',
  responsestatuscode: 'headers',
  statuscategory: 'headers',
  statuscode: 'headers',
  headerstext: 'headers',
  finalurl: 'urls',
  fullurl: 'urls',
  href: 'urls',
  path: 'urls',
  pathname: 'urls',
  query: 'urls',
  queryparam: 'urls',
  queryparams: 'urls',
  searchparam: 'urls',
  searchparams: 'urls',
  urlparam: 'urls',
  urlparams: 'urls',
  urlparameter: 'urls',
  urlparameters: 'urls',
  pathparam: 'urls',
  pathparams: 'urls',
  pathparameter: 'urls',
  pathparameters: 'urls',
  parameter: 'urls',
  parameters: 'urls',
  requesturl: 'urls',
  responseurl: 'urls',
  uri: 'urls',
  url: 'urls',
  requestbodybytes: 'bodies',
  requestbytes: 'bodies',
  requestsize: 'bodies',
  responsebodybytes: 'bodies',
  responsebytes: 'bodies',
  responsesize: 'bodies',
  consoleoutput: 'scriptConsole',
  logs: 'scriptConsole',
  scriptconsole: 'scriptConsole',
  scriptlogs: 'scriptConsole',
  idfrompayload: 'payloadIdentifiers',
  payloadderivedidentifier: 'payloadIdentifiers',
  payloadidentifier: 'payloadIdentifiers',
  requestidfrompayload: 'payloadIdentifiers'
});

const REQUEST_RESPONSE_CONTEXT_ALIAS_CATEGORIES = Object.freeze({
  bodybytes: 'bodies',
  bodysize: 'bodies',
  bytes: 'bodies',
  contentbytes: 'bodies',
  contentlength: 'bodies',
  reason: 'headers',
  reasonphrase: 'headers',
  size: 'bodies',
  status: 'headers',
  statuscategory: 'headers',
  statuscode: 'headers',
  statustext: 'headers'
});

function allRequestResponseLoggingEnabled() {
  return normalizeDiagnosticsSettings({
    requestResponseLogging: {
      urls: true,
      headers: true,
      cookies: true,
      bodies: true,
      protocolMessages: true,
      scriptConsole: true,
      payloadIdentifiers: true
    }
  });
}

test('diagnostics settings default-deny request and response data', () => {
  const defaults = defaultDiagnosticsSettings();

  assert.equal(defaults.logging.enabled, true);
  assert.equal(defaults.logging.level, 'info');
  assert.deepEqual(defaults.requestResponseLogging, {
    urls: false,
    headers: false,
    cookies: false,
    bodies: false,
    protocolMessages: false,
    scriptConsole: false,
    payloadIdentifiers: false
  });
  assert.deepEqual(normalizeDiagnosticsSettings({
    logging: { enabled: true, level: 'TRACE' },
    requestResponseLogging: {
      urls: true,
      headers: 'yes',
      bodies: false,
      unknown: true
    }
  }), {
    logging: { enabled: true, level: 'info' },
    requestResponseLogging: {
      urls: true,
      headers: false,
      cookies: false,
      bodies: false,
      protocolMessages: false,
      scriptConsole: false,
      payloadIdentifiers: false
    }
  });
  assert.equal(diagnosticsLoggingEnabled({ logging: { enabled: false } }, 'error'), false);
  assert.equal(diagnosticsLoggingEnabled({ logging: { enabled: true, level: 'warn' } }, 'info'), false);
  assert.equal(diagnosticsLoggingEnabled({ logging: { enabled: true, level: 'warn' } }, 'error'), true);
});

test('all exact request response aliases honor default-deny and opt-in categories', () => {
  const fields = Object.fromEntries(Object.keys(EXACT_REQUEST_RESPONSE_ALIAS_CATEGORIES).map((key) => [
    key,
    `visible_${key}`
  ]));
  const defaultSanitized = sanitizeDiagnosticEvent({ type: 'diagnostics.alias.exact-default', fields }, defaultDiagnosticsSettings());
  const optInSanitized = sanitizeDiagnosticEvent({ type: 'diagnostics.alias.exact-opt-in', fields }, allRequestResponseLoggingEnabled());

  for (const [key, category] of Object.entries(EXACT_REQUEST_RESPONSE_ALIAS_CATEGORIES)) {
    assert.equal(defaultSanitized.fields[key], `[omitted:${category}]`, `${key} should default omit as ${category}`);
    if (category === 'cookies') {
      assert.equal(optInSanitized.fields[key], '[redacted-cookie]', `${key} should still redact cookie content`);
    } else {
      assert.equal(optInSanitized.fields[key], fields[key], `${key} should preserve safe opt-in content`);
    }
  }
});

test('all context-only request response aliases honor request response parents', () => {
  const metrics = Object.fromEntries(Object.keys(REQUEST_RESPONSE_CONTEXT_ALIAS_CATEGORIES).map((key) => [
    key,
    `visible_${key}`
  ]));
  const fields = {
    requestInfo: { metrics: { ...metrics } },
    responseDetails: { metrics: { ...metrics } },
    httpRequests: [{ metrics: { ...metrics } }],
    httpResponses: [{ timing: { ...metrics } }]
  };
  const defaultSanitized = sanitizeDiagnosticEvent({ type: 'diagnostics.alias.context-default', fields }, defaultDiagnosticsSettings());
  const optInSanitized = sanitizeDiagnosticEvent({ type: 'diagnostics.alias.context-opt-in', fields }, allRequestResponseLoggingEnabled());

  for (const [key, category] of Object.entries(REQUEST_RESPONSE_CONTEXT_ALIAS_CATEGORIES)) {
    assert.equal(defaultSanitized.fields.requestInfo.metrics[key], `[omitted:${category}]`, `requestInfo.${key} should default omit`);
    assert.equal(defaultSanitized.fields.responseDetails.metrics[key], `[omitted:${category}]`, `responseDetails.${key} should default omit`);
    assert.equal(defaultSanitized.fields.httpRequests[0].metrics[key], `[omitted:${category}]`, `httpRequests[0].${key} should default omit`);
    assert.equal(defaultSanitized.fields.httpResponses[0].timing[key], `[omitted:${category}]`, `httpResponses[0].${key} should default omit`);
    assert.equal(optInSanitized.fields.requestInfo.metrics[key], metrics[key], `requestInfo.${key} should preserve safe opt-in content`);
    assert.equal(optInSanitized.fields.responseDetails.metrics[key], metrics[key], `responseDetails.${key} should preserve safe opt-in content`);
    assert.equal(optInSanitized.fields.httpRequests[0].metrics[key], metrics[key], `httpRequests[0].${key} should preserve safe opt-in content`);
    assert.equal(optInSanitized.fields.httpResponses[0].timing[key], metrics[key], `httpResponses[0].${key} should preserve safe opt-in content`);
  }
});

test('sanitized diagnostic events omit request response categories by default', () => {
  const event = sensitiveDiagnosticEvent();
  const sanitized = sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings());
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.fields.requestUrl, '[omitted:urls]');
  assert.equal(sanitized.fields.finalUrl, '[omitted:urls]');
  assert.equal(sanitized.fields.grpcUrl, '[omitted:urls]');
  assert.equal(sanitized.fields.websocketUrl, '[omitted:urls]');
  assert.equal(sanitized.fields.fileUrl, '[omitted:urls]');
  assert.equal(sanitized.fields.queryParams, '[omitted:urls]');
  assert.equal(sanitized.fields.urlParams, '[omitted:urls]');
  assert.equal(sanitized.fields.urlParameters, '[omitted:urls]');
  assert.equal(sanitized.fields.searchParams, '[omitted:urls]');
  assert.equal(sanitized.fields.pathParams, '[omitted:urls]');
  assert.equal(sanitized.fields.parameters, '[omitted:urls]');
  assert.equal(sanitized.fields.method, '[omitted:headers]');
  assert.equal(sanitized.fields.protocol, '[omitted:headers]');
  assert.equal(sanitized.fields.statusCode, '[omitted:headers]');
  assert.equal(sanitized.fields.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.request.method, '[omitted:headers]');
  assert.equal(sanitized.fields.request.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.request.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestInfo.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.metrics.method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestInfo.metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.metrics.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.metrics.bodyBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.metrics.bodySize, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfo.metrics.contentBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestDetails.method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestDetails.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestDetails.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestDetails.metrics.method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestDetails.metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestDetails.metrics.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequest.method, '[omitted:headers]');
  assert.equal(sanitized.fields.httpRequest.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequest.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequest.metrics.method, '[omitted:headers]');
  assert.equal(sanitized.fields.httpRequest.metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequest.metrics.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.response.status, '[omitted:headers]');
  assert.equal(sanitized.fields.response.statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.response.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.response.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfo.status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfo.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfo.metrics.status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.metrics.statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.metrics.reason, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.metrics.reasonPhrase, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.metrics.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfo.metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfo.metrics.contentBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseDetails.status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseDetails.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseDetails.metrics.status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.metrics.reason, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.metrics.reasonPhrase, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.metrics.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.responseDetails.metrics.contentLength, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponse.status, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponse.statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponse.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponse.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponse.timing.statusCode, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponse.timing.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponse.timing.contentLength, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponse.timing.contentBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requests[0].method, '[omitted:headers]');
  assert.equal(sanitized.fields.requests[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requests[0].bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfos[0].method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestInfos[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfos[0].bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfos[0].metrics.method, '[omitted:headers]');
  assert.equal(sanitized.fields.requestInfos[0].metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfos[0].metrics.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestInfos[0].metrics.bodyBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequests[0].method, '[omitted:headers]');
  assert.equal(sanitized.fields.httpRequests[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequests[0].bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequests[0].metrics.method, '[omitted:headers]');
  assert.equal(sanitized.fields.httpRequests[0].metrics.size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpRequests[0].metrics.bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responses[0].status, '[omitted:headers]');
  assert.equal(sanitized.fields.responses[0].statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.responses[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.responses[0].bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfos[0].status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].statusText, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfos[0].bytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.status, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.reason, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.reasonPhrase, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.contentLength, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseInfos[0].metrics.contentBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponses[0].status, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponses[0].size, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponses[0].timing.statusCode, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponses[0].timing.statusCategory, '[omitted:headers]');
  assert.equal(sanitized.fields.httpResponses[0].timing.contentLength, '[omitted:bodies]');
  assert.equal(sanitized.fields.httpResponses[0].timing.contentBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.headers, '[omitted:headers]');
  assert.equal(sanitized.fields.metadata, '[omitted:headers]');
  assert.equal(sanitized.fields.requestMetadata, '[omitted:headers]');
  assert.equal(sanitized.fields['set-cookie'], '[omitted:cookies]');
  assert.equal(sanitized.fields.body, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestBodyText, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseBodyText, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestBodyBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.requestSize, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseBodyBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseBytes, '[omitted:bodies]');
  assert.equal(sanitized.fields.responseSize, '[omitted:bodies]');
  assert.equal(sanitized.fields.graphqlVariables, '[omitted:bodies]');
  assert.equal(sanitized.fields.formDataParts, '[omitted:bodies]');
  assert.equal(sanitized.fields.protocolMessages, '[omitted:protocolMessages]');
  assert.equal(sanitized.fields.logs, '[omitted:scriptConsole]');
  assert.equal(sanitized.fields.consoleOutput, '[omitted:scriptConsole]');
  assert.equal(sanitized.fields.payloadIdentifier, '[omitted:payloadIdentifiers]');
  assert.equal(sanitized.fields.nested.access_token, '[redacted]');
  assert.equal(sanitized.fields.nested.accessToken, '[redacted]');
  assert.equal(sanitized.fields.nested.authorizationHeader, '[redacted]');
  assert.equal(sanitized.fields.nested.passphrase, '[redacted]');
  assert.equal(sanitized.fields.nested.credential, '[redacted]');
  assert.equal(sanitized.fields.nested.credentials, '[redacted]');
  assert.equal(sanitized.fields.nested.passwd, '[redacted]');
  assert.equal(sanitized.fields.nested['[redacted-key]'], '[redacted]');
  assert.equal(sanitized.fields.nested['[redacted-key-2]'], '[redacted]');
  assert.equal(sanitized.fields.nested['[redacted-key-3]'], '[redacted]');
  assert.equal(sanitized.fields.nested['[redacted-key-4]'], '[redacted]');
  assert.doesNotMatch(serialized, /customer-search|customer-url-param|customer-url-parameter|customer-search-param|customer-path-param|customer-parameter|customer-body|nested-request-body-secret|nested-request-info-body-secret|nested-request-details-body-secret|nested-http-request-body-secret|nested-response-body-secret|nested-response-info-body-secret|nested-response-details-body-secret|nested-http-response-body-secret|array-request-body-secret|array-request-info-body-secret|array-http-request-body-secret|array-response-body-secret|array-response-info-body-secret|customer-header|customer-cookie|customer-log|customer-payload-id|customer-graphql-variable|customer-form-data|console-output-customer-secret|metadata-visible/);
  assert.doesNotMatch(serialized, /private-key-secret|Bearer request-secret|object-key-token-secret|header-key-secret|api-key-object-secret|HeaderKeySecret|eyJsecret|eyJaaaaaaab|grpc-user|grpc-password|grpc-query-secret|socket-user|socket-password|socket-query-secret|client-certificate-passphrase|generic-credential-secret|generic-credentials-secret|legacy-passwd-secret|structured-token-secret|structured-state-secret|structured-raw-secret|structured-value-raw-secret|structured-current-secret|structured-url-secret|structured-url-raw-secret|structured-url-value-raw-secret|structured-url-current-secret|structured-url-example-secret|structured-url-schema-secret|structured-search-secret|structured-path-secret|structured-parameter-secret|structured-parameter-schema-secret/);
  assert.doesNotMatch(serialized, /\/home\/alice|\/Users\/Alice|C:\\\\Users\\\\Alice/);
});

test('diagnostic top-level metadata redacts secret-shaped labels before token normalization', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-metadata-'));
  try {
    const event = {
      type: 'access_token=top-level-type-secret',
      outcome: 'state=top-level-outcome-secret',
      failureCode: 'ACCESS_TOKEN_SUPERSECRET12345',
      level: 'error',
      fields: { detail: 'safe metadata detail' }
    };
    const sanitized = sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings());
    const serialized = JSON.stringify(sanitized);

    assert.doesNotMatch(serialized, /top-level-(?:type|outcome)-secret|SUPERSECRET12345/);
    assert.equal(sanitized.type, 'access_token-redacted');
    assert.equal(sanitized.outcome, 'state-redacted');
    assert.equal(sanitized.failureCode, '[redacted]');

    const delimiterFree = sanitizeDiagnosticEvent({
      type: 'access_token_supersecret12345',
      outcome: 'state_supersecret12345',
      failureCode: 'ACCESS_TOKEN_SUPERSECRET12345',
      fields: { detail: 'safe metadata detail' }
    }, defaultDiagnosticsSettings());
    const delimiterFreeSerialized = JSON.stringify(delimiterFree);

    assert.doesNotMatch(delimiterFreeSerialized, /supersecret12345|SUPERSECRET12345/);
    assert.equal(delimiterFree.type, 'diagnostic.event');
    assert.equal(delimiterFree.outcome, 'redacted');
    assert.equal(delimiterFree.failureCode, '[redacted]');

    const compactDelimiterFree = sanitizeDiagnosticEvent({
      type: 'accesstokensupersecret12345',
      outcome: 'statesupersecret12345',
      failureCode: 'accesstokensupersecret12345',
      fields: { detail: 'safe metadata detail' }
    }, defaultDiagnosticsSettings());
    const compactDelimiterFreeSerialized = JSON.stringify(compactDelimiterFree);

    assert.doesNotMatch(compactDelimiterFreeSerialized, /supersecret12345/);
    assert.equal(compactDelimiterFree.type, 'diagnostic.event');
    assert.equal(compactDelimiterFree.outcome, 'redacted');
    assert.equal(compactDelimiterFree.failureCode, '[redacted]');

    const compactOpaque = sanitizeDiagnosticEvent({
      type: 'accesstokenabcdef123456',
      outcome: 'stateabcdef123456',
      failureCode: 'codeabcdef1234567890',
      fields: { detail: 'safe metadata detail' }
    }, defaultDiagnosticsSettings());
    const compactOpaqueSerialized = JSON.stringify(compactOpaque);

    assert.doesNotMatch(compactOpaqueSerialized, /abcdef123456/);
    assert.equal(compactOpaque.type, 'diagnostic.event');
    assert.equal(compactOpaque.outcome, 'redacted');
    assert.equal(compactOpaque.failureCode, '[redacted]');

    const compactTokenAlias = sanitizeDiagnosticEvent({
      type: 'xtokensupersecret12345',
      outcome: 'x-token-abcdef1234',
      failureCode: 'xtokenabcdef1234',
      fields: { marker: 'xtokensupersecret12345 x-token-supersecret12345 accesstokenabcdef1234 stateabcdef1234 codeabcdef1234 xtokenabcdef1234 x-token-abcdef1234 tokenendpointfailed' }
    }, defaultDiagnosticsSettings());
    const compactTokenAliasSerialized = JSON.stringify(compactTokenAlias);

    assert.doesNotMatch(compactTokenAliasSerialized, /xtokensupersecret12345|x-token-supersecret12345|accesstokenabcdef1234|stateabcdef1234|codeabcdef1234|xtokenabcdef1234|x-token-abcdef1234/);
    assert.equal(compactTokenAlias.type, 'diagnostic.event');
    assert.equal(compactTokenAlias.outcome, 'redacted');
    assert.equal(compactTokenAlias.failureCode, '[redacted]');
    assert.equal(compactTokenAlias.fields.marker, '[redacted] [redacted] [redacted] [redacted] [redacted] [redacted] [redacted] tokenendpointfailed');

    const safeInternalLabel = sanitizeDiagnosticEvent({
      type: 'redaction.compact-token-regression',
      outcome: 'tokenendpointfailed',
      failureCode: 'request_send_failed',
      fields: { detail: 'tokenendpointfailed' }
    }, defaultDiagnosticsSettings());

    assert.equal(safeInternalLabel.type, 'redaction.compact-token-regression');
    assert.equal(safeInternalLabel.outcome, 'tokenendpointfailed');
    assert.equal(safeInternalLabel.failureCode, 'request_send_failed');
    assert.equal(safeInternalLabel.fields.detail, 'tokenendpointfailed');

    for (const failureCode of ['oauth_pkce_failed', 'vault_prompt_denied', 'request_send_failed']) {
      assert.equal(sanitizeDiagnosticEvent({
        type: 'diagnostics.internal-code',
        failureCode,
        fields: { detail: 'safe metadata detail' }
      }, defaultDiagnosticsSettings()).failureCode, failureCode);
    }

    const logger = new LocalDiagnosticsLogger({
      logDirectory: directory,
      settingsProvider: () => normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } })
    });
    await logger.log(event);
    const line = await fs.readFile(path.join(directory, 'postmeter.log.jsonl'), 'utf8');
    const record = JSON.parse(line);

    assert.doesNotMatch(line, /top-level-(?:type|outcome)-secret|SUPERSECRET12345/);
    assert.equal(record.type, 'access_token-redacted');
    assert.equal(record.outcome, 'state-redacted');
    assert.equal(record.failureCode, '[redacted]');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('safe internal sandbox denial failure codes survive diagnostics sanitizer logger and bundle export', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-safe-codes-'));
  const safeInternalFailureCodes = [
    'script_send_request_disabled',
    'script_vault_disabled',
    'script_vault_prompt_denied',
    'script_vault_unavailable',
    'script_cookies_disabled'
  ];
  try {
    const logger = new LocalDiagnosticsLogger({
      logDirectory: directory,
      settingsProvider: () => normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } })
    });

    for (const failureCode of safeInternalFailureCodes) {
      const event = {
        type: 'sandbox.broker.denied',
        level: 'warn',
        failureCode,
        fields: {
          operation: failureCode.includes('cookie') ? 'pm.cookies' : 'pm.vault'
        }
      };
      assert.equal(sanitizeDiagnosticEvent(event, defaultDiagnosticsSettings()).failureCode, failureCode);
      await logger.log(event);
    }

    const lines = (await fs.readFile(path.join(directory, 'postmeter.log.jsonl'), 'utf8'))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((entry) => entry.failureCode), safeInternalFailureCodes);

    const bundlePath = path.join(directory, 'bundle.json');
    await exportDiagnosticBundle({
      logger,
      targetPath: bundlePath,
      workspace: { settings: { diagnostics: normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } }) } }
    });
    const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8'));
    assert.deepEqual(bundle.logs.map((entry) => entry.failureCode), safeInternalFailureCodes);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('request response diagnostic opt-ins are narrow and still redact secrets', () => {
  const settings = normalizeDiagnosticsSettings({
    requestResponseLogging: {
      urls: true,
      headers: true,
      cookies: true,
      bodies: true,
      protocolMessages: true,
      scriptConsole: true,
      payloadIdentifiers: true
    }
  });
  const sanitized = sanitizeDiagnosticEvent(sensitiveDiagnosticEvent(), settings);
  const serialized = JSON.stringify(sanitized);

  assert.match(sanitized.fields.requestUrl, /https:\/\/api\.example\.test\/v1\/customers/);
  assert.match(sanitized.fields.requestUrl, /customer-search/);
  assert.doesNotMatch(sanitized.fields.requestUrl, /request-secret|verifier-secret|user-code-secret|client-assertion-secret/);
  assert.match(sanitized.fields.grpcUrl, /grpcs:\/\/grpc\.example\.test\/service\.Customer\/Get/);
  assert.doesNotMatch(sanitized.fields.grpcUrl, /grpc-user|grpc-password|grpc-query-secret/);
  assert.match(sanitized.fields.websocketUrl, /wss:\/\/socket\.example\.test\/live/);
  assert.doesNotMatch(sanitized.fields.websocketUrl, /socket-user|socket-password|socket-query-secret/);
  assert.equal(sanitized.fields.fileUrl, 'file://[path]');
  assert.equal(sanitized.fields.queryParams[0].value, 'customer-search');
  assert.equal(sanitized.fields.queryParams[1].value, '[redacted]');
  assert.equal(sanitized.fields.queryParams[2].value, '[redacted]');
  assert.equal(sanitized.fields.queryParams[3].raw, '[redacted]');
  assert.equal(sanitized.fields.queryParams[4].valueRaw, '[redacted]');
  assert.equal(sanitized.fields.queryParams[5].currentValue, '[redacted]');
  assert.equal(sanitized.fields.queryParams[6].raw, '[redacted]');
  assert.equal(sanitized.fields.urlParams[0].value, 'customer-url-param');
  assert.equal(sanitized.fields.urlParameters[0].value, '[redacted]');
  assert.equal(sanitized.fields.urlParameters[1].raw, '[redacted]');
  assert.equal(sanitized.fields.urlParameters[2].valueRaw, '[redacted]');
  assert.equal(sanitized.fields.urlParameters[3].currentValue, '[redacted]');
  assert.equal(sanitized.fields.urlParameters[4].example, '[redacted]');
  assert.equal(sanitized.fields.urlParameters[5].schema, '[redacted]');
  assert.equal(sanitized.fields.searchParams[0].value, '[redacted]');
  assert.equal(sanitized.fields.pathParams[0].value, 'customer-path-param');
  assert.equal(sanitized.fields.pathParams[1].values, '[redacted]');
  assert.equal(sanitized.fields.parameters[0].value, '[redacted]');
  assert.equal(sanitized.fields.parameters[1].schema, '[redacted]');
  assert.equal(sanitized.fields.method, 'POST');
  assert.equal(sanitized.fields.protocol, 'https');
  assert.equal(sanitized.fields.statusCode, 201);
  assert.equal(sanitized.fields.statusCategory, '2xx');
  assert.equal(sanitized.fields.request.method, 'POST');
  assert.equal(sanitized.fields.request.size, 888);
  assert.equal(sanitized.fields.request.bytes, 999);
  assert.equal(sanitized.fields.requestInfo.method, 'PUT');
  assert.equal(sanitized.fields.requestInfo.size, 2888);
  assert.equal(sanitized.fields.requestInfo.bytes, 2999);
  assert.equal(sanitized.fields.requestInfo.metrics.method, 'HEAD');
  assert.equal(sanitized.fields.requestInfo.metrics.size, 2111);
  assert.equal(sanitized.fields.requestInfo.metrics.bytes, 2222);
  assert.equal(sanitized.fields.requestInfo.metrics.bodyBytes, 2333);
  assert.equal(sanitized.fields.requestInfo.metrics.bodySize, 2444);
  assert.equal(sanitized.fields.requestInfo.metrics.contentBytes, 2555);
  assert.equal(sanitized.fields.requestDetails.method, 'OPTIONS');
  assert.equal(sanitized.fields.requestDetails.size, 4888);
  assert.equal(sanitized.fields.requestDetails.bytes, 4999);
  assert.equal(sanitized.fields.requestDetails.metrics.method, 'TRACE');
  assert.equal(sanitized.fields.requestDetails.metrics.size, 4111);
  assert.equal(sanitized.fields.requestDetails.metrics.bytes, 4222);
  assert.equal(sanitized.fields.httpRequest.method, 'PATCH');
  assert.equal(sanitized.fields.httpRequest.size, 6888);
  assert.equal(sanitized.fields.httpRequest.bytes, 6999);
  assert.equal(sanitized.fields.httpRequest.metrics.method, 'POST');
  assert.equal(sanitized.fields.httpRequest.metrics.size, 6111);
  assert.equal(sanitized.fields.httpRequest.metrics.bytes, 6222);
  assert.equal(sanitized.fields.response.status, 201);
  assert.equal(sanitized.fields.response.statusText, 'Created');
  assert.equal(sanitized.fields.response.size, 777);
  assert.equal(sanitized.fields.response.bytes, 666);
  assert.equal(sanitized.fields.responseInfo.status, 204);
  assert.equal(sanitized.fields.responseInfo.statusText, 'No Content');
  assert.equal(sanitized.fields.responseInfo.size, 2777);
  assert.equal(sanitized.fields.responseInfo.bytes, 2666);
  assert.equal(sanitized.fields.responseInfo.metrics.status, 207);
  assert.equal(sanitized.fields.responseInfo.metrics.statusText, 'Multi-Status');
  assert.equal(sanitized.fields.responseInfo.metrics.reason, 'Multi-Status');
  assert.equal(sanitized.fields.responseInfo.metrics.reasonPhrase, 'Multi-Status Phrase');
  assert.equal(sanitized.fields.responseInfo.metrics.statusCategory, '2xx');
  assert.equal(sanitized.fields.responseInfo.metrics.size, 2555);
  assert.equal(sanitized.fields.responseInfo.metrics.contentBytes, 2445);
  assert.equal(sanitized.fields.responseDetails.status, 206);
  assert.equal(sanitized.fields.responseDetails.statusText, 'Partial Content');
  assert.equal(sanitized.fields.responseDetails.size, 4777);
  assert.equal(sanitized.fields.responseDetails.bytes, 4666);
  assert.equal(sanitized.fields.responseDetails.metrics.status, 208);
  assert.equal(sanitized.fields.responseDetails.metrics.reason, 'Already Reported');
  assert.equal(sanitized.fields.responseDetails.metrics.reasonPhrase, 'Already Reported Phrase');
  assert.equal(sanitized.fields.responseDetails.metrics.statusCategory, '2xx');
  assert.equal(sanitized.fields.responseDetails.metrics.contentLength, 4444);
  assert.equal(sanitized.fields.httpResponse.status, 211);
  assert.equal(sanitized.fields.httpResponse.statusText, 'Network Authentication Required');
  assert.equal(sanitized.fields.httpResponse.size, 6777);
  assert.equal(sanitized.fields.httpResponse.bytes, 6666);
  assert.equal(sanitized.fields.httpResponse.timing.statusCode, 212);
  assert.equal(sanitized.fields.httpResponse.timing.statusCategory, '2xx');
  assert.equal(sanitized.fields.httpResponse.timing.contentLength, 6111);
  assert.equal(sanitized.fields.httpResponse.timing.contentBytes, 6122);
  assert.equal(sanitized.fields.requests[0].method, 'POST');
  assert.equal(sanitized.fields.requests[0].size, 1888);
  assert.equal(sanitized.fields.requests[0].bytes, 1999);
  assert.equal(sanitized.fields.requestInfos[0].method, 'DELETE');
  assert.equal(sanitized.fields.requestInfos[0].size, 3888);
  assert.equal(sanitized.fields.requestInfos[0].bytes, 3999);
  assert.equal(sanitized.fields.requestInfos[0].metrics.method, 'CONNECT');
  assert.equal(sanitized.fields.requestInfos[0].metrics.size, 3111);
  assert.equal(sanitized.fields.requestInfos[0].metrics.bytes, 3222);
  assert.equal(sanitized.fields.requestInfos[0].metrics.bodyBytes, 3331);
  assert.equal(sanitized.fields.httpRequests[0].method, 'PATCH');
  assert.equal(sanitized.fields.httpRequests[0].size, 1444);
  assert.equal(sanitized.fields.httpRequests[0].bytes, 1555);
  assert.equal(sanitized.fields.httpRequests[0].metrics.method, 'POST');
  assert.equal(sanitized.fields.httpRequests[0].metrics.size, 1333);
  assert.equal(sanitized.fields.httpRequests[0].metrics.bytes, 1666);
  assert.equal(sanitized.fields.responses[0].status, 202);
  assert.equal(sanitized.fields.responses[0].statusText, 'Accepted');
  assert.equal(sanitized.fields.responses[0].size, 1777);
  assert.equal(sanitized.fields.responses[0].bytes, 1666);
  assert.equal(sanitized.fields.responseInfos[0].status, 205);
  assert.equal(sanitized.fields.responseInfos[0].statusText, 'Reset Content');
  assert.equal(sanitized.fields.responseInfos[0].size, 3777);
  assert.equal(sanitized.fields.responseInfos[0].bytes, 3666);
  assert.equal(sanitized.fields.responseInfos[0].metrics.status, 209);
  assert.equal(sanitized.fields.responseInfos[0].metrics.reason, 'Info');
  assert.equal(sanitized.fields.responseInfos[0].metrics.reasonPhrase, 'Info Phrase');
  assert.equal(sanitized.fields.responseInfos[0].metrics.statusCategory, '2xx');
  assert.equal(sanitized.fields.responseInfos[0].metrics.contentLength, 3333);
  assert.equal(sanitized.fields.responseInfos[0].metrics.contentBytes, 3444);
  assert.equal(sanitized.fields.httpResponses[0].status, 203);
  assert.equal(sanitized.fields.httpResponses[0].size, 1222);
  assert.equal(sanitized.fields.httpResponses[0].timing.statusCode, 210);
  assert.equal(sanitized.fields.httpResponses[0].timing.statusCategory, '2xx');
  assert.equal(sanitized.fields.httpResponses[0].timing.contentLength, 1111);
  assert.equal(sanitized.fields.httpResponses[0].timing.contentBytes, 1122);
  assert.equal(sanitized.fields.headers.Authorization, '[redacted]');
  assert.equal(sanitized.fields.headers['X-Customer-Id'], '[redacted]');
  assert.equal(sanitized.fields.metadata.authorization, '[redacted]');
  assert.equal(sanitized.fields.metadata['customer-id'], '[redacted]');
  assert.match(sanitized.fields.requestMetadata.trace, /metadata-visible/);
  assert.equal(sanitized.fields['set-cookie'], '[redacted-cookie]');
  assert.match(sanitized.fields.body, /customer-body/);
  assert.equal(sanitized.fields.requestBodyBytes, 19);
  assert.equal(sanitized.fields.requestBytes, 20);
  assert.equal(sanitized.fields.requestSize, 21);
  assert.equal(sanitized.fields.responseBodyBytes, 1024);
  assert.equal(sanitized.fields.responseBytes, 2048);
  assert.equal(sanitized.fields.responseSize, 4096);
  assert.doesNotMatch(serialized, /request-secret|body-token-secret|json-token-secret|camel-client-secret|customer-cookie|customer-log-secret|private-key-secret|customer-header|access-token-secret|refresh-token-secret|id-token-secret|auth-header-secret|proxy-header-secret|structured-token-secret|structured-state-secret|structured-url-secret|structured-search-secret|structured-parameter-secret|\/Users\/Alice/);
  assert.match(serialized, /customer-payload-id/);
});

test('structured header and metadata pair opt-ins redact sensitive pair values by original name', () => {
  const settings = normalizeDiagnosticsSettings({
    requestResponseLogging: {
      headers: true
    }
  });
  const sanitized = sanitizeDiagnosticEvent({
    type: 'diagnostics.header-pair.probe',
    fields: {
      headers: [
        { key: 'Authorization', value: 'Bearer auth-value-should-not-leak' },
        { name: 'Proxy-Authorization', raw: 'Basic proxy-value-should-not-leak' },
        { key: 'Cookie', currentValue: 'sid=cookie-value-should-not-leak' },
        { name: 'Set-Cookie', value: 'sid=set-cookie-value-should-not-leak; Path=/' },
        { key: 'x-api-key', value: 'api-key-value-should-not-leak' },
        { name: 'X-Amz-Signature', value: 'aws-signature-value-should-not-leak' },
        { name: 'X-Akamai-Signature', value: 'akamai-signature-value-should-not-leak' },
        { name: 'Content-Type', value: 'application/json' }
      ],
      metadata: [
        { key: 'authorization', value: 'metadata-auth-value-should-not-leak' },
        { name: 'grpc-metadata-token', currentValue: 'metadata-token-value-should-not-leak' }
      ],
      requestMetadata: [
        { key: 'x-api-key', schema: { default: 'schema-api-key-value-should-not-leak' } },
        { name: 'traceparent', value: '00-safe-trace-visible' }
      ]
    }
  }, settings);
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.fields.headers[0].value, '[redacted]');
  assert.equal(sanitized.fields.headers[1].raw, '[redacted]');
  assert.equal(sanitized.fields.headers[2].currentValue, '[redacted]');
  assert.equal(sanitized.fields.headers[3].value, '[redacted]');
  assert.equal(sanitized.fields.headers[4].value, '[redacted]');
  assert.equal(sanitized.fields.headers[5].value, '[redacted]');
  assert.equal(sanitized.fields.headers[6].value, '[redacted]');
  assert.equal(sanitized.fields.headers[7].value, 'application/json');
  assert.equal(sanitized.fields.metadata[0].value, '[redacted]');
  assert.equal(sanitized.fields.metadata[1].currentValue, '[redacted]');
  assert.equal(sanitized.fields.requestMetadata[0].schema, '[redacted]');
  assert.equal(sanitized.fields.requestMetadata[1].value, '00-safe-trace-visible');
  assert.doesNotMatch(serialized, /auth-value-should-not-leak|proxy-value-should-not-leak|cookie-value-should-not-leak|set-cookie-value-should-not-leak|api-key-value-should-not-leak|aws-signature-value-should-not-leak|akamai-signature-value-should-not-leak|metadata-auth-value-should-not-leak|metadata-token-value-should-not-leak|schema-api-key-value-should-not-leak/);
});

test('redaction covers auth schemes oauth fields JWTs paths private keys and URL credentials', () => {
  const redacted = redactText([
    'Authorization: Bearer bearer-secret',
    'Proxy-Authorization: Basic basic-secret',
    'Authorization: Digest username="alice", realm="secure", nonce="abc123", response="deadbeef"',
    'Proxy-Authorization: Digest username="proxy-user", nonce="proxy-nonce", response="proxy-response"',
    'Digest username="standalone-user", realm="standalone-realm", nonce="standalone-nonce", uri="/standalone/path", response="standalone-response", cnonce="standalone-cnonce"',
    'Hawk id="hawk-id", nonce="hawk-nonce", mac="hawk-mac"',
    'OAuth oauth_consumer_key="oauth-consumer", oauth_token="oauth-token", oauth_signature="oauth-signature"',
    'AWS4-HMAC-SHA256 Credential=aws-credential/20260502/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=aws-signature',
    'EG1-HMAC-SHA256 client_token=akamai-client;access_token=akamai-access;timestamp=20260502T000000Z;nonce=akamai-nonce;signature=akamai-signature',
    'X-Amz-Credential=aws-query-credential x-amz-credential=aws-lower-credential xAmzCredential=aws-camel-credential X-Amz-Signature=aws-query-signature X-Amz-Security-Token=aws-security-token client-secret=hyphen client secret next=ok',
    '{"Authorization":"Digest username=\\"json-user\\", nonce=\\"json-nonce\\", response=\\"json-response\\""}',
    '{"authorizationHeader":"Digest username=\\"json-authz-user\\", realm=\\"json-authz-realm\\", nonce=\\"json-authz-nonce\\", uri=\\"/digest/private/path\\", response=\\"json-authz-response\\", cnonce=\\"json-authz-cnonce\\""}',
    'client_secret=client-secret-value',
    'client_secret=alpha beta gamma next=ok',
    'client_secret: "top secret value" next=ok',
    '"client_secret": "json client secret value"',
    '"access_token":"json-token-secret"',
    '"access_token": "json access token with spaces"',
    'accessToken: access-token-secret',
    'refreshToken=refresh-token-secret',
    'idToken=id-token-secret',
    'authToken=camel-auth-token-secret authorizationToken=authorization-token-secret clientToken=client-token-secret bearerToken=bearer-token-secret oauthToken=oauth-token-secret',
    '{"authToken":"json-auth-token-secret","clientToken":"json-client-token-secret"}',
    'authorization_code="authorization code with spaces"',
    'authorization-code=secret authorization code words next=ok',
    'clientSecret: camel-client-secret',
    'clientSecret: "camel client secret with spaces"',
    'authHeader=auth-header-secret',
    'authorizationHeader=authorization-header-secret',
    'proxyAuthorizationHeader=proxy-header-secret',
    'sessionToken=session-token-secret',
    'apiKey=api-key-secret',
    'apiKey: "api key secret with spaces"',
    'passphrase: "client cert passphrase with spaces"',
    'credential=credential-secret-value',
    'credentials: "credential bag secret"',
    'authorization code authcodevalue client secret clientSecretValue device code deviceCodeValue user code userCodeValue code verifier verifierValue client assertion assertionValue cert passphrase passphraseSecret private key privateKeyValue',
    'passwd=legacy-passwd-secret',
    'code_verifier=verifier-secret',
    'code-verifier=verifier-hyphen-secret',
    'user_code=user-code-secret',
    'user-code=user-code-hyphen-secret',
    'clientAssertion=client-assertion-secret',
    'client-assertion=assertion-hyphen-secret',
    'OAuth callback failed with code=oauth-code-secret state=oauth-state-secret',
    'password=alpha beta gamma next=ok',
    'passphrase=client cert passphrase words next=ok',
    'body=customer-body-secret',
    'bodyPreview=customer-body-preview-secret',
    'body="customer body secret"',
    '{"body":"customer json body secret","ok":true}',
    'data=customer-data-secret',
    'requestBodyText: request-body-secret',
    'requestBodyText: customer request body secret',
    'request_body: snake case request body secret',
    'responseBodyText: customer response body secret',
    '"response_text":"customer response secret"',
    'renderedResponseText: rendered response secret',
    'rendered-response: proprietary rendered response secret',
    'graphqlVariables=graphql-secret',
    'Cookie: sid=cookie-secret',
    'eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc',
    '-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    '/home/alice/customer.json',
    '/data/customer.json',
    '/workspace/customer.json',
    '/srv/customer.json',
    '/nix/store/postmeter/customer.json',
    '/Applications/PostMeter.app/Contents/Resources/customer.json',
    '/Users/Jane Doe/secret/customer.json failed',
    '/Users/Alice/Research and Development/secret.txt next=ok',
    'C:\\Users\\Alice\\customer.json',
    'C:\\Users\\Alice\\secret.txt and /Applications/PostMeter.app/customer.json',
    'C:\\Users\\Alice\\secret.txt and D:\\tmp\\file.txt',
    'C:\\Users\\Alice\\secret.txt and https://user:password@example.test/path?apiKey=chained-url-secret&visible=1',
    'C:\\Users\\Alice\\oauth.json Digest realm="digest-private-realm", nonce="digest-secret-nonce", response="digest-secret-response"',
    'C:\\Users\\Alice\\My File.txt next context',
    '\\\\?\\UNC\\SERVER\\Customer Files\\secret.txt next=ok',
    '\\\\?\\C:\\Users\\Alice\\secret-device-path.txt next=ok',
    '\\\\SERVER\\Share\\customer.json',
    '\\\\SERVER\\Research and Development\\invoice 123.pdf next=ok',
    '\\\\SERVER\\Customer Files\\invoice 123.pdf next=ok',
    'https://user:password@example.test/path?apiKey=url-secret&visible=1',
    'file:///Users/Alice/Customer Data Project/secret.json next=ok',
    'file://SERVER/Share/Customer Files/secret.json next=ok',
    'FILE://SERVER/Share/Customer Files/secret.json next=ok',
    'file://localhost/Users/Alice/Customer Data Project/secret.json next=ok',
    'File://localhost/Users/Alice/Customer Data Project/secret.json next=ok',
    'file://C:/Users/Alice/Customer Data Project/secret.json next=ok',
    'FiLe:///Users/Alice/Customer Data Project/secret.json next=ok',
    'provider said access_token%3Dsingle-token-secret next=ok',
    'provider said access_token%3Dprovider-token%26code%3Dprovider-code%26state%3Dprovider-state',
    'postmeter://oauth/callback?code=oauth-code-secret&state=oauth-state-secret',
    'ftp://ftp-user:ftp-password@files.example.test/path?api_key=ftp-secret&visible=1',
    'getaddrinfo ENOTFOUND private.customer-api.internal',
    'connect ECONNREFUSED 10.24.3.9:443',
    'connect ETIMEDOUT [2001:db8::1]:443',
    'proxy failed localhost:8080',
    'upstream api.company.com/v1/customer?token=bare-host-token'
  ].join('\n'));

  assert.doesNotMatch(redacted, /bearer-secret|basic-secret|alice|secure|abc123|deadbeef|proxy-user|proxy-nonce|proxy-response|standalone-user|standalone-realm|standalone-nonce|standalone-response|standalone-cnonce|digest-private-realm|digest-secret-nonce|digest-secret-response|json-authz-user|json-authz-realm|json-authz-nonce|json-authz-response|json-authz-cnonce|hawk-id|hawk-nonce|hawk-mac|oauth-consumer|oauth-token|oauth-signature|aws-credential|aws-signature|akamai-client|akamai-access|akamai-nonce|akamai-signature|aws-query-credential|aws-lower-credential|aws-camel-credential|aws-query-signature|aws-security-token|hyphen client secret|client secret next|json-user|json-nonce|json-response|client-secret-value|alpha beta gamma|top secret value|json client secret value|json-token-secret|json access token with spaces|authorization code with spaces|authorization code words|access-token-secret|refresh-token-secret|id-token-secret|camel-auth-token-secret|authorization-token-secret|client-token-secret|bearer-token-secret|oauth-token-secret|json-auth-token-secret|json-client-token-secret|camel-client-secret|camel client secret with spaces|auth-header-secret|authorization-header-secret|proxy-header-secret|session-token-secret|api-key-secret|api key secret with spaces|client cert passphrase with spaces|credential-secret-value|credential bag secret|authcodevalue|clientSecretValue|deviceCodeValue|userCodeValue|verifierValue|assertionValue|passphraseSecret|privateKeyValue|legacy-passwd-secret|verifier-secret|verifier-hyphen-secret|user-code-secret|user-code-hyphen-secret|client-assertion-secret|assertion-hyphen-secret|oauth-code-secret|oauth-state-secret|single-token-secret|provider-token|provider-code|provider-state|client cert passphrase words|customer-body-secret|customer-body-preview-secret|customer body secret|customer json body secret|customer-data-secret|request-body-secret|snake case request body secret|customer request body secret|customer response body secret|customer response secret|rendered response secret|proprietary rendered response secret|graphql-secret|cookie-secret/);
  assert.doesNotMatch(redacted, /private-key-secret|\/standalone\/path|\/digest\/private\/path|\/home\/alice|\/data\/customer|\/workspace\/customer|\/srv\/customer|\/nix\/store|\/Applications\/PostMeter\.app|\/Users\/Jane|Doe\/secret|Research and Development|secret\.txt|Customer Data Project|secret\.json|customer\.json|C:\\\\Users\\\\Alice|D:\\\\tmp|\\\\\?\\\\UNC|\\\\\?\\\\C:|secret-device-path|SERVER\\\\Share|SERVER\/Share|file:\/\/SERVER\/Share|FILE:\/\/SERVER\/Share|Customer Files|invoice 123|chained-url-secret|url-secret|password@example|oauth-code-secret|oauth-state-secret|ftp-user|ftp-password|ftp-secret|My File\.txt|private\.customer-api\.internal|10\.24\.3\.9|2001:db8|localhost:8080|api\.company\.com|bare-host-token/);
  assert.match(redacted, /\[redacted/);
  const structured = sanitizeDiagnosticEvent({
    type: 'structured.oauth-fields',
    fields: {
      token: 'structured-token-secret',
      code: 'structured-code-secret',
      state: 'structured-state-secret'
    }
  });
  assert.equal(structured.fields.token, '[redacted]');
  assert.equal(structured.fields.code, '[redacted]');
  assert.equal(structured.fields.state, '[redacted]');

  const safeContext = redactText('OAuth 2.0 provider returned invalid_grant. Digest auth username is required.');
  assert.match(safeContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(safeContext, /Digest auth username is required/);
  assert.equal(redactText('Basic authentication required. Bearer authentication required. token endpoint failed.'), 'Basic authentication required. Bearer authentication required. token endpoint failed.');
  assert.equal(
    redactText('Cookie: sid=session-secret Basic authentication failed. Bearer authentication is required.'),
    'Cookie: [omitted:cookies] Basic authentication failed. Bearer authentication is required.'
  );
  assert.equal(
    redactText('Set-Cookie: sid=set-cookie-secret; Path=/; HttpOnly; Secure Basic authentication failed. Bearer authentication is required.'),
    'Set-Cookie: [omitted:cookies] Basic authentication failed. Bearer authentication is required.'
  );
  const bareCookieContext = redactText('provider failed Cookie sid=cookie-bare-secret OAuth 2.0 provider returned invalid_grant Set-Cookie sid=set-cookie-bare-secret Basic authentication required cookieHeader sid=cookie-header-bare-secret Bearer authentication required setCookieHeader sid=set-cookie-header-bare-secret Digest auth username was rejected');
  assert.doesNotMatch(bareCookieContext, /cookie-bare-secret|set-cookie-bare-secret|cookie-header-bare-secret|set-cookie-header-bare-secret/);
  assert.match(bareCookieContext, /OAuth 2\.0 provider returned invalid_grant/);
  assert.match(bareCookieContext, /Basic authentication required/);
  assert.match(bareCookieContext, /Bearer authentication required/);
  assert.match(bareCookieContext, /Digest auth username was rejected/);

  const urlAllowed = redactText('https://user:password@example.test/path?apiKey=url-secret&visible=1&user_code=user-code-secret&code_verifier=verifier-secret&client_assertion=client-assertion-secret&X-Amz-Credential=aws-url-credential&X-Amz-Signature=aws-url-signature&X-Amz-Security-Token=aws-url-security-token', { allowUrl: true });
  assert.match(urlAllowed, /https:\/\/example\.test\/path/);
  assert.match(urlAllowed, /visible=1/);
  assert.doesNotMatch(urlAllowed, /user:password|url-secret|user-code-secret|verifier-secret|client-assertion-secret|aws-url-credential|aws-url-signature|aws-url-security-token/);

  const urlJwtAllowed = redactText('https://example.test/eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc?visible=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc', { allowUrl: true });
  assert.match(urlJwtAllowed, /https:\/\/example\.test\//);
  assert.doesNotMatch(urlJwtAllowed, /eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);

  const duplicateUrlJwtAllowed = redactText('https://example.test/path?visible=ok&visible=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc', { allowUrl: true });
  assert.match(duplicateUrlJwtAllowed, /visible=ok/);
  assert.doesNotMatch(duplicateUrlJwtAllowed, /eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const urlOptInSettings = defaultDiagnosticsSettings();
  urlOptInSettings.requestResponseLogging.urls = true;
  const duplicateUrlEvent = sanitizeDiagnosticEvent({ type: 'url.opt-in', fields: { url: 'https://example.test/path?visible=ok&visible=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc' } }, urlOptInSettings);
  assert.match(duplicateUrlEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(duplicateUrlEvent.fields.url, /eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const encodeRepeated = (value, depth) => {
    let encoded = String(value);
    for (let index = 0; index < depth; index += 1) {
      encoded = encodeURIComponent(encoded);
    }
    return encoded;
  };
  const queryKeyJwtAllowed = redactText('https://example.test/path?eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc=ok&visible=1', { allowUrl: true });
  assert.match(queryKeyJwtAllowed, /visible=1/);
  assert.doesNotMatch(queryKeyJwtAllowed, /eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const fragmentTokenAllowed = redactText('https://example.test/callback#access_token=fragment-secret&id_token=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc&visible=ok', { allowUrl: true });
  assert.match(fragmentTokenAllowed, /visible=ok/);
  assert.doesNotMatch(fragmentTokenAllowed, /fragment-secret|eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const routedFragmentTokenAllowed = redactText('https://example.test/app#/callback?token=route-token-secret&visible=ok', { allowUrl: true });
  assert.match(routedFragmentTokenAllowed, /visible=ok/);
  assert.doesNotMatch(routedFragmentTokenAllowed, /route-token-secret/);
  const pathParamAllowed = redactText('https://example.test/oauth/client_secret/path-client-secret/access_token/path-access-token/token/path-token/safe/path?visible=ok', { allowUrl: true });
  assert.match(pathParamAllowed, /\/oauth\/client_secret\//);
  assert.match(pathParamAllowed, /\/safe\/path/);
  assert.match(pathParamAllowed, /visible=ok/);
  assert.doesNotMatch(pathParamAllowed, /path-client-secret|path-access-token|path-token/);
  const inlinePathParamAllowed = redactText('https://api.example.test/oauth/access_token:path-token-secret/access_token_path-inline-token-secret/token:inline-token-secret/safe/path?visible=ok', { allowUrl: true });
  assert.match(inlinePathParamAllowed, /\/oauth\//);
  assert.match(inlinePathParamAllowed, /\/safe\/path/);
  assert.match(inlinePathParamAllowed, /visible=ok/);
  assert.doesNotMatch(inlinePathParamAllowed, /path-token-secret|path-inline-token-secret|inline-token-secret/);
  const encodedInlinePathParamAllowed = redactText('https://api.example.test/oauth/access_token%3Aencoded-inline-token-secret?visible=ok', { allowUrl: true });
  assert.match(encodedInlinePathParamAllowed, /visible=ok/);
  assert.doesNotMatch(encodedInlinePathParamAllowed, /encoded-inline-token-secret/);
  const pathParamEvent = sanitizeDiagnosticEvent({ type: 'url.path-opt-in', fields: { url: 'https://example.test/oauth/client_secret/event-client-secret?visible=ok' } }, urlOptInSettings);
  assert.match(pathParamEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(pathParamEvent.fields.url, /event-client-secret/);
  const inlinePathParamEvent = sanitizeDiagnosticEvent({ type: 'url.inline-path-opt-in', fields: { url: 'https://api.example.test/oauth/token:event-inline-token-secret?visible=ok' } }, urlOptInSettings);
  assert.match(inlinePathParamEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(inlinePathParamEvent.fields.url, /event-inline-token-secret/);
  const routedFragmentPathAllowed = redactText('https://example.test/app#/callback/access_token/fragment-path-secret?visible=ok', { allowUrl: true });
  assert.match(routedFragmentPathAllowed, /visible=ok/);
  assert.doesNotMatch(routedFragmentPathAllowed, /fragment-path-secret/);
  const encodedSlashPathAllowed = redactText('https://example.test/oauth%2Faccess_token%2Fencoded-slash-secret?visible=ok', { allowUrl: true });
  assert.match(encodedSlashPathAllowed, /visible=ok/);
  assert.doesNotMatch(encodedSlashPathAllowed, /encoded-slash-secret/);
  const tripleEncodedSlashPathAllowed = redactText('https://example.test/oauth%25252Faccess_token%25252Ftriple-slash-secret?visible=ok', { allowUrl: true });
  assert.match(tripleEncodedSlashPathAllowed, /visible=ok/);
  assert.doesNotMatch(tripleEncodedSlashPathAllowed, /triple-slash-secret/);
  const encodedSlashPathEvent = sanitizeDiagnosticEvent({ type: 'url.encoded-path-opt-in', fields: { url: 'https://example.test/oauth%2Fclient_secret%2Fencoded-event-secret?visible=ok' } }, urlOptInSettings);
  assert.match(encodedSlashPathEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(encodedSlashPathEvent.fields.url, /encoded-event-secret/);
  const encodedRoutedFragmentPathAllowed = redactText('https://example.test/app#%2Fcallback%2Faccess_token%2Frouted-encoded-slash-secret%3Fvisible%3Dok', { allowUrl: true });
  assert.match(encodedRoutedFragmentPathAllowed, /visible=ok/);
  assert.doesNotMatch(encodedRoutedFragmentPathAllowed, /routed-encoded-slash-secret/);
  const overBudgetEncodedQueryAllowed = redactText(`https://example.test/callback?payload=${encodeRepeated('access_token=depth-query-secret&visible=ok', 10)}`, { allowUrl: true });
  assert.doesNotMatch(overBudgetEncodedQueryAllowed, /depth-query-secret/);
  const overBudgetEncodedFragmentAllowed = redactText(`https://example.test/callback#${encodeRepeated('access_token=depth-fragment-secret&visible=ok', 10)}`, { allowUrl: true });
  assert.doesNotMatch(overBudgetEncodedFragmentAllowed, /depth-fragment-secret/);
  const overBudgetEncodedPathAllowed = redactText(`https://example.test/${encodeRepeated('oauth/access_token/depth-path-secret', 10)}?visible=ok`, { allowUrl: true });
  assert.doesNotMatch(overBudgetEncodedPathAllowed, /depth-path-secret/);
  const overBudgetEncodedHashPathAllowed = redactText(`https://example.test/app#${encodeRepeated('/callback/access_token/depth-hash-secret?visible=ok', 10)}`, { allowUrl: true });
  assert.doesNotMatch(overBudgetEncodedHashPathAllowed, /depth-hash-secret/);
  const overBudgetEncodedEvent = sanitizeDiagnosticEvent({ type: 'url.over-budget-opt-in', fields: { url: `https://example.test/callback?payload=${encodeRepeated('access_token=depth-event-secret&visible=ok', 10)}` } }, urlOptInSettings);
  assert.doesNotMatch(overBudgetEncodedEvent.fields.url, /depth-event-secret/);
  const matrixTransportAllowed = redactTransportReferences('https://example.test/callback;access_token=matrix-secret;visible=ok?outer=1', { allowUrl: true });
  assert.match(matrixTransportAllowed, /outer=1/);
  assert.doesNotMatch(matrixTransportAllowed, /matrix-secret/);
  const fragmentEvent = sanitizeDiagnosticEvent({ type: 'url.fragment-opt-in', fields: { url: 'https://example.test/callback#access_token=fragment-secret&id_token=eyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc&visible=ok' } }, urlOptInSettings);
  assert.match(fragmentEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(fragmentEvent.fields.url, /fragment-secret|eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const encodedQueryTokenAllowed = redactText('https://example.test/path?access_token%3Dquery-encoded-secret%26visible%3Dok', { allowUrl: true });
  assert.match(encodedQueryTokenAllowed, /visible=ok/);
  assert.doesNotMatch(encodedQueryTokenAllowed, /query-encoded-secret/);
  const encodedFragmentTokenAllowed = redactText('https://example.test/callback#access_token%3Dfragment-encoded-secret%26id_token%3DeyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc%26visible%3Dok', { allowUrl: true });
  assert.match(encodedFragmentTokenAllowed, /visible=ok/);
  assert.doesNotMatch(encodedFragmentTokenAllowed, /fragment-encoded-secret|eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const encodedNestedValueAllowed = redactText('https://example.test/path?redirect=access_token%3Dnested-encoded-secret%26visible%3Dok&visible=outer-ok', { allowUrl: true });
  assert.match(encodedNestedValueAllowed, /visible=outer-ok/);
  assert.doesNotMatch(encodedNestedValueAllowed, /nested-encoded-secret/);
  const encodedPathQueryAllowed = redactText('https://example.test/callback%3Fcode%3Doauth-code-secret%26state%3Doauth-state-secret', { allowUrl: true });
  assert.doesNotMatch(encodedPathQueryAllowed, /oauth-code-secret|oauth-state-secret/);
  const nestedCallbackEvent = sanitizeDiagnosticEvent({ type: 'url.nested-callback-opt-in', fields: { url: 'https://example.test/path?redirect=%2Fcallback%3Fstate%3Doauth-state-secret&visible=ok' } }, urlOptInSettings);
  assert.match(nestedCallbackEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(nestedCallbackEvent.fields.url, /oauth-state-secret/);
  const doubleNestedQueryAllowed = redactText('https://example.test/path?redirect=next%3Daccess_token%253Ddouble-nested-query-secret%2526visible%253Dok&visible=outer-ok', { allowUrl: true });
  assert.match(doubleNestedQueryAllowed, /visible=outer-ok/);
  assert.doesNotMatch(doubleNestedQueryAllowed, /double-nested-query-secret/);
  const doubleNestedTransportAllowed = redactTransportReferences('https://example.test/path?redirect=next%3Daccess_token%253Ddouble-nested-transport-secret%2526visible%253Dok&visible=outer-ok', { allowUrl: true });
  assert.match(doubleNestedTransportAllowed, /visible=outer-ok/);
  assert.doesNotMatch(doubleNestedTransportAllowed, /double-nested-transport-secret/);
  const doubleNestedEvent = sanitizeDiagnosticEvent({ type: 'url.double-nested-query-opt-in', fields: { url: 'https://example.test/path?redirect=next%3Daccess_token%253Ddouble-nested-event-secret%2526visible%253Dok&visible=outer-ok' } }, urlOptInSettings);
  assert.match(doubleNestedEvent.fields.url, /visible=outer-ok/);
  assert.doesNotMatch(doubleNestedEvent.fields.url, /double-nested-event-secret/);
  const doubleNestedFragmentAllowed = redactText('https://example.test/callback#redirect=next%3Daccess_token%253Ddouble-nested-fragment-secret%2526visible%253Dok&visible=outer-ok', { allowUrl: true });
  assert.match(doubleNestedFragmentAllowed, /visible=outer-ok/);
  assert.doesNotMatch(doubleNestedFragmentAllowed, /double-nested-fragment-secret/);
  const encodedFragmentEvent = sanitizeDiagnosticEvent({ type: 'url.encoded-fragment-opt-in', fields: { url: 'https://example.test/callback#access_token%3Dfragment-encoded-secret%26visible%3Dok' } }, urlOptInSettings);
  assert.match(encodedFragmentEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(encodedFragmentEvent.fields.url, /fragment-encoded-secret/);
  const tripleEncodedQueryTokenAllowed = redactText('https://example.test/path?access_token%25253Dtriple-query-secret%252526visible%25253Dok', { allowUrl: true });
  assert.match(tripleEncodedQueryTokenAllowed, /visible=ok/);
  assert.doesNotMatch(tripleEncodedQueryTokenAllowed, /triple-query-secret/);
  const tripleEncodedFragmentTokenAllowed = redactText('https://example.test/callback#access_token%25253Dtriple-fragment-secret%252526id_token%25253DeyJaaaaaaaa.eyJbbbbbbbb.eyJcccccccc%252526visible%25253Dok', { allowUrl: true });
  assert.match(tripleEncodedFragmentTokenAllowed, /visible=ok/);
  assert.doesNotMatch(tripleEncodedFragmentTokenAllowed, /triple-fragment-secret|eyJaaaaaaaa|eyJbbbbbbbb|eyJcccccccc/);
  const tripleEncodedFragmentEvent = sanitizeDiagnosticEvent({ type: 'url.triple-encoded-fragment-opt-in', fields: { url: 'https://example.test/callback#access_token%25253Dtriple-event-secret%252526visible%25253Dok' } }, urlOptInSettings);
  assert.match(tripleEncodedFragmentEvent.fields.url, /visible=ok/);
  assert.doesNotMatch(tripleEncodedFragmentEvent.fields.url, /triple-event-secret/);

  const nonHttpUrlAllowed = redactText('grpc://alice:secret@grpc.example.test/service.Customer/Get?client_secret=top-secret&visible=1 wss://bob:secret@socket.example.test/live?token=socket-secret', { allowUrl: true });
  assert.match(nonHttpUrlAllowed, /grpc:\/\/grpc\.example\.test\/service\.Customer\/Get/);
  assert.match(nonHttpUrlAllowed, /wss:\/\/socket\.example\.test\/live/);
  assert.match(nonHttpUrlAllowed, /visible=1/);
  assert.doesNotMatch(nonHttpUrlAllowed, /alice|bob|secret@|top-secret|socket-secret/);

  const customUrlAllowed = redactText('postmeter://oauth/callback?code=oauth-code-secret&state=oauth-state-secret ftp://ftp-user:ftp-password@files.example.test/path?api_key=ftp-secret&visible=1', { allowUrl: true });
  assert.match(customUrlAllowed, /postmeter:\/\/oauth\/callback/);
  assert.match(customUrlAllowed, /ftp:\/\/files\.example\.test\/path/);
  assert.match(customUrlAllowed, /visible=1/);
  assert.doesNotMatch(customUrlAllowed, /oauth-code-secret|oauth-state-secret|ftp-user|ftp-password|ftp-secret/);

  const fileUrlAllowed = redactText('file:///Users/Alice/secret/customer.json https://example.test/ok?visible=1', { allowUrl: true });
  assert.match(fileUrlAllowed, /https:\/\/example\.test\/ok/);
  assert.doesNotMatch(fileUrlAllowed, /\/Users\/Alice|secret\/customer/);
  assert.match(fileUrlAllowed, /file:\/\/\[path\]/);
});

test('free-form secret redaction consumes unquoted multi-word values and hyphenated oauth fields', () => {
  const redacted = redactText([
    'client_secret=alpha beta gamma next=ok',
    'clientSecret=camel alpha beta next=ok',
    'password=one two three next=ok',
    'passphrase=client cert passphrase words next=ok',
    'code-verifier=hyphen verifier secret next=ok',
    'client-assertion=hyphen assertion secret next=ok',
    'code verifier code-verifier-label-secret client assertion client-assertion-label-secret'
  ].join('\n'));

  assert.doesNotMatch(redacted, /alpha beta gamma|camel alpha beta|one two three|client cert passphrase words|hyphen verifier secret|hyphen assertion secret|code-verifier-label-secret|client-assertion-label-secret/);
  assert.match(redacted, /next=ok/);

  const event = sanitizeDiagnosticEvent({
    type: 'diagnostics.redaction.probe',
    fields: {
      error: 'clientSecret=alpha beta gamma next=ok code-verifier=hyphen verifier secret'
    }
  }, defaultDiagnosticsSettings());
  assert.doesNotMatch(JSON.stringify(event), /alpha beta gamma|hyphen verifier secret/);
});

test('body field redaction consumes quoted structured and multiline diagnostic text safely', () => {
  const nestedEscaped = JSON.stringify({
    output: JSON.stringify({
      body: 'nested-json-body-secret',
      bodyPreview: 'nested-json-preview-secret',
      responseText: 'nested-json-response-secret',
      'rendered-response': 'nested-json-rendered-secret'
    })
  });
  const cases = [
    'failed body="first line\nsecond line customer-secret"',
    'failed body={\n  "customer":"secret"\n} next=value',
    'failed body=[\n  {"customer":"secret"}\n] next=value',
    'failed body_preview=customer body preview with spaces',
    'failed request_body=customer request body with spaces',
    'failed requestBodyText: customer secret with spaces\nnext=value',
    'failed responseBodyText=response secret with spaces and https://api.example.test/body',
    'failed response_text="customer response text with spaces"',
    'failed responseText: customer response text with spaces\nnext=value',
    'failed rendered-response: proprietary rendered response secret',
    'failed text=customer raw text with spaces',
    'failed responseBodyText customer bare response secret requestBodyText customer bare request secret bodyPreview customer bare preview secret',
    'failed variables customer bare variable secret text customer bare text secret',
    'failed protocolMessages customer bare protocol secret consoleOutput customer bare console secret payloadIdentifier customer bare payload secret',
    'failed variables={"customer":"secret"} next=value',
    'failed consoleOutput=customer-console-data next=value',
    'failed script-console=script console traffic echo next=value',
    'failed payloadIdentifier=customer-12345 next=value',
    'failed payload-identifier=customer-67890 next=value',
    'failed protocol-message=customer-protocol-message next=value',
    'failed protocolMessages=[{"data":"customer-message"}] next=value',
    nestedEscaped,
    '{\\"body\\":\\"raw-escaped-body-secret\\",\\"responseText\\":\\"raw-escaped-response-secret\\"}'
  ];

  for (const sample of cases) {
    const redacted = redactText(sample);
    assert.doesNotMatch(redacted, /customer-secret|"customer":"secret"|customer secret|customer body preview|customer request body|response secret|customer response text|proprietary rendered response secret|customer raw text|customer bare response secret|customer bare request secret|customer bare preview secret|customer bare variable secret|customer bare text secret|customer bare protocol secret|customer bare console secret|customer bare payload secret|customer-console-data|script console traffic echo|customer-12345|customer-67890|customer-protocol-message|customer-message|nested-json-body-secret|nested-json-preview-secret|nested-json-response-secret|nested-json-rendered-secret|raw-escaped-body-secret|raw-escaped-response-secret|api\.example\.test/);
    assert.match(redacted, /\[omitted:(bodies|scriptConsole|payloadIdentifiers|protocolMessages)\]/);
  }
});

test('local diagnostics logger writes bounded rotated JSONL records and honors disabled logging', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-log-'));
  try {
    const logger = new LocalDiagnosticsLogger({
      logDirectory: directory,
      maxFileBytes: 4096,
      maxFiles: 3,
      maxRecordBytes: 1024,
      settingsProvider: () => normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } })
    });
    for (let index = 0; index < 80; index += 1) {
      await logger.log({
        type: 'request.send.failed',
        level: 'debug',
        fields: {
          index,
          body: `customer-body-${index}`,
          message: 'x'.repeat(512)
        }
      });
    }
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.jsonl'));
    assert.ok(files.length >= 1);
    assert.ok(files.length <= 3);
    const recent = await logger.readRecentEntries(20);
    assert.ok(recent.length <= 20);
    assert.ok(recent.every((entry) => entry.type === 'request.send.failed'));
    assert.ok(JSON.stringify(recent).includes('[omitted:bodies]'));

    const disabledDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-disabled-'));
    const disabledLogger = new LocalDiagnosticsLogger({
      logDirectory: disabledDirectory,
      settingsProvider: () => ({ logging: { enabled: false } })
    });
    assert.equal(await disabledLogger.log({ type: 'request.send.failed', level: 'error' }), null);
    assert.deepEqual(await fs.readdir(disabledDirectory).catch(() => []), []);
    await fs.rm(disabledDirectory, { recursive: true, force: true });

    const singleFileDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-single-'));
    const singleFileLogger = new LocalDiagnosticsLogger({
      logDirectory: singleFileDirectory,
      maxFileBytes: 4096,
      maxFiles: 1,
      maxRecordBytes: 8192,
      settingsProvider: () => normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } })
    });
    for (let index = 0; index < 5; index += 1) {
      await singleFileLogger.log({
        type: 'diagnostics.rotation.single-file',
        level: 'debug',
        fields: { index, note: 'x'.repeat(3000) }
      });
    }
    const singleFiles = (await fs.readdir(singleFileDirectory)).filter((file) => file.endsWith('.jsonl'));
    assert.deepEqual(singleFiles, ['postmeter.log.jsonl']);
    const singleStat = await fs.stat(path.join(singleFileDirectory, 'postmeter.log.jsonl'));
    assert.ok(singleStat.size < 4096);
    await fs.rm(singleFileDirectory, { recursive: true, force: true });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('local diagnostics logger truncates oversized JSONL records at the configured cap', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-truncated-'));
  try {
    const logger = new LocalDiagnosticsLogger({
      logDirectory: directory,
      maxFileBytes: 4096,
      maxFiles: 2,
      maxRecordBytes: 1024,
      settingsProvider: () => normalizeDiagnosticsSettings({ logging: { enabled: true, level: 'debug' } })
    });
    await logger.log({
      type: 'diagnostics.large-record',
      level: 'debug',
      fields: {
        preservedNote: 'visible-large-record-field',
        oversizedValue: 'x'.repeat(5000)
      }
    });

    const rawLine = await fs.readFile(path.join(directory, 'postmeter.log.jsonl'), 'utf8');
    const line = rawLine.trimEnd();
    const record = JSON.parse(line);

    assert.ok(Buffer.byteLength(rawLine, 'utf8') <= 1025);
    assert.equal(record.truncated, true);
    assert.equal(record.type, 'diagnostics.large-record');
    assert.doesNotMatch(line, /visible-large-record-field|x{100}/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('diagnostic bundle export is local sanitized and does not use network APIs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-diagnostics-bundle-'));
  const targetPath = path.join(directory, 'diagnostics.json');
  const logger = new LocalDiagnosticsLogger({
    logDirectory: path.join(directory, 'logs'),
    settingsProvider: () => defaultDiagnosticsSettings()
  });
  await logger.log({
    type: 'request.send.failed',
    level: 'error',
    fields: {
      requestUrl: 'https://api.example.test/customer?access_token=log-token&query=customer-search',
      headers: { Authorization: 'Bearer log-token' },
      body: 'customer-response-body'
    }
  });
  const artifactDirectory = path.join(directory, 'validation-artifacts');
  await fs.mkdir(artifactDirectory);
  await fs.writeFile(path.join(artifactDirectory, 'postmeter-ui-failure.log'), 'artifact-token-secret');
  await fs.writeFile(path.join(artifactDirectory, 'postmeter-ui-failure.json'), '{"body":"artifact-body-secret"}');
  await fs.writeFile(path.join(artifactDirectory, 'postmeter-ui-failure.png'), 'artifact-screenshot-secret');
  const workspace = {
    schemaVersion: 11,
    settings: {
      appearance: { theme: 'dark' },
      diagnostics: defaultDiagnosticsSettings(),
      sandbox: {
        fileBindings: [{ source: 'file', localPath: '/home/alice/pii.csv' }],
        packageCache: [{ specifier: '@team/pii', source: 'secret source' }],
        trustedCapabilities: { sendRequest: true, cookies: true, vault: false }
      },
      updates: { includePrereleases: true }
    },
    collections: [{
      id: 'collection-1',
      name: 'Customers',
      requests: [{
        id: 'request-1',
        method: 'POST',
        url: 'https://api.example.test/customer?token=request-token',
        body: 'customer-request-body'
      }],
      folders: [{ id: 'folder-1', requests: [{ id: 'request-2', url: 'https://api.example.test/nested' }], folders: [] }]
    }],
    environments: [{ id: 'env-1', variables: [{ key: 'CUSTOMER_TOKEN', value: 'environment-token' }] }],
    cookies: [{ name: 'sid', value: 'customer-cookie', domain: 'example.test' }],
    history: [{ finalUrl: 'https://api.example.test/customer?token=history-token', statusCode: 200 }]
  };
  const runtimeInfo = {
    node: '22.16.0',
    electron: '41.3.0',
    chrome: '142.0.7444.163',
    platform: 'linux',
    arch: 'x64'
  };
  const originalFetch = globalThis.fetch;
  const originalDnsLookup = dns.lookup;
  const originalDnsResolve = dns.resolve;
  const originalDnsPromisesLookup = dns.promises.lookup;
  const originalDnsPromisesResolve = dns.promises.resolve;
  const originalDgramCreateSocket = dgram.createSocket;
  const originalHttpGet = http.get;
  const originalHttpRequest = http.request;
  const originalHttp2Connect = http2.connect;
  const originalHttpsGet = https.get;
  const originalHttpsRequest = https.request;
  const originalNetConnect = net.connect;
  const originalNetCreateConnection = net.createConnection;
  const originalTlsConnect = tls.connect;
  try {
    globalThis.fetch = () => {
      throw new Error('diagnostic export must not call fetch');
    };
    dns.lookup = () => {
      throw new Error('diagnostic export must not call dns.lookup');
    };
    dns.resolve = () => {
      throw new Error('diagnostic export must not call dns.resolve');
    };
    dns.promises.lookup = () => {
      throw new Error('diagnostic export must not call dns.promises.lookup');
    };
    dns.promises.resolve = () => {
      throw new Error('diagnostic export must not call dns.promises.resolve');
    };
    dgram.createSocket = () => {
      throw new Error('diagnostic export must not call dgram.createSocket');
    };
    http.get = () => {
      throw new Error('diagnostic export must not call http.get');
    };
    http.request = () => {
      throw new Error('diagnostic export must not call http.request');
    };
    http2.connect = () => {
      throw new Error('diagnostic export must not call http2.connect');
    };
    https.get = () => {
      throw new Error('diagnostic export must not call https.get');
    };
    https.request = () => {
      throw new Error('diagnostic export must not call https.request');
    };
    net.connect = () => {
      throw new Error('diagnostic export must not call net.connect');
    };
    net.createConnection = () => {
      throw new Error('diagnostic export must not call net.createConnection');
    };
    tls.connect = () => {
      throw new Error('diagnostic export must not call tls.connect');
    };
    await exportDiagnosticBundle({
      appInfo: { version: '0.2.0', releaseChannel: 'beta', name: 'PostMeter' },
      generatedAt: '2026-05-01T00:00:00.000Z',
      logger,
      runtimeInfo,
      targetPath,
      workspace
    });
  } finally {
    globalThis.fetch = originalFetch;
    dns.lookup = originalDnsLookup;
    dns.resolve = originalDnsResolve;
    dns.promises.lookup = originalDnsPromisesLookup;
    dns.promises.resolve = originalDnsPromisesResolve;
    dgram.createSocket = originalDgramCreateSocket;
    http.get = originalHttpGet;
    http.request = originalHttpRequest;
    http2.connect = originalHttp2Connect;
    https.get = originalHttpsGet;
    https.request = originalHttpsRequest;
    net.connect = originalNetConnect;
    net.createConnection = originalNetCreateConnection;
    tls.connect = originalTlsConnect;
  }

  const stat = await fs.stat(targetPath);
  if (process.platform !== 'win32') {
    assert.equal(stat.mode & 0o777, 0o600);
  }
  const bundle = JSON.parse(await fs.readFile(targetPath, 'utf8'));
  const serialized = JSON.stringify(bundle);
  assert.equal(bundle.schemaVersion, DIAGNOSTICS_SCHEMA_VERSION);
  assert.equal(bundle.generatedAt, '2026-05-01T00:00:00.000Z');
  assert.deepEqual(bundle.app, { version: '0.2.0', releaseChannel: 'beta', name: 'PostMeter' });
  assert.deepEqual(bundle.runtime, runtimeInfo);
  assert.equal(bundle.privacy.automaticTelemetry, false);
  assert.equal(bundle.privacy.cloudUpload, false);
  assert.equal(bundle.privacy.userControlledLocalExportOnly, true);
  assert.equal(bundle.workspace.requestCount, 2);
  assert.equal(bundle.workspace.historyCount, 1);
  assert.ok(Object.keys(bundle.readiness.statusCounts).length > 0);
  assert.equal(bundle.settings.sandbox.fileBindingCount, 1);
  assert.equal(bundle.settings.sandbox.packageCacheCount, 1);
  assert.equal(bundle.logs[0].fields.requestUrl, '[omitted:urls]');
  assert.doesNotMatch(serialized, /customer-request-body|customer-response-body|environment-token|customer-cookie|history-token|request-token|log-token/);
  assert.doesNotMatch(serialized, /\/home\/alice|secret source|pii\.csv|artifact-token-secret|artifact-body-secret|artifact-screenshot-secret/);
  await fs.rm(directory, { recursive: true, force: true });
});

test('diagnostics summaries expose counts and audited settings without raw workspace data', () => {
  const settings = sanitizeSettingsSummary({
    appearance: { theme: 'system' },
    diagnostics: { requestResponseLogging: { urls: true } },
    sandbox: {
      fileBindings: [{ localPath: '/home/alice/upload.bin' }],
      packageCache: [{ source: 'module.exports = "secret";' }],
      trustedCapabilities: { sendRequest: false, cookies: true, vault: true }
    }
  });
  const summary = workspaceSummary({
    schemaVersion: 11,
    collections: [{ requests: [{ id: 'r1' }], folders: [{ requests: [{ id: 'r2' }], folders: [] }] }],
    environments: [{ id: 'env' }],
    cookies: [{ name: 'sid', value: 'secret' }],
    history: [{ finalUrl: 'https://example.test?token=secret' }]
  });

  assert.deepEqual(settings.sandbox, {
    fileBindingCount: 1,
    packageCacheCount: 1,
    trustedCapabilities: {
      cookies: true,
      sendRequest: false,
      vault: true
    }
  });
  assert.equal(settings.diagnostics.requestResponseLogging.urls, true);
  assert.deepEqual(summary, {
    schemaVersion: 11,
    collectionCount: 1,
    folderCount: 1,
    requestCount: 2,
    environmentCount: 1,
    cookieCount: 1,
    historyCount: 1
  });
});

test('main-process sandbox validation failure path is structured and redacted', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', '..', 'electron', 'main.js'), 'utf8');

  assert.match(source, /app\.sandbox-runtime-validation\.failed/);
  assert.match(source, /sandbox_runtime_validation_failed/);
  assert.match(source, /console\.error\(redactText\(message\)\)/);
  assert.ok(source.indexOf("app.setPath('userData'") < source.indexOf('new LocalDiagnosticsLogger'));
});

test('main-process startup and workspace recovery diagnostics are structured and redacted', () => {
  const recoveryEvent = workspaceRecoveryDiagnosticEvent(new Error('recovered /home/alice/Workspace.json with accessToken=recovery-secret'));
  const sanitizedRecovery = sanitizeDiagnosticEvent(recoveryEvent, defaultDiagnosticsSettings());
  const serializedRecovery = JSON.stringify(sanitizedRecovery);

  assert.equal(sanitizedRecovery.type, 'workspace.recovery.completed');
  assert.equal(sanitizedRecovery.level, 'warn');
  assert.equal(sanitizedRecovery.outcome, 'completed');
  assert.equal(sanitizedRecovery.failureCode, 'workspace_recovered_from_unreadable_file');
  assert.doesNotMatch(serializedRecovery, /\/home\/alice|recovery-secret/);
  assert.match(serializedRecovery, /\[path\]|\[redacted\]/);

  const startupEvent = startupFailureDiagnosticEvent(
    new Error('startup failed for https://api.example.test?token=startup-secret body=startup-body /Users/Alice/workspace.json'),
    'PostMeter could not open the workspace'
  );
  const sanitizedStartup = sanitizeDiagnosticEvent(startupEvent, defaultDiagnosticsSettings());
  const serializedStartup = JSON.stringify(sanitizedStartup);

  assert.equal(sanitizedStartup.type, 'app.startup.failed');
  assert.equal(sanitizedStartup.level, 'error');
  assert.equal(sanitizedStartup.outcome, 'failed');
  assert.equal(sanitizedStartup.failureCode, 'startup_failed');
  assert.equal(sanitizedStartup.fields.title, 'PostMeter could not open the workspace');
  assert.doesNotMatch(serializedStartup, /api\.example\.test|startup-secret|startup-body|\/Users\/Alice/);
  assert.match(serializedStartup, /\[url\]|\[omitted:bodies\]|\[path\]/);
});

function sensitiveDiagnosticEvent() {
  return {
    type: 'request.send.failed',
    level: 'error',
    outcome: 'failed',
    failureCode: 'request_send_failed',
    durationMillis: 12.5,
    fields: {
      requestUrl: 'https://alice:request-secret@api.example.test/v1/customers?access_token=request-secret&code_verifier=verifier-secret&user_code=user-code-secret&client_assertion=client-assertion-secret&q=customer-search',
      finalUrl: 'https://api.example.test/final?refresh_token=request-secret',
      grpcUrl: 'grpcs://grpc-user:grpc-password@grpc.example.test/service.Customer/Get?client_secret=grpc-query-secret',
      websocketUrl: 'wss://socket-user:socket-password@socket.example.test/live?access_token=socket-query-secret',
      fileUrl: 'file:///Users/Alice/secret/customer.json',
      queryParams: [
        { key: 'q', value: 'customer-search' },
        { key: 'access_token', value: 'structured-token-secret' },
        { name: 'state', value: 'structured-state-secret' },
        { name: 'access_token', raw: 'structured-raw-secret' },
        { name: 'access_token', valueRaw: 'structured-value-raw-secret' },
        { name: 'access_token', currentValue: 'structured-current-secret' },
        { name: 'trace', raw: 'eyJaaaaaaab.eyJbbbbbbbb.eyJcccccccc' }
      ],
      urlParams: [{ key: 'q', value: 'customer-url-param' }],
      urlParameters: [
        { name: 'access_token', value: 'structured-url-secret' },
        { name: 'access_token', raw: 'structured-url-raw-secret' },
        { name: 'access_token', valueRaw: 'structured-url-value-raw-secret' },
        { name: 'access_token', currentValue: 'structured-url-current-secret' },
        { name: 'access_token', example: 'structured-url-example-secret' },
        { name: 'access_token', schema: { default: 'structured-url-schema-secret' } }
      ],
      searchParams: [{ param: 'code', value: 'structured-search-secret' }],
      pathParams: [
        { name: 'customerId', value: 'customer-path-param' },
        { name: 'token', values: ['structured-path-secret'] }
      ],
      parameters: [
        { name: 'state', in: 'query', value: 'structured-parameter-secret' },
        { name: 'state', in: 'query', schema: { default: 'structured-parameter-schema-secret' } }
      ],
      method: 'POST',
      protocol: 'https',
      statusCode: 201,
      statusCategory: '2xx',
      request: {
        method: 'POST',
        size: 888,
        bytes: 999,
        body: 'nested-request-body-secret'
      },
      requestInfo: {
        method: 'PUT',
        size: 2888,
        bytes: 2999,
        metrics: {
          method: 'HEAD',
          size: 2111,
          bytes: 2222,
          bodyBytes: 2333,
          bodySize: 2444,
          contentBytes: 2555
        },
        body: 'nested-request-info-body-secret'
      },
      requestDetails: {
        method: 'OPTIONS',
        size: 4888,
        bytes: 4999,
        metrics: {
          method: 'TRACE',
          size: 4111,
          bytes: 4222
        },
        body: 'nested-request-details-body-secret'
      },
      httpRequest: {
        method: 'PATCH',
        size: 6888,
        bytes: 6999,
        metrics: {
          method: 'POST',
          size: 6111,
          bytes: 6222
        },
        body: 'nested-http-request-body-secret'
      },
      response: {
        status: 201,
        statusText: 'Created',
        size: 777,
        bytes: 666,
        body: 'nested-response-body-secret'
      },
      responseInfo: {
        status: 204,
        statusText: 'No Content',
        size: 2777,
        bytes: 2666,
        metrics: {
          status: 207,
          statusText: 'Multi-Status',
          reason: 'Multi-Status',
          reasonPhrase: 'Multi-Status Phrase',
          statusCategory: '2xx',
          size: 2555,
          contentBytes: 2445
        },
        body: 'nested-response-info-body-secret'
      },
      responseDetails: {
        status: 206,
        statusText: 'Partial Content',
        size: 4777,
        bytes: 4666,
        metrics: {
          status: 208,
          reason: 'Already Reported',
          reasonPhrase: 'Already Reported Phrase',
          statusCategory: '2xx',
          contentLength: 4444
        },
        body: 'nested-response-details-body-secret'
      },
      httpResponse: {
        status: 211,
        statusText: 'Network Authentication Required',
        size: 6777,
        bytes: 6666,
        timing: {
          statusCode: 212,
          statusCategory: '2xx',
          contentLength: 6111,
          contentBytes: 6122
        },
        body: 'nested-http-response-body-secret'
      },
      requests: [{
        method: 'POST',
        size: 1888,
        bytes: 1999,
        body: 'array-request-body-secret'
      }],
      requestInfos: [{
        method: 'DELETE',
        size: 3888,
        bytes: 3999,
        metrics: {
          method: 'CONNECT',
          size: 3111,
          bytes: 3222,
          bodyBytes: 3331
        },
        body: 'array-request-info-body-secret'
      }],
      httpRequests: [{
        method: 'PATCH',
        size: 1444,
        bytes: 1555,
        metrics: {
          method: 'POST',
          size: 1333,
          bytes: 1666
        },
        body: 'array-http-request-body-secret'
      }],
      responses: [{
        status: 202,
        statusText: 'Accepted',
        size: 1777,
        bytes: 1666,
        body: 'array-response-body-secret'
      }],
      responseInfos: [{
        status: 205,
        statusText: 'Reset Content',
        size: 3777,
        bytes: 3666,
        metrics: {
          status: 209,
          reason: 'Info',
          reasonPhrase: 'Info Phrase',
          statusCategory: '2xx',
          contentLength: 3333,
          contentBytes: 3444
        },
        body: 'array-response-info-body-secret'
      }],
      httpResponses: [{
        status: 203,
        size: 1222,
        timing: {
          statusCode: 210,
          statusCategory: '2xx',
          contentLength: 1111,
          contentBytes: 1122
        }
      }],
      headers: {
        Authorization: 'Bearer request-secret',
        'X-Customer-Id': 'customer-header'
      },
      metadata: {
        authorization: 'Bearer metadata-secret',
        'customer-id': 'metadata-customer-id'
      },
      requestMetadata: {
        trace: 'metadata-visible'
      },
      'set-cookie': 'Set-Cookie: sid=customer-cookie; Path=/; HttpOnly',
      body: 'customer-body access_token=body-token-secret {"access_token":"json-token-secret","accessToken":"access-token-secret","refreshToken":"refresh-token-secret","idToken":"id-token-secret","clientSecret":"camel-client-secret","authHeader":"auth-header-secret","proxyAuthorizationHeader":"proxy-header-secret"}',
      requestBodyText: 'customer-request-body-text',
      responseBodyText: 'customer-response-body-text',
      requestBodyBytes: 19,
      requestBytes: 20,
      requestSize: 21,
      responseBodyBytes: 1024,
      responseBytes: 2048,
      responseSize: 4096,
      graphqlVariables: '{"customer":"customer-graphql-variable"}',
      formDataParts: [{ name: 'customer-form-data', value: 'customer-form-data-value' }],
      protocolMessages: [{ data: 'customer-protocol-message' }],
      logs: ['customer-log Authorization: Bearer customer-log-secret'],
      consoleOutput: 'console-output-customer-secret',
      payloadIdentifier: 'customer-payload-id',
      nested: {
        access_token: 'nested-token-secret',
        accessToken: 'nested-access-token-secret',
        authorizationHeader: 'nested-authorization-header-secret',
        passphrase: 'client-certificate-passphrase',
        credential: 'generic-credential-secret',
        credentials: 'generic-credentials-secret',
        passwd: 'legacy-passwd-secret',
        note: 'Bearer request-secret eyJsecret12.eyJsecret34.eyJsecret56',
        privateKey: '-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
        localPath: '/home/alice/customer.json',
        windowsPath: 'C:\\Users\\Alice\\customer.json',
        'access_token=object-key-token-secret-12345': 'object-key-value',
        'Authorization: Bearer header-key-secret-12345': 'header-key-value',
        'x-api-key-object-secret-12345': 'hyphen-key-value',
        AuthorizationBearerHeaderKeySecret12345: 'camel-key-value'
      }
    }
  };
}
