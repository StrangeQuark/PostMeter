const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const {
  normalizeAuth
} = require('./auth');
const {
  resolveEnvironmentValue
} = require('../workspace/environmentResolver');
const {
  DEFAULT_MAX_PFX_BYTES,
  decryptPemPrivateKey,
  extractPfxToPem,
  readRegularFileBounded
} = require('./pfxCertificate');
const {
  findMatchingClientCertificate,
  grpcRootCertificatesWithSystemRoots,
  normalizeRequestTlsSettings,
  normalizeTlsSettings
} = require('./tlsSettings');
const {
  normalizeSandboxFileBindings
} = require('./fileAttachmentBindings');
const { classifyNetworkDestination } = require('../security/networkPolicy');

const DEFAULT_GRPC_TIMEOUT_MILLIS = 3 * 60 * 1000;
const MAX_GRPC_METADATA_PAIRS = 1000;
const MAX_GRPC_MESSAGES = 1000;
const MAX_GRPC_MESSAGE_BYTES = 512 * 1024;
const MAX_GRPC_PROTO_BYTES = 2 * 1024 * 1024;
const GRPC_STATUS_NAMES = Object.freeze({
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED'
});

async function invokeGrpcRequest(request = {}, environment = { variables: [] }, options = {}) {
  const started = performance.now();
  const invocation = await prepareGrpcInvocation(request, environment, options);
  await enforceGrpcNetworkPolicy(invocation, options.networkPolicy);
  const credentialResult = await grpcCredentialsForRequest(invocation, environment, options);
  const client = new invocation.Client(invocation.target, credentialResult.credentials, grpcClientOptions(invocation));
  let result;
  try {
    result = await invokeGrpcMethod(client, invocation, options);
  } finally {
    client.close();
  }
  const durationMillis = Math.max(0, Math.round(performance.now() - started));
  return {
    response: grpcResponseFromInvocation(result, invocation, durationMillis, credentialResult.tlsDiagnostics)
  };
}

async function enforceGrpcNetworkPolicy(invocation = {}, policy = {}) {
  if (!policy || policy.enabled !== true) {
    return;
  }
  const url = `${invocation.secure ? 'https' : 'http'}://${invocation.target}`;
  const classification = await classifyNetworkDestination(url, {
    resolveHost: policy.resolveHost
  });
  if (classification.category === 'public') {
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.public.allowed', classification);
    return;
  }
  if (classification.category === 'metadata') {
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.metadata.blocked', classification, 'metadata_endpoint_blocked');
    const error = new Error('Metadata-service requests are blocked by PostMeter network safe mode.');
    error.code = 'POSTMETER_METADATA_REQUEST_BLOCKED';
    throw error;
  }
  if (policy.allowPrivateNetworkRequests === true) {
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.private.allowed', classification);
    return;
  }
  if (typeof policy.confirmPrivateNetworkRequest === 'function') {
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.private.prompted', classification);
    const accepted = await policy.confirmPrivateNetworkRequest({
      category: classification.category || 'unknown',
      hostname: classification.hostname || '',
      reason: classification.reason || ''
    });
    if (accepted === true) {
      await recordGrpcNetworkPolicyEvent(policy, 'request.network.private.allowed', classification);
      return;
    }
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.private.denied', classification, 'private_network_request_denied');
  } else {
    await recordGrpcNetworkPolicyEvent(policy, 'request.network.private.blocked', classification, 'private_network_request_blocked');
  }
  const error = new Error('Private-network requests are blocked by PostMeter network safe mode.');
  error.code = 'POSTMETER_PRIVATE_NETWORK_REQUEST_BLOCKED';
  throw error;
}

async function recordGrpcNetworkPolicyEvent(policy, type, classification, failureCode = '') {
  if (typeof policy?.recordDiagnosticEvent !== 'function') {
    return;
  }
  await Promise.resolve(policy.recordDiagnosticEvent({
    type,
    level: failureCode ? 'warn' : 'info',
    outcome: failureCode ? 'blocked' : 'completed',
    failureCode: failureCode || undefined,
    fields: {
      category: classification?.category || 'unknown',
      hostname: classification?.hostname || '',
      reason: classification?.reason || ''
    }
  })).catch(() => {});
}

async function prepareGrpcInvocation(request, environment, options) {
  const transportConfig = options.grpcTransportConfig || {};
  const grpcConfig = grpcTransportConfigForInvocation(request, options);
  const transportEnvironment = options.grpcTransportEnvironment || environment;
  const targetInfo = grpcTargetForRequest(request, grpcConfig, environment);
  const methodPath = grpcMethodPathForRequest(request, grpcConfig, targetInfo, environment);
  const { servicePath, methodName } = splitGrpcMethodPath(methodPath);
  const loaded = await loadGrpcObject(grpcConfig, transportEnvironment, options);
  const Client = findGrpcServiceClient(loaded, servicePath);
  const method = findGrpcMethod(Client, methodName);
  const messages = grpcRequestMessages(request, grpcConfig, environment);
  return {
    Client,
    secure: targetInfo.secure,
    servicePath,
    methodName,
    method,
    target: targetInfo.target,
    finalUrl: `${targetInfo.scheme}://${targetInfo.target}/${servicePath}/${methodName}`,
    metadata: grpcMetadataForRequest(request, grpcConfig, environment),
    messages,
    request,
    grpcConfig,
    transportEnvironment,
    hasTrustedTransportConfig: hasTrustedGrpcTransportConfig(options),
    transportConfig
  };
}

function grpcTransportConfigForInvocation(request, options) {
  if (hasTrustedGrpcTransportConfig(options)) {
    return cloneJsonValue(options.grpcTransportConfig?.grpc || {});
  }
  return request.grpc && typeof request.grpc === 'object' ? cloneJsonValue(request.grpc) : {};
}

function hasTrustedGrpcTransportConfig(options = {}) {
  return Object.hasOwn(options, 'grpcTransportConfig')
    && options.grpcTransportConfig
    && typeof options.grpcTransportConfig === 'object';
}

function grpcTargetForRequest(request, grpcConfig, environment) {
  const rawUrl = resolveEnvironmentValue(
    request.url || grpcConfig.url || grpcConfig.target || '',
    environment
  ).trim();
  if (!rawUrl) {
    throw new Error('gRPC request URL is required.');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('gRPC request URL is not a valid URI.');
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'grpc' && scheme !== 'grpcs') {
    throw new Error('gRPC request URL must use grpc:// or grpcs://.');
  }
  if (!parsed.hostname) {
    throw new Error('gRPC request URL must include a host.');
  }
  const port = parsed.port || (scheme === 'grpcs' ? '443' : '80');
  return {
    methodPath: parsed.pathname.replace(/^\/+/, ''),
    scheme,
    secure: scheme === 'grpcs',
    target: `${parsed.hostname}:${port}`
  };
}

function grpcMethodPathForRequest(request, grpcConfig, targetInfo, environment) {
  const service = firstString(grpcConfig.service, grpcConfig.serviceName);
  const method = firstString(grpcConfig.method, grpcConfig.rpc, grpcConfig.methodName);
  const source = resolveEnvironmentValue(
    request.methodPath || grpcConfig.methodPath || targetInfo.methodPath || (service && method ? `${service}/${method}` : ''),
    environment
  ).trim().replace(/^\/+/, '');
  if (!source || !source.includes('/')) {
    throw new Error('gRPC method path must be service/method.');
  }
  return source;
}

function splitGrpcMethodPath(methodPath) {
  const [servicePath, methodName, ...extra] = String(methodPath || '').split('/');
  if (!servicePath || !methodName || extra.length) {
    throw new Error('gRPC method path must be service/method.');
  }
  return { servicePath, methodName };
}

async function loadGrpcObject(grpcConfig, environment, options) {
  const source = await grpcProtoSource(grpcConfig, environment, options);
  let protoPath = source.path;
  let tempDir = '';
  try {
    if (source.inline) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-grpc-proto-'));
      protoPath = path.join(tempDir, 'request.proto');
      await fs.writeFile(protoPath, source.inline, 'utf8');
    }
    const packageDefinition = await protoLoader.load(protoPath, {
      defaults: true,
      enums: String,
      includeDirs: source.includeDirs,
      keepCase: true,
      longs: String,
      oneofs: true
    });
    return grpc.loadPackageDefinition(packageDefinition);
  } catch (error) {
    throw new Error(`gRPC proto could not be loaded: ${sanitizeGrpcError(error)}`);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { force: true, recursive: true }).catch(() => {});
    }
  }
}

async function grpcProtoSource(grpcConfig, environment, options) {
  const inline = firstString(
    grpcConfig.proto,
    grpcConfig.protoSource,
    grpcConfig.source,
    grpcConfig.definition
  );
  const includeDirs = grpcIncludeDirs(grpcConfig, environment, options);
  if (inline) {
    if (Buffer.byteLength(inline, 'utf8') > MAX_GRPC_PROTO_BYTES) {
      throw new Error(`gRPC proto source cannot exceed ${MAX_GRPC_PROTO_BYTES} bytes.`);
    }
    return { includeDirs, inline, path: '' };
  }

  const rawPath = firstString(
    grpcConfig.protoPath,
    grpcConfig.filePath,
    grpcConfig.path,
    grpcConfig.importPath
  );
  if (!rawPath) {
    throw new Error('gRPC transport requires inline proto source or a .proto file path.');
  }
  const resolvedPath = resolveGrpcPath(rawPath, environment, options.grpcProtoBaseDir);
  if (path.extname(resolvedPath).toLowerCase() !== '.proto') {
    throw new Error('gRPC proto file path must end with .proto.');
  }
  const stat = await fs.stat(resolvedPath).catch((error) => {
    throw new Error(`gRPC proto file could not be read: ${error?.code || error?.message || 'unknown error'}.`);
  });
  if (!stat.isFile()) {
    throw new Error('gRPC proto path must be a regular file.');
  }
  if (stat.size > MAX_GRPC_PROTO_BYTES) {
    throw new Error(`gRPC proto file cannot exceed ${MAX_GRPC_PROTO_BYTES} bytes.`);
  }
  return {
    includeDirs: Array.from(new Set([path.dirname(resolvedPath), ...includeDirs])),
    inline: '',
    path: resolvedPath
  };
}

function grpcIncludeDirs(grpcConfig, environment, options) {
  const values = [
    ...(Array.isArray(grpcConfig.includeDirs) ? grpcConfig.includeDirs : []),
    ...(Array.isArray(grpcConfig.importDirs) ? grpcConfig.importDirs : []),
    ...(Array.isArray(grpcConfig.protoDirs) ? grpcConfig.protoDirs : []),
    ...(Array.isArray(options.grpcProtoIncludeDirs) ? options.grpcProtoIncludeDirs : [])
  ];
  return values
    .map((value) => resolveGrpcPath(value, environment, options.grpcProtoBaseDir))
    .filter(Boolean)
    .slice(0, 32);
}

function resolveGrpcPath(value, environment, baseDir) {
  const resolved = resolveEnvironmentValue(String(value || ''), environment).trim();
  if (!resolved) {
    return '';
  }
  return path.resolve(baseDir || process.cwd(), resolved);
}

function findGrpcServiceClient(root, servicePath) {
  const direct = getByPath(root, servicePath.split('.'));
  if (typeof direct === 'function' && direct.service) {
    return direct;
  }
  const serviceName = servicePath.split('.').pop();
  const fallback = findServiceByName(root, serviceName);
  if (fallback) {
    return fallback;
  }
  throw new Error(`gRPC service "${servicePath}" was not found in the loaded proto.`);
}

function findServiceByName(root, name) {
  if (!root || typeof root !== 'object') {
    return null;
  }
  for (const [key, value] of Object.entries(root)) {
    if (key === name && typeof value === 'function' && value.service) {
      return value;
    }
    const nested = findServiceByName(value, name);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findGrpcMethod(Client, methodName) {
  const service = Client.service || {};
  const candidates = [
    methodName,
    methodName.charAt(0).toLowerCase() + methodName.slice(1),
    methodName.charAt(0).toUpperCase() + methodName.slice(1)
  ];
  for (const candidate of candidates) {
    if (service[candidate]) {
      return {
        callName: service[candidate].originalName || candidate,
        definition: service[candidate]
      };
    }
  }
  for (const [name, definition] of Object.entries(service)) {
    if (definition?.originalName === methodName || definition?.path?.endsWith(`/${methodName}`)) {
      return {
        callName: definition.originalName || name,
        definition
      };
    }
  }
  throw new Error(`gRPC method "${methodName}" was not found in the loaded service.`);
}

function grpcClientOptions(invocation) {
  const options = {
    'grpc.max_receive_message_length': MAX_GRPC_MESSAGE_BYTES,
    'grpc.max_send_message_length': MAX_GRPC_MESSAGE_BYTES
  };
  const grpcOptions = invocation.grpcConfig.options && typeof invocation.grpcConfig.options === 'object'
    ? invocation.grpcConfig.options
    : {};
  for (const [key, value] of Object.entries(grpcOptions)) {
    if (/^grpc\.[A-Za-z0-9_.-]+$/.test(key)) {
      options[key] = grpcClientOptionValue(key, value);
    }
  }
  options['grpc.max_receive_message_length'] = clampGrpcMessageLimit(options['grpc.max_receive_message_length']);
  options['grpc.max_send_message_length'] = clampGrpcMessageLimit(options['grpc.max_send_message_length']);
  return options;
}

function grpcClientOptionValue(key, value) {
  if (key === 'grpc.max_receive_message_length' || key === 'grpc.max_send_message_length') {
    return clampGrpcMessageLimit(value);
  }
  return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
}

function clampGrpcMessageLimit(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return MAX_GRPC_MESSAGE_BYTES;
  }
  return Math.max(1, Math.min(MAX_GRPC_MESSAGE_BYTES, numeric));
}

async function grpcCredentialsForRequest(invocation, environment, options) {
  if (!invocation.secure) {
    return {
      credentials: grpc.credentials.createInsecure(),
      tlsDiagnostics: null
    };
  }
  const transportEnvironment = invocation.transportEnvironment || environment;
  const fileBindings = Array.isArray(options.fileBindings) ? options.fileBindings : null;
  const tlsConfig = invocation.grpcConfig.tls || {};
  const settings = normalizeTlsSettings(options.tlsSettings || {});
  const clientCertificates = [
    ...(options.clientCertificates || []),
    ...(settings.clientCertificates || [])
  ];
  const requestTlsSettings = normalizeRequestTlsSettings(invocation.request?.settings || {});
  const effectiveSettings = {
    ...settings,
    sslCertificateVerification: requestTlsSettings.sslCertificateVerification === 'inherit'
      ? settings.sslCertificateVerification
      : requestTlsSettings.sslCertificateVerification !== 'disabled'
  };
  const rootCertParts = [];
  const settingsCaPath = resolveEnvironmentValue(settings.caCertificatePath, transportEnvironment).trim();
  const settingsRootCerts = await readOptionalPem(settingsCaPath, transportEnvironment, 'CA certificate', fileBindings);
  if (settingsRootCerts) {
    rootCertParts.push(settingsRootCerts);
  }
  const rootCerts = await readOptionalPem(tlsConfig.caPath, transportEnvironment, 'CA certificate', fileBindings);
  if (rootCerts) {
    rootCertParts.push(rootCerts);
  }
  const clientAuth = normalizeAuth(invocation.hasTrustedTransportConfig
    ? invocation.transportConfig.auth || {}
    : invocation.request.auth || {});
  if (clientAuth.type !== 'clientCertificate') {
    const matchedCertificate = findMatchingClientCertificate(
      clientCertificates,
      grpcUrlForTarget(invocation)
    );
    if (matchedCertificate) {
      return {
        credentials: await grpcCredentialsForClientCertificate({
          type: 'clientCertificate',
          caPath: matchedCertificate.caPath || '',
          certPath: matchedCertificate.certPath || '',
          keyPath: matchedCertificate.keyPath || '',
          passphrase: matchedCertificate.passphrase || '',
          pfxPath: matchedCertificate.pfxPath || ''
        }, transportEnvironment, rootCertParts, effectiveSettings, fileBindings),
        tlsDiagnostics: grpcTlsDiagnostics(effectiveSettings, rootCertParts, matchedCertificate, transportEnvironment)
      };
    }
    return {
      credentials: grpc.credentials.createSsl(
        grpcRootCertificatesWithSystemRoots(rootCertParts) || undefined,
        undefined,
        undefined,
        grpcVerifyOptions(effectiveSettings)
      ),
      tlsDiagnostics: grpcTlsDiagnostics(effectiveSettings, rootCertParts, null, transportEnvironment)
    };
  }

  const certificateId = resolveEnvironmentValue(clientAuth.certificateId, transportEnvironment).trim();
  const certificateBinding = certificateId
    ? clientCertificates.find((item) => item?.enabled !== false && String(item?.id || '') === certificateId)
    : null;
  if (certificateId && !certificateBinding) {
    throw new Error('Configured gRPC client certificate binding was not found for this request.');
  }
  const auth = certificateBinding ? {
    type: 'clientCertificate',
    certificateId,
    caPath: certificateBinding.caPath || '',
    certPath: certificateBinding.certPath || '',
    keyPath: certificateBinding.keyPath || '',
    passphrase: certificateBinding.passphrase || '',
    pfxPath: certificateBinding.pfxPath || ''
  } : clientAuth;
  return {
    credentials: await grpcCredentialsForClientCertificate(auth, transportEnvironment, rootCertParts, effectiveSettings, fileBindings),
    tlsDiagnostics: grpcTlsDiagnostics(effectiveSettings, rootCertParts, certificateBinding || auth, transportEnvironment, {
      certificateId
    })
  };
}

async function grpcCredentialsForClientCertificate(auth, transportEnvironment, rootCertParts, settings, fileBindings = null) {
  const ca = await readOptionalPem(auth.caPath, transportEnvironment, 'CA certificate', fileBindings);
  const caParts = ca ? [...rootCertParts, ca] : rootCertParts;
  const rootCerts = grpcRootCertificatesWithSystemRoots(caParts) || undefined;
  const pfxPath = resolveEnvironmentValue(String(auth.pfxPath || ''), transportEnvironment).trim();
  if (pfxPath) {
    const extracted = await extractPfxForGrpc(resolveMainOwnedFilePath(pfxPath, fileBindings, 'PFX/P12 bundle'), resolveEnvironmentValue(auth.passphrase, transportEnvironment));
    return grpc.credentials.createSsl(rootCerts, extracted.privateKey, extracted.certChain, grpcVerifyOptions(settings));
  }

  const certChain = await readRequiredPem(auth.certPath, transportEnvironment, 'PEM certificate', fileBindings);
  const privateKey = decryptPemPrivateKey(
    await readRequiredPem(auth.keyPath, transportEnvironment, 'PEM key', fileBindings),
    resolveEnvironmentValue(auth.passphrase, transportEnvironment),
    'gRPC PEM key'
  );
  return grpc.credentials.createSsl(rootCerts, privateKey, certChain, grpcVerifyOptions(settings));
}

function grpcVerifyOptions(settings) {
  return settings.sslCertificateVerification === false
    ? { rejectUnauthorized: false, checkServerIdentity: () => undefined }
    : {};
}

function grpcTlsDiagnostics(settings, rootCertParts = [], certificate = null, environment, options = {}) {
  const certificateId = options.certificateId || certificate?.id || '';
  const hasCertificateMaterial = Boolean(
    certificate
    && (
      certificateId
      || String(certificate.certPath || '').trim()
      || String(certificate.keyPath || '').trim()
      || String(certificate.pfxPath || '').trim()
    )
  );
  const certificateCaPath = certificate?.caPath
    ? resolveEnvironmentValue(certificate.caPath, environment).trim()
    : '';
  return {
    caCertificateConfigured: rootCertParts.length > 0 || Boolean(certificateCaPath),
    clientCertificateConfigured: hasCertificateMaterial,
    clientCertificateId: certificateId,
    clientCertificateName: certificate?.name || '',
    verificationDisabled: settings.sslCertificateVerification === false
  };
}

function grpcUrlForTarget(invocation) {
  return new URL(invocation.finalUrl || `grpcs://${invocation.target}`);
}

async function readOptionalPem(filePath, environment, label, fileBindings = null) {
  const resolved = resolveEnvironmentValue(String(filePath || ''), environment).trim();
  if (!resolved) {
    return null;
  }
  return readBoundedFile(resolveMainOwnedFilePath(resolved, fileBindings, label), label);
}

async function readRequiredPem(filePath, environment, label, fileBindings = null) {
  const resolved = resolveEnvironmentValue(String(filePath || ''), environment).trim();
  if (!resolved) {
    throw new Error(`gRPC client certificate ${label} path is required.`);
  }
  return readBoundedFile(resolveMainOwnedFilePath(resolved, fileBindings, label), label);
}

async function readBoundedFile(filePath, label) {
  return readRegularFileBounded(filePath, `gRPC ${label}`, MAX_GRPC_PROTO_BYTES);
}

async function extractPfxForGrpc(filePath, passphrase = '') {
  return extractPfxToPem(filePath, passphrase, {
    bundleLabel: 'gRPC PFX/P12 bundle',
    maxBytes: DEFAULT_MAX_PFX_BYTES
  });
}

function resolveMainOwnedFilePath(value, fileBindings = null, label = 'file') {
  const reference = String(value || '').trim();
  if (!reference) {
    return '';
  }
  if (Array.isArray(fileBindings)) {
    const bindings = normalizeSandboxFileBindings(fileBindings);
    const binding = bindings.find((candidate) => (
      candidate.enabled !== false
      && candidate.localPath
      && (candidate.source === reference || candidate.id === reference)
    ));
    if (binding?.localPath) {
      return path.resolve(binding.localPath);
    }
    throw new Error(`gRPC client certificate ${label} requires a main-owned local file binding.`);
  }
  return path.resolve(reference);
}

function grpcMetadataForRequest(request, grpcConfig, environment) {
  const metadata = new grpc.Metadata();
  for (const pair of normalizePairs(request.metadata || grpcConfig.metadata || []).slice(0, MAX_GRPC_METADATA_PAIRS)) {
    if (pair.enabled === false || !pair.key) {
      continue;
    }
    metadata.add(
      resolveEnvironmentValue(pair.key, environment).trim().toLowerCase(),
      resolveEnvironmentValue(pair.value, environment)
    );
  }
  return metadata;
}

function grpcRequestMessages(request, grpcConfig, environment) {
  const values = Array.isArray(request.messages) && request.messages.length
    ? request.messages
    : Array.isArray(grpcConfig.messages)
      ? grpcConfig.messages
      : [];
  const messages = values.slice(0, MAX_GRPC_MESSAGES).map((message) => (
    resolveGrpcValue(message?.data ?? message?.value ?? message?.body ?? message, environment)
  ));
  return messages.length ? messages : [{}];
}

function resolveGrpcValue(value, environment, seen = new WeakMap()) {
  if (typeof value === 'string') {
    const text = resolveEnvironmentValue(value, environment);
    const trimmed = text.trim();
    if (/^[{[]/.test(trimmed)) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return text;
      }
    }
    return text;
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const item of value.slice(0, MAX_GRPC_MESSAGES)) {
      output.push(resolveGrpcValue(item, environment, seen));
    }
    assertGrpcMessageSize(output);
    return output;
  }
  const output = Object.create(null);
  seen.set(value, output);
  for (const [key, item] of Object.entries(value).slice(0, MAX_GRPC_MESSAGES)) {
    if (key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      output[key] = resolveGrpcValue(item, environment, seen);
    }
  }
  assertGrpcMessageSize(output);
  return output;
}

function assertGrpcMessageSize(value) {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  if (bytes > MAX_GRPC_MESSAGE_BYTES) {
    throw new Error(`gRPC message payload cannot exceed ${MAX_GRPC_MESSAGE_BYTES} bytes.`);
  }
}

function invokeGrpcMethod(client, invocation, options) {
  const definition = invocation.method.definition;
  if (definition.requestStream && definition.responseStream) {
    return invokeBidirectionalStreaming(client, invocation, options);
  }
  if (definition.requestStream) {
    return invokeClientStreaming(client, invocation, options);
  }
  if (definition.responseStream) {
    return invokeServerStreaming(client, invocation, options);
  }
  return invokeUnary(client, invocation, options);
}

function invokeUnary(client, invocation, options) {
  return new Promise((resolve) => {
    const state = createCallState(invocation);
    let callbackDone = false;
    const call = client[invocation.method.callName](
      invocation.messages[0] || {},
      invocation.metadata,
      grpcCallOptions(options),
      (error, response) => {
        if (response != null) {
          appendGrpcMessage(state, response);
        }
        if (error) {
          state.error = error;
        }
        callbackDone = true;
        if (state.statusSeen || state.error) {
          resolveGrpcCall(state, resolve);
        }
      }
    );
    attachUnaryCallHandlers(call, state, resolve, () => callbackDone);
    attachGrpcAbort(call, options.signal, state, resolve);
  });
}

function invokeClientStreaming(client, invocation, options) {
  return new Promise((resolve) => {
    const state = createCallState(invocation);
    let callbackDone = false;
    const call = client[invocation.method.callName](
      invocation.metadata,
      grpcCallOptions(options),
      (error, response) => {
        if (response != null) {
          appendGrpcMessage(state, response);
        }
        if (error) {
          state.error = error;
        }
        callbackDone = true;
        if (state.statusSeen || state.error) {
          resolveGrpcCall(state, resolve);
        }
      }
    );
    attachUnaryCallHandlers(call, state, resolve, () => callbackDone);
    attachGrpcAbort(call, options.signal, state, resolve);
    writeGrpcMessages(call, invocation.messages, state);
  });
}

function invokeServerStreaming(client, invocation, options) {
  return new Promise((resolve) => {
    const state = createCallState(invocation);
    const call = client[invocation.method.callName](
      invocation.messages[0] || {},
      invocation.metadata,
      grpcCallOptions(options)
    );
    attachStreamingCallHandlers(call, state, resolve);
    attachGrpcAbort(call, options.signal, state, resolve);
  });
}

function invokeBidirectionalStreaming(client, invocation, options) {
  return new Promise((resolve) => {
    const state = createCallState(invocation);
    const call = client[invocation.method.callName](
      invocation.metadata,
      grpcCallOptions(options)
    );
    attachStreamingCallHandlers(call, state, resolve);
    attachGrpcAbort(call, options.signal, state, resolve);
    writeGrpcMessages(call, invocation.messages, state);
  });
}

function createCallState(invocation) {
  return {
    error: null,
    finalUrl: invocation.finalUrl,
    messages: [],
    metadata: [],
    resolved: false,
    status: null,
    statusSeen: false,
    trailers: []
  };
}

function attachUnaryCallHandlers(call, state, resolve, isCallbackDone) {
  call.on('metadata', (metadata) => {
    state.metadata = metadataToPairs(metadata);
  });
  call.on('status', (status) => {
    state.status = status;
    state.statusSeen = true;
    state.trailers = statusMetadataToPairs(status);
    if (isCallbackDone()) {
      resolveGrpcCall(state, resolve);
    }
  });
  call.on('error', (error) => {
    state.error = error;
    if (isCallbackDone()) {
      resolveGrpcCall(state, resolve);
    }
  });
}

function attachStreamingCallHandlers(call, state, resolve) {
  call.on('metadata', (metadata) => {
    state.metadata = metadataToPairs(metadata);
  });
  call.on('data', (message) => {
    try {
      appendGrpcMessage(state, message);
    } catch (error) {
      state.error = error;
      call.cancel();
    }
  });
  call.on('status', (status) => {
    state.status = status;
    state.statusSeen = true;
    state.trailers = statusMetadataToPairs(status);
    resolveGrpcCall(state, resolve);
  });
  call.on('error', (error) => {
    state.error = error;
  });
  call.on('end', () => {
    if (!state.statusSeen) {
      setImmediate(() => {
        if (!state.statusSeen) {
          resolveGrpcCall(state, resolve);
        }
      });
    }
  });
}

function attachGrpcAbort(call, signal, state, resolve) {
  if (!signal) {
    return;
  }
  const abort = () => {
    state.error = Object.assign(new Error('gRPC request was cancelled.'), {
      code: grpc.status.CANCELLED
    });
    call.cancel();
    resolveGrpcCall(state, resolve);
  };
  if (signal.aborted) {
    abort();
    return;
  }
  signal.addEventListener('abort', abort, { once: true });
}

function resolveGrpcCall(state, resolve) {
  if (state.resolved) {
    return;
  }
  state.resolved = true;
  resolve(state);
}

function writeGrpcMessages(call, messages, state) {
  for (const message of messages) {
    if (state.error) {
      break;
    }
    call.write(message);
  }
  call.end();
}

function appendGrpcMessage(state, message) {
  if (state.messages.length >= MAX_GRPC_MESSAGES) {
    throw Object.assign(new Error(`gRPC response cannot exceed ${MAX_GRPC_MESSAGES} messages.`), {
      code: grpc.status.RESOURCE_EXHAUSTED
    });
  }
  assertGrpcMessageSize(message);
  state.messages.push(message);
}

function grpcCallOptions(options) {
  const timeoutMillis = Math.max(1, Math.min(
    DEFAULT_GRPC_TIMEOUT_MILLIS,
    Math.floor(Number(options.timeoutMillis || DEFAULT_GRPC_TIMEOUT_MILLIS))
  ));
  return {
    deadline: new Date(Date.now() + timeoutMillis)
  };
}

function grpcResponseFromInvocation(state, invocation, durationMillis, tlsDiagnostics = null) {
  const errorCode = Number(state.error?.code);
  const statusCode = Number.isFinite(errorCode)
    ? errorCode
    : Number.isFinite(Number(state.status?.code))
      ? Number(state.status.code)
      : 0;
  const reason = state.error?.details || state.error?.message || state.status?.details || '';
  const trailers = ensureGrpcStatusPairs(
    state.trailers.length ? state.trailers : metadataToPairs(state.error?.metadata),
    statusCode,
    reason
  );
  const body = grpcBodyFromMessages(state.messages);
  const response = {
    body,
    cancelled: statusCode === grpc.status.CANCELLED,
    code: statusCode,
    durationMillis,
    finalUrl: state.finalUrl || invocation.finalUrl,
    headers: {},
    messages: state.messages.map((message, index) => ({
      data: cloneJsonValue(message),
      name: `message-${index}`,
      timestamp: new Date().toISOString(),
      type: ''
    })),
    metadata: state.metadata,
    reason,
    responseBytes: Buffer.byteLength(body, 'utf8'),
    responseSize: Buffer.byteLength(body, 'utf8'),
    responseTime: durationMillis,
    status: GRPC_STATUS_NAMES[statusCode] || 'UNKNOWN',
    statusCode,
    trailers
  };
  if (tlsDiagnostics && typeof tlsDiagnostics === 'object' && Object.keys(tlsDiagnostics).length) {
    response.tls = tlsDiagnostics;
  }
  return response;
}

function grpcBodyFromMessages(messages) {
  if (messages.length === 1) {
    return JSON.stringify(cloneJsonValue(messages[0]));
  }
  return JSON.stringify(messages.map(cloneJsonValue));
}

function ensureGrpcStatusPairs(pairs, code, reason) {
  const output = Array.isArray(pairs) ? [...pairs] : [];
  if (!output.some((pair) => pair.key.toLowerCase() === 'grpc-status')) {
    output.push({ enabled: true, key: 'grpc-status', value: String(code) });
  }
  if (reason && !output.some((pair) => pair.key.toLowerCase() === 'grpc-message')) {
    output.push({ enabled: true, key: 'grpc-message', value: String(reason) });
  }
  return output;
}

function metadataToPairs(metadata) {
  if (!metadata || typeof metadata.getMap !== 'function') {
    return [];
  }
  const pairs = [];
  for (const key of Object.keys(metadata.getMap()).slice(0, MAX_GRPC_METADATA_PAIRS)) {
    for (const value of metadata.get(key)) {
      pairs.push({
        enabled: true,
        key,
        value: Buffer.isBuffer(value) ? value.toString('base64') : String(value)
      });
    }
  }
  return pairs;
}

function statusMetadataToPairs(status) {
  return metadataToPairs(status?.metadata);
}

function normalizePairs(values) {
  if (Array.isArray(values)) {
    return values.map((item) => ({
      enabled: item?.enabled !== false && item?.disabled !== true,
      key: item?.key == null ? String(item?.name || '') : String(item.key),
      value: item?.value == null ? '' : String(item.value)
    }));
  }
  if (values && typeof values === 'object') {
    return Object.entries(values).map(([key, value]) => ({
      enabled: true,
      key,
      value: value == null ? '' : String(value)
    }));
  }
  return [];
}

function getByPath(root, parts) {
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function firstString(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) {
      return String(value);
    }
  }
  return '';
}

function sanitizeGrpcError(error) {
  const message = error?.message || String(error || 'unknown error');
  return message.replace(/\s+/g, ' ').slice(0, 300);
}

function cloneJsonValue(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
}

module.exports = {
  extractPfxForGrpc,
  invokeGrpcRequest
};
