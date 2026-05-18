const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  bindUi,
  closeToolbarMenus,
  initializeRenderer
} = require('../../src/renderer/rendererBootstrap');
const { setContextMenuPeerCloser, showContextMenu } = require('../../src/renderer/contextMenu');

function selectOptionValues(source, id) {
  const match = source.match(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`));
  assert.ok(match, `Expected ${id} select to exist.`);
  return [...match[1].matchAll(/<option value="([^"]+)"/g)].map((optionMatch) => optionMatch[1]);
}

function assertDigestAdvancedMarkup(source, ids) {
  const usernameIndex = source.indexOf(`id="${ids.username}"`);
  assert.notEqual(usernameIndex, -1, `Expected ${ids.username} to exist.`);

  const advancedStart = source.indexOf('<details class="auth-advanced auth-wide">', usernameIndex);
  assert.notEqual(advancedStart, -1, `Expected ${ids.username} Digest advanced disclosure to exist.`);

  const advancedEnd = source.indexOf('</details>', advancedStart);
  assert.notEqual(advancedEnd, -1, `Expected ${ids.username} Digest advanced disclosure to close.`);

  const visibleSource = source.slice(usernameIndex, advancedStart);
  const advancedSource = source.slice(advancedStart, advancedEnd);
  const retryTooltip = 'PostMeter normally retries once after a Digest challenge and uses values from the server response. Disable retry sends only the configured Digest values.';

  assert.match(visibleSource, new RegExp(`id="${ids.password}"`));
  for (const id of ids.advanced) {
    assert.doesNotMatch(visibleSource, new RegExp(`id="${id}"`), `${id} should be inside the Digest advanced disclosure.`);
    assert.match(advancedSource, new RegExp(`id="${id}"`));
  }
  assert.match(advancedSource, /<summary>Advanced<\/summary>/);
  assert.match(advancedSource, /class="checkbox-line auth-wide"/);
  assert.match(advancedSource, /<span>Disable retry<\/span>/);
  assert.ok(advancedSource.includes(`title="${retryTooltip}"`));
}

function assertHawkAdvancedMarkup(source, ids) {
  const authIdIndex = source.indexOf(`id="${ids.authId}"`);
  assert.notEqual(authIdIndex, -1, `Expected ${ids.authId} to exist.`);

  const advancedStart = source.indexOf('<details class="auth-advanced auth-wide">', authIdIndex);
  assert.notEqual(advancedStart, -1, `Expected ${ids.authId} Hawk advanced disclosure to exist.`);

  const advancedEnd = source.indexOf('</details>', advancedStart);
  assert.notEqual(advancedEnd, -1, `Expected ${ids.authId} Hawk advanced disclosure to close.`);

  const visibleSource = source.slice(authIdIndex, advancedStart);
  const advancedSource = source.slice(advancedStart, advancedEnd);

  for (const id of ids.main) {
    assert.match(visibleSource, new RegExp(`id="${id}"`));
  }
  for (const id of ids.advanced) {
    assert.doesNotMatch(visibleSource, new RegExp(`id="${id}"`), `${id} should be inside the Hawk advanced disclosure.`);
    assert.match(advancedSource, new RegExp(`id="${id}"`));
  }
  assert.match(advancedSource, /<summary>Advanced<\/summary>/);
  assert.match(advancedSource, /Include payload hash/);
}

function assertAwsAdvancedMarkup(source, ids) {
  const accessKeyIndex = source.indexOf(`id="${ids.accessKey}"`);
  assert.notEqual(accessKeyIndex, -1, `Expected ${ids.accessKey} to exist.`);

  const advancedStart = source.indexOf('<details class="auth-advanced auth-wide">', accessKeyIndex);
  assert.notEqual(advancedStart, -1, `Expected ${ids.accessKey} AWS advanced disclosure to exist.`);

  const advancedEnd = source.indexOf('</details>', advancedStart);
  assert.notEqual(advancedEnd, -1, `Expected ${ids.accessKey} AWS advanced disclosure to close.`);

  const visibleSource = source.slice(accessKeyIndex, advancedStart);
  const advancedSource = source.slice(advancedStart, advancedEnd);

  for (const id of ids.main) {
    assert.match(visibleSource, new RegExp(`id="${id}"`));
  }
  for (const id of ids.advanced) {
    assert.doesNotMatch(visibleSource, new RegExp(`id="${id}"`), `${id} should be inside the AWS advanced disclosure.`);
    assert.match(advancedSource, new RegExp(`id="${id}"`));
  }
  assert.match(advancedSource, /<summary>Advanced<\/summary>/);
}

function assertOauth1AdvancedMarkup(source, ids) {
  const signatureIndex = source.indexOf(`id="${ids.signatureMethod}"`);
  assert.notEqual(signatureIndex, -1, `Expected ${ids.signatureMethod} to exist.`);

  const advancedStart = source.indexOf('<details class="auth-advanced auth-wide">', signatureIndex);
  assert.notEqual(advancedStart, -1, `Expected ${ids.signatureMethod} OAuth 1.0 advanced disclosure to exist.`);

  const advancedEnd = source.indexOf('</details>', advancedStart);
  assert.notEqual(advancedEnd, -1, `Expected ${ids.signatureMethod} OAuth 1.0 advanced disclosure to close.`);

  const visibleSource = source.slice(signatureIndex, advancedStart);
  const advancedSource = source.slice(advancedStart, advancedEnd);

  for (const id of ids.main) {
    assert.match(visibleSource, new RegExp(`id="${id}"`));
  }
  for (const id of ids.advanced) {
    assert.doesNotMatch(visibleSource, new RegExp(`id="${id}"`), `${id} should be inside the OAuth 1.0 advanced disclosure.`);
    assert.match(advancedSource, new RegExp(`id="${id}"`));
  }
  assert.match(advancedSource, /<summary>Advanced<\/summary>/);
  assert.match(advancedSource, /Include body hash/);
  assert.match(advancedSource, /Add empty parameters to signature/);
}

function assertOauth2AdvancedMarkup(source, ids) {
  const startId = ids.start || ids.grantType;
  const grantIndex = source.indexOf(`id="${startId}"`);
  assert.notEqual(grantIndex, -1, `Expected ${startId} to exist.`);

  const advancedStart = source.indexOf('<details class="auth-advanced auth-wide">', grantIndex);
  assert.notEqual(advancedStart, -1, `Expected ${ids.grantType} OAuth 2.0 advanced disclosure to exist.`);

  const advancedEnd = source.indexOf('</details>', advancedStart);
  assert.notEqual(advancedEnd, -1, `Expected ${ids.grantType} OAuth 2.0 advanced disclosure to close.`);

  const visibleSource = source.slice(grantIndex, advancedStart);
  const advancedSource = source.slice(advancedStart, advancedEnd);

  for (const id of ids.main) {
    assert.match(visibleSource, new RegExp(`id="${id}"`));
  }
  for (const id of ids.advanced) {
    assert.doesNotMatch(visibleSource, new RegExp(`id="${id}"`), `${id} should be inside the OAuth 2.0 advanced disclosure.`);
    assert.match(advancedSource, new RegExp(`id="${id}"`));
  }
  assert.match(advancedSource, /<summary>Advanced<\/summary>/);
  assert.match(advancedSource, /Refresh Token URL/);
  assert.match(advancedSource, /Auth Request/);
  assert.match(advancedSource, /Token Request/);
  assert.match(advancedSource, /Refresh Request/);
  if (ids.advanced.includes('clearOauthCookiesButton')) {
    assert.match(advancedSource, /Clear cookies/);
  }
}

test('renderer bootstrap initializes theme and runs registered cleanup callbacks on unload', async () => {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const fakeDocument = {
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener(name, handler) {
      windowListeners.set(name, handler);
    }
  };
  const appliedThemes = [];
  let cleanupCount = 0;

  initializeRenderer({
    doc: fakeDocument,
    windowObject: fakeWindow,
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference: () => 'dark',
    onReady: async ({ registerCleanup }) => {
      registerCleanup(() => { cleanupCount += 1; });
      registerCleanup(() => { cleanupCount += 10; });
    }
  });

  assert.deepEqual(appliedThemes, ['dark']);
  await documentListeners.get('DOMContentLoaded')();
  windowListeners.get('beforeunload')();
  assert.equal(cleanupCount, 11);
});

test('renderer bootstrap falls back to the system theme when theme loading throws', () => {
  const appliedThemes = [];
  initializeRenderer({
    doc: { addEventListener() {} },
    windowObject: { addEventListener() {} },
    applyThemePreference: (theme) => appliedThemes.push(theme),
    getStoredThemePreference() {
      throw new Error('storage unavailable');
    }
  });

  assert.deepEqual(appliedThemes, ['system']);
});

test('renderer bootstrap closes toolbar menus and resets trigger aria state', () => {
  const menus = [{ hidden: false }, { hidden: false }];
  const triggers = [
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    },
    {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    }
  ];

  closeToolbarMenus({
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return menus;
      }
      if (selector === '.menu-trigger') {
        return triggers;
      }
      return [];
    }
  });

  assert.equal(menus.every((menu) => menu.hidden === true), true);
  assert.equal(triggers.every((button) => button.attributes['aria-expanded'] === 'false'), true);
});

test('renderer accessibility source keeps splitters body editor and pane save recovery wired', async () => {
  const root = path.join(__dirname, '..', '..');
  const indexSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
  const themeSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'theme.css'), 'utf8');
  const chromeSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'chrome.css'), 'utf8');
  const editorPanelsSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'editorPanels.css'), 'utf8');
  const overlaysSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'overlays.css'), 'utf8');
  const layoutSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'layoutControls.js'), 'utf8');
  const bootstrapSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'rendererBootstrap.js'), 'utf8');
  const rendererSource = await fs.promises.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

  assert.match(indexSource, /id="bodyInput"[^>]+aria-label="Request body"/);
  assert.match(indexSource, /id="graphqlOperationNameField"[\s\S]*id="graphqlOperationNameInput"[\s\S]*id="beautifyBodyButton"/);
  assert.match(indexSource, /id="graphqlQueryInput"[^>]+aria-label="GraphQL query"[^>]+data-code-language="graphql"/);
  assert.match(indexSource, /id="performanceGraphqlOperationNameField"[\s\S]*id="performanceGraphqlOperationNameInput"[\s\S]*id="performanceBeautifyBodyButton"/);
  assert.match(indexSource, /id="performanceGraphqlQueryInput"[^>]+aria-label="Performance GraphQL query"[^>]+data-code-language="graphql"/);
  assert.match(indexSource, /id="exportItemModal"/);
  assert.match(indexSource, /id="exportItemList"[^>]+role="radiogroup"/);
  assert.match(indexSource, /id="confirmExportItemButton"[^>]+disabled/);
  assert.match(indexSource, /id="requestExportPickerModal"[^>]+runner-import-modal/);
  assert.match(indexSource, /id="requestExportPickerList"[^>]+runner-import-list/);
  assert.match(indexSource, /id="confirmRequestExportPickerButton"[^>]+disabled/);
  assert.match(indexSource, /id="folderDestinationModal"/);
  assert.match(indexSource, /id="folderDestinationList"[^>]+role="radiogroup"/);
  assert.match(indexSource, /id="confirmFolderDestinationButton"[^>]+disabled/);
  assert.match(overlaysSource, /#notificationModalMessage\s*\{[\s\S]*white-space:\s*pre-line/);
  assert.match(indexSource, /id="csvVariablesModal"/);
  assert.match(indexSource, /id="runnerCsvVariablesButton"/);
  assert.match(indexSource, /id="runnerToggleCsvVariablesButton"/);
  assert.match(indexSource, /id="runnerEditCsvVariablesButton"/);
  assert.match(indexSource, /id="runnerAuthRefreshMenu"[\s\S]*id="runnerToggleAuthRefreshButton"[\s\S]*Turn On[\s\S]*id="runnerEditAuthRefreshButton"[\s\S]*Edit/);
  assert.match(indexSource, /id="performanceAuthRefreshMenu"[\s\S]*id="performanceToggleAuthRefreshButton"[\s\S]*Turn On[\s\S]*id="performanceEditAuthRefreshButton"[\s\S]*Edit/);
  assert.doesNotMatch(indexSource, /Refresh auth during run/);
  assert.match(indexSource, /id="runnerAuthRefreshManageRequestButton"[^>]*>Manage<\/button>/);
  assert.match(indexSource, /id="runnerAuthRefreshAutoDetectRequestButton"[^>]*>Auto-Detect<\/button>/);
  assert.match(indexSource, /id="runnerAuthRefreshRemoveRequestButton"[^>]*class="danger-button"[^>]*>Remove<\/button>/);
  assert.match(indexSource, /id="runnerAuthRefreshTokenManageRequestButton"[^>]*>Manage<\/button>/);
  assert.match(indexSource, /id="runnerAuthRefreshTokenAutoDetectRequestButton"[^>]*>Auto-Detect<\/button>/);
  assert.match(indexSource, /id="runnerAuthRefreshTokenRemoveRequestButton"[^>]*class="danger-button"[^>]*>Remove<\/button>/);
  assert.match(indexSource, /class="auth-refresh-refresh-token" data-auth-refresh-types="bearer cookie"/);
  assert.match(indexSource, /id="performanceAuthRefreshManageRequestButton"[^>]*>Manage<\/button>/);
  assert.match(indexSource, /id="performanceAuthRefreshAutoDetectRequestButton"[^>]*>Auto-Detect<\/button>/);
  assert.match(indexSource, /id="performanceAuthRefreshRemoveRequestButton"[^>]*class="danger-button"[^>]*>Remove<\/button>/);
  assert.match(indexSource, /id="performanceAuthRefreshTokenManageRequestButton"[^>]*>Manage<\/button>/);
  assert.match(indexSource, /id="performanceAuthRefreshTokenAutoDetectRequestButton"[^>]*>Auto-Detect<\/button>/);
  assert.match(indexSource, /id="performanceAuthRefreshTokenRemoveRequestButton"[^>]*class="danger-button"[^>]*>Remove<\/button>/);
  assert.match(indexSource, /id="authRefreshAutoDetectModal"[^>]+auth-refresh-auto-detect-modal/);
  assert.match(indexSource, /id="authRefreshAutoDetectList"[^>]+role="radiogroup"/);
  assert.match(indexSource, /id="confirmAuthRefreshAutoDetectButton"[^>]+disabled/);
  assert.match(indexSource, /src="authRefreshAutoDetectModel\.js"/);
  assert.match(chromeSource, /\.auth-refresh-menu-group > \.auth-refresh-trigger\.auth-refresh-active[\s\S]*border-color:\s*var\(--green\)/);
  assert.match(overlaysSource, /\.auth-refresh-auto-detect-modal\s*\{[\s\S]*width:\s*min\(720px/);
  assert.match(chromeSource, /\.auth-refresh-manage-menu-group \.toolbar-menu[\s\S]*right:\s*0/);
  assert.match(chromeSource, /\.capture-settings-panel\.auth-refresh-panel[\s\S]*max-height:\s*calc\(100vh - 24px\)/);
  assert.doesNotMatch(chromeSource, /\.capture-settings-panel\.auth-refresh-panel[\s\S]{0,180}max-height:\s*min\(560px/);
  assert.match(rendererSource, /classList\.toggle\('auth-refresh-active', active\)/);
  assert.match(rendererSource, /autoSelectRefreshingAuthAccessTokenForOwner\('performance', test, previousAuthRefresh, test\.authRefresh\)/);
  assert.match(rendererSource, /performanceRefreshingAuthAccessTokenAvailable\(auth, authRefresh\)/);
  assert.match(rendererSource, /syncPerformanceRefreshingAuthTypeLock\(auth, authRefresh\)/);
  assert.match(rendererSource, /runnerRequestRefreshingAuthField\(runner, request\)/);
  assert.match(rendererSource, /refreshingAuthOriginalAuth/);
  assert.match(rendererSource, /autoSelectRefreshingAuthRefreshTokenForAccessRequest\(ownerType, owner\)/);
  assert.match(rendererSource, /requestKind === 'refreshToken' \|\| requestKind === 'access'/);
  assert.match(rendererSource, /function removeAuthRefreshRequest\(ownerType, requestKind = 'access'\)/);
  assert.match(rendererSource, /async function autoDetectAuthRefreshRequest\(ownerType, requestKind = 'access'\)/);
  assert.match(rendererSource, /buildAuthRefreshAutoDetectCandidates\(response\)/);
  assert.match(rendererSource, /function confirmAuthRefreshAutoDetectModal\(\)/);
  assert.match(rendererSource, /apiKey:\s*\{\s*label:\s*'API key',\s*controlName:\s*'ApiKey'\s*\}/);
  assert.doesNotMatch(rendererSource, /oauth2:\s*\{\s*label:\s*'OAuth access token'/);
  assert.match(rendererSource, /aws:\s*\{\s*label:\s*'AWS access key ID',\s*controlName:\s*'AwsAccessKey'\s*\}/);
  assert.match(rendererSource, /custom:\s*\{\s*label:\s*'custom header value',\s*controlName:\s*'Custom'\s*\}/);
  assert.match(rendererSource, /REFRESHING_AUTH_API_KEY_LABEL = 'Use Refreshing API Key'/);
  assert.match(rendererSource, /label:\s*'cookie'[\s\S]*allowedSources:\s*\['cookie'\]/);
  assert.match(rendererSource, /removeOpenAuthRefreshRequestTab\(ownerType, owner\.id, requestId\)/);
  assert.match(rendererSource, /syncVisibleRefreshingAuthTypeOptionsForOwner\(prefix, next\)/);
  assert.match(indexSource, /Refresh token request/);
  assert.match(indexSource, /id="runnerAuthRefreshTypeSelect"[\s\S]*Bearer \/ JWT[\s\S]*AWS Temporary Credentials/);
  assert.match(indexSource, /id="performanceAuthRefreshTypeSelect"[\s\S]*API Key[\s\S]*Custom Header/);
  assert.doesNotMatch(indexSource, /OAuth 2\.0 Request Auth/);
  assert.equal(selectOptionValues(indexSource, 'authTypeSelect').includes('cookie'), false);
  assert.equal(selectOptionValues(indexSource, 'performanceAuthTypeSelect').includes('cookie'), false);
  const postmanAuthOrder = [
    'none',
    'basic',
    'bearer',
    'jwtBearer',
    'digest',
    'oauth1',
    'oauth2',
    'hawk',
    'aws',
    'ntlm',
    'apiKey',
    'akamaiEdgeGrid',
    'asap'
  ];
  assert.deepEqual(selectOptionValues(indexSource, 'authTypeSelect'), postmanAuthOrder);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthTypeSelect'), postmanAuthOrder);
  assert.deepEqual(selectOptionValues(indexSource, 'runnerAuthRefreshTypeSelect'), ['bearer', 'apiKey', 'cookie', 'aws', 'custom']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthRefreshTypeSelect'), ['bearer', 'apiKey', 'cookie', 'aws', 'custom']);
  assert.doesNotMatch(indexSource, /<option value="oauth2">OAuth 2<\/option>/);
  assert.equal(selectOptionValues(indexSource, 'runnerAuthRefreshTypeSelect').includes('cookie'), true);
  assert.equal(selectOptionValues(indexSource, 'performanceAuthRefreshTypeSelect').includes('cookie'), true);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauthAddAuthDataToSelect'), ['header', 'query']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauthAddAuthDataToSelect'), ['header', 'query']);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauthGrantTypeSelect'), [
    'authorizationCode',
    'authorizationCodePkce',
    'implicit',
    'passwordCredentials',
    'clientCredentials'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauthGrantTypeSelect'), [
    'authorizationCode',
    'authorizationCodePkce',
    'implicit',
    'passwordCredentials',
    'clientCredentials'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauthClientAuthenticationSelect'), ['basic', 'body']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauthClientAuthenticationSelect'), ['basic', 'body']);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauthCodeChallengeMethodSelect'), ['S256', 'plain']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauthCodeChallengeMethodSelect'), ['S256', 'plain']);
  assert.doesNotMatch(indexSource, />Device Authorization URL</);
  assert.doesNotMatch(indexSource, />Redirect Strategy</);
  assert.doesNotMatch(indexSource, />User Code</);
  assert.doesNotMatch(indexSource, />Verification URL</);
  assert.doesNotMatch(indexSource, />Start Device Flow</);
  assert.doesNotMatch(indexSource, />Cancel OAuth</);
  assert.doesNotMatch(indexSource, /id="startDeviceFlowButton"/);
  assert.doesNotMatch(indexSource, /id="cancelOauthFlowButton"/);
  assert.deepEqual(selectOptionValues(indexSource, 'authDigestAlgorithmSelect'), [
    'MD5',
    'MD5-sess',
    'SHA-256',
    'SHA-256-sess',
    'SHA-512-256',
    'SHA-512-256-sess'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthDigestAlgorithmSelect'), [
    'MD5',
    'MD5-sess',
    'SHA-256',
    'SHA-256-sess',
    'SHA-512-256',
    'SHA-512-256-sess'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'authHawkAlgorithmSelect'), ['sha256', 'sha1']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthHawkAlgorithmSelect'), ['sha256', 'sha1']);
  assert.deepEqual(selectOptionValues(indexSource, 'authAwsAddAuthDataToSelect'), ['header', 'query']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthAwsAddAuthDataToSelect'), ['header', 'query']);
  assert.deepEqual(selectOptionValues(indexSource, 'authJwtAlgorithmSelect'), [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthJwtAlgorithmSelect'), [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'authAsapAlgorithmSelect'), [
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthAsapAlgorithmSelect'), [
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512'
  ]);
  assert.match(editorPanelsSource, /\.auth-section\[data-auth-section="jwtBearer"\]:not\(\[data-jwt-algorithm-kind="private"\]\) \[data-jwt-mode="private"\]/);
  assert.match(indexSource, /data-auth-section="ntlm"[\s\S]*id="authNtlmUsernameInput"[\s\S]*<summary>Advanced<\/summary>[\s\S]*id="authNtlmDomainInput"[\s\S]*id="authNtlmWorkstationInput"/);
  assert.match(indexSource, /data-auth-section="akamaiEdgeGrid"[\s\S]*id="authAkamaiAccessTokenInput"[\s\S]*<summary>Advanced<\/summary>[\s\S]*id="authAkamaiNonceInput"[\s\S]*id="authAkamaiMaxBodySizeInput"/);
  assert.match(indexSource, /data-auth-section="asap"[\s\S]*id="authAsapAlgorithmSelect"[\s\S]*id="authAsapPrivateKeyInput"[\s\S]*<summary>Advanced<\/summary>[\s\S]*id="authAsapSubjectInput"[\s\S]*id="authAsapAdditionalClaimsInput"[\s\S]*id="authAsapExpiresInInput"/);
  assert.doesNotMatch(indexSource, /id="authAsapHeaderPrefixInput"|id="performanceAuthAsapHeaderPrefixInput"/);
  assert.match(indexSource, /data-auth-section="jwtBearer"[\s\S]*id="authJwtAlgorithmSelect"[\s\S]*id="authJwtPayloadInput"[\s\S]*<summary>Advanced<\/summary>[\s\S]*id="authJwtHeadersInput"/);
  assert.doesNotMatch(indexSource, /id="authJwtQueryParamNameInput"|id="performanceAuthJwtQueryParamNameInput"|Query param name/);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauth1SignatureMethodSelect'), [
    'HMAC-SHA1',
    'HMAC-SHA256',
    'HMAC-SHA512',
    'RSA-SHA1',
    'RSA-SHA256',
    'RSA-SHA512',
    'PLAINTEXT'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauth1SignatureMethodSelect'), [
    'HMAC-SHA1',
    'HMAC-SHA256',
    'HMAC-SHA512',
    'RSA-SHA1',
    'RSA-SHA256',
    'RSA-SHA512',
    'PLAINTEXT'
  ]);
  assert.deepEqual(selectOptionValues(indexSource, 'authOauth1AddAuthDataToSelect'), ['header', 'queryOrBody']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthOauth1AddAuthDataToSelect'), ['header', 'queryOrBody']);
  assertOauth2AdvancedMarkup(indexSource, {
    start: 'authOauthTokenNameInput',
    grantType: 'authOauthGrantTypeSelect',
    main: [
      'authOauthTokenNameInput',
      'authOauthGrantTypeSelect',
      'authOauthCallbackUrlInput',
      'authOauthAuthorizeUsingBrowserInput',
      'authOauthAuthorizationUrlInput',
      'authOauthTokenUrlInput',
      'authOauthClientIdInput',
      'authOauthClientSecretInput',
      'authOauthUsernameInput',
      'authOauthPasswordInput',
      'authOauthScopesInput',
      'authOauthStateInput',
      'authOauthCodeChallengeMethodSelect',
      'authOauthCodeVerifierInput',
      'authOauthClientAuthenticationSelect'
    ],
    advanced: [
      'authOauthRefreshTokenUrlInput',
      'authOauthAuthRequestParamKeyInput',
      'authOauthAuthRequestParamValueInput',
      'authOauthTokenRequestParamKeyInput',
      'authOauthTokenRequestParamValueInput',
      'authOauthTokenRequestParamSendInSelect',
      'authOauthRefreshRequestParamKeyInput',
      'authOauthRefreshRequestParamValueInput',
      'authOauthRefreshRequestParamSendInSelect',
      'clearOauthCookiesButton'
    ]
  });
  assert.match(indexSource, /id="authOauthRefreshTokenInput" type="hidden"/);
  assert.doesNotMatch(indexSource, /<span>Refresh Token<\/span>\s*<input id="authOauthRefreshTokenInput"/);
  assert.match(indexSource, /id="authOauthAutoRefreshTokenInput" type="checkbox"[\s\S]*Auto-refresh Token/);
  assert.match(indexSource, /id="authOauthShareTokenInput" type="checkbox"[\s\S]*Share Token/);
  assertOauth2AdvancedMarkup(indexSource, {
    start: 'performanceAuthOauthTokenNameInput',
    grantType: 'performanceAuthOauthGrantTypeSelect',
    main: [
      'performanceAuthOauthTokenNameInput',
      'performanceAuthOauthGrantTypeSelect',
      'performanceAuthOauthCallbackUrlInput',
      'performanceAuthOauthAuthorizeUsingBrowserInput',
      'performanceAuthOauthAuthorizationUrlInput',
      'performanceAuthOauthTokenUrlInput',
      'performanceAuthOauthClientIdInput',
      'performanceAuthOauthClientSecretInput',
      'performanceAuthOauthUsernameInput',
      'performanceAuthOauthPasswordInput',
      'performanceAuthOauthScopesInput',
      'performanceAuthOauthStateInput',
      'performanceAuthOauthCodeChallengeMethodSelect',
      'performanceAuthOauthCodeVerifierInput',
      'performanceAuthOauthClientAuthenticationSelect'
    ],
    advanced: [
      'performanceAuthOauthRefreshTokenUrlInput',
      'performanceAuthOauthAuthRequestParamKeyInput',
      'performanceAuthOauthAuthRequestParamValueInput',
      'performanceAuthOauthTokenRequestParamKeyInput',
      'performanceAuthOauthTokenRequestParamValueInput',
      'performanceAuthOauthTokenRequestParamSendInSelect',
      'performanceAuthOauthRefreshRequestParamKeyInput',
      'performanceAuthOauthRefreshRequestParamValueInput',
      'performanceAuthOauthRefreshRequestParamSendInSelect'
    ]
  });
  assert.match(indexSource, /id="performanceAuthOauthRefreshTokenInput" type="hidden"/);
  assert.doesNotMatch(indexSource, /<span>Refresh Token<\/span>\s*<input id="performanceAuthOauthRefreshTokenInput"/);
  assert.match(indexSource, /id="performanceAuthOauthAutoRefreshTokenInput" type="checkbox"[\s\S]*Auto-refresh Token/);
  assert.match(indexSource, /id="performanceAuthOauthShareTokenInput" type="checkbox"[\s\S]*Share Token/);
  assert.match(editorPanelsSource, /\[data-oauth2-grant-field\]\s*\{/);
  assert.match(editorPanelsSource, /data-oauth2-grant-type="passwordCredentials"/);
  assert.match(editorPanelsSource, /data-oauth2-grant-type="authorizationCodePkce"/);
  assert.match(editorPanelsSource, /\.auth-section\[data-auth-section="oauth1"\]:not\(\[data-oauth1-signature-kind="rsa"\]\) \[data-oauth1-mode="rsa"\]/);
  assert.match(editorPanelsSource, /\.auth-section\[data-auth-section="oauth1"\]\[data-oauth1-signature-kind="rsa"\] \[data-oauth1-mode="shared"\]/);
  assert.match(indexSource, /data-oauth1-mode="shared"[\s\S]*id="authOauth1ConsumerSecretInput"/);
  assert.match(indexSource, /data-oauth1-mode="shared"[\s\S]*id="authOauth1TokenSecretInput"/);
  assert.match(indexSource, /data-oauth1-mode="rsa"[\s\S]*id="authOauth1PrivateKeyInput"/);
  assert.match(indexSource, /data-oauth1-mode="rsa"[\s\S]*id="performanceAuthOauth1PrivateKeyInput"/);
  assertOauth1AdvancedMarkup(indexSource, {
    signatureMethod: 'authOauth1SignatureMethodSelect',
    main: [
      'authOauth1ConsumerKeyInput',
      'authOauth1ConsumerSecretInput',
      'authOauth1TokenInput',
      'authOauth1TokenSecretInput',
      'authOauth1PrivateKeyInput',
      'authOauth1AddAuthDataToSelect'
    ],
    advanced: [
      'authOauth1CallbackInput',
      'authOauth1VerifierInput',
      'authOauth1TimestampInput',
      'authOauth1NonceInput',
      'authOauth1VersionInput',
      'authOauth1RealmInput',
      'authOauth1IncludeBodyHashInput',
      'authOauth1AddEmptyParamsToSignInput'
    ]
  });
  assertOauth1AdvancedMarkup(indexSource, {
    signatureMethod: 'performanceAuthOauth1SignatureMethodSelect',
    main: [
      'performanceAuthOauth1ConsumerKeyInput',
      'performanceAuthOauth1ConsumerSecretInput',
      'performanceAuthOauth1TokenInput',
      'performanceAuthOauth1TokenSecretInput',
      'performanceAuthOauth1PrivateKeyInput',
      'performanceAuthOauth1AddAuthDataToSelect'
    ],
    advanced: [
      'performanceAuthOauth1CallbackInput',
      'performanceAuthOauth1VerifierInput',
      'performanceAuthOauth1TimestampInput',
      'performanceAuthOauth1NonceInput',
      'performanceAuthOauth1VersionInput',
      'performanceAuthOauth1RealmInput',
      'performanceAuthOauth1IncludeBodyHashInput',
      'performanceAuthOauth1AddEmptyParamsToSignInput'
    ]
  });
  assertDigestAdvancedMarkup(indexSource, {
    username: 'authDigestUsernameInput',
    password: 'authDigestPasswordInput',
    advanced: [
      'authDigestDisableRetryingRequestInput',
      'authDigestRealmInput',
      'authDigestNonceInput',
      'authDigestAlgorithmSelect',
      'authDigestQopInput',
      'authDigestNonceCountInput',
      'authDigestClientNonceInput',
      'authDigestOpaqueInput'
    ]
  });
  assertDigestAdvancedMarkup(indexSource, {
    username: 'performanceAuthDigestUsernameInput',
    password: 'performanceAuthDigestPasswordInput',
    advanced: [
      'performanceAuthDigestDisableRetryingRequestInput',
      'performanceAuthDigestRealmInput',
      'performanceAuthDigestNonceInput',
      'performanceAuthDigestAlgorithmSelect',
      'performanceAuthDigestQopInput',
      'performanceAuthDigestNonceCountInput',
      'performanceAuthDigestClientNonceInput',
      'performanceAuthDigestOpaqueInput'
    ]
  });
  assertHawkAdvancedMarkup(indexSource, {
    authId: 'authHawkAuthIdInput',
    main: [
      'authHawkAuthIdInput',
      'authHawkAuthKeyInput',
      'authHawkAlgorithmSelect'
    ],
    advanced: [
      'authHawkUserInput',
      'authHawkNonceInput',
      'authHawkExtraDataInput',
      'authHawkAppInput',
      'authHawkDelegationInput',
      'authHawkTimestampInput',
      'authHawkIncludePayloadHashInput'
    ]
  });
  assertHawkAdvancedMarkup(indexSource, {
    authId: 'performanceAuthHawkAuthIdInput',
    main: [
      'performanceAuthHawkAuthIdInput',
      'performanceAuthHawkAuthKeyInput',
      'performanceAuthHawkAlgorithmSelect'
    ],
    advanced: [
      'performanceAuthHawkUserInput',
      'performanceAuthHawkNonceInput',
      'performanceAuthHawkExtraDataInput',
      'performanceAuthHawkAppInput',
      'performanceAuthHawkDelegationInput',
      'performanceAuthHawkTimestampInput',
      'performanceAuthHawkIncludePayloadHashInput'
    ]
  });
  assertAwsAdvancedMarkup(indexSource, {
    accessKey: 'authAwsAccessKeyInput',
    main: [
      'authAwsAccessKeyInput',
      'authAwsSecretKeyInput',
      'authAwsAddAuthDataToSelect'
    ],
    advanced: [
      'authAwsRegionInput',
      'authAwsServiceInput',
      'authAwsSessionTokenInput'
    ]
  });
  assertAwsAdvancedMarkup(indexSource, {
    accessKey: 'performanceAuthAwsAccessKeyInput',
    main: [
      'performanceAuthAwsAccessKeyInput',
      'performanceAuthAwsSecretKeyInput',
      'performanceAuthAwsAddAuthDataToSelect'
    ],
    advanced: [
      'performanceAuthAwsRegionInput',
      'performanceAuthAwsServiceInput',
      'performanceAuthAwsSessionTokenInput'
    ]
  });
  assert.doesNotMatch(indexSource, /Yes, disable retrying the request/);
  assert.match(editorPanelsSource, /\.auth-advanced-grid\s*\{/);
  assert.deepEqual(selectOptionValues(indexSource, 'runnerAuthRefreshAccessTokenSourceSelect'), ['body', 'rawBody', 'header', 'cookie']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthRefreshAccessTokenSourceSelect'), ['body', 'rawBody', 'header', 'cookie']);
  for (const id of [
    'runnerAuthRefreshRefreshTokenSourceSelect',
    'runnerAuthRefreshApiKeySourceSelect',
    'runnerAuthRefreshCustomSourceSelect',
    'performanceAuthRefreshRefreshTokenSourceSelect',
    'performanceAuthRefreshApiKeySourceSelect',
    'performanceAuthRefreshCustomSourceSelect'
  ]) {
    assert.deepEqual(selectOptionValues(indexSource, id), ['body', 'rawBody', 'header', 'cookie'], `${id} should expose the supported response sources`);
  }
  assert.deepEqual(selectOptionValues(indexSource, 'runnerAuthRefreshAwsCredentialsSourceSelect'), ['body', 'header', 'cookie']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthRefreshAwsCredentialsSourceSelect'), ['body', 'header', 'cookie']);
  assert.deepEqual(selectOptionValues(indexSource, 'runnerAuthRefreshApiKeyLocationSelect'), ['header', 'query']);
  assert.deepEqual(selectOptionValues(indexSource, 'performanceAuthRefreshApiKeyLocationSelect'), ['header', 'query']);
  assert.doesNotMatch(indexSource, /AuthRefreshCookieSourceSelect/);
  assert.match(rendererSource, /AUTH_REFRESH_OUTPUT_SOURCE_VALUES = new Set\(\['body', 'rawBody', 'header', 'cookie'\]\)/);
  assert.match(rendererSource, /source === 'rawBody'/);
  assert.match(indexSource, /Save Access Token To/);
  assert.doesNotMatch(indexSource, /Save API Key To/);
  assert.match(indexSource, /API Key Name/);
  assert.match(indexSource, /Send API Key As/);
  assert.match(indexSource, /Save Access Key ID To/);
  assert.match(indexSource, /Save Session Token To/);
  assert.match(indexSource, /Access Token Response Path/);
  assert.match(indexSource, /Read Credentials From/);
  assert.match(indexSource, /<summary>Refresh Token<\/summary>/);
  assert.match(indexSource, /<summary>Advanced<\/summary>/);
  assert.match(indexSource, /Save Refresh Token To/);
  assert.match(indexSource, /Refresh Every \(s\)/);
  assert.doesNotMatch(indexSource, /Use Refreshing Access Token/);
  assert.doesNotMatch(indexSource, /Refreshing Auth Refresh Token/);
  assert.match(rendererSource, /REFRESHING_AUTH_ACCESS_TOKEN_LABEL = 'Use Refreshing Access Token'/);
  assert.match(rendererSource, /REFRESHING_AUTH_REFRESH_TOKEN_LABEL = 'Refreshing Auth Refresh Token'/);
  assert.match(rendererSource, /REFRESHING_AUTH_ACCESS_COOKIE_LABEL = 'Use Refreshing Access Cookie'/);
  assert.match(rendererSource, /REFRESHING_AUTH_REFRESH_COOKIE_LABEL = 'Refreshing Auth Refresh Cookie'/);
  assert.doesNotMatch(indexSource, /AuthRefreshMode/);
  assert.doesNotMatch(indexSource, /AuthRefreshTarget/);
  assert.doesNotMatch(indexSource, /Expires At Variable/);
  assert.match(indexSource, /id="performanceCsvVariablesButton"/);
  assert.match(indexSource, /id="performanceToggleCsvVariablesButton"/);
  assert.match(indexSource, /id="performanceEditCsvVariablesButton"/);
  assert.doesNotMatch(indexSource, /id="fileMenuButton"/);
  assert.doesNotMatch(indexSource, /id="fileMenu"/);
  assert.match(indexSource, /id="settingsModal"[^>]+settings-modal/);
  assert.match(indexSource, /id="settingsAppearanceButton"[^>]+data-settings-section="appearance"/);
  assert.match(indexSource, /id="settingsModalsButton"[^>]+data-settings-section="modals"/);
  assert.match(indexSource, /id="themeDarkButton"[^>]+data-theme-option="dark"/);
  assert.match(indexSource, /id="interfaceFontSelect"/);
  assert.match(indexSource, /id="interfaceFontSelect"[\s\S]*value="system-mono"/);
  assert.deepEqual(selectOptionValues(indexSource, 'interfaceFontSizeInput'), ['10', '13', '16', '19']);
  assert.match(indexSource, /id="resetInterfaceTypographyButton"/);
  assert.match(indexSource, /id="editorFontSelect"/);
  assert.match(indexSource, /id="editorFontSelect"[\s\S]*value="georgia"/);
  assert.deepEqual(selectOptionValues(indexSource, 'editorFontSizeInput'), ['10', '13', '16', '19']);
  assert.match(indexSource, /id="resetEditorTypographyButton"/);
  assert.deepEqual(selectOptionValues(indexSource, 'interfaceFontSelect'), selectOptionValues(indexSource, 'editorFontSelect'));
  assert.match(indexSource, /id="showEditorLineNumbersInput"/);
  assert.match(indexSource, /src="vendor\/markdown-it\.min\.js"/);
  assert.match(indexSource, /src="markdownRenderer\.js"/);
  assert.match(indexSource, /id="docsPreview"[^>]+markdown-renderer/);
  assert.match(indexSource, /id="collectionDescriptionPreview"[^>]+markdown-renderer/);
  assert.match(indexSource, /id="requestSettingsTab"[\s\S]*id="requestSslCertificateVerificationInput"/);
  assert.match(indexSource, /id="requestSettingsTab"[\s\S]*id="requestCookieJarEnabledInput"/);
  assert.doesNotMatch(indexSource, /id="requestCookiesTabButton"/);
  assert.match(indexSource, /id="performanceSettingsTab"[\s\S]*id="performanceRequestSslCertificateVerificationInput"/);
  assert.match(indexSource, /id="performanceSettingsTab"[\s\S]*id="performanceRequestCookieJarEnabledInput"/);
  assert.doesNotMatch(indexSource, /id="performanceRequestCookiesTabButton"/);
  assert.doesNotMatch(indexSource, /id="requestCaCertificatePathInput"/);
  assert.match(rendererSource, /request:\s*\[[^\]]*'requestSettingsTab'[^\]]*\]/);
  assert.match(rendererSource, /performanceRequest:\s*\[[^\]]*'performanceSettingsTab'[^\]]*\]/);
  assert.match(rendererSource, /results:\s*\[[^\]]*'responseNetworkTab'[^\]]*\]/);
  assert.match(indexSource, /id="saveOnForceCloseInput"/);
  assert.match(indexSource, /id="closeModalsOnBackdropClickInput"/);
  assert.match(indexSource, /id="includePrereleasesInput"/);
  assert.doesNotMatch(indexSource, /class="toolbar-group theme-control"/);
  assert.match(indexSource, /role="tablist"[^>]+aria-orientation="vertical"/);
  assert.match(layoutSource, /aria-valuemin/);
  assert.match(layoutSource, /aria-valuemax/);
  assert.match(layoutSource, /aria-valuenow/);
  assert.match(layoutSource, /sidebarMinimumWidthPixels/);
  assert.match(themeSource, /--sidebar-rail-width:\s*clamp\(102px,\s*calc\(var\(--ui-font-size\) \* 8\.2\),\s*156px\)/);
  assert.match(chromeSource, /grid-template-columns:\s*max\(var\(--sidebar-width\),\s*var\(--sidebar-min-width\)\)\s+6px\s+minmax\(0,\s*1fr\)/);
  assert.match(layoutSource, /event\.key === 'ArrowLeft'/);
  assert.match(layoutSource, /event\.key === 'ArrowRight'/);
  assert.match(bootstrapSource, /aria-orientation/);
  assert.match(bootstrapSource, /ArrowDown/);
  assert.match(bootstrapSource, /ArrowUp/);
  assert.match(bootstrapSource, /querySelectorAll\?\.\('\.toolbar-submenu-row'\)/);
  assert.match(bootstrapSource, /addEventListener\('mouseenter'/);
  assert.match(bootstrapSource, /activeRow !== submenuRow/);
  assert.match(bootstrapSource, /getSelectedExportItemId/);
  assert.match(bootstrapSource, /getSelectedFolderDestination/);
  assert.match(bootstrapSource, /onToggleRunnerCsvVariables/);
  assert.match(bootstrapSource, /onEditRunnerCsvVariables/);
  assert.match(bootstrapSource, /onTogglePerformanceCsvVariables/);
  assert.match(bootstrapSource, /onEditPerformanceCsvVariables/);
  assert.match(bootstrapSource, /bindClick\(doc, 'beautifyBodyButton', options\.onBeautifyBody/);
  assert.match(bootstrapSource, /bindClick\(doc, 'performanceBeautifyBodyButton', options\.onBeautifyPerformanceBody/);
  assert.match(rendererSource, /CodeEditor\.setLanguage\?\.\(bodyElement\(prefix, 'graphqlQueryInput'\), 'graphql'\)/);
  assert.match(rendererSource, /if \(normalized === 'html' \|\| normalized === 'xml'\) \{\s*return normalized;\s*\}/);
  assert.match(rendererSource, /function beautifyBodyEditor\(prefix\)/);
  assert.match(editorPanelsSource, /\.body-editor-controls \.graphql-operation-field/);
  assert.match(editorPanelsSource, /\.body-beautify-button/);
  assert.doesNotMatch(bootstrapSource, /'fileMenuButton', 'fileMenu'/);
  assert.doesNotMatch(bootstrapSource, /bindClick\(doc, 'openSettingsButton', options\.onOpenSettings\)/);
  assert.match(bootstrapSource, /data-settings-section/);
  assert.match(rendererSource, /async function newFolderFromToolbar/);
  assert.match(rendererSource, /async function openSettingsModal/);
  assert.match(rendererSource, /function selectSettingsSection/);
  assert.match(rendererSource, /function renderSettingsControls/);
  assert.match(rendererSource, /function renderFolderDestinationList/);
  assert.match(rendererSource, /function collectRequestExportEntries/);
  assert.match(rendererSource, /function renderRequestExportPickerList/);
  assert.match(rendererSource, /showModal\('requestExportPickerModal'/);
  assert.match(rendererSource, /postmeter\?\.clipboard\?\.writeText/);
  assert.match(rendererSource, /setContextMenuPeerCloser/);
  assert.match(rendererSource, /Request save failed:/);
  assert.match(rendererSource, /Request Save Failed/);
  assert.match(rendererSource, /Environment save failed:/);
  assert.match(rendererSource, /Environment Save Failed/);
  assert.match(rendererSource, /const previousSettings = structuredClone\(workspace\.settings\)/);
  assert.match(rendererSource, /workspace\.settings = previousSettings/);
  assert.match(indexSource, /<fieldset class="settings-card workspace-diagnostics-panel" aria-describedby="diagnosticsPrivacySummary">/);
  assert.doesNotMatch(indexSource, /diagnosticsSensitiveWarning/);
  for (const id of [
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput',
    'exportDiagnosticsButton'
  ]) {
    assert.doesNotMatch(indexSource, new RegExp(`id="${id}"[^>]+aria-describedby=`));
  }
  assert.match(chromeSource, /\.workspace-diagnostics-panel/);
  assert.match(chromeSource, /\.toolbar-group\s*\{[^}]*background:\s*transparent;/s);
  assert.match(chromeSource, /\.toolbar-group button\s*\{[^}]*min-height:\s*34px;[^}]*background:\s*var\(--surface-muted\);/s);
  assert.match(chromeSource, /\.toolbar-group button\.primary\s*\{[^}]*background:\s*var\(--primary\);/s);
  assert.match(chromeSource, /\.toolbar-menu:has\(\.toolbar-submenu-row:hover\) \.toolbar-submenu-row:not\(:hover\) \.toolbar-submenu/);
  assert.match(chromeSource, /\.toolbar-submenu::before/);
  assert.match(chromeSource, /\.request-tab-method\.method-post/);
  assert.match(chromeSource, /\.request-tab-method\.entity-collection/);
  assert.match(chromeSource, /\.request-tab-method\.entity-runner/);
  assert.match(chromeSource, /\.tree-badge\.entity-collection/);
  assert.match(chromeSource, /\.tree-badge\.entity-performance/);
  assert.match(chromeSource, /\.tree-row\s*\{/);
  assert.match(chromeSource, /\.tree-disclosure\s*,\s*\.tree-disclosure-placeholder/);
  assert.match(rendererSource, /function treeDisclosureButton\(payload, options = \{\}\)/);
  assert.match(rendererSource, /button\.setAttribute\('aria-expanded'/);
  assert.match(rendererSource, /function toggleCollectionTreeNode\(kind, id\)/);
  assert.match(rendererSource, /function expandCollectionTreePath\(collection, folderId = null, options = \{\}\)/);
  assert.match(rendererSource, /function revealOpenRequestTabInCollectionTree\(tab\)/);
  assert.match(rendererSource, /expandCollectionTreePath\(collection, found\.folder\?\.id \|\| null\)/);
  assert.match(rendererSource, /function revealOpenFolderTabInCollectionTree\(tab\)/);
  assert.match(rendererSource, /expandCollectionTreePath\(collection, tab\.folderId, \{ includeTargetFolder: false \}\)/);
  assert.match(rendererSource, /setCollectionTreeItemCollapsed\(state, 'collection', collection\.id, false\);\s*activeRunnerRequestRunnerId = null;/);
  assert.match(rendererSource, /setCollectionTreeItemCollapsed\(state, 'folder', folder\.id, false\);\s*activeRunnerRequestRunnerId = null;/);
  assert.match(rendererSource, /if \(!collapsed\) \{\s*appendSidebarTreeRows\(wrapper, sidebarTreeChildRows\(collection, collection, null\)/);
  assert.match(rendererSource, /if \(!collapsed\) \{\s*appendSidebarTreeRows\(wrapper, sidebarTreeChildRows\(folder, collection, folder\)/);
  assert.doesNotMatch(overlaysSource, /--mono-font/);
  assert.match(overlaysSource, /csv-variables-modal textarea[\s\S]*font-family:\s*var\(--mono\)/);
  assert.match(overlaysSource, /csv-variables-modal textarea[\s\S]*font-size:\s*var\(--editor-font-size\)/);
  assert.doesNotMatch(editorPanelsSource, /--mono-font/);
  assert.match(editorPanelsSource, /\.code-editor\s*\{[\s\S]*font-family:\s*var\(--mono\)/);
  assert.match(editorPanelsSource, /\.code-editor\s*\{[\s\S]*font-size:\s*var\(--editor-font-size\)/);
  assert.doesNotMatch(editorPanelsSource, /\.field\s+span\s*\{/);
  assert.match(editorPanelsSource, /\.field\s*>\s*span\s*\{/);
  const codeEditorTokenCss = editorPanelsSource.slice(
    editorPanelsSource.indexOf('.code-editor-token.tok-keyword'),
    editorPanelsSource.indexOf('.variable-highlight-editor')
  );
  const metricChangingTokenStyles = Array.from(codeEditorTokenCss.matchAll(/font-(?:style|weight)\s*:\s*([^;]+);/g))
    .map((match) => match[0])
    .filter((declaration) => !/:\s*inherit\s*;/.test(declaration));
  assert.deepEqual(metricChangingTokenStyles, []);
  assert.match(rendererSource, /pendingDiagnosticsSettingsSave/);
  assert.match(rendererSource, /Switch to this workspace before exporting local diagnostics/);
  assert.match(rendererSource, /Saving diagnostics privacy settings before export/);
  assert.match(rendererSource, /function requestTabMethodText\(request, tab = {}\)/);
  assert.match(rendererSource, /`AUTH - \$\{method\}`/);
  assert.match(rendererSource, /`RUN - \$\{method\}`/);
  assert.match(rendererSource, /col: 'entity-collection'/);
  assert.match(rendererSource, /methodClassName: \(\) => tagClassName\('ENV'\)/);
  assert.match(rendererSource, /badge\.className = \['tree-badge', tagClassName\(kind\)\]/);
});

test('renderer bootstrap binds auth input and modal draft confirmation events', () => {
  const calls = {
    authType: [],
    authInput: 0,
    performanceAuthType: [],
    performanceAuthInput: 0,
    resolveModal: []
  };
  const elements = new Map([
    ['authTypeSelect', createElement({ tagName: 'SELECT', value: 'oauth2' })],
    ['authDigestUsernameInput', createElement({ value: 'ada' })],
    ['performanceAuthTypeSelect', createElement({ tagName: 'SELECT', value: 'apiKey' })],
    ['performanceAuthApiKeyNameInput', createElement({ value: 'api_key' })],
    ['confirmSaveDraftButton', createElement()],
    ['confirmExportCollectionButton', createElement()],
    ['confirmExportItemButton', createElement()],
    ['confirmFolderDestinationButton', createElement()],
    ['confirmRunnerImportButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  const documentListeners = new Map();
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(name, handler) {
      documentListeners.set(name, handler);
    }
  };
  const fakeWindow = {
    addEventListener() {}
  };

  bindUi({
    doc: fakeDocument,
    windowObject: fakeWindow,
    onAuthTypeChange: (value) => calls.authType.push(value),
    onAuthInput: () => { calls.authInput += 1; },
    onPerformanceAuthTypeChange: (value) => calls.performanceAuthType.push(value),
    onPerformanceAuthInput: () => { calls.performanceAuthInput += 1; },
    onResolveActiveModal: (value) => calls.resolveModal.push(value),
    getSelectedDraftSaveCollectionId: () => 'collection-1',
    getSelectedExportCollectionId: () => 'collection-2',
    getSelectedExportItemId: () => 'runner-1',
    getSelectedFolderDestination: () => '{"collectionId":"collection-2","folderId":"folder-1"}',
    getSelectedRunnerImportTarget: () => ({ type: 'request', collectionId: 'collection-1', requestId: 'request-1' })
  });

  elements.get('authTypeSelect').dispatch('change');
  elements.get('authDigestUsernameInput').dispatch('input');
  elements.get('performanceAuthTypeSelect').dispatch('change');
  elements.get('performanceAuthApiKeyNameInput').dispatch('input');
  elements.get('confirmSaveDraftButton').dispatch('click');
  elements.get('confirmExportCollectionButton').dispatch('click');
  elements.get('confirmExportItemButton').dispatch('click');
  elements.get('confirmFolderDestinationButton').dispatch('click');
  elements.get('confirmRunnerImportButton').dispatch('click');

  assert.deepEqual(calls.authType, ['oauth2']);
  assert.equal(calls.authInput, 2);
  assert.deepEqual(calls.performanceAuthType, ['apiKey']);
  assert.equal(calls.performanceAuthInput, 2);
  assert.deepEqual(calls.resolveModal, [
    'collection-1',
    'collection-2',
    'runner-1',
    '{"collectionId":"collection-2","folderId":"folder-1"}',
    { type: 'request', collectionId: 'collection-1', requestId: 'request-1' }
  ]);
});

test('renderer bootstrap binds request-local TLS setting controls', () => {
  const calls = [];
  const elements = new Map([
    ['requestSslCertificateVerificationInput', createElement({ tagName: 'INPUT' })],
    ['performanceRequestSslCertificateVerificationInput', createElement({ tagName: 'INPUT' })],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onRequestTlsSettingsChange: () => calls.push('request-tls'),
    onPerformanceRequestTlsSettingsChange: () => calls.push('performance-request-tls')
  });

  elements.get('requestSslCertificateVerificationInput').dispatch('change');
  elements.get('performanceRequestSslCertificateVerificationInput').dispatch('change');

  assert.deepEqual(calls, [
    'request-tls',
    'performance-request-tls'
  ]);
});

test('renderer bootstrap resolves text, confirmation, and notification modals', () => {
  const resolved = [];
  const elements = new Map([
    ['textInputModal', createElement()],
    ['textInputModalInput', createElement({ tagName: 'TEXTAREA', value: 'textarea-value' })],
    ['textInputModalSingleLineInput', createElement({ tagName: 'INPUT', value: 'single-line-value' })],
    ['confirmTextInputModalButton', createElement()],
    ['cancelTextInputModalButton', createElement()],
    ['cancelExportItemButton', createElement()],
    ['cancelFolderDestinationButton', createElement()],
    ['confirmActionButton', createElement()],
    ['cancelConfirmActionButton', createElement()],
    ['closeAuthRefreshAutoDetectModalButton', createElement()],
    ['cancelAuthRefreshAutoDetectButton', createElement()],
    ['confirmAuthRefreshAutoDetectButton', createElement()],
    ['closeNotificationModalButton', createElement()],
    ['closeCookiesModalButton', createElement()],
    ['cancelRunnerImportButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  elements.get('textInputModal').dataset.valueControl = 'textInputModalSingleLineInput';

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [elements.get('exportRequestPanelMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('exportRequestPanelButton')];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveActiveModal: (value) => resolved.push(value),
    onConfirmAuthRefreshAutoDetectModal: () => resolved.push('auth-auto-detect-confirm')
  });

  elements.get('confirmTextInputModalButton').dispatch('click');
  elements.get('cancelTextInputModalButton').dispatch('click');
  elements.get('cancelExportItemButton').dispatch('click');
  elements.get('cancelFolderDestinationButton').dispatch('click');
  elements.get('confirmActionButton').dispatch('click');
  elements.get('cancelConfirmActionButton').dispatch('click');
  elements.get('closeAuthRefreshAutoDetectModalButton').dispatch('click');
  elements.get('cancelAuthRefreshAutoDetectButton').dispatch('click');
  elements.get('confirmAuthRefreshAutoDetectButton').dispatch('click');
  elements.get('closeNotificationModalButton').dispatch('click');
  elements.get('closeCookiesModalButton').dispatch('click');
  elements.get('cancelRunnerImportButton').dispatch('click');

  assert.deepEqual(resolved, ['single-line-value', null, null, null, true, false, null, null, 'auth-auto-detect-confirm', true, true, null]);
});

test('renderer bootstrap binds workspace cookie manager controls', () => {
  const calls = [];
  const elements = new Map([
    ['openCookiesButton', createElement()],
    ['openRequestCookiesButton', createElement()],
    ['openPerformanceCookiesButton', createElement()],
    ['cookiesDomainInput', createElement({ tagName: 'INPUT' })],
    ['cookiesAddDomainButton', createElement()],
    ['clearExpiredWorkspaceCookiesButton', createElement()],
    ['clearAllWorkspaceCookiesButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onOpenCookies: () => calls.push('open'),
    onAddCookieDomain: () => calls.push('add-domain'),
    onClearExpiredWorkspaceCookies: () => calls.push('clear'),
    onClearAllWorkspaceCookies: () => calls.push('clear-all')
  });

  elements.get('openCookiesButton').dispatch('click');
  elements.get('openRequestCookiesButton').dispatch('click');
  elements.get('openPerformanceCookiesButton').dispatch('click');
  elements.get('cookiesAddDomainButton').dispatch('click');
  elements.get('cookiesDomainInput').dispatch('keydown', { key: 'Enter' });
  elements.get('clearExpiredWorkspaceCookiesButton').dispatch('click');
  elements.get('clearAllWorkspaceCookiesButton').dispatch('click');

  assert.deepEqual(calls, ['open', 'open', 'open', 'add-domain', 'add-domain', 'clear', 'clear-all']);
});

test('renderer bootstrap opens toolbar menus inside active modals', () => {
  const elements = new Map([
    ['cookiesClearMenuButton', createElement()],
    ['cookiesClearMenu', createElement({ closest: (selector) => selector === '.modal' ? elements.get('cookiesModal') : null })],
    ['cookiesModal', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);
  elements.get('modalBackdrop').hidden = false;
  elements.get('cookiesModal').hidden = false;

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [elements.get('cookiesClearMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('cookiesClearMenuButton')];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  });

  elements.get('cookiesClearMenuButton').dispatch('click');

  assert.equal(elements.get('cookiesClearMenu').hidden, false);
  assert.equal(elements.get('cookiesClearMenuButton').getAttribute('aria-expanded'), 'true');
});

test('renderer bootstrap binds CSV variable edit buttons and modal controls', () => {
  const calls = [];
  const elements = new Map([
    ['runnerCsvVariablesButton', createElement()],
    ['runnerCsvVariablesMenu', createElement()],
    ['runnerToggleCsvVariablesButton', createElement()],
    ['runnerEditCsvVariablesButton', createElement()],
    ['performanceCsvVariablesButton', createElement()],
    ['performanceCsvVariablesMenu', createElement()],
    ['performanceToggleCsvVariablesButton', createElement()],
    ['performanceEditCsvVariablesButton', createElement()],
    ['closeCsvVariablesModalButton', createElement()],
    ['cancelCsvVariablesModalButton', createElement()],
    ['saveCsvVariablesModalButton', createElement()],
    ['csvVariablesImportButton', createElement()],
    ['clearCsvVariablesFileButton', createElement()],
    ['csvVariablesLoadFileButton', createElement()],
    ['csvVariablesKeepFileButton', createElement()],
    ['csvVariablesFileInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesFileSourceButton', createElement()],
    ['csvVariablesInlineSourceButton', createElement()],
    ['csvVariablesValuesToggle', createElement()],
    ['csvVariablesValuesInput', createElement({ tagName: 'TEXTAREA' })],
    ['csvVariablesReuseFirstRowInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesLoopRowsInput', createElement({ tagName: 'INPUT' })],
    ['csvVariablesContinueWithoutRowsInput', createElement({ tagName: 'INPUT' })],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [elements.get('runnerCsvVariablesMenu'), elements.get('performanceCsvVariablesMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('runnerCsvVariablesButton'), elements.get('performanceCsvVariablesButton')];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onToggleRunnerCsvVariables: () => calls.push('runner-toggle-csv'),
    onEditRunnerCsvVariables: () => calls.push('runner-csv'),
    onTogglePerformanceCsvVariables: () => calls.push('performance-toggle-csv'),
    onEditPerformanceCsvVariables: () => calls.push('performance-csv'),
    onResolveActiveModal: (value) => calls.push(`resolve:${value}`),
    onConfirmCsvVariablesModal: () => calls.push('save-csv'),
    onImportCsvVariablesFile: () => calls.push('import-csv'),
    onClearCsvVariablesFile: () => calls.push('clear-csv'),
    onLoadCsvVariablesFile: () => calls.push('load-csv'),
    onKeepCsvVariablesFile: () => calls.push('keep-csv'),
    onCsvVariablesFileSelected: () => calls.push('file-selected'),
    onSelectCsvVariablesSource: (source) => calls.push(`source:${source}`),
    onToggleCsvVariablesValues: () => calls.push('toggle-values'),
    onCsvVariablesValuesInput: () => calls.push('values-input'),
    onCsvVariablesRowModeChange: (mode) => calls.push(`row-mode:${mode}`)
  });

  elements.get('runnerCsvVariablesButton').dispatch('click');
  assert.equal(elements.get('runnerCsvVariablesMenu').hidden, false);
  elements.get('runnerToggleCsvVariablesButton').dispatch('click');
  elements.get('runnerEditCsvVariablesButton').dispatch('click');
  elements.get('performanceCsvVariablesButton').dispatch('click');
  assert.equal(elements.get('performanceCsvVariablesMenu').hidden, false);
  elements.get('performanceToggleCsvVariablesButton').dispatch('click');
  elements.get('performanceEditCsvVariablesButton').dispatch('click');
  for (const id of [
    'closeCsvVariablesModalButton',
    'cancelCsvVariablesModalButton',
    'saveCsvVariablesModalButton',
    'csvVariablesImportButton',
    'clearCsvVariablesFileButton',
    'csvVariablesLoadFileButton',
    'csvVariablesKeepFileButton'
  ]) {
    elements.get(id).dispatch('click');
  }
  elements.get('csvVariablesFileInput').dispatch('change');
  elements.get('csvVariablesFileSourceButton').dispatch('click');
  elements.get('csvVariablesInlineSourceButton').dispatch('click');
  elements.get('csvVariablesValuesToggle').dispatch('click');
  elements.get('csvVariablesValuesInput').dispatch('input');
  elements.get('csvVariablesReuseFirstRowInput').dispatch('change');
  elements.get('csvVariablesLoopRowsInput').dispatch('change');
  elements.get('csvVariablesContinueWithoutRowsInput').dispatch('change');

  assert.deepEqual(calls, [
    'runner-toggle-csv',
    'runner-csv',
    'performance-toggle-csv',
    'performance-csv',
    'resolve:null',
    'resolve:null',
    'save-csv',
    'import-csv',
    'clear-csv',
    'load-csv',
    'keep-csv',
    'file-selected',
    'source:file',
    'source:inline',
    'toggle-values',
    'values-input',
    'row-mode:reuse',
    'row-mode:loop',
    'row-mode:continue'
  ]);
});

test('renderer bootstrap binds refreshing auth manage menus', () => {
  const pairs = [
    ['runnerAuthRefreshButton', 'runnerAuthRefreshMenu'],
    ['performanceAuthRefreshButton', 'performanceAuthRefreshMenu'],
    ['runnerAuthRefreshManageRequestButton', 'runnerAuthRefreshManageRequestMenu'],
    ['runnerAuthRefreshTokenManageRequestButton', 'runnerAuthRefreshTokenManageRequestMenu'],
    ['performanceAuthRefreshManageRequestButton', 'performanceAuthRefreshManageRequestMenu'],
    ['performanceAuthRefreshTokenManageRequestButton', 'performanceAuthRefreshTokenManageRequestMenu']
  ];
  const elements = new Map(pairs.flatMap(([buttonId, menuId]) => [
    [buttonId, createElement()],
    [menuId, createElement()]
  ]));

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return pairs.map(([, menuId]) => elements.get(menuId));
        }
        if (selector === '.menu-trigger') {
          return pairs.map(([buttonId]) => elements.get(buttonId));
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  });

  for (const [buttonId, menuId] of pairs) {
    elements.get(buttonId).dispatch('click');
    assert.equal(elements.get(menuId).hidden, false);
    assert.equal(elements.get(buttonId).attributes['aria-expanded'], 'true');
  }
});

test('renderer bootstrap binds refreshing auth auto-detect actions', () => {
  const calls = [];
  const controls = [
    ['runnerAuthRefreshAutoDetectRequestButton', 'runner-access'],
    ['runnerAuthRefreshTokenAutoDetectRequestButton', 'runner-refresh'],
    ['performanceAuthRefreshAutoDetectRequestButton', 'performance-access'],
    ['performanceAuthRefreshTokenAutoDetectRequestButton', 'performance-refresh']
  ];
  const elements = new Map([
    ...controls.map(([id]) => [id, createElement()]),
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onAutoDetectRunnerAuthRefreshRequest: () => calls.push('runner-access'),
    onAutoDetectRunnerAuthRefreshTokenRequest: () => calls.push('runner-refresh'),
    onAutoDetectPerformanceAuthRefreshRequest: () => calls.push('performance-access'),
    onAutoDetectPerformanceAuthRefreshTokenRequest: () => calls.push('performance-refresh')
  });

  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, call]) => call));
});

test('renderer bootstrap toolbar menus close capture settings panels unless nested inside one', () => {
  const csvButton = createElement();
  const csvMenu = createElement();
  const manageButton = createElement();
  const manageMenu = createElement();
  manageMenu.closest = (selector) => (selector === '.capture-settings-panel' ? manageMenu : null);
  const elements = new Map([
    ['runnerCsvVariablesButton', csvButton],
    ['runnerCsvVariablesMenu', csvMenu],
    ['runnerAuthRefreshManageRequestButton', manageButton],
    ['runnerAuthRefreshManageRequestMenu', manageMenu]
  ]);
  let closeCapturePanels = 0;

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [csvMenu, manageMenu];
        }
        if (selector === '.menu-trigger') {
          return [csvButton, manageButton];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onCloseCaptureSettingsPanels: () => { closeCapturePanels += 1; }
  });

  csvButton.dispatch('click');
  assert.equal(closeCapturePanels, 1);
  manageButton.dispatch('click');
  assert.equal(closeCapturePanels, 1);
});

test('renderer bootstrap flips nested toolbar menus upward when lower panel space is constrained', () => {
  const manageButton = createElement();
  const manageMenu = createElement();
  const panel = {
    getBoundingClientRect: () => ({ top: 100, bottom: 560 })
  };
  const menuClasses = new Set();
  manageButton.getBoundingClientRect = () => ({ top: 520, bottom: 550 });
  manageMenu.getBoundingClientRect = () => ({ height: 150 });
  manageMenu.closest = (selector) => (selector === '.capture-settings-panel' ? panel : null);
  manageMenu.classList = {
    add: (name) => menuClasses.add(name),
    remove: (name) => menuClasses.delete(name),
    contains: (name) => menuClasses.has(name)
  };
  const elements = new Map([
    ['runnerAuthRefreshManageRequestButton', manageButton],
    ['runnerAuthRefreshManageRequestMenu', manageMenu]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '.toolbar-menu') {
          return [manageMenu];
        }
        if (selector === '.menu-trigger') {
          return [manageButton];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {}, innerHeight: 900 }
  });

  manageButton.dispatch('click');
  assert.equal(manageMenu.hidden, false);
  assert.equal(manageMenu.classList.contains('toolbar-menu-open-up'), true);

  closeToolbarMenus({
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return [manageMenu];
      }
      if (selector === '.menu-trigger') {
        return [manageButton];
      }
      return [];
    }
  });
  assert.equal(manageMenu.classList.contains('toolbar-menu-open-up'), false);
});

test('renderer bootstrap binds settings menu, category, theme, and setting controls', () => {
  const calls = [];
  const settingsSections = [
    'appearance',
    'tabs',
    'modals',
    'updates',
    'scripts',
    'certificates',
    'vault',
    'packages',
    'files',
    'diagnostics'
  ];
  const settingsButtons = settingsSections.map((section) => {
    const button = createElement();
    button.dataset.settingsSection = section;
    return button;
  });
  const themeDarkButton = createElement();
  themeDarkButton.dataset.themeOption = 'dark';
  const elements = new Map([
    ['closeSettingsModalButton', createElement()],
    ['closeSettingsModalFooterButton', createElement()],
    ['interfaceFontSelect', createElement({ tagName: 'SELECT' })],
    ['interfaceFontSizeInput', createElement({ tagName: 'SELECT' })],
    ['resetInterfaceTypographyButton', createElement()],
    ['editorFontSelect', createElement({ tagName: 'SELECT' })],
    ['editorFontSizeInput', createElement({ tagName: 'SELECT' })],
    ['resetEditorTypographyButton', createElement()],
    ['showEditorLineNumbersInput', createElement({ tagName: 'INPUT' })],
    ['showVariableTooltipHintsInput', createElement({ tagName: 'INPUT' })],
    ['saveOnForceCloseInput', createElement({ tagName: 'INPUT' })],
    ['closeModalsOnBackdropClickInput', createElement({ tagName: 'INPUT' })],
    ['includePrereleasesInput', createElement({ tagName: 'INPUT' })],
    ['sslCertificateVerificationInput', createElement({ tagName: 'INPUT' })],
    ['caCertificatePathInput', createElement({ tagName: 'INPUT' })],
    ['chooseCaCertificateButton', createElement()],
    ['clearCaCertificateButton', createElement()],
    ['addClientCertificateButton', createElement()],
    ['closeClientCertificateModalButton', createElement()],
    ['cancelClientCertificateModalButton', createElement()],
    ['saveClientCertificateModalButton', createElement()],
    ['chooseClientCertificateCertPathButton', createElement()],
    ['chooseClientCertificateKeyPathButton', createElement()],
    ['chooseClientCertificatePfxPathButton', createElement()],
    ['toggleClientCertificatePassphraseButton', createElement()],
    ['clientCertificateFormatSelect', createElement({ tagName: 'SELECT' })],
    ['trustedScriptSendRequestInput', createElement({ tagName: 'INPUT' })],
    ['trustedScriptCookiesInput', createElement({ tagName: 'INPUT' })],
    ['trustedScriptVaultInput', createElement({ tagName: 'INPUT' })],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-settings-section]') {
          return settingsButtons;
        }
        if (selector === '[data-theme-option]') {
          return [themeDarkButton];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onSelectSettingsSection: (section) => calls.push(`section:${section}`),
    onSelectTheme: (theme) => calls.push(`theme:${theme}`),
    onInterfaceTypographyChange: () => calls.push('interface-typography'),
    onEditorTypographyChange: () => calls.push('editor-typography'),
    onResetInterfaceTypography: () => calls.push('reset-interface-typography'),
    onResetEditorTypography: () => calls.push('reset-editor-typography'),
    onShowEditorLineNumbersChange: () => calls.push('line-numbers'),
    onShowVariableTooltipHintsChange: () => calls.push('variable-tooltip-hints'),
    onSaveOnForceCloseChange: () => calls.push('save-on-force-close'),
    onCloseModalsOnBackdropClickChange: () => calls.push('close-modals-on-backdrop'),
    onIncludePrereleasesChange: () => calls.push('include-prereleases'),
    onTlsSettingsChange: () => calls.push('tls-settings'),
    onChooseCaCertificate: () => calls.push('choose-ca'),
    onClearCaCertificate: () => calls.push('clear-ca'),
    onAddClientCertificate: () => calls.push('add-client-cert'),
    onConfirmClientCertificateModal: () => calls.push('confirm-client-cert'),
    onChooseClientCertificateCertPath: () => calls.push('choose-client-cert-crt'),
    onChooseClientCertificateKeyPath: () => calls.push('choose-client-cert-key'),
    onChooseClientCertificatePfxPath: () => calls.push('choose-client-cert-pfx'),
    onClientCertificateFormatChange: () => calls.push('client-cert-format'),
    onToggleClientCertificatePassphraseVisibility: () => calls.push('toggle-client-cert-passphrase'),
    onTrustedScriptCapabilityChange: () => calls.push('script-capability'),
    onResolveActiveModal: (value) => calls.push(`resolve:${value}`)
  });

  settingsButtons.find((button) => button.dataset.settingsSection === 'tabs').dispatch('click');
  themeDarkButton.dispatch('click');
  elements.get('interfaceFontSelect').dispatch('change');
  elements.get('interfaceFontSizeInput').dispatch('change');
  elements.get('resetInterfaceTypographyButton').dispatch('click');
  elements.get('editorFontSelect').dispatch('change');
  elements.get('editorFontSizeInput').dispatch('change');
  elements.get('resetEditorTypographyButton').dispatch('click');
  elements.get('showEditorLineNumbersInput').dispatch('change');
  elements.get('showVariableTooltipHintsInput').dispatch('change');
  elements.get('saveOnForceCloseInput').dispatch('change');
  settingsButtons.find((button) => button.dataset.settingsSection === 'modals').dispatch('click');
  elements.get('closeModalsOnBackdropClickInput').dispatch('change');
  for (const section of ['updates', 'scripts', 'certificates', 'vault', 'packages', 'files', 'diagnostics', 'appearance']) {
    settingsButtons.find((button) => button.dataset.settingsSection === section).dispatch('click');
  }
  elements.get('includePrereleasesInput').dispatch('change');
  elements.get('sslCertificateVerificationInput').dispatch('change');
  elements.get('caCertificatePathInput').dispatch('change');
  elements.get('chooseCaCertificateButton').dispatch('click');
  elements.get('clearCaCertificateButton').dispatch('click');
  elements.get('addClientCertificateButton').dispatch('click');
  elements.get('clientCertificateFormatSelect').dispatch('change');
  elements.get('chooseClientCertificateCertPathButton').dispatch('click');
  elements.get('chooseClientCertificateKeyPathButton').dispatch('click');
  elements.get('chooseClientCertificatePfxPathButton').dispatch('click');
  elements.get('toggleClientCertificatePassphraseButton').dispatch('click');
  elements.get('saveClientCertificateModalButton').dispatch('click');
  elements.get('cancelClientCertificateModalButton').dispatch('click');
  elements.get('closeClientCertificateModalButton').dispatch('click');
  elements.get('trustedScriptSendRequestInput').dispatch('change');
  elements.get('trustedScriptCookiesInput').dispatch('change');
  elements.get('trustedScriptVaultInput').dispatch('change');
  elements.get('closeSettingsModalButton').dispatch('click');
  elements.get('closeSettingsModalFooterButton').dispatch('click');

  assert.deepEqual(calls, [
    'section:tabs',
    'theme:dark',
    'interface-typography',
    'interface-typography',
    'reset-interface-typography',
    'editor-typography',
    'editor-typography',
    'reset-editor-typography',
    'line-numbers',
    'variable-tooltip-hints',
    'save-on-force-close',
    'section:modals',
    'close-modals-on-backdrop',
    'section:updates',
    'section:scripts',
    'section:certificates',
    'section:vault',
    'section:packages',
    'section:files',
    'section:diagnostics',
    'section:appearance',
    'include-prereleases',
    'tls-settings',
    'tls-settings',
    'choose-ca',
    'clear-ca',
    'add-client-cert',
    'client-cert-format',
    'choose-client-cert-crt',
    'choose-client-cert-key',
    'choose-client-cert-pfx',
    'toggle-client-cert-passphrase',
    'confirm-client-cert',
    'resolve:null',
    'resolve:null',
    'script-capability',
    'script-capability',
    'script-capability',
    'resolve:true',
    'resolve:true'
  ]);
});

test('renderer bootstrap binds tutorial modal and overlay controls', () => {
  const calls = [];
  const elements = new Map([
    ['closeTutorialsModalButton', createElement()],
    ['startTutorialButton', createElement()],
    ['previousTutorialStepButton', createElement()],
    ['nextTutorialStepButton', createElement()],
    ['endTutorialButton', createElement()],
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveActiveModal: (value) => calls.push(`resolve:${value}`),
    onStartSelectedTutorial: () => calls.push('start-tutorial'),
    onPreviousTutorialStep: () => calls.push('previous-step'),
    onNextTutorialStep: () => calls.push('next-step'),
    onEndTutorial: () => calls.push('end-tutorial')
  });

  elements.get('closeTutorialsModalButton').dispatch('click');
  elements.get('startTutorialButton').dispatch('click');
  elements.get('previousTutorialStepButton').dispatch('click');
  elements.get('nextTutorialStepButton').dispatch('click');
  elements.get('endTutorialButton').dispatch('click');

  assert.deepEqual(calls, [
    'resolve:null',
    'start-tutorial',
    'previous-step',
    'next-step',
    'end-tutorial'
  ]);
});

test('renderer bootstrap keeps active modals open when the backdrop is clicked by default', () => {
  let cancelCount = 0;
  const elements = new Map([
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onCancelActiveModal: () => {
      cancelCount += 1;
    }
  });

  elements.get('modalBackdrop').dispatch('click');

  assert.equal(cancelCount, 0);
});

test('renderer bootstrap supports opt-in modal backdrop dismissal for future preferences', () => {
  let cancelCount = 0;
  const elements = new Map([
    ['contextMenu', createElement()],
    ['modalBackdrop', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    closeModalsOnBackdropClick: () => true,
    onCancelActiveModal: () => {
      cancelCount += 1;
    }
  });

  elements.get('modalBackdrop').dispatch('click');

  assert.equal(cancelCount, 1);
});

test('renderer bootstrap binds every collection and request export menu button', () => {
  const calls = [];
  const controls = [
    ['exportRequestButton', 'request-postmeter', 'onExportRequest'],
    ['exportRequestCurlButton', 'request-curl', 'onExportRequestCurl'],
    ['exportCollectionButton', 'postmeter', 'onExportCollection'],
    ['exportPostmanButton', 'postman', 'onExportPostman'],
    ['exportOpenApiButton', 'openapi', 'onExportOpenApi'],
    ['exportCurlButton', 'curl', 'onExportCurl']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds generated header visibility and token controls', () => {
  const calls = [];
  const elements = new Map([
    ['sendPostMeterTokenInput', createElement()],
    ['showGeneratedHeadersInput', createElement()],
    ['performanceSendPostMeterTokenInput', createElement()],
    ['performanceShowGeneratedHeadersInput', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onPostMeterTokenHeaderChange: () => calls.push('request-token'),
    onShowGeneratedHeadersChange: () => calls.push('request-generated'),
    onPerformancePostMeterTokenHeaderChange: () => calls.push('performance-token'),
    onPerformanceShowGeneratedHeadersChange: () => calls.push('performance-generated')
  });

  for (const element of elements.values()) {
    element.dispatch('change');
  }

  assert.deepEqual(calls, [
    'request-token',
    'request-generated',
    'performance-token',
    'performance-generated'
  ]);
});

test('renderer bootstrap binds performance creation import export run and config controls', () => {
  const calls = [];
  const controlIds = [
    'newPerformanceTestMenuButton',
    'emptyCreatePerformanceTestButton',
    'importPerformanceTestButton',
    'exportPerformanceTestMenuButton',
    'performanceCsvVariablesButton',
    'performanceCsvVariablesMenu',
    'performanceToggleCsvVariablesButton',
    'performanceEditCsvVariablesButton',
    'savePerformanceTestButton',
    'deletePerformanceTestButton',
    'runPerformanceTestButton',
    'cancelPerformanceTestButton',
    'exportPerformanceTestButton',
    'performanceCaptureSettingsButton',
    'performanceAuthRefreshButton',
    'performanceAuthRefreshMenu',
    'performanceToggleAuthRefreshButton',
    'performanceEditAuthRefreshButton',
    'exportPerformanceResultsButton',
    'exportPerformanceResultsMenu',
    'exportPerformanceResultHtmlButton',
    'exportPerformanceResultJsonButton',
    'exportPerformanceResultCsvButton',
    'importPerformanceRequestButton',
    'calibratePerformanceButton',
    'closePerformanceCalibrationModalButton',
    'addPerformanceParamButton',
    'addPerformanceHeaderButton',
    'addPerformanceRequestVariableButton',
    'openPerformanceCookiesButton',
    'performanceMethodSelect',
    'performanceUrlInput',
    'performanceBodyTypeSelect',
    'performanceBodyRawFormatSelect',
    'performanceBeautifyBodyButton',
    'performanceBodyInput',
    'performanceGraphqlQueryInput',
    'performanceGraphqlVariablesInput',
    'performanceGraphqlOperationNameInput',
    'performanceDocsInput',
    'addPerformanceFormDataBodyRowButton',
    'addPerformanceUrlencodedBodyRowButton',
    'performanceBinaryBodySourceInput'
  ];
  const elements = new Map(controlIds.map((id) => [id, createElement({ tagName: id.endsWith('Select') ? 'SELECT' : 'INPUT' })]));
  const performanceEnvironmentControls = [createElement({ tagName: 'SELECT' })];
  const performanceMutationControls = [createElement({ tagName: 'INPUT' })];
  const performanceConfigControls = Array.from({ length: 5 }, () => createElement({ tagName: 'INPUT' }));
  const performanceSafetyControls = Array.from({ length: 3 }, () => createElement({ tagName: 'INPUT' }));
  const performanceTab = createElement();
  performanceTab.dataset.tabGroup = 'performance';
  performanceTab.dataset.tab = 'spike';

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-performance-environment]') {
          return performanceEnvironmentControls;
        }
        if (selector === '[data-performance-mutation]') {
          return performanceMutationControls;
        }
        if (selector === '[data-performance-config]') {
          return performanceConfigControls;
        }
        if (selector === '[data-performance-safety]') {
          return performanceSafetyControls;
        }
        if (selector === '.toolbar-menu') {
          return [elements.get('performanceCsvVariablesMenu'), elements.get('performanceAuthRefreshMenu'), elements.get('exportPerformanceResultsMenu')];
        }
        if (selector === '.menu-trigger') {
          return [elements.get('performanceCsvVariablesButton'), elements.get('performanceAuthRefreshButton'), elements.get('exportPerformanceResultsButton')];
        }
        if (selector === '.tab' || selector === '.tab[data-tab-group="performance"]') {
          return [performanceTab];
        }
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onNewPerformanceTest: () => calls.push('new'),
    onImportPerformanceTest: () => calls.push('import-test'),
    onExportPerformanceTest: () => calls.push('export-test'),
    onTogglePerformanceCsvVariables: () => calls.push('toggle-csv-performance'),
    onEditPerformanceCsvVariables: () => calls.push('csv-performance'),
    onSavePerformanceTest: () => calls.push('save'),
    onDeletePerformanceTest: () => calls.push('delete'),
    onRunPerformanceTest: () => calls.push('run'),
    onCancelPerformanceTest: () => calls.push('cancel'),
    onTogglePerformanceCaptureSettings: () => calls.push('capture-settings'),
    onTogglePerformanceAuthRefresh: () => calls.push('auth-refresh-toggle'),
    onEditPerformanceAuthRefresh: () => calls.push('auth-refresh-edit'),
    onExportPerformanceResultHtml: () => calls.push('export-result-html'),
    onExportPerformanceResultJson: () => calls.push('export-result-json'),
    onExportPerformanceResultCsv: () => calls.push('export-result-csv'),
    onImportPerformanceRequest: () => calls.push('import-request'),
    onAddPerformanceParam: () => calls.push('add-param'),
    onAddPerformanceHeader: () => calls.push('add-header'),
    onAddPerformanceRequestVariable: () => calls.push('add-variable'),
    onOpenCookies: () => calls.push('open-cookies'),
    onCalibratePerformance: () => calls.push('calibrate'),
    onClosePerformanceCalibration: () => calls.push('close-calibration'),
    onPerformanceConfigChange: () => calls.push('config'),
    onPerformanceRequestChange: () => calls.push('request'),
    onPerformanceBodyTypeChange: () => calls.push('body-type'),
    onBeautifyPerformanceBody: () => calls.push('beautify-performance'),
    onAddPerformanceFormDataBodyRow: () => calls.push('add-form-data'),
    onAddPerformanceUrlencodedBodyRow: () => calls.push('add-urlencoded'),
    onActivateTab: (group, tab) => calls.push(`${group}:${tab}`)
  });

  for (const id of [
    'newPerformanceTestMenuButton',
    'emptyCreatePerformanceTestButton',
    'importPerformanceTestButton',
    'exportPerformanceTestMenuButton',
    'performanceCsvVariablesButton',
    'performanceToggleCsvVariablesButton',
    'performanceEditCsvVariablesButton',
    'savePerformanceTestButton',
    'deletePerformanceTestButton',
    'runPerformanceTestButton',
    'cancelPerformanceTestButton',
    'exportPerformanceTestButton',
    'performanceCaptureSettingsButton',
    'performanceAuthRefreshButton',
    'performanceToggleAuthRefreshButton',
    'performanceEditAuthRefreshButton',
    'exportPerformanceResultsButton',
    'exportPerformanceResultHtmlButton',
    'exportPerformanceResultJsonButton',
    'exportPerformanceResultCsvButton',
    'importPerformanceRequestButton',
    'addPerformanceParamButton',
    'addPerformanceHeaderButton',
    'addPerformanceRequestVariableButton',
    'openPerformanceCookiesButton',
    'calibratePerformanceButton',
    'closePerformanceCalibrationModalButton',
    'performanceBeautifyBodyButton',
    'addPerformanceFormDataBodyRowButton',
    'addPerformanceUrlencodedBodyRowButton'
  ]) {
    elements.get(id).dispatch('click');
  }
  for (const control of [...performanceEnvironmentControls, ...performanceMutationControls]) {
    control.dispatch('change');
  }
  for (const control of [...performanceConfigControls, ...performanceSafetyControls]) {
    control.dispatch('input');
  }
  performanceConfigControls[0].dispatch('change');
  performanceTab.dispatch('click');
  elements.get('performanceMethodSelect').dispatch('change');
  elements.get('performanceUrlInput').dispatch('input');
  elements.get('performanceBodyTypeSelect').dispatch('change');
  elements.get('performanceBodyRawFormatSelect').dispatch('change');
  elements.get('performanceBodyInput').dispatch('input');
  elements.get('performanceGraphqlQueryInput').dispatch('input');
  elements.get('performanceGraphqlVariablesInput').dispatch('input');
  elements.get('performanceGraphqlOperationNameInput').dispatch('input');
  elements.get('performanceDocsInput').dispatch('input');
  elements.get('performanceBinaryBodySourceInput').dispatch('input');

  assert.deepEqual(calls.slice(0, 24), [
    'new',
    'new',
    'import-test',
    'export-test',
    'toggle-csv-performance',
    'csv-performance',
    'save',
    'delete',
    'run',
    'cancel',
    'export-test',
    'capture-settings',
    'auth-refresh-toggle',
    'auth-refresh-edit',
    'export-result-html',
    'export-result-json',
    'export-result-csv',
    'import-request',
    'add-param',
    'add-header',
    'add-variable',
    'open-cookies',
    'calibrate',
    'close-calibration'
  ]);
  assert.equal(calls.filter((call) => call === 'config').length, 11);
  assert.ok(calls.includes('beautify-performance'));
  assert.ok(calls.includes('add-form-data'));
  assert.ok(calls.includes('add-urlencoded'));
  assert.equal(calls.filter((call) => call === 'request').length, 8);
  assert.equal(calls.filter((call) => call === 'body-type').length, 2);
  assert.ok(calls.includes('performance:spike'));
});

test('renderer bootstrap binds request body format and beautify controls', () => {
  const calls = [];
  const elements = new Map([
    ['bodyTypeSelect', createElement({ tagName: 'SELECT' })],
    ['bodyRawFormatSelect', createElement({ tagName: 'SELECT' })],
    ['beautifyBodyButton', createElement()],
    ['bodyInput', createElement({ tagName: 'TEXTAREA' })],
    ['graphqlQueryInput', createElement({ tagName: 'TEXTAREA' })],
    ['graphqlVariablesInput', createElement({ tagName: 'TEXTAREA' })],
    ['graphqlOperationNameInput', createElement({ tagName: 'INPUT' })],
    ['addFormDataBodyRowButton', createElement()],
    ['addUrlencodedBodyRowButton', createElement()],
    ['binaryBodySourceInput', createElement({ tagName: 'INPUT' })]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onBodyTypeChange: () => calls.push('body-type'),
    onBeautifyBody: () => calls.push('beautify'),
    onBodyInput: () => calls.push('body-input'),
    onAddFormDataBodyRow: () => calls.push('form-data'),
    onAddUrlencodedBodyRow: () => calls.push('urlencoded')
  });

  elements.get('bodyTypeSelect').dispatch('change');
  elements.get('bodyRawFormatSelect').dispatch('change');
  elements.get('beautifyBodyButton').dispatch('click');
  elements.get('bodyInput').dispatch('input');
  elements.get('graphqlQueryInput').dispatch('input');
  elements.get('graphqlVariablesInput').dispatch('input');
  elements.get('graphqlOperationNameInput').dispatch('input');
  elements.get('addFormDataBodyRowButton').dispatch('click');
  elements.get('addUrlencodedBodyRowButton').dispatch('click');
  elements.get('binaryBodySourceInput').dispatch('input');

  assert.deepEqual(calls, [
    'body-type',
    'body-type',
    'beautify',
    'body-input',
    'body-input',
    'body-input',
    'body-input',
    'form-data',
    'urlencoded',
    'body-input'
  ]);
});

test('renderer bootstrap closes open toolbar menus on Tab without native dialogs', () => {
  const button = createElement();
  const menu = createElement();
  const calls = [];
  const elements = new Map([
    ['importMenuButton', button],
    ['importMenu', menu]
  ]);
  const fakeDocument = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.toolbar-menu') {
        return [menu];
      }
      if (selector === '.menu-trigger') {
        return [button];
      }
      return [];
    },
    addEventListener() {}
  };

  bindUi({
    doc: fakeDocument,
    windowObject: { addEventListener() {} },
    onCloseContextMenu: () => calls.push('context'),
    onCloseFileSourceMenu: () => calls.push('file-source')
  });

  button.dispatch('click');
  assert.equal(menu.hidden, false);
  assert.equal(button.attributes['aria-expanded'], 'true');
  assert.deepEqual(calls, ['context', 'file-source']);

  menu.dispatch('keydown', { key: 'Tab' });

  assert.equal(menu.hidden, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
});

test('tree context menus close on Tab and reset trigger expanded state', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const trigger = createElement();
  const menu = {
    children: [],
    hidden: true,
    offsetHeight: 80,
    offsetWidth: 120,
    style: {},
    textContent: '',
    append(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      return selector === 'button' ? this.children[0] : null;
    },
    querySelectorAll(selector) {
      return selector === 'button:not([disabled])' ? this.children : [];
    }
  };

  global.document = {
    activeElement: null,
    createElement() {
      return createElement();
    },
    getElementById(id) {
      return id === 'contextMenu' ? menu : null;
    }
  };
  global.window = { innerHeight: 768, innerWidth: 1024 };

  try {
    showContextMenu(32, 32, [['Rename', () => {}]], { focusFirst: true, trigger });
    assert.equal(menu.hidden, false);
    assert.equal(trigger.attributes['aria-expanded'], 'true');

    menu.onkeydown({
      key: 'Tab',
      preventDefault() {},
      target: menu.children[0]
    });

    assert.equal(menu.hidden, true);
    assert.equal(trigger.attributes['aria-expanded'], 'false');
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

test('tree context menus close toolbar peers before opening', () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  let peerCloseCount = 0;
  const menu = {
    children: [],
    hidden: true,
    offsetHeight: 80,
    offsetWidth: 120,
    style: {},
    textContent: '',
    append(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };

  global.document = {
    createElement() {
      return createElement();
    },
    getElementById(id) {
      return id === 'contextMenu' ? menu : null;
    }
  };
  global.window = { innerHeight: 768, innerWidth: 1024 };
  setContextMenuPeerCloser(() => {
    peerCloseCount += 1;
  });

  try {
    showContextMenu(32, 32, [['Rename', () => {}]]);
    assert.equal(peerCloseCount, 1);
    assert.equal(menu.hidden, false);
  } finally {
    setContextMenuPeerCloser(null);
    global.document = previousDocument;
    global.window = previousWindow;
  }
});

test('renderer bootstrap binds markdown pane preview and save buttons', () => {
  const elements = new Map([
    ['saveRequestButton', createElement()],
    ['docsPreview', createElement({ tagName: 'DIV' })],
    ['docsSaveButton', createElement()],
    ['docsCancelButton', createElement()],
    ['exportRequestPanelButton', createElement()],
    ['exportRequestPanelMenu', createElement()],
    ['exportRequestPanelPostmeterButton', createElement()],
    ['exportRequestPanelCurlButton', createElement()],
    ['collectionDescriptionPreview', createElement({ tagName: 'DIV' })],
    ['collectionDescriptionSaveButton', createElement()],
    ['collectionDescriptionCancelButton', createElement()],
    ['folderDescriptionPreview', createElement({ tagName: 'DIV' })],
    ['folderDescriptionSaveButton', createElement()],
    ['folderDescriptionCancelButton', createElement()],
    ['saveEnvironmentButton', createElement()]
  ]);
  const calls = [];
  let previewKeyPrevented = false;

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onSaveRequest: () => calls.push('request'),
    onEditRequestDocs: () => calls.push('docs-edit'),
    onSaveRequestDocs: () => calls.push('docs-save'),
    onCancelRequestDocs: () => calls.push('docs-cancel'),
    onExportCurrentRequest: () => calls.push('request-export'),
    onExportCurrentRequestCurl: () => calls.push('request-export-curl'),
    onEditCollectionDescription: () => calls.push('collection-description-edit'),
    onSaveCollectionDescription: () => calls.push('collection-description-save'),
    onCancelCollectionDescription: () => calls.push('collection-description-cancel'),
    onEditFolderDescription: () => calls.push('folder-description-edit'),
    onSaveFolderDescription: () => calls.push('folder-description-save'),
    onCancelFolderDescription: () => calls.push('folder-description-cancel'),
    onSaveEnvironment: () => calls.push('environment')
  });

  elements.get('saveRequestButton').dispatch('click');
  elements.get('docsPreview').dispatch('click');
  elements.get('docsSaveButton').dispatch('click');
  elements.get('docsCancelButton').dispatch('click');
  elements.get('exportRequestPanelButton').dispatch('click');
  assert.equal(elements.get('exportRequestPanelMenu').hidden, false);
  elements.get('exportRequestPanelPostmeterButton').dispatch('click');
  elements.get('exportRequestPanelMenu').hidden = true;
  elements.get('exportRequestPanelButton').dispatch('click');
  assert.equal(elements.get('exportRequestPanelMenu').hidden, false);
  elements.get('exportRequestPanelCurlButton').dispatch('click');
  elements.get('collectionDescriptionPreview').dispatch('keydown', {
    key: 'Enter',
    preventDefault() {
      previewKeyPrevented = true;
    }
  });
  elements.get('collectionDescriptionSaveButton').dispatch('click');
  elements.get('collectionDescriptionCancelButton').dispatch('click');
  elements.get('folderDescriptionPreview').dispatch('click');
  elements.get('folderDescriptionSaveButton').dispatch('click');
  elements.get('folderDescriptionCancelButton').dispatch('click');
  elements.get('saveEnvironmentButton').dispatch('click');

  assert.equal(previewKeyPrevented, true);

  assert.deepEqual(calls, [
    'request',
    'docs-edit',
    'docs-save',
    'docs-cancel',
    'request-export',
    'request-export-curl',
    'collection-description-edit',
    'collection-description-save',
    'collection-description-cancel',
    'folder-description-edit',
    'folder-description-save',
    'folder-description-cancel',
    'environment'
  ]);
});

test('renderer bootstrap binds request environment and runner import/export menu actions', () => {
  const controls = [
    ['importRequestButton', 'import-request', 'onImportRequest'],
    ['importEnvironmentButton', 'import-environment', 'onImportEnvironment'],
    ['importRunnerButton', 'import-runner', 'onImportRunner'],
    ['exportEnvironmentButton', 'export-environment', 'onExportEnvironment'],
    ['exportPostmanEnvironmentButton', 'export-postman-environment', 'onExportPostmanEnvironment'],
    ['exportRunnerDefinitionButton', 'export-runner', 'onExportRunnerDefinition'],
    ['exportRunnerHtmlButton', 'export-runner-html', 'onExportRunnerHtml'],
    ['exportRunnerJsonButton', 'export-runner-json', 'onExportRunnerJson'],
    ['exportRunnerCsvButton', 'export-runner-csv', 'onExportRunnerCsv'],
    ['runnerCaptureSettingsButton', 'runner-capture-settings', 'onToggleRunnerCaptureSettings'],
    ['runnerToggleAuthRefreshButton', 'runner-auth-refresh-toggle', 'onToggleRunnerAuthRefresh'],
    ['runnerEditAuthRefreshButton', 'runner-auth-refresh-edit', 'onEditRunnerAuthRefresh'],
    ['runnerAuthRefreshOpenRequestButton', 'runner-auth-open-request', 'onOpenRunnerAuthRefreshRequest'],
    ['runnerAuthRefreshNewRequestButton', 'runner-auth-new-request', 'onNewRunnerAuthRefreshRequest'],
    ['runnerAuthRefreshImportButton', 'runner-auth-import', 'onImportRunnerAuthRefreshRequest'],
    ['runnerAuthRefreshRemoveRequestButton', 'runner-auth-remove-request', 'onRemoveRunnerAuthRefreshRequest'],
    ['runnerAuthRefreshTokenOpenRequestButton', 'runner-auth-refresh-token-open-request', 'onOpenRunnerAuthRefreshTokenRequest'],
    ['runnerAuthRefreshTokenNewRequestButton', 'runner-auth-refresh-token-new-request', 'onNewRunnerAuthRefreshTokenRequest'],
    ['runnerAuthRefreshTokenImportButton', 'runner-auth-refresh-token-import', 'onImportRunnerAuthRefreshTokenRequest'],
    ['runnerAuthRefreshTokenRemoveRequestButton', 'runner-auth-refresh-token-remove-request', 'onRemoveRunnerAuthRefreshTokenRequest'],
    ['performanceToggleAuthRefreshButton', 'performance-auth-refresh-toggle', 'onTogglePerformanceAuthRefresh'],
    ['performanceEditAuthRefreshButton', 'performance-auth-refresh-edit', 'onEditPerformanceAuthRefresh'],
    ['performanceAuthRefreshOpenRequestButton', 'performance-auth-open-request', 'onOpenPerformanceAuthRefreshRequest'],
    ['performanceAuthRefreshNewRequestButton', 'performance-auth-new-request', 'onNewPerformanceAuthRefreshRequest'],
    ['performanceAuthRefreshImportButton', 'performance-auth-import', 'onImportPerformanceAuthRefreshRequest'],
    ['performanceAuthRefreshRemoveRequestButton', 'performance-auth-remove-request', 'onRemovePerformanceAuthRefreshRequest'],
    ['performanceAuthRefreshTokenOpenRequestButton', 'performance-auth-refresh-token-open-request', 'onOpenPerformanceAuthRefreshTokenRequest'],
    ['performanceAuthRefreshTokenNewRequestButton', 'performance-auth-refresh-token-new-request', 'onNewPerformanceAuthRefreshTokenRequest'],
    ['performanceAuthRefreshTokenImportButton', 'performance-auth-refresh-token-import', 'onImportPerformanceAuthRefreshTokenRequest'],
    ['performanceAuthRefreshTokenRemoveRequestButton', 'performance-auth-refresh-token-remove-request', 'onRemovePerformanceAuthRefreshTokenRequest']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const calls = [];
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds HTML report option modal controls', () => {
  const controls = [
    ['htmlReportIncludeResultsInput', 'include-results', 'onHtmlReportIncludeResultsChange', 'change'],
    ['htmlReportIncludeDetailsInput', 'include-details', 'onHtmlReportIncludeDetailsChange', 'change'],
    ['cancelHtmlReportOptionsButton', 'cancel', 'onCancelHtmlReportOptions', 'click'],
    ['confirmHtmlReportOptionsButton', 'confirm', 'onConfirmHtmlReportOptions', 'click']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement({ tagName: id.endsWith('Input') ? 'INPUT' : 'BUTTON' })]));
  const calls = [];
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id, , , eventName] of controls) {
    elements.get(id).dispatch(eventName);
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap creates runners from the toolbar New menu and runner empty pane only', () => {
  const elements = new Map([
    ['newRunnerMenuButton', createElement()],
    ['newRunnerButton', createElement()],
    ['emptyCreateRunnerButton', createElement()]
  ]);
  const calls = [];

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onNewRunner: () => calls.push('runner')
  });

  elements.get('newRunnerButton').dispatch('click');
  elements.get('emptyCreateRunnerButton').dispatch('click');
  elements.get('newRunnerMenuButton').dispatch('click');

  assert.deepEqual(calls, ['runner', 'runner']);
});

test('renderer bootstrap binds workspace sandbox control buttons', () => {
  const calls = [];
  const controls = [
    ['addSandboxPackageButton', 'add-package', 'onAddSandboxPackage'],
    ['fetchSandboxPackageButton', 'fetch-package', 'onFetchSandboxPackage'],
    ['refreshSandboxPackagesButton', 'refresh-packages', 'onRefreshSandboxPackages'],
    ['bindSandboxFileButton', 'bind-file', 'onBindSandboxFile'],
    ['refreshSandboxFilesButton', 'refresh-files', 'onRefreshSandboxFiles'],
    ['bindVaultSecretButton', 'bind-vault', 'onBindVaultSecret'],
    ['refreshVaultMetadataButton', 'refresh-vault', 'onRefreshVaultMetadata'],
    ['resetVaultButton', 'reset-vault', 'onResetVault']
  ];
  const elements = new Map(controls.map(([id]) => [id, createElement()]));
  const options = {
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} }
  };
  for (const [, label, optionName] of controls) {
    options[optionName] = () => calls.push(label);
  }

  bindUi(options);
  for (const [id] of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(calls, controls.map(([, label]) => label));
});

test('renderer bootstrap binds diagnostics privacy controls and export button', () => {
  const changes = [];
  const exports = [];
  const diagnosticControlIds = [
    'diagnosticLoggingEnabledInput',
    'diagnosticLogLevelSelect',
    'diagnosticLogUrlsInput',
    'diagnosticLogHeadersInput',
    'diagnosticLogCookiesInput',
    'diagnosticLogBodiesInput',
    'diagnosticLogProtocolMessagesInput',
    'diagnosticLogScriptConsoleInput',
    'diagnosticLogPayloadIdentifiersInput'
  ];
  const elements = new Map([
    ...diagnosticControlIds.map((id) => [id, createElement({ tagName: id === 'diagnosticLogLevelSelect' ? 'SELECT' : 'INPUT' })]),
    ['exportDiagnosticsButton', createElement()]
  ]);

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onDiagnosticsSettingsChange: (event) => changes.push(event.target),
    onExportDiagnostics: () => exports.push('export')
  });

  for (const id of diagnosticControlIds) {
    elements.get(id).dispatch('change');
  }
  elements.get('exportDiagnosticsButton').dispatch('click');

  assert.equal(changes.length, diagnosticControlIds.length);
  assert.deepEqual(exports, ['export']);
});

test('renderer bootstrap binds vault prompt decision buttons', () => {
  const decisions = [];
  const controls = [
    'denyVaultPromptButton',
    'allowVaultPromptRequestButton',
    'allowVaultPromptCollectionButton',
    'allowVaultPromptWorkspaceButton',
    'resetVaultPromptGrantsButton'
  ];
  const elements = new Map(controls.map((id) => [id, createElement()]));

  bindUi({
    doc: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {}
    },
    windowObject: { addEventListener() {} },
    onResolveVaultPrompt: (decision) => decisions.push(decision)
  });

  for (const id of controls) {
    elements.get(id).dispatch('click');
  }

  assert.deepEqual(decisions, [
    { granted: false, scope: 'request' },
    { granted: true, scope: 'request' },
    { granted: true, scope: 'collection' },
    { granted: true, scope: 'workspace' },
    { granted: false, reset: true, scope: 'request' }
  ]);
});

test('renderer supplies handlers for all workspace sandbox controls', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const optionName of [
    'onAddSandboxPackage',
    'onFetchSandboxPackage',
    'onRefreshSandboxPackages',
    'onBindSandboxFile',
    'onRefreshSandboxFiles',
    'onBindVaultSecret',
    'onRefreshVaultMetadata',
    'onResetVault',
    'onDiagnosticsSettingsChange',
    'onExportDiagnostics'
  ]) {
    assert.match(rendererSource, new RegExp(`${optionName}:`), `${optionName} should be passed to bindUi`);
  }
  assert.equal(
    [...rendererSource.matchAll(/onRefreshSandboxFiles:/g)].length,
    1,
    'onRefreshSandboxFiles should not be overwritten by a later bindUi option'
  );
  assert.match(rendererSource, /onRefreshSandboxFiles: refreshSandboxFileBindings/);
});

test('renderer Step 11 workflows do not rely on native prompt alert or confirm dialogs', () => {
  for (const relativePath of [
    'src/renderer/renderer.js',
    'src/renderer/rendererWorkflows.js',
    'src/renderer/rendererBootstrap.js',
    'src/renderer/requestTabState.js',
    'src/renderer/contextMenu.js',
    'src/renderer/codeEditor.js',
    'src/renderer/variableAutocomplete.js',
    'src/renderer/requestTabs.js'
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /(^|[^A-Za-z0-9_$.])(?:prompt|alert|confirm)\s*\(/,
      `${relativePath} should use in-app modal workflows instead of native dialogs`
    );
  }
});

test('renderer cancels active OAuth flow when loaded workspace context resets', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /function cancelActiveOauthFlowForContextReset\(\)/);
  assert.match(rendererSource, /window\.postmeter\.oauth\.cancelFlow\(flowId\)/);
  assert.match(rendererSource, /function applyLoadedWorkspace\(loaded, options = \{\}\) \{\s*cancelActiveOauthFlowForContextReset\(\);/);
  assert.match(rendererSource, /function cancelActiveRuntimeForContextReset\(\)/);
  assert.match(rendererSource, /window\.postmeter\.runner\.cancel\(runnerId\)/);
});

test('renderer clears and scopes vault metadata to the active workspace context', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /let lastVaultMetadataWorkspaceId = null/);
  assert.match(rendererSource, /lastVaultMetadata = null;\s*lastVaultMetadataWorkspaceId = null;\s*activeOauthFlowId = null;\s*activeRunnerId = null;/);
  assert.match(rendererSource, /const metadataWorkspaceId = activeWorkspaceId \|\| ''/);
  assert.match(rendererSource, /if \(\(activeWorkspaceId \|\| ''\) !== metadataWorkspaceId\) \{\s*return;\s*\}/);
  assert.match(rendererSource, /lastVaultMetadataWorkspaceId = metadataWorkspaceId/);
  assert.match(rendererSource, /lastVaultMetadataWorkspaceId !== \(activeWorkspaceId \|\| ''\)/);
});

test('renderer commits client-certificate passphrase secret changes only after settings saves', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  assert.match(rendererSource, /const certificateId = existing\?\.id \|\| \(crypto\.randomUUID/);
  assert.match(rendererSource, /let plainPassphrase = existing\?\.passphrase \|\| ''/);
  assert.match(rendererSource, /passphraseSecretKey = await bindClientCertificatePassphrase\(certificateId, values\.passphrase\)/);
  assert.match(rendererSource, /if \(!saved && passphraseSecretKey && passphraseSecretKey !== previousSecretKey\) \{\s*await unsetClientCertificatePassphraseSecret\(passphraseSecretKey\);/);
  assert.match(rendererSource, /if \(saved && previousSecretKey && previousSecretKey !== passphraseSecretKey\) \{\s*await unsetClientCertificatePassphraseSecret\(previousSecretKey\);/);

  const removeStart = rendererSource.indexOf('async function removeClientCertificate');
  const removeSource = rendererSource.slice(removeStart, rendererSource.indexOf('async function setDiagnosticsSettingsFromInputs', removeStart));
  assert.ok(removeSource.indexOf('const saved = await saveWorkspaceSettingsWithRollback') >= 0);
  assert.ok(
    removeSource.indexOf('const saved = await saveWorkspaceSettingsWithRollback') < removeSource.indexOf('await unsetClientCertificatePassphraseSecret(certificate.passphraseSecretKey)'),
    'certificate removal should unset the vault secret only after the settings save succeeds'
  );
});

test('renderer treats canceled certificate file pickers as cancellation', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  const workspaceStart = rendererSource.indexOf('async function chooseWorkspaceCaCertificate');
  const workspaceSource = rendererSource.slice(workspaceStart, rendererSource.indexOf('async function clearWorkspaceCaCertificate', workspaceStart));

  assert.match(workspaceSource, /if \(!selection\?\.path\) \{\s*return;\s*\}/);
  assert.doesNotMatch(workspaceSource, /promptTextInput/);
  assert.doesNotMatch(rendererSource, /chooseActiveRequestCaCertificate/);
  assert.doesNotMatch(rendererSource, /requestCaCertificatePathInput/);
});

test('renderer exposes Network response diagnostics for TLS results', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  const workflowSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/rendererWorkflows.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');

  assert.match(indexHtml, /id="resultsNetworkTabButton"[\s\S]*aria-controls="responseNetworkTab"/);
  assert.match(indexHtml, /id="responseNetwork"[^>]*aria-label="Network and TLS diagnostics"/);
  assert.match(rendererSource, /\$\('responseNetwork'\)\.value = formatResponseNetwork\(response\)/);
  assert.match(rendererSource, /function formatResponseNetwork\(response\)/);
  assert.match(rendererSource, /appendRunnerTransportDetails\(details, item\)/);
  assert.match(workflowSource, /\$\('responseNetwork'\)|element\('responseNetwork'\)/);
});

test('renderer supplies explicit collection export format handlers', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  for (const [optionName, format] of [
    ['onExportCollection', 'postmeter'],
    ['onExportPostman', 'postman'],
    ['onExportOpenApi', 'openapi'],
    ['onExportCurl', 'curl']
  ]) {
    assert.match(
      rendererSource,
      new RegExp(`${optionName}: \\(\\) => exportCollection\\(null, '${format}'\\)`),
      `${optionName} should pass the ${format} export format`
    );
  }
  assert.match(rendererSource, /onExportWorkspace: \(\) => \{ void exportWorkspaceFromPicker\(\); \}/);
  assert.match(rendererSource, /onExportEnvironment: \(\) => \{ void exportEnvironmentFromPicker\('postmeter'\); \}/);
  assert.match(rendererSource, /onExportPostmanEnvironment: \(\) => \{ void exportEnvironmentFromPicker\('postman'\); \}/);
  assert.match(rendererSource, /onExportRunnerDefinition: \(\) => \{ void exportRunnerDefinitionFromPicker\(\); \}/);
  assert.match(rendererSource, /onExportPerformanceTest: \(\) => \{ void exportPerformanceTestFromPicker\(\); \}/);
});

test('renderer exposes first-class runner UI and sends runner payloads through runtime IPC', () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer.js'), 'utf8');
  const bootstrapSource = fs.readFileSync(path.join(__dirname, '../../src/renderer/rendererBootstrap.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');

  assert.match(indexHtml, /id="runnersPanelTab"[^>]*>Runners<\/button>/);
  assert.match(indexHtml, /id="newRunnerMenuButton"[^>]*>Runner<\/button>/);
  assert.match(indexHtml, /id="runnerMainPanel"/);
  assert.match(indexHtml, /id="runnerImportModal"/);
  assert.match(indexHtml, /id="addRunnerRequestButton"/);
  assert.match(indexHtml, /id="runnerCsvVariablesButton"/);
  assert.match(indexHtml, /id="runnerAllowEnvironmentMutation"/);
  assert.match(indexHtml, /id="runnerToggleCsvVariablesButton"/);
  assert.match(indexHtml, /id="runnerEditCsvVariablesButton"/);
  assert.match(indexHtml, /id="csvVariablesModal"/);
  assert.match(indexHtml, /id="csvVariablesFileSourceButton"/);
  assert.match(indexHtml, /id="csvVariablesInlineSourceButton"/);
  assert.match(indexHtml, /id="csvVariablesValuesToggle"/);
  assert.match(indexHtml, /id="csvVariablesValuesPanel"/);
  assert.match(indexHtml, /id="csvVariablesReuseFirstRowInput"/);
  assert.match(indexHtml, /id="csvVariablesLoopRowsInput"/);
  assert.match(indexHtml, /id="csvVariablesContinueWithoutRowsInput"/);
  assert.match(indexHtml, /id="performanceToggleCsvVariablesButton"/);
  assert.match(indexHtml, /id="performanceEditCsvVariablesButton"/);
  assert.doesNotMatch(indexHtml, /id="runnerUseCsvVariablesInput"/);
  assert.doesNotMatch(indexHtml, /id="performanceUseCsvVariablesInput"/);
  assert.doesNotMatch(indexHtml, /id="newRunnerButton"/);
  assert.match(indexHtml, /id="emptyCreateRunnerButton"[^>]*>New Runner<\/button>/);
  assert.match(bootstrapSource, /bindClick\(doc, 'newRunnerMenuButton', options\.onNewRunner\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'emptyCreateRunnerButton', options\.onNewRunner\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'runnerToggleCsvVariablesButton', options\.onToggleRunnerCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'runnerEditCsvVariablesButton', options\.onEditRunnerCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'performanceToggleCsvVariablesButton', options\.onTogglePerformanceCsvVariables\)/);
  assert.match(bootstrapSource, /bindClick\(doc, 'performanceEditCsvVariablesButton', options\.onEditPerformanceCsvVariables\)/);
  assert.match(bootstrapSource, /bindChange\(doc, 'csvVariablesReuseFirstRowInput'/);
  assert.match(bootstrapSource, /bindClick\(doc, 'confirmRunnerImportButton'/);
  assert.doesNotMatch(bootstrapSource, /newRunnerButton/);
  assert.doesNotMatch(indexHtml, /id="resultsRunnerTabButton"/);
  assert.match(rendererSource, /const startRunner = window\.__postmeterStartRunner \|\| window\.postmeter\.runner\.start/);
  assert.match(rendererSource, /startRunner\(runnerId, cloneJson\(runner\), cloneJson\(runnerEnvironment\)/);
  assert.match(rendererSource, /result\?\.environmentMutationAllowed === true/);
  assert.doesNotMatch(rendererSource, /const runnerCollection = \{/);
});

test('renderer loads vault prompt queue before the app renderer', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  const queueIndex = indexHtml.indexOf('src="vaultPromptQueue.js"');
  const rendererIndex = indexHtml.indexOf('src="renderer.js"');
  assert.ok(queueIndex >= 0, 'vaultPromptQueue.js should be loaded');
  assert.ok(rendererIndex >= 0, 'renderer.js should be loaded');
  assert.ok(queueIndex < rendererIndex, 'vaultPromptQueue.js should load before renderer.js');
});

test('renderer loads code editor helpers before request editor panels and renderer bootstrap', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../../src/renderer/index.html'), 'utf8');
  const codeEditorIndex = indexHtml.indexOf('src="codeEditor.js"');
  const requestPanelsIndex = indexHtml.indexOf('src="requestEditorPanels.js"');
  const rendererIndex = indexHtml.indexOf('src="renderer.js"');
  assert.ok(codeEditorIndex >= 0, 'codeEditor.js should be loaded');
  assert.ok(requestPanelsIndex >= 0, 'requestEditorPanels.js should be loaded');
  assert.ok(rendererIndex >= 0, 'renderer.js should be loaded');
  assert.ok(codeEditorIndex < requestPanelsIndex, 'codeEditor.js should load before request editor panels are rendered.');
  assert.ok(codeEditorIndex < rendererIndex, 'codeEditor.js should load before renderer.js initializes textareas.');
});

function createElement({ tagName = 'BUTTON', value = '', closest = null } = {}) {
  const listeners = new Map();
  return {
    attributes: {},
    tagName,
    value,
    hidden: true,
    dataset: {},
    addEventListener(name, handler) {
      if (!listeners.has(name)) {
        listeners.set(name, []);
      }
      listeners.get(name).push(handler);
    },
    setAttribute(name, nextValue) {
      this.attributes[name] = String(nextValue);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    focus() {
      this.focused = true;
    },
    matches(selector) {
      return selector === 'button' && this.tagName === 'BUTTON';
    },
    closest(selector) {
      return typeof closest === 'function' ? closest(selector) : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    dispatch(name, event = {}) {
      for (const handler of listeners.get(name) || []) {
        handler({
          stopPropagation() {},
          preventDefault: event.preventDefault || (() => {}),
          target: this,
          currentTarget: this,
          key: event.key
        });
      }
    }
  };
}
