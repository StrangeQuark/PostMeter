const assert = require('node:assert/strict');
const test = require('node:test');
const {
  beautifyBodyText,
  bodyTypeCodeLanguage,
  buildAvailableVariableRows,
  buildVariablePreviewText,
  collectAuthFromEditor,
  sortAvailableVariableRows,
  syncOauth1SignatureFields,
  syncRefreshingAuthSelectOptions
} = require('../../src/renderer/requestEditorPanels');

function oauth1EditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthOauth1` : 'authOauth1';
  const values = {
    SignatureMethodSelect: { value: 'HMAC-SHA1' },
    ConsumerKeyInput: { value: '' },
    ConsumerSecretInput: { value: '' },
    TokenInput: { value: '' },
    TokenSecretInput: { value: '' },
    PrivateKeyInput: { value: '' },
    AddAuthDataToSelect: { value: 'header' },
    CallbackInput: { value: '' },
    VerifierInput: { value: '' },
    TimestampInput: { value: '' },
    NonceInput: { value: '' },
    VersionInput: { value: '1.0' },
    RealmInput: { value: '' },
    IncludeBodyHashInput: { checked: false },
    AddEmptyParamsToSignInput: { checked: false },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function oauth2EditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthOauth` : 'authOauth';
  const values = {
    GrantTypeSelect: { value: 'authorizationCode' },
    TokenTypeSelect: { value: 'Bearer' },
    HeaderPrefixInput: { value: 'Bearer' },
    TokenNameInput: { value: '' },
    AddAuthDataToSelect: { value: 'header' },
    AccessTokenInput: { value: '' },
    RefreshTokenInput: { value: '' },
    AutoRefreshTokenInput: { checked: true },
    ShareTokenInput: { checked: false },
    AuthorizationUrlInput: { value: '' },
    CallbackUrlInput: { value: '' },
    AuthorizeUsingBrowserInput: { checked: false },
    RedirectStrategySelect: { value: 'loopback' },
    DeviceAuthorizationUrlInput: { value: '' },
    TokenUrlInput: { value: '' },
    RefreshTokenUrlInput: { value: '' },
    ClientIdInput: { value: '' },
    ClientSecretInput: { value: '' },
    UsernameInput: { value: '' },
    PasswordInput: { value: '' },
    ScopesInput: { value: '' },
    StateInput: { value: '' },
    CodeChallengeMethodSelect: { value: 'S256' },
    CodeVerifierInput: { value: '' },
    ClientAuthenticationSelect: { value: 'basic' },
    AuthRequestParamKeyInput: { value: '' },
    AuthRequestParamValueInput: { value: '' },
    TokenRequestParamKeyInput: { value: '' },
    TokenRequestParamValueInput: { value: '' },
    TokenRequestParamSendInSelect: { value: 'body' },
    RefreshRequestParamKeyInput: { value: '' },
    RefreshRequestParamValueInput: { value: '' },
    RefreshRequestParamSendInSelect: { value: 'body' },
    UserCodeInput: { value: '' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function hawkEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthHawk` : 'authHawk';
  const values = {
    AuthIdInput: { value: '' },
    AuthKeyInput: { value: '' },
    AlgorithmSelect: { value: 'sha256' },
    UserInput: { value: '' },
    NonceInput: { value: '' },
    ExtraDataInput: { value: '' },
    AppInput: { value: '' },
    DelegationInput: { value: '' },
    TimestampInput: { value: '' },
    IncludePayloadHashInput: { checked: false },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function awsEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthAws` : 'authAws';
  const values = {
    AccessKeyInput: { value: '' },
    SecretKeyInput: { value: '' },
    AddAuthDataToSelect: { value: 'header' },
    RegionInput: { value: '' },
    ServiceInput: { value: '' },
    SessionTokenInput: { value: '' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function ntlmEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthNtlm` : 'authNtlm';
  const values = {
    UsernameInput: { value: '' },
    PasswordInput: { value: '' },
    DisableRetryingRequestInput: { checked: false },
    DomainInput: { value: '' },
    WorkstationInput: { value: '' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function akamaiEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthAkamai` : 'authAkamai';
  const values = {
    AccessTokenInput: { value: '' },
    ClientTokenInput: { value: '' },
    ClientSecretInput: { value: '' },
    NonceInput: { value: '' },
    TimestampInput: { value: '' },
    BaseUrlInput: { value: '' },
    HeadersToSignInput: { value: '' },
    MaxBodySizeInput: { value: '' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function jwtEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthJwt` : 'authJwt';
  const values = {
    AlgorithmSelect: { value: 'HS256', closest: () => null },
    SecretInput: { value: '' },
    SecretBase64EncodedInput: { checked: false },
    PrivateKeyInput: { value: '' },
    AddTokenToSelect: { value: 'header' },
    PayloadInput: { value: '{}' },
    HeaderPrefixInput: { value: 'Bearer' },
    HeadersInput: { value: '{}' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

function asapEditorValues(prefix = '', overrides = {}) {
  const base = prefix ? `${prefix}AuthAsap` : 'authAsap';
  const values = {
    AlgorithmSelect: { value: 'RS256' },
    IssuerInput: { value: '' },
    AudienceInput: { value: '' },
    KeyIdInput: { value: '' },
    PrivateKeyInput: { value: '' },
    SubjectInput: { value: '' },
    AdditionalClaimsInput: { value: '{}' },
    ExpiresInInput: { value: '3600' },
    ...overrides
  };
  return Object.entries(values).map(([suffix, value]) => [`${base}${suffix}`, value]);
}

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

test('request editor panels expose environment collection folder and request variables in preview rows', () => {
  const rows = buildAvailableVariableRows(
    {
      name: 'Collection',
      variables: [
        { enabled: true, key: 'collectionToken', value: 'from-collection' },
        { enabled: true, key: 'shared', value: 'collection' }
      ]
    },
    {
      name: 'Environment',
      variables: [
        { enabled: true, key: 'environmentToken', value: 'from-environment' },
        { enabled: true, key: 'shared', value: 'environment' }
      ]
    },
    {
      name: 'Request',
      variables: [
        { enabled: true, key: 'requestToken', value: 'from-request' },
        { enabled: true, key: 'shared', value: 'request' },
        { enabled: false, key: 'disabled', value: 'ignored' }
      ]
    },
    null,
    [{
      name: 'Folder',
      variables: [
        { enabled: true, key: 'folderToken', value: 'from-folder' },
        { enabled: true, key: 'shared', value: 'folder' }
      ]
    }]
  );

  assert.deepEqual(
    rows.map((row) => [row.key, row.value, row.source, row.status]),
    [
      ['collectionToken', 'from-collection', 'Collection', 'Active'],
      ['environmentToken', 'from-environment', 'Environment', 'Active'],
      ['folderToken', 'from-folder', 'Folder', 'Active'],
      ['requestToken', 'from-request', 'Request', 'Active'],
      ['shared', 'request', 'Request', 'Active'],
      ['shared', 'folder', 'Folder', 'Shadowed'],
      ['shared', 'collection', 'Collection', 'Shadowed'],
      ['shared', 'environment', 'Environment', 'Shadowed']
    ]
  );
});

test('request editor panels sort variable preview rows by name source precedence and status', () => {
  const rows = buildAvailableVariableRows(
    {
      name: 'Collection',
      variables: [
        { enabled: true, key: 'alpha', value: 'collection-alpha' },
        { enabled: true, key: 'shared', value: 'collection-shared' }
      ]
    },
    {
      name: 'Environment',
      variables: [
        { enabled: true, key: 'gamma', value: 'environment-gamma' },
        { enabled: true, key: 'shared', value: 'environment-shared' }
      ]
    },
    {
      name: 'Request',
      variables: [
        { enabled: true, key: 'beta', value: 'request-beta' },
        { enabled: true, key: 'shared', value: 'request-shared' }
      ]
    },
    null,
    [{
      name: 'Folder',
      variables: [
        { enabled: true, key: 'folderOnly', value: 'folder-only' },
        { enabled: true, key: 'shared', value: 'folder-shared' }
      ]
    }]
  );

  assert.deepEqual(
    sortAvailableVariableRows(rows, { column: 'Name', direction: 'desc' }).map((row) => `${row.key}:${row.source}`),
    [
      'shared:Request',
      'shared:Folder',
      'shared:Collection',
      'shared:Environment',
      'gamma:Environment',
      'folderOnly:Folder',
      'beta:Request',
      'alpha:Collection'
    ]
  );
  assert.deepEqual(
    sortAvailableVariableRows(rows, { column: 'Source', direction: 'asc' }).map((row) => `${row.source}:${row.key}`),
    [
      'Environment:gamma',
      'Environment:shared',
      'Collection:alpha',
      'Collection:shared',
      'Folder:folderOnly',
      'Folder:shared',
      'Request:beta',
      'Request:shared'
    ]
  );
  assert.deepEqual(
    sortAvailableVariableRows(rows, { column: 'Source', direction: 'desc' }).map((row) => `${row.source}:${row.key}`),
    [
      'Request:beta',
      'Request:shared',
      'Folder:folderOnly',
      'Folder:shared',
      'Collection:alpha',
      'Collection:shared',
      'Environment:gamma',
      'Environment:shared'
    ]
  );
  assert.deepEqual(
    sortAvailableVariableRows(rows, { column: 'Status', direction: 'desc' }).map((row) => `${row.status}:${row.source}:${row.key}`),
    [
      'Shadowed:Folder:shared',
      'Shadowed:Collection:shared',
      'Shadowed:Environment:shared',
      'Active:Collection:alpha',
      'Active:Request:beta',
      'Active:Folder:folderOnly',
      'Active:Environment:gamma',
      'Active:Request:shared'
    ]
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
      ...oauth2EditorValues('', {
      GrantTypeSelect: { value: 'deviceCode' },
      TokenTypeSelect: { value: 'MAC' },
      HeaderPrefixInput: { value: 'Token' },
      TokenNameInput: { value: 'Local token' },
      AddAuthDataToSelect: { value: 'query' },
      AccessTokenInput: { value: 'access-token' },
      RefreshTokenInput: { value: 'refresh-token' },
      AutoRefreshTokenInput: { checked: false },
      ShareTokenInput: { checked: true },
      AuthorizationUrlInput: { value: 'https://auth.example.test/authorize' },
      CallbackUrlInput: { value: 'postmeter://oauth/callback' },
      AuthorizeUsingBrowserInput: { checked: true },
      RedirectStrategySelect: { value: 'customScheme' },
      DeviceAuthorizationUrlInput: { value: 'https://auth.example.test/device' },
      TokenUrlInput: { value: 'https://auth.example.test/token' },
      RefreshTokenUrlInput: { value: 'https://auth.example.test/refresh' },
      ClientIdInput: { value: 'client-id' },
      ClientSecretInput: { value: 'client-secret' },
      UsernameInput: { value: '' },
      PasswordInput: { value: '' },
      ScopesInput: { value: 'openid profile' },
      StateInput: { value: 'configured-state' },
      CodeChallengeMethodSelect: { value: 'S256' },
      CodeVerifierInput: { value: '' },
      ClientAuthenticationSelect: { value: 'body' },
      AuthRequestParamKeyInput: { value: 'prompt' },
      AuthRequestParamValueInput: { value: 'consent' },
      TokenRequestParamKeyInput: { value: 'resource' },
      TokenRequestParamValueInput: { value: 'postmeter-api' },
      TokenRequestParamSendInSelect: { value: 'body' },
      RefreshRequestParamKeyInput: { value: 'X-Refresh-Trace' },
      RefreshRequestParamValueInput: { value: 'trace' },
      RefreshRequestParamSendInSelect: { value: 'header' },
      UserCodeInput: { value: 'NEXT-CODE' }
      }),
      ...oauth1EditorValues(),
      ...hawkEditorValues(),
      ...awsEditorValues(),
      ...ntlmEditorValues(),
      ...akamaiEditorValues(),
      ...jwtEditorValues(),
      ...asapEditorValues(),
      ['authDigestUsernameInput', { value: '' }],
    ['authDigestPasswordInput', { value: '' }],
    ['authDigestDisableRetryingRequestInput', { checked: false }],
    ['authDigestRealmInput', { value: '' }],
    ['authDigestNonceInput', { value: '' }],
    ['authDigestAlgorithmSelect', { value: 'MD5' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '' }],
    ['authDigestClientNonceInput', { value: '' }],
    ['authDigestOpaqueInput', { value: '' }],
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
    headerPrefix: 'Token',
    tokenName: 'Local token',
    addAuthDataTo: 'query',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    autoRefreshToken: false,
    shareToken: true,
    tokenUrl: 'https://auth.example.test/token',
    refreshTokenUrl: 'https://auth.example.test/refresh',
    authorizationUrl: 'https://auth.example.test/authorize',
    deviceAuthorizationUrl: 'https://auth.example.test/device',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    username: '',
    password: '',
    scopes: 'openid profile',
    state: 'configured-state',
    codeChallengeMethod: 'S256',
    codeVerifier: '',
    authorizeUsingBrowser: true,
    clientAuthentication: 'body',
    authRequestParams: [
      { enabled: true, key: 'prompt', value: 'consent' }
    ],
    tokenRequestParams: [
      { enabled: true, key: 'resource', value: 'postmeter-api', sendIn: 'body' }
    ],
    refreshRequestParams: [
      { enabled: true, key: 'X-Refresh-Trace', value: 'trace', sendIn: 'header' }
    ],
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

test('request editor panels read Digest auth editor inputs', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'digest' }],
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
      ...oauth2EditorValues(),
      ...oauth1EditorValues(),
      ...hawkEditorValues(),
      ...awsEditorValues(),
      ...ntlmEditorValues(),
      ...akamaiEditorValues(),
      ...jwtEditorValues(),
      ...asapEditorValues(),
      ['authDigestUsernameInput', { value: 'ada' }],
    ['authDigestPasswordInput', { value: 'secret' }],
    ['authDigestDisableRetryingRequestInput', { checked: true }],
    ['authDigestRealmInput', { value: 'postmeter' }],
    ['authDigestNonceInput', { value: 'abc123' }],
    ['authDigestAlgorithmSelect', { value: 'SHA-256' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '00000005' }],
    ['authDigestClientNonceInput', { value: '0a4f113b' }],
    ['authDigestOpaqueInput', { value: 'opaque-token' }],
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

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), {
    type: 'digest',
    username: 'ada',
    password: 'secret',
    disableRetryingRequest: true,
    realm: 'postmeter',
    nonce: 'abc123',
    algorithm: 'SHA-256',
    qop: 'auth',
    opaque: 'opaque-token',
    clientNonce: '0a4f113b',
    nonceCount: '00000005'
  });
});

test('request editor panels read Hawk auth editor inputs', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'hawk' }],
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
    ...oauth2EditorValues(),
    ...oauth1EditorValues(),
    ...hawkEditorValues('', {
      AuthIdInput: { value: 'hawk-id' },
      AuthKeyInput: { value: 'hawk-key' },
      AlgorithmSelect: { value: 'sha1' },
      UserInput: { value: 'ada' },
      NonceInput: { value: 'nonce-value' },
      ExtraDataInput: { value: 'extra-data' },
      AppInput: { value: 'postmeter-app' },
      DelegationInput: { value: 'delegated-by' },
      TimestampInput: { value: '1777291200' },
      IncludePayloadHashInput: { checked: true }
    }),
    ...awsEditorValues(),
    ...ntlmEditorValues(),
    ...akamaiEditorValues(),
    ...jwtEditorValues(),
    ...asapEditorValues(),
    ['authDigestUsernameInput', { value: '' }],
    ['authDigestPasswordInput', { value: '' }],
    ['authDigestDisableRetryingRequestInput', { checked: false }],
    ['authDigestRealmInput', { value: '' }],
    ['authDigestNonceInput', { value: '' }],
    ['authDigestAlgorithmSelect', { value: 'MD5' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '' }],
    ['authDigestClientNonceInput', { value: '' }],
    ['authDigestOpaqueInput', { value: '' }],
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

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), {
    type: 'hawk',
    authId: 'hawk-id',
    authKey: 'hawk-key',
    algorithm: 'sha1',
    user: 'ada',
    nonce: 'nonce-value',
    extraData: 'extra-data',
    app: 'postmeter-app',
    delegation: 'delegated-by',
    timestamp: '1777291200',
    includePayloadHash: true
  });
});

test('request editor panels read AWS Signature auth editor inputs', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'aws' }],
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
    ...oauth2EditorValues(),
    ...oauth1EditorValues(),
    ...hawkEditorValues(),
    ...awsEditorValues('', {
      AccessKeyInput: { value: 'AKIDEXAMPLE' },
      SecretKeyInput: { value: 'aws-secret' },
      AddAuthDataToSelect: { value: 'query' },
      RegionInput: { value: 'us-east-1' },
      ServiceInput: { value: 'execute-api' },
      SessionTokenInput: { value: 'session-token' }
    }),
    ...ntlmEditorValues(),
    ...akamaiEditorValues(),
    ...jwtEditorValues(),
    ...asapEditorValues(),
    ['authDigestUsernameInput', { value: '' }],
    ['authDigestPasswordInput', { value: '' }],
    ['authDigestDisableRetryingRequestInput', { checked: false }],
    ['authDigestRealmInput', { value: '' }],
    ['authDigestNonceInput', { value: '' }],
    ['authDigestAlgorithmSelect', { value: 'MD5' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '' }],
    ['authDigestClientNonceInput', { value: '' }],
    ['authDigestOpaqueInput', { value: '' }],
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

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), {
    type: 'aws',
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'aws-secret',
    region: 'us-east-1',
    service: 'execute-api',
    sessionToken: 'session-token',
    addAuthDataToQuery: true
  });
});

test('request editor panels read NTLM Akamai JWT Bearer and ASAP auth editor inputs', () => {
  const baseValues = () => new Map([
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
    ...oauth2EditorValues(),
    ...oauth1EditorValues(),
    ...hawkEditorValues(),
    ...awsEditorValues(),
    ['authDigestUsernameInput', { value: '' }],
    ['authDigestPasswordInput', { value: '' }],
    ['authDigestDisableRetryingRequestInput', { checked: false }],
    ['authDigestRealmInput', { value: '' }],
    ['authDigestNonceInput', { value: '' }],
    ['authDigestAlgorithmSelect', { value: 'MD5' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '' }],
    ['authDigestClientNonceInput', { value: '' }],
    ['authDigestOpaqueInput', { value: '' }],
    ['authClientPfxPathInput', { value: '' }],
    ['authClientCertPathInput', { value: '' }],
    ['authClientKeyPathInput', { value: '' }],
    ['authClientCaPathInput', { value: '' }],
    ['authClientPassphraseInput', { value: '' }]
  ]);
  const collect = (entries) => {
    const values = baseValues();
    for (const [key, value] of entries) {
      values.set(key, value);
    }
    return collectAuthFromEditor({
      doc: {
        getElementById(id) {
          const value = values.get(id);
          if (!value) {
            throw new Error(`Unexpected element lookup: ${id}`);
          }
          return value;
        }
      }
    });
  };

  assert.deepEqual(collect([
    ['authTypeSelect', { value: 'ntlm' }],
    ...ntlmEditorValues('', {
      UsernameInput: { value: 'ada' },
      PasswordInput: { value: 'secret' },
      DisableRetryingRequestInput: { checked: true },
      DomainInput: { value: 'POSTMETER' },
      WorkstationInput: { value: 'WORKSTATION' }
    }),
    ...akamaiEditorValues(),
    ...jwtEditorValues(),
    ...asapEditorValues()
  ]), {
    type: 'ntlm',
    username: 'ada',
    password: 'secret',
    disableRetryingRequest: true,
    domain: 'POSTMETER',
    workstation: 'WORKSTATION'
  });

  assert.deepEqual(collect([
    ['authTypeSelect', { value: 'akamaiEdgeGrid' }],
    ...ntlmEditorValues(),
    ...akamaiEditorValues('', {
      AccessTokenInput: { value: 'access' },
      ClientTokenInput: { value: 'client' },
      ClientSecretInput: { value: 'secret' },
      NonceInput: { value: 'nonce' },
      TimestampInput: { value: 'timestamp' },
      BaseUrlInput: { value: 'https://edge.example.test' },
      HeadersToSignInput: { value: 'x-one x-two' },
      MaxBodySizeInput: { value: '1024' }
    }),
    ...jwtEditorValues(),
    ...asapEditorValues()
  ]), {
    type: 'akamaiEdgeGrid',
    accessToken: 'access',
    clientToken: 'client',
    clientSecret: 'secret',
    nonce: 'nonce',
    timestamp: 'timestamp',
    baseUrl: 'https://edge.example.test',
    headersToSign: 'x-one x-two',
    maxBodySize: '1024'
  });

  assert.deepEqual(collect([
    ['authTypeSelect', { value: 'jwtBearer' }],
    ...ntlmEditorValues(),
    ...akamaiEditorValues(),
    ...jwtEditorValues('', {
      AlgorithmSelect: { value: 'PS256', closest: () => null },
      PrivateKeyInput: { value: 'private-key' },
      PayloadInput: { value: '{"claim":true}' },
      HeaderPrefixInput: { value: 'JWT' },
      HeadersInput: { value: '{"kid":"jwt-kid"}' },
      AddTokenToSelect: { value: 'query' }
    }),
    ...asapEditorValues()
  ]), {
    type: 'jwtBearer',
    algorithm: 'PS256',
    secret: '',
    secretBase64Encoded: false,
    privateKey: 'private-key',
    keyId: '',
    issuer: '',
    subject: '',
    audience: '',
    expiresIn: '300',
    claims: '{"claim":true}',
    jwtHeaders: '{"kid":"jwt-kid"}',
    headerPrefix: 'JWT',
    addTokenTo: 'query'
  });

  assert.deepEqual(collect([
    ['authTypeSelect', { value: 'asap' }],
    ...ntlmEditorValues(),
    ...akamaiEditorValues(),
    ...jwtEditorValues(),
    ...asapEditorValues('', {
      AlgorithmSelect: { value: 'ES256' },
      IssuerInput: { value: 'issuer' },
      AudienceInput: { value: 'audience' },
      KeyIdInput: { value: 'kid' },
      PrivateKeyInput: { value: 'private-key' },
      SubjectInput: { value: 'subject' },
      AdditionalClaimsInput: { value: '{"scope":["read","write"],"tenant":"postmeter"}' },
      ExpiresInInput: { value: '60' }
    })
  ]), {
    type: 'asap',
    algorithm: 'ES256',
    privateKey: 'private-key',
    secret: '',
    issuer: 'issuer',
    subject: 'subject',
    audience: 'audience',
    keyId: 'kid',
    expiresIn: '60',
    additionalClaims: '{"scope":["read","write"],"tenant":"postmeter"}'
  });
});

test('request editor panels read OAuth 1.0 auth editor inputs', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'oauth1' }],
    ['authBearerTokenInput', { value: '' }],
    ['authBasicUsernameInput', { value: '' }],
    ['authBasicPasswordInput', { value: '' }],
    ['authApiKeyLocationSelect', { value: 'header' }],
    ['authApiKeyNameInput', { value: '' }],
    ['authApiKeyValueInput', { value: '' }],
    ['authCookieValueInput', { value: '' }],
      ...oauth2EditorValues(),
      ...oauth1EditorValues('', {
      SignatureMethodSelect: { value: 'HMAC-SHA256' },
      ConsumerKeyInput: { value: 'consumer' },
      ConsumerSecretInput: { value: 'consumer-secret' },
      TokenInput: { value: 'token' },
      TokenSecretInput: { value: 'token-secret' },
      PrivateKeyInput: { value: 'private-key' },
      AddAuthDataToSelect: { value: 'queryOrBody' },
      CallbackInput: { value: 'https://client.example.test/callback' },
      VerifierInput: { value: 'verifier' },
      TimestampInput: { value: '1777291200' },
      NonceInput: { value: 'nonce' },
      VersionInput: { value: '1.0' },
      RealmInput: { value: 'postmeter' },
      IncludeBodyHashInput: { checked: true },
      AddEmptyParamsToSignInput: { checked: true }
      }),
      ...hawkEditorValues(),
      ...awsEditorValues(),
      ...ntlmEditorValues(),
      ...akamaiEditorValues(),
      ...jwtEditorValues(),
      ...asapEditorValues(),
      ['authDigestUsernameInput', { value: '' }],
    ['authDigestPasswordInput', { value: '' }],
    ['authDigestDisableRetryingRequestInput', { checked: false }],
    ['authDigestRealmInput', { value: '' }],
    ['authDigestNonceInput', { value: '' }],
    ['authDigestAlgorithmSelect', { value: 'MD5' }],
    ['authDigestQopInput', { value: 'auth' }],
    ['authDigestNonceCountInput', { value: '' }],
    ['authDigestClientNonceInput', { value: '' }],
    ['authDigestOpaqueInput', { value: '' }],
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

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), {
    type: 'oauth1',
    consumerKey: 'consumer',
    consumerSecret: 'consumer-secret',
    token: 'token',
    tokenSecret: 'token-secret',
    privateKey: 'private-key',
    signatureMethod: 'HMAC-SHA256',
    addAuthDataTo: 'queryOrBody',
    callback: 'https://client.example.test/callback',
    verifier: 'verifier',
    timestamp: '1777291200',
    nonce: 'nonce',
    version: '1.0',
    realm: 'postmeter',
    includeBodyHash: true,
    addEmptyParamsToSign: true
  });
});

test('request editor panels collect OAuth 1.0 RSA auth from the Private Key field', () => {
  const values = new Map([
    ['authTypeSelect', { value: 'oauth1' }],
    ...oauth1EditorValues('', {
      SignatureMethodSelect: { value: 'RSA-SHA512' },
      ConsumerKeyInput: { value: 'consumer' },
      ConsumerSecretInput: { value: '' },
      TokenInput: { value: 'token' },
      TokenSecretInput: { value: '' },
      PrivateKeyInput: { value: 'rsa-private-key' }
    })
  ]);
  const fakeDoc = {
    getElementById(id) {
      return values.get(id) || { checked: false, value: '' };
    }
  };

  assert.deepEqual(collectAuthFromEditor({ doc: fakeDoc }), {
    type: 'oauth1',
    consumerKey: 'consumer',
    consumerSecret: '',
    token: 'token',
    tokenSecret: '',
    privateKey: 'rsa-private-key',
    signatureMethod: 'RSA-SHA512',
    addAuthDataTo: 'header',
    callback: '',
    verifier: '',
    timestamp: '',
    nonce: '',
    version: '1.0',
    realm: '',
    includeBodyHash: false,
    addEmptyParamsToSign: false
  });
});

test('request editor panels toggles OAuth 1.0 RSA-specific fields from the signature method', () => {
  const section = { dataset: {} };
  const signatureSelect = {
    value: 'HMAC-SHA1',
    closest(selector) {
      assert.equal(selector, '[data-auth-section="oauth1"]');
      return section;
    }
  };
  const fakeDoc = {
    getElementById(id) {
      assert.equal(id, 'authOauth1SignatureMethodSelect');
      return signatureSelect;
    }
  };

  syncOauth1SignatureFields({ doc: fakeDoc });
  assert.equal(section.dataset.oauth1SignatureKind, 'shared');

  signatureSelect.value = 'RSA-SHA256';
  syncOauth1SignatureFields({ doc: fakeDoc });
  assert.equal(section.dataset.oauth1SignatureKind, 'rsa');
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
      ...oauth2EditorValues('performance'),
      ...oauth1EditorValues('performance'),
      ...hawkEditorValues('performance'),
      ...awsEditorValues('performance'),
      ...ntlmEditorValues('performance'),
      ...akamaiEditorValues('performance'),
      ...jwtEditorValues('performance'),
      ...asapEditorValues('performance'),
      ['performanceAuthDigestUsernameInput', { value: '' }],
    ['performanceAuthDigestPasswordInput', { value: '' }],
    ['performanceAuthDigestDisableRetryingRequestInput', { checked: false }],
    ['performanceAuthDigestRealmInput', { value: '' }],
    ['performanceAuthDigestNonceInput', { value: '' }],
    ['performanceAuthDigestAlgorithmSelect', { value: 'MD5' }],
    ['performanceAuthDigestQopInput', { value: 'auth' }],
    ['performanceAuthDigestNonceCountInput', { value: '' }],
    ['performanceAuthDigestClientNonceInput', { value: '' }],
    ['performanceAuthDigestOpaqueInput', { value: '' }],
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
