const assert = require('node:assert/strict');
const test = require('node:test');
const {
  bodyTypeCodeLanguage,
  buildVariablePreviewText,
  collectAuthFromEditor
} = require('../../src/renderer/requestEditorPanels');

test('request editor panels choose code editor language from body type', () => {
  assert.equal(bodyTypeCodeLanguage('RAW_JSON'), 'json');
  assert.equal(bodyTypeCodeLanguage('RAW_TEXT'), 'text');
  assert.equal(bodyTypeCodeLanguage('NONE'), 'text');
});

test('request editor panels build variable preview text using request-over-folder-over-collection-over-environment precedence', () => {
  const text = buildVariablePreviewText(
    {
      variables: [
        { enabled: true, key: 'baseUrl', value: 'https://collection.example.test' },
        { enabled: true, key: 'shared', value: 'collection' }
      ]
    },
    {
      variables: [
        { enabled: true, key: 'shared', value: 'environment' },
        { enabled: true, key: 'envOnly', value: 'present' }
      ]
    },
    {
      variables: [
        { enabled: true, key: 'shared', value: 'request' },
        { enabled: false, key: 'disabled', value: 'ignored' }
      ]
    },
    null,
    [{
      variables: [
        { enabled: true, key: 'shared', value: 'folder' },
        { enabled: true, key: 'folderOnly', value: 'present' }
      ]
    }]
  );

  assert.equal(
    text,
    [
      'baseUrl = https://collection.example.test (Collection)',
      'envOnly = present (Environment)',
      'folderOnly = present (Folder)',
      'shared = request (Request)'
    ].join('\n')
  );
});

test('request editor panels read auth editor inputs through the shared auth model', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'oauth2' }],
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
    ['authOauthGrantTypeSelect', { value: 'deviceCode' }],
    ['authOauthTokenTypeSelect', { value: 'MAC' }],
    ['authOauthAccessTokenInput', { value: 'access-token' }],
    ['authOauthRefreshTokenInput', { value: 'refresh-token' }],
    ['authOauthAuthorizationUrlInput', { value: 'https://auth.example.test/authorize' }],
    ['authOauthRedirectStrategySelect', { value: 'customScheme' }],
    ['authOauthDeviceAuthorizationUrlInput', { value: 'https://auth.example.test/device' }],
    ['authOauthTokenUrlInput', { value: 'https://auth.example.test/token' }],
    ['authOauthClientIdInput', { value: 'client-id' }],
    ['authOauthClientSecretInput', { value: 'client-secret' }],
    ['authOauthScopesInput', { value: 'openid profile' }],
    ['authOauthUserCodeInput', { value: 'NEXT-CODE' }],
    ['authClientPfxPathInput', { value: '' }],
    ['authClientCertPathInput', { value: '' }],
    ['authClientKeyPathInput', { value: '' }],
    ['authClientCaPathInput', { value: '' }],
    ['authClientPassphraseInput', { value: '' }]
  ]);
  const fakeDoc = {
    getElementById(id) {
      const value = values.get(id);
      if (!value) {
        throw new Error(`Unexpected element lookup: ${id}`);
      }
      return value;
    }
  };

  assert.deepEqual(collectAuthFromEditor({
    doc: fakeDoc,
    existingAuth: {
      type: 'oauth2',
      grantType: 'deviceCode',
      redirectUri: 'postmeter://oauth/callback',
      expiresAt: '2030-01-01T00:00:00.000Z',
      deviceCode: 'device-code',
      verificationUri: 'https://auth.example.test/device',
      verificationUriComplete: 'https://auth.example.test/device?user_code=PREV',
      deviceCodeExpiresAt: '2030-01-01T00:10:00.000Z',
      devicePollIntervalSeconds: '5'
    }
  }), {
    type: 'oauth2',
    tokenType: 'MAC',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenUrl: 'https://auth.example.test/token',
    authorizationUrl: 'https://auth.example.test/authorize',
    deviceAuthorizationUrl: 'https://auth.example.test/device',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    scopes: 'openid profile',
    grantType: 'deviceCode',
    redirectStrategy: 'customScheme',
    redirectUri: 'postmeter://oauth/callback',
    expiresAt: '2030-01-01T00:00:00.000Z',
    deviceCode: 'device-code',
    userCode: 'NEXT-CODE',
    verificationUri: 'https://auth.example.test/device',
    verificationUriComplete: 'https://auth.example.test/device?user_code=PREV',
    deviceCodeExpiresAt: '2030-01-01T00:10:00.000Z',
    devicePollIntervalSeconds: '5'
  });
});

test('request editor panels can read prefixed auth editor inputs for performance requests', () => {
  const values = new Map([
    ['performanceAuthTypeSelect', { value: 'apiKey' }],
    ['performanceAuthBearerTokenInput', { value: '' }],
    ['performanceAuthBasicUsernameInput', { value: '' }],
    ['performanceAuthBasicPasswordInput', { value: '' }],
    ['performanceAuthApiKeyLocationSelect', { value: 'query' }],
    ['performanceAuthApiKeyNameInput', { value: 'token' }],
    ['performanceAuthApiKeyValueInput', { value: 'abc123' }],
    ['performanceAuthCookieValueInput', { value: '' }],
    ['performanceAuthOauthGrantTypeSelect', { value: 'authorizationCode' }],
    ['performanceAuthOauthTokenTypeSelect', { value: 'Bearer' }],
    ['performanceAuthOauthAccessTokenInput', { value: '' }],
    ['performanceAuthOauthRefreshTokenInput', { value: '' }],
    ['performanceAuthOauthAuthorizationUrlInput', { value: '' }],
    ['performanceAuthOauthRedirectStrategySelect', { value: 'loopback' }],
    ['performanceAuthOauthDeviceAuthorizationUrlInput', { value: '' }],
    ['performanceAuthOauthTokenUrlInput', { value: '' }],
    ['performanceAuthOauthClientIdInput', { value: '' }],
    ['performanceAuthOauthClientSecretInput', { value: '' }],
    ['performanceAuthOauthScopesInput', { value: '' }],
    ['performanceAuthOauthUserCodeInput', { value: '' }],
    ['performanceAuthClientPfxPathInput', { value: '' }],
    ['performanceAuthClientCertPathInput', { value: '' }],
    ['performanceAuthClientKeyPathInput', { value: '' }],
    ['performanceAuthClientCaPathInput', { value: '' }],
    ['performanceAuthClientPassphraseInput', { value: '' }]
  ]);
  const fakeDoc = {
    getElementById(id) {
      const value = values.get(id);
      if (!value) {
        throw new Error(`Unexpected element lookup: ${id}`);
      }
      return value;
    }
  };

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc, idPrefix: 'performance' }), {
    type: 'apiKey',
    location: 'query',
    key: 'token',
    value: 'abc123'
  });
});
