const assert = require('node:assert/strict');
const test = require('node:test');
const {
  beautifyBodyText,
  bodyTypeCodeLanguage,
  buildVariablePreviewText,
  collectAuthFromEditor,
  syncRefreshingAuthSelectOptions
} = require('../../src/renderer/requestEditorPanels');

test('request editor panels choose code editor language from body type', () => {
  assert.equal(bodyTypeCodeLanguage('RAW_JSON'), 'json');
  assert.equal(bodyTypeCodeLanguage('RAW_TEXT'), 'text');
  assert.equal(bodyTypeCodeLanguage('NONE'), 'text');
});

test('request editor panels beautify raw JSON with four-space indentation', () => {
  assert.equal(beautifyBodyText('{"test":"object"}', 'json'), [
    '{',
    '    "test": "object"',
    '}'
  ].join('\n'));
  assert.equal(beautifyBodyText('{"test":', 'json'), '{"test":');
});

test('request editor panels beautify JavaScript, markup, and GraphQL body text', () => {
  assert.equal(beautifyBodyText('const payload={test:"object",count:1};', 'javascript'), [
    'const payload = {',
    '    test: "object",',
    '    count: 1',
    '};'
  ].join('\n'));
  assert.equal(beautifyBodyText('<div><span>Hi</span></div>', 'html'), [
    '<div>',
    '    <span>',
    '        Hi',
    '    </span>',
    '</div>'
  ].join('\n'));
  assert.equal(beautifyBodyText('<root><item id="1">value</item></root>', 'xml'), [
    '<root>',
    '    <item id="1">',
    '        value',
    '    </item>',
    '</root>'
  ].join('\n'));
  assert.equal(beautifyBodyText('query User($id: ID!) { user(id: $id) { id name } }', 'graphql'), [
    'query User($id: ID!) {',
    '    user(id: $id) {',
    '        id',
    '        name',
    '    }',
    '}'
  ].join('\n'));
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

test('request editor panels collect auto refresh auth type', () => {
  const fakeDoc = {
    getElementById(id) {
      return { value: id === 'authTypeSelect' ? 'autoRefresh' : '' };
    }
  };

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), { type: 'autoRefresh' });
});

test('request editor panels collect auto refresh refresh-token auth type', () => {
  const fakeDoc = {
    getElementById(id) {
      return { value: id === 'authTypeSelect' ? 'autoRefreshRefreshToken' : '' };
    }
  };

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), { type: 'autoRefreshRefreshToken' });
});

test('request editor panels inserts dynamic refreshing auth select options only when available', () => {
  const select = fakeSelect('none');

  syncRefreshingAuthSelectOptions(select, {
    accessTokenAvailable: true,
    refreshTokenAvailable: true
  });

  const accessOption = select.querySelector('option[value="autoRefresh"]');
  const refreshOption = select.querySelector('option[value="autoRefreshRefreshToken"]');
  assert.equal(accessOption.textContent, 'Use Refreshing Access Token');
  assert.equal(accessOption.hidden, false);
  assert.equal(accessOption.disabled, false);
  assert.equal(refreshOption.textContent, 'Refreshing Auth Refresh Token');
  assert.equal(refreshOption.hidden, false);
  assert.equal(refreshOption.disabled, false);

  select.value = 'autoRefreshRefreshToken';
  syncRefreshingAuthSelectOptions(select, {
    accessTokenAvailable: true,
    refreshTokenAvailable: false
  });

  assert.equal(select.value, 'none');
  assert.equal(refreshOption.hidden, true);
  assert.equal(refreshOption.disabled, true);
});

test('request editor panels keep dynamic refreshing auth selections when available', () => {
  const select = fakeSelect('autoRefresh');

  syncRefreshingAuthSelectOptions(select, {
    accessTokenAvailable: true,
    refreshTokenAvailable: false
  });

  assert.equal(select.value, 'autoRefresh');
  select.value = 'autoRefreshRefreshToken';
  syncRefreshingAuthSelectOptions(select, {
    accessTokenAvailable: false,
    refreshTokenAvailable: true
  });

  assert.equal(select.value, 'autoRefreshRefreshToken');
});

test('request editor panels can label dynamic refreshing auth options for cookies', () => {
  const select = fakeSelect('none');

  syncRefreshingAuthSelectOptions(select, {
    accessTokenLabel: 'Use Refreshing Access Cookie',
    accessTokenAvailable: true,
    refreshTokenLabel: 'Refreshing Auth Refresh Cookie',
    refreshTokenAvailable: true
  });

  assert.equal(select.querySelector('option[value="autoRefresh"]').textContent, 'Use Refreshing Access Cookie');
  assert.equal(select.querySelector('option[value="autoRefreshRefreshToken"]').textContent, 'Refreshing Auth Refresh Cookie');
});

test('request editor panels clear dynamic refreshing auth selections when options are unavailable', () => {
  const select = fakeSelect('autoRefresh');

  syncRefreshingAuthSelectOptions(select, {
    accessTokenAvailable: false,
    refreshTokenAvailable: false
  });

  assert.equal(select.value, 'none');
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

function fakeSelect(initialValue = 'none') {
  const select = {
    value: initialValue,
    options: [],
    ownerDocument: {
      createElement(tagName) {
        return {
          tagName: String(tagName || '').toUpperCase(),
          value: '',
          textContent: '',
          dataset: {},
          hidden: false,
          disabled: false
        };
      }
    },
    append(option) {
      this.options.push(option);
    },
    querySelector(selector) {
      const match = String(selector || '').match(/option\[value="([^"]+)"\]/);
      if (!match) {
        return null;
      }
      return this.options.find((option) => option.value === match[1]) || null;
    }
  };
  select.options.push({
    value: 'none',
    textContent: 'None',
    dataset: {},
    hidden: false,
    disabled: false
  });
  return select;
}
