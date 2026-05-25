(function attachUiAuthMatrixSmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput
  } = resolveUiSmokeCommon(global);

  const ASAP_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCQqphluuMiRdyU
or6JHzdG23i/2h8sgQUGY/ttge/5dDNDMpSQM5kqZSN7ubyTlqh/JuWa1AaNlZI4
TcaXDXAecNCLjuCTwuQa/739uigxaJXYWGxu0IvpK+QnsMKrVjVhOmUJoKYTeY5x
ts69r9wI1kibccmeIa3kNShKeALU3IK6JE8+XnbB9QfYkpKZNr/Tywbo0SYLIv8Q
fA+rmYy38LJFxQiW9JJYWQauHuipkpVaLXtVlZYM9vrCQ2HXEicixot7RbWu5gvw
tqogZC7Hu+OTXnCx6xnENb0JjpUol9OvH6i5fC5R+CnEG9fB/qApEJ7cfiXhCEam
EDETl+WBAgMBAAECggEAAcB5HDlDRR/atBeU7ljpDNP9Tjh0Wm/9CTbmfWzehLMw
KDsJcsYXL5zeLUJCavie9Xw5eVKiOi5yoPkrI5rjbdDwq5H5PPzWEZAhgzww/qkt
MFugw4ZFvXb9OjBRKS0/8/uWq+NMw41cKNsdfY1OwTIkGrLJ7d7rSclNgbpakWyO
BL9Guo8C/+uxhngKcGYslV2PzdxGulpS8ADbgLeMQS0qObtpcoAkpYjH/pDPmsQG
uQ1CXLsTW+PBxzTXKuzsjyLA6qSVK+Ph5nS0q11OyGTshisNKhK9OjjnXeEWctgl
UVWV9YF6AvXP8P1fJHepQ/2m8wuxWLyxx0J5albPgQKBgQDEoNyPEzTRif7yWf0B
RORuxzirMhFLJjU2XW3Hov6RYQpZubrVY9LVqvJQreUxnmVYZsexN0UDJPuu0eZk
w2CtlBAC02pLYhCI+KywlIHYG8apae9phDVANk92HjZ181QaIS+7UFeBSzKrlXAD
Syy2AhK4hMaUYhBOPzytlSpkYQKBgQC8WSKAZKn4JBnoHvYLw6cJi/CyG3I1QMOY
SfbFppu3fKqfD9igqPY5Id9X0cHn42sDlrRnS0sFWWiNtvzxijVUmpZr0aunb50r
cXPbxEK9WGLEJujP5e3hTvS5Qoiac7EaxooFfkraxW1Xiaf07zO9WLwItpZrLEv0
YmPZCQUVIQKBgC7kIdUpAmaaHyeSmEiOMl/MuNHyzbb7NKNzYnPChi0LVFmTdl/f
P29fJgxhfA/6MzcCw8qaYKXgUvkc63HKOisK7UqPOoEhsMnJa/1sXQ65iQXr0oF6
WuymRwrnJ5u3XK4ijeyAu22FDl9m8uCGM/JvyiEg4O6P+E2AvSq0MPjhAoGAcNGT
cQTbKt+1BO1GxFU1wOoqCwWVq4BXqOjlAA+ERqxOJ2j+gX2zvxUjCx+B3rzCZSvo
c9cN4O5lSj3J1YTL3Rmb8IlvIKQiqNsUYxd0Qqamwofr/Fvl2YfJ3w6TdLDH7Rnv
osq7W7/WdxDlojmF7G0ydKWqBBhMht5IoMBeYwECgYEAotUbg/oHUhyk6YxVAeAC
DcQbYPPqU/PWF1RlqjC/mGFmbKQzo/6KZQNg+XIzHJNN4FKyzSKtKZfZ9V+20OgT
ilLO7aG5zRdcv9xqid7I6SUPAeKutXTYZhtyrJ3yL6D97AqUsDn3xHY71/HPGmq9
oYFs0AIGZkWoRrgOaWck4dw=
-----END PRIVATE KEY-----`;

  async function runUiAuthMatrixSmoke(params) {
    const baseUrl = params.get('uiAuthBaseUrl');
    assertUiSmoke(baseUrl, 'UI auth matrix smoke requires a verifier base URL.');
    resetWorkspace();
    newCollection();
    newRequest();
    assertUiSmoke(activeRequest(), 'Auth matrix smoke request was not created.');
    activeRequest().name = 'Auth Matrix Smoke Request';
    renderAll();

    await verifyNoAuth(baseUrl);
    await verifyBasic(baseUrl);
    await verifyBearer(baseUrl);
    await verifyApiKeyHeader(baseUrl);
    await verifyApiKeyQuery(baseUrl);
    await verifyCookie(baseUrl);
    verifyClientCertificateEditor(baseUrl);
    await verifyDigest(baseUrl);
    await verifyOAuth1(baseUrl);
    await verifyNtlm(baseUrl);
    await verifyAkamai(baseUrl);
    await verifyJwtBearer(baseUrl);
    await verifyAsap(baseUrl);
  }

  function resetWorkspace() {
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    clearActiveWorkspaceItem();
    renderAll();
  }

  async function verifyNoAuth(baseUrl) {
    prepareCase(baseUrl, '/auth/none');
    setAuthType('none');
    const response = await sendAndRead('none');
    assertUiSmoke(response.verified === true, 'No Auth request unexpectedly sent auth material.');
  }

  async function verifyBasic(baseUrl) {
    prepareCase(baseUrl, '/auth/basic');
    setAuthType('basic');
    setField('authBasicUsernameInput', 'ui-basic-user');
    setField('authBasicPasswordInput', 'ui-basic-password');
    assertUiSmoke(activeRequest().auth.username === 'ui-basic-user', 'Basic Auth UI did not collect the username.');
    const response = await sendAndRead('basic');
    assertUiSmoke(response.verified === true, 'Basic Auth UI request did not verify.');
  }

  async function verifyBearer(baseUrl) {
    prepareCase(baseUrl, '/auth/bearer');
    setAuthType('bearer');
    setField('authBearerTokenInput', 'ui-bearer-token');
    assertUiSmoke(activeRequest().auth.token === 'ui-bearer-token', 'Bearer UI did not collect the token.');
    const response = await sendAndRead('bearer');
    assertUiSmoke(response.verified === true, 'Bearer Auth UI request did not verify.');
  }

  async function verifyApiKeyHeader(baseUrl) {
    prepareCase(baseUrl, '/auth/api-key-header');
    setAuthType('apiKey');
    setSelect('authApiKeyLocationSelect', 'header');
    setField('authApiKeyNameInput', 'X-UI-API-Key');
    setField('authApiKeyValueInput', 'ui-api-key-value');
    const response = await sendAndRead('api key header');
    assertUiSmoke(response.verified === true, 'API key header UI request did not verify.');
  }

  async function verifyApiKeyQuery(baseUrl) {
    prepareCase(baseUrl, '/auth/api-key-query');
    setAuthType('apiKey');
    setSelect('authApiKeyLocationSelect', 'query');
    setField('authApiKeyNameInput', 'ui_api_key');
    setField('authApiKeyValueInput', 'ui-query-key-value');
    const response = await sendAndRead('api key query');
    assertUiSmoke(response.verified === true, 'API key query UI request did not verify.');
  }

  async function verifyCookie(baseUrl) {
    prepareCase(baseUrl, '/auth/cookie');
    setAuthType('cookie');
    setField('authCookieValueInput', 'uiSession=ui-cookie-value');
    assertUiSmoke(activeRequest().auth.value === 'uiSession=ui-cookie-value', 'Cookie auth UI did not collect the cookie value.');
    const response = await sendAndRead('cookie');
    assertUiSmoke(response.verified === true, 'Cookie Auth UI request did not verify.');
  }

  function verifyClientCertificateEditor(baseUrl) {
    prepareCase(baseUrl, '/auth/client-certificate');
    setAuthType('clientCertificate');
    setField('authClientPfxPathInput', '/tmp/ui-client.p12');
    setField('authClientCaPathInput', '/tmp/ui-ca.pem');
    setField('authClientPassphraseInput', 'ui-client-passphrase');
    assertUiSmoke(activeRequest().auth.type === 'clientCertificate', 'Client certificate UI did not collect the auth type.');
    assertUiSmoke(activeRequest().auth.pfxPath === '/tmp/ui-client.p12', 'Client certificate UI did not collect the PFX/P12 path.');
    assertUiSmoke(activeRequest().auth.caPath === '/tmp/ui-ca.pem', 'Client certificate UI did not collect the CA path.');
    assertUiSmoke(activeRequest().auth.passphrase === 'ui-client-passphrase', 'Client certificate UI did not collect the passphrase.');
  }

  async function verifyDigest(baseUrl) {
    prepareCase(baseUrl, '/auth/digest?case=challenge');
    setAuthType('digest');
    setField('authDigestUsernameInput', 'ui-digest-user');
    setField('authDigestPasswordInput', 'ui-digest-password');
    const response = await sendAndRead('digest');
    assertUiSmoke(response.verified === true, 'Digest Auth UI request did not verify after challenge retry.');
    assertUiSmoke(response.fields.username === 'ui-digest-user', 'Digest Auth UI request sent the wrong username.');
  }

  async function verifyOAuth1(baseUrl) {
    prepareCase(baseUrl, '/auth/oauth1?visible=1');
    setAuthType('oauth1');
    setSelect('authOauth1SignatureMethodSelect', 'HMAC-SHA1');
    setField('authOauth1ConsumerKeyInput', 'ui-oauth1-consumer');
    setField('authOauth1ConsumerSecretInput', 'ui-oauth1-consumer-secret');
    setField('authOauth1TokenInput', 'ui-oauth1-token');
    setField('authOauth1TokenSecretInput', 'ui-oauth1-token-secret');
    setSelect('authOauth1AddAuthDataToSelect', 'header');
    openAdvanced('authOauth1ConsumerKeyInput');
    setField('authOauth1TimestampInput', '1777291400');
    setField('authOauth1NonceInput', 'ui-oauth1-nonce');
    setField('authOauth1VersionInput', '1.0');
    setField('authOauth1RealmInput', 'ui-oauth1-realm');
    const response = await sendAndRead('oauth1');
    assertUiSmoke(response.verified === true, 'OAuth 1.0 UI request did not verify.');
  }

  async function verifyNtlm(baseUrl) {
    prepareCase(baseUrl, '/auth/ntlm');
    setAuthType('ntlm');
    setField('authNtlmUsernameInput', 'ui-ntlm-user');
    setField('authNtlmPasswordInput', 'ui-ntlm-password');
    openAdvanced('authNtlmUsernameInput');
    setField('authNtlmDomainInput', 'UIDOMAIN');
    setField('authNtlmWorkstationInput', 'UIWORKSTATION');
    const response = await sendAndRead('ntlm');
    assertUiSmoke(response.verified === true, 'NTLM UI request did not send a Type 1 authorization header.');
  }

  async function verifyAkamai(baseUrl) {
    prepareCase(baseUrl, '/auth/akamai?existing=1');
    activeRequest().headers = [{ enabled: true, key: 'X-UI-Signed', value: 'signed-header' }];
    renderAll();
    activateTab('request', 'auth');
    setAuthType('akamaiEdgeGrid');
    setField('authAkamaiAccessTokenInput', 'ui-akamai-access');
    setField('authAkamaiClientTokenInput', 'ui-akamai-client');
    setField('authAkamaiClientSecretInput', 'ui-akamai-secret');
    openAdvanced('authAkamaiAccessTokenInput');
    setField('authAkamaiNonceInput', 'ui-akamai-nonce');
    setField('authAkamaiTimestampInput', '20260525T12:00:00+0000');
    setField('authAkamaiBaseUrlInput', 'https://edge.ui-auth.test');
    setField('authAkamaiHeadersToSignInput', 'x-ui-signed');
    setField('authAkamaiMaxBodySizeInput', '1024');
    const response = await sendAndRead('akamai');
    assertUiSmoke(response.verified === true, 'Akamai EdgeGrid UI request did not verify.');
  }

  async function verifyJwtBearer(baseUrl) {
    prepareCase(baseUrl, '/auth/jwt');
    setAuthType('jwtBearer');
    setSelect('authJwtAlgorithmSelect', 'HS256');
    setField('authJwtSecretInput', 'ui-jwt-secret');
    setSelect('authJwtAddTokenToSelect', 'header');
    setField('authJwtPayloadInput', '{"sub":"ui-jwt-subject","scope":"ui-auth-matrix"}');
    openAdvanced('authJwtAlgorithmSelect');
    setField('authJwtHeaderPrefixInput', 'Bearer');
    const response = await sendAndRead('jwt bearer');
    assertUiSmoke(response.verified === true, 'JWT Bearer UI request did not verify.');
  }

  async function verifyAsap(baseUrl) {
    prepareCase(baseUrl, '/auth/asap');
    setAuthType('asap');
    setSelect('authAsapAlgorithmSelect', 'RS256');
    setField('authAsapIssuerInput', 'ui-asap-issuer');
    setField('authAsapAudienceInput', 'ui-asap-audience');
    setField('authAsapKeyIdInput', 'ui-asap-key');
    setField('authAsapPrivateKeyInput', ASAP_PRIVATE_KEY);
    openAdvanced('authAsapAlgorithmSelect');
    setField('authAsapSubjectInput', 'ui-asap-subject');
    setField('authAsapAdditionalClaimsInput', '{"matrix":true}');
    setField('authAsapExpiresInInput', '300');
    const response = await sendAndRead('asap');
    assertUiSmoke(response.verified === true, 'ASAP UI request did not verify.');
  }

  function prepareCase(baseUrl, pathname) {
    activeRequest().headers = [];
    activeRequest().queryParams = [];
    activeRequest().body = '';
    activeRequest().bodyType = 'NONE';
    activeRequest().auth = { type: 'none' };
    renderAll();
    setSelect('methodSelect', 'GET');
    setField('urlInput', `${baseUrl}${pathname}`);
    setSelect('bodyTypeSelect', 'NONE');
    activateTab('request', 'auth');
  }

  function setAuthType(type) {
    setSelect('authTypeSelect', type);
    assertUiSmoke($('authTypeSelect').value === type, `Auth Type select did not accept ${type}.`);
    const activeSection = document.querySelector(`.auth-section.active[data-auth-section="${type}"]`);
    if (type !== 'none') {
      assertUiSmoke(Boolean(activeSection), `${type} auth section did not become active.`);
    }
  }

  async function sendAndRead(label) {
    await sendActiveRequest();
    assertUiSmoke($('responseStatus').textContent === '200', `Expected ${label} request status 200, saw ${$('responseStatus').textContent}: ${$('responseBody').value}`);
    try {
      return JSON.parse($('responseBody').value);
    } catch {
      throw new Error(`${label} smoke response was not JSON: ${$('responseBody').value}`);
    }
  }

  function openAdvanced(anchorId) {
    const advanced = $(anchorId)?.closest?.('.auth-section')?.querySelector?.('details.auth-advanced');
    assertUiSmoke(Boolean(advanced), `${anchorId} advanced disclosure was not rendered.`);
    advanced.open = true;
  }

  function setField(id, value) {
    const input = $(id);
    input.value = value;
    dispatchInput(input);
  }

  function setSelect(id, value) {
    const input = $(id);
    input.value = value;
    dispatchChange(input);
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiAuthMatrixSmoke.js.');
  }

  const exported = {
    runUiAuthMatrixSmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiAuthMatrixSmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
