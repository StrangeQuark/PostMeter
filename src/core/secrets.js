const SECRET_WRAPPER_MARKER = '__postmeterSecret';
const SECRET_WRAPPER_VERSION = 1;
const REDACTED_SECRET = '<redacted>';

const AUTH_SECRET_FIELDS = new Set([
  'token',
  'password',
  'value',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'deviceCode',
  'passphrase'
]);

function encryptWorkspaceSecrets(workspace, secretCodec) {
  const next = clonePlain(workspace);
  if (!secretCodec) {
    return next;
  }
  transformWorkspaceSecrets(next, (value) => encryptSecretValue(value, secretCodec), true);
  return next;
}

function decryptWorkspaceSecrets(workspace, secretCodec) {
  const next = clonePlain(workspace);
  transformWorkspaceSecrets(next, (value) => decryptSecretValue(value, secretCodec), true);
  return next;
}

function redactWorkspaceSecrets(workspace) {
  const next = clonePlain(workspace);
  transformWorkspaceSecrets(next, () => REDACTED_SECRET, false);
  return next;
}

function encryptSecretValue(value, secretCodec) {
  if (isSecretWrapper(value) || value == null || value === '') {
    return value ?? '';
  }
  const encrypted = secretCodec.encrypt(String(value));
  if (encrypted && typeof encrypted === 'object' && Object.hasOwn(encrypted, 'value')) {
    return {
      [SECRET_WRAPPER_MARKER]: true,
      version: SECRET_WRAPPER_VERSION,
      codec: encrypted.codec || secretCodec.name || 'custom',
      value: encrypted.value
    };
  }
  return {
    [SECRET_WRAPPER_MARKER]: true,
    version: SECRET_WRAPPER_VERSION,
    codec: secretCodec.name || 'custom',
    value: String(encrypted ?? '')
  };
}

function decryptSecretValue(value, secretCodec) {
  if (!isSecretWrapper(value)) {
    return value ?? '';
  }
  if (!secretCodec) {
    throw new Error('Workspace contains encrypted secrets but no secret codec is available.');
  }
  return secretCodec.decrypt(value.value, value.codec);
}

function isSecretWrapper(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value[SECRET_WRAPPER_MARKER] === true
    && value.version === SECRET_WRAPPER_VERSION
    && typeof value.value === 'string'
  );
}

function transformWorkspaceSecrets(workspace, transformer, includePlainSecrets) {
  for (const collection of workspace.collections || []) {
    transformCollectionSecrets(collection, transformer, includePlainSecrets);
  }
  for (const environment of workspace.environments || []) {
    for (const variable of environment.variables || []) {
      if (variable.secret === true && (includePlainSecrets || variable.value)) {
        variable.value = transformer(variable.value);
      }
    }
  }
  for (const cookie of workspace.cookies || []) {
    if (cookie.value && (includePlainSecrets || cookie.value)) {
      cookie.value = transformer(cookie.value);
    }
  }
}

function transformCollectionSecrets(collection, transformer, includePlainSecrets) {
  for (const variable of collection.variables || []) {
    if (variable.secret === true && (includePlainSecrets || variable.value)) {
      variable.value = transformer(variable.value);
    }
  }
  for (const certificate of collection.certificates || []) {
    if (certificate.passphrase && (includePlainSecrets || certificate.passphrase)) {
      certificate.passphrase = transformer(certificate.passphrase);
    }
  }
  for (const request of collection.requests || []) {
    transformRequestSecrets(request, transformer, includePlainSecrets);
  }
  for (const folder of collection.folders || []) {
    transformFolderSecrets(folder, transformer, includePlainSecrets);
  }
}

function transformFolderSecrets(folder, transformer, includePlainSecrets) {
  for (const request of folder.requests || []) {
    transformRequestSecrets(request, transformer, includePlainSecrets);
  }
  for (const child of folder.folders || []) {
    transformFolderSecrets(child, transformer, includePlainSecrets);
  }
}

function transformRequestSecrets(request, transformer, includePlainSecrets) {
  for (const variable of request.variables || []) {
    if (variable.secret === true && (includePlainSecrets || variable.value)) {
      variable.value = transformer(variable.value);
    }
  }
  if (!request.auth || typeof request.auth !== 'object') {
    return;
  }
  for (const field of AUTH_SECRET_FIELDS) {
    if (Object.hasOwn(request.auth, field) && (includePlainSecrets || request.auth[field])) {
      request.auth[field] = transformer(request.auth[field]);
    }
  }
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

module.exports = {
  AUTH_SECRET_FIELDS,
  REDACTED_SECRET,
  SECRET_WRAPPER_MARKER,
  decryptSecretValue,
  decryptWorkspaceSecrets,
  encryptSecretValue,
  encryptWorkspaceSecrets,
  isSecretWrapper,
  redactWorkspaceSecrets
};
