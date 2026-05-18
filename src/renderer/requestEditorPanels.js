(function attachRequestEditorPanels(global) {
  const { authEditorState, authFromEditorState } = global.PostMeterAuthModel || require('../core/authModel');
  const {
    cookieFieldIssues,
    domainFromRequestUrl,
    newWorkspaceCookie,
    rendererCookieMatchesHost
  } = global.PostMeterCookieModel || require('./cookieModel');

  function element(doc, id) {
    return doc.getElementById(id);
  }

  function optionElement(doc, options, id) {
    return element(doc, options.idPrefix ? `${options.idPrefix}${id[0].toUpperCase()}${id.slice(1)}` : id);
  }

  function setOptionElementValue(doc, options, id, value) {
    const target = optionElement(doc, options, id);
    if (target) {
      target.value = value;
    }
  }

  function setOptionElementChecked(doc, options, id, value) {
    const target = optionElement(doc, options, id);
    if (target) {
      target.checked = value === true;
    }
  }

  function optionElementValue(doc, options, id) {
    return optionElement(doc, options, id)?.value || '';
  }

  function optionElementChecked(doc, options, id) {
    return optionElement(doc, options, id)?.checked === true;
  }

  function syncOauth1SignatureFields(options = {}) {
    const doc = options.doc || document;
    const signatureMethod = optionElementValue(doc, options, 'authOauth1SignatureMethodSelect') || 'HMAC-SHA1';
    const section = optionElement(doc, options, 'authOauth1SignatureMethodSelect')?.closest?.('[data-auth-section="oauth1"]');
    if (section) {
      section.dataset.oauth1SignatureKind = String(signatureMethod).toUpperCase().startsWith('RSA-') ? 'rsa' : 'shared';
    }
  }

  function syncOauth2GrantFields(options = {}) {
    const doc = options.doc || document;
    const grantType = optionElementValue(doc, options, 'authOauthGrantTypeSelect') || 'authorizationCode';
    const section = optionElement(doc, options, 'authOauthGrantTypeSelect')?.closest?.('[data-auth-section="oauth2"]');
    if (section) {
      section.dataset.oauth2GrantType = grantType;
    }
  }

  function syncJwtAlgorithmFields(options = {}) {
    const doc = options.doc || document;
    const algorithm = String(optionElementValue(doc, options, 'authJwtAlgorithmSelect') || 'HS256').toUpperCase();
    const section = optionElement(doc, options, 'authJwtAlgorithmSelect')?.closest?.('[data-auth-section="jwtBearer"]');
    if (section) {
      section.dataset.jwtAlgorithmKind = algorithm.startsWith('HS') ? 'secret' : 'private';
    }
  }

  function bodyTypeCodeLanguage(bodyType) {
    return bodyType === 'RAW_JSON' ? 'json' : 'text';
  }

  const BEAUTIFY_INDENT = '    ';
  const BEAUTIFIABLE_FORMATS = new Set(['graphql', 'html', 'javascript', 'json', 'xml']);

  function beautifyBodyText(value, format) {
    const text = String(value ?? '');
    if (!text.trim()) {
      return text;
    }
    const normalized = normalizeBeautifyFormat(format);
    if (!BEAUTIFIABLE_FORMATS.has(normalized)) {
      return text;
    }
    if (normalized === 'json') {
      return beautifyJsonText(text);
    }
    if (normalized === 'javascript') {
      return beautifyJavaScriptText(text);
    }
    if (normalized === 'graphql') {
      return beautifyGraphqlText(text);
    }
    return beautifyMarkupText(text);
  }

  function normalizeBeautifyFormat(format) {
    const normalized = String(format || 'text').toLowerCase();
    if (normalized === 'js') {
      return 'javascript';
    }
    if (normalized === 'gql') {
      return 'graphql';
    }
    return normalized;
  }

  function beautifyJsonText(text) {
    try {
      return JSON.stringify(JSON.parse(text), null, 4);
    } catch {
      return text;
    }
  }

  function beautifyMarkupText(text) {
    const trimmed = text.trim();
    if (!trimmed.includes('<')) {
      return text;
    }
    const tokens = trimmed.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
    const lines = [];
    let indent = 0;
    for (const token of tokens) {
      const value = token.trim();
      if (!value) {
        continue;
      }
      if (/^<\//.test(value)) {
        indent = Math.max(0, indent - 1);
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${value}`);
        continue;
      }
      if (/^<!(?:--|doctype|\[cdata\[)/i.test(value) || /^<\?/.test(value) || /\/>$/.test(value)) {
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${value}`);
        continue;
      }
      if (/^</.test(value)) {
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${value}`);
        indent += 1;
        continue;
      }
      for (const line of value.split(/\r?\n/).map((part) => part.trim()).filter(Boolean)) {
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${line}`);
      }
    }
    return lines.length ? lines.join('\n') : text;
  }

  function beautifyJavaScriptText(text) {
    const tokens = tokenizeJavaScript(text);
    if (!tokens.some((token) => /[{}[\],;:=]/.test(token.value))) {
      return text.trim();
    }
    const lines = [];
    let current = '';
    let indent = 0;
    let previous = null;

    const flush = () => {
      const line = current.trim();
      if (line) {
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${line}`);
      }
      current = '';
    };
    const append = (value, options = {}) => {
      if (!current) {
        current = value;
        return;
      }
      if (
        options.tight
        || /\s$/.test(current)
        || current.endsWith('(')
        || current.endsWith('[')
        || current.endsWith('.')
        || /^[)\].,;:]/.test(value)
      ) {
        current += value;
        return;
      }
      current += ` ${value}`;
    };
    const appendToPreviousLine = (value) => {
      if (current.trim()) {
        current = `${current.trimEnd()}${value}`;
        flush();
      } else if (lines.length) {
        lines[lines.length - 1] = `${lines[lines.length - 1].trimEnd()}${value}`;
      }
    };

    for (const token of tokens) {
      const value = token.value;
      if (value === '{' || value === '[') {
        append(value, { tight: previous === '(' || previous === '[' });
        flush();
        indent += 1;
      } else if (value === '}' || value === ']') {
        flush();
        indent = Math.max(0, indent - 1);
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${value}`);
      } else if (value === ',') {
        appendToPreviousLine(',');
      } else if (value === ';') {
        appendToPreviousLine(';');
      } else if (value === ':') {
        current = `${current.trimEnd()}: `;
      } else if (isSpacedJavaScriptOperator(value)) {
        current = `${current.trimEnd()} ${value} `;
      } else if (value === '(') {
        append(value, { tight: true });
      } else if (value === ')') {
        current = `${current.trimEnd()})`;
      } else {
        append(value);
      }
      previous = value;
    }
    flush();
    return lines.length ? lines.join('\n') : text.trim();
  }

  function tokenizeJavaScript(text) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      const next = text[index + 1];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '/' && next === '/') {
        const end = text.indexOf('\n', index + 2);
        const value = text.slice(index, end === -1 ? text.length : end);
        tokens.push({ type: 'comment', value });
        index += value.length;
        continue;
      }
      if (char === '/' && next === '*') {
        const end = text.indexOf('*/', index + 2);
        const value = text.slice(index, end === -1 ? text.length : end + 2);
        tokens.push({ type: 'comment', value });
        index += value.length;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        const end = readQuotedText(text, index, char);
        tokens.push({ type: 'string', value: text.slice(index, end) });
        index = end;
        continue;
      }
      const operator = readJavaScriptOperator(text, index);
      if (operator) {
        tokens.push({ type: 'operator', value: operator });
        index += operator.length;
        continue;
      }
      const word = text.slice(index).match(/^[^\s{}[\](),;:=+\-*/%&|!<>?.]+/);
      if (word) {
        tokens.push({ type: 'word', value: word[0] });
        index += word[0].length;
        continue;
      }
      tokens.push({ type: 'punctuation', value: char });
      index += 1;
    }
    return tokens;
  }

  function readJavaScriptOperator(text, index) {
    for (const operator of ['===', '!==', '=>', '>=', '<=', '&&', '||', '??', '+=', '-=', '*=', '/=', '%=', '==', '!=', '=', '+', '-', '*', '/', '%', '>', '<']) {
      if (text.startsWith(operator, index)) {
        return operator;
      }
    }
    return '';
  }

  function isSpacedJavaScriptOperator(value) {
    return ['===', '!==', '=>', '>=', '<=', '&&', '||', '??', '+=', '-=', '*=', '/=', '%=', '==', '!=', '=', '+', '-', '*', '/', '%', '>', '<'].includes(value);
  }

  function beautifyGraphqlText(text) {
    const tokens = tokenizeGraphql(text);
    if (!tokens.length) {
      return text;
    }
    const lines = [];
    let current = '';
    let indent = 0;
    let selectionDepth = 0;
    let parenDepth = 0;
    let previous = null;

    const flush = () => {
      const line = current.trim();
      if (line) {
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${line}`);
      }
      current = '';
    };
    const append = (value, options = {}) => {
      if (!current) {
        current = value;
        return;
      }
      if (
        options.tight
        || /\s$/.test(current)
        || current.endsWith('(')
        || current.endsWith('[')
        || current.endsWith('@')
        || value === ')'
        || value === ']'
        || value === '!'
      ) {
        current += value;
        return;
      }
      current += ` ${value}`;
    };

    for (const token of tokens) {
      const value = token.value;
      if (token.type === 'comment') {
        flush();
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}${value}`);
      } else if (value === '{') {
        append('{');
        flush();
        indent += 1;
        selectionDepth += 1;
      } else if (value === '}') {
        flush();
        indent = Math.max(0, indent - 1);
        selectionDepth = Math.max(0, selectionDepth - 1);
        lines.push(`${BEAUTIFY_INDENT.repeat(indent)}}`);
      } else if (value === '(' || value === '[') {
        append(value, { tight: true });
        parenDepth += 1;
      } else if (value === ')' || value === ']') {
        append(value, { tight: true });
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (value === ':') {
        current = `${current.trimEnd()}: `;
      } else if (value === ',') {
        current = `${current.trimEnd()}, `;
      } else if (value === '!' || value === '@' || value === '...') {
        append(value, { tight: true });
      } else {
        if (selectionDepth > 0 && parenDepth === 0 && current.trim() && !graphqlTokenStaysInline(previous)) {
          flush();
        }
        append(value, { tight: previous === '@' || previous === '...' });
      }
      previous = value;
    }
    flush();
    return lines.length ? lines.join('\n') : text;
  }

  function tokenizeGraphql(text) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '#') {
        const end = text.indexOf('\n', index + 1);
        const value = text.slice(index, end === -1 ? text.length : end).trim();
        tokens.push({ type: 'comment', value });
        index += value.length;
        continue;
      }
      if (text.startsWith('"""', index)) {
        const end = text.indexOf('"""', index + 3);
        const tokenEnd = end === -1 ? text.length : end + 3;
        tokens.push({ type: 'string', value: text.slice(index, tokenEnd) });
        index = tokenEnd;
        continue;
      }
      if (char === '"') {
        const end = readQuotedText(text, index, char);
        tokens.push({ type: 'string', value: text.slice(index, end) });
        index = end;
        continue;
      }
      if (text.startsWith('...', index)) {
        tokens.push({ type: 'punctuation', value: '...' });
        index += 3;
        continue;
      }
      if (char === '$') {
        const match = text.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*/);
        if (match) {
          tokens.push({ type: 'word', value: match[0] });
          index += match[0].length;
          continue;
        }
      }
      const name = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (name) {
        tokens.push({ type: 'word', value: name[0] });
        index += name[0].length;
        continue;
      }
      const number = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?/);
      if (number) {
        tokens.push({ type: 'number', value: number[0] });
        index += number[0].length;
        continue;
      }
      tokens.push({ type: 'punctuation', value: char });
      index += 1;
    }
    return tokens;
  }

  function graphqlTokenStaysInline(previous) {
    return ['{', '(', '[', ':', '@', '...', ',', '|'].includes(previous);
  }

  function readQuotedText(text, start, quote) {
    let index = start + quote.length;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === quote) {
        return index + quote.length;
      }
      index += 1;
    }
    return text.length;
  }

  function refreshVariableTextboxes(root) {
    global.PostMeterVariableHighlighter?.enhanceVariableTextboxes?.(root);
    global.PostMeterVariableHighlighter?.refreshVariableHighlights?.(root);
  }

  function renderAuthEditor(auth, options = {}) {
    const doc = options.doc || document;
    const showAuthSection = options.showAuthSection || (() => {});
    const fields = authEditorState(auth);

    setOptionElementValue(doc, options, 'authTypeSelect', fields.type);
    showAuthSection(fields.type);
    setOptionElementValue(doc, options, 'authBearerTokenInput', fields.bearerToken);
    setOptionElementValue(doc, options, 'authBasicUsernameInput', fields.basicUsername);
    setOptionElementValue(doc, options, 'authBasicPasswordInput', fields.basicPassword);
    setOptionElementValue(doc, options, 'authApiKeyLocationSelect', fields.apiKeyLocation);
    setOptionElementValue(doc, options, 'authApiKeyNameInput', fields.apiKeyName);
    setOptionElementValue(doc, options, 'authApiKeyValueInput', fields.apiKeyValue);
    setOptionElementValue(doc, options, 'authCookieValueInput', fields.cookieValue);
    setOptionElementValue(doc, options, 'authOauthGrantTypeSelect', fields.oauthGrantType);
    setOptionElementValue(doc, options, 'authOauthTokenTypeSelect', fields.oauthTokenType);
    setOptionElementValue(doc, options, 'authOauthHeaderPrefixInput', fields.oauthHeaderPrefix);
    setOptionElementValue(doc, options, 'authOauthTokenNameInput', fields.oauthTokenName);
    setOptionElementValue(doc, options, 'authOauthAddAuthDataToSelect', fields.oauthAddAuthDataTo);
    setOptionElementValue(doc, options, 'authOauthAccessTokenInput', fields.oauthAccessToken);
    setOptionElementValue(doc, options, 'authOauthRefreshTokenInput', fields.oauthRefreshToken);
    setOptionElementChecked(doc, options, 'authOauthAutoRefreshTokenInput', fields.oauthAutoRefreshToken);
    setOptionElementChecked(doc, options, 'authOauthShareTokenInput', fields.oauthShareToken);
    setOptionElementValue(doc, options, 'authOauthAuthorizationUrlInput', fields.oauthAuthorizationUrl);
    setOptionElementValue(doc, options, 'authOauthCallbackUrlInput', fields.oauthCallbackUrl);
    setOptionElementChecked(doc, options, 'authOauthAuthorizeUsingBrowserInput', fields.oauthAuthorizeUsingBrowser);
    setOptionElementValue(doc, options, 'authOauthRedirectStrategySelect', fields.oauthRedirectStrategy);
    setOptionElementValue(doc, options, 'authOauthDeviceAuthorizationUrlInput', fields.oauthDeviceAuthorizationUrl);
    setOptionElementValue(doc, options, 'authOauthTokenUrlInput', fields.oauthTokenUrl);
    setOptionElementValue(doc, options, 'authOauthRefreshTokenUrlInput', fields.oauthRefreshTokenUrl);
    setOptionElementValue(doc, options, 'authOauthClientIdInput', fields.oauthClientId);
    setOptionElementValue(doc, options, 'authOauthClientSecretInput', fields.oauthClientSecret);
    setOptionElementValue(doc, options, 'authOauthUsernameInput', fields.oauthUsername);
    setOptionElementValue(doc, options, 'authOauthPasswordInput', fields.oauthPassword);
    setOptionElementValue(doc, options, 'authOauthScopesInput', fields.oauthScopes);
    setOptionElementValue(doc, options, 'authOauthStateInput', fields.oauthState);
    setOptionElementValue(doc, options, 'authOauthCodeChallengeMethodSelect', fields.oauthCodeChallengeMethod);
    setOptionElementValue(doc, options, 'authOauthCodeVerifierInput', fields.oauthCodeVerifier);
    setOptionElementValue(doc, options, 'authOauthClientAuthenticationSelect', fields.oauthClientAuthentication);
    setOptionElementValue(doc, options, 'authOauthAuthRequestParamKeyInput', fields.oauthAuthRequestParamKey);
    setOptionElementValue(doc, options, 'authOauthAuthRequestParamValueInput', fields.oauthAuthRequestParamValue);
    setOptionElementValue(doc, options, 'authOauthTokenRequestParamKeyInput', fields.oauthTokenRequestParamKey);
    setOptionElementValue(doc, options, 'authOauthTokenRequestParamValueInput', fields.oauthTokenRequestParamValue);
    setOptionElementValue(doc, options, 'authOauthTokenRequestParamSendInSelect', fields.oauthTokenRequestParamSendIn);
    setOptionElementValue(doc, options, 'authOauthRefreshRequestParamKeyInput', fields.oauthRefreshRequestParamKey);
    setOptionElementValue(doc, options, 'authOauthRefreshRequestParamValueInput', fields.oauthRefreshRequestParamValue);
    setOptionElementValue(doc, options, 'authOauthRefreshRequestParamSendInSelect', fields.oauthRefreshRequestParamSendIn);
    setOptionElementValue(doc, options, 'authOauthUserCodeInput', fields.oauthUserCode);
    setOptionElementValue(doc, options, 'authOauthVerificationUriInput', fields.oauthVerificationUri);
    syncOauth2GrantFields({ ...options, doc });
    setOptionElementValue(doc, options, 'authOauth1SignatureMethodSelect', fields.oauth1SignatureMethod);
    setOptionElementValue(doc, options, 'authOauth1ConsumerKeyInput', fields.oauth1ConsumerKey);
    setOptionElementValue(doc, options, 'authOauth1ConsumerSecretInput', fields.oauth1ConsumerSecret);
    setOptionElementValue(doc, options, 'authOauth1TokenInput', fields.oauth1Token);
    setOptionElementValue(doc, options, 'authOauth1TokenSecretInput', fields.oauth1TokenSecret);
    setOptionElementValue(doc, options, 'authOauth1PrivateKeyInput', fields.oauth1PrivateKey);
    setOptionElementValue(doc, options, 'authOauth1AddAuthDataToSelect', fields.oauth1AddAuthDataTo);
    setOptionElementValue(doc, options, 'authOauth1CallbackInput', fields.oauth1Callback);
    setOptionElementValue(doc, options, 'authOauth1VerifierInput', fields.oauth1Verifier);
    setOptionElementValue(doc, options, 'authOauth1TimestampInput', fields.oauth1Timestamp);
    setOptionElementValue(doc, options, 'authOauth1NonceInput', fields.oauth1Nonce);
    setOptionElementValue(doc, options, 'authOauth1VersionInput', fields.oauth1Version);
    setOptionElementValue(doc, options, 'authOauth1RealmInput', fields.oauth1Realm);
    setOptionElementChecked(doc, options, 'authOauth1IncludeBodyHashInput', fields.oauth1IncludeBodyHash);
    setOptionElementChecked(doc, options, 'authOauth1AddEmptyParamsToSignInput', fields.oauth1AddEmptyParamsToSign);
    syncOauth1SignatureFields({ ...options, doc });
    setOptionElementValue(doc, options, 'authDigestUsernameInput', fields.digestUsername);
    setOptionElementValue(doc, options, 'authDigestPasswordInput', fields.digestPassword);
    setOptionElementChecked(doc, options, 'authDigestDisableRetryingRequestInput', fields.digestDisableRetryingRequest);
    setOptionElementValue(doc, options, 'authDigestRealmInput', fields.digestRealm);
    setOptionElementValue(doc, options, 'authDigestNonceInput', fields.digestNonce);
    setOptionElementValue(doc, options, 'authDigestAlgorithmSelect', fields.digestAlgorithm);
    setOptionElementValue(doc, options, 'authDigestQopInput', fields.digestQop);
    setOptionElementValue(doc, options, 'authDigestNonceCountInput', fields.digestNonceCount);
    setOptionElementValue(doc, options, 'authDigestClientNonceInput', fields.digestClientNonce);
    setOptionElementValue(doc, options, 'authDigestOpaqueInput', fields.digestOpaque);
    setOptionElementValue(doc, options, 'authHawkAuthIdInput', fields.hawkAuthId);
    setOptionElementValue(doc, options, 'authHawkAuthKeyInput', fields.hawkAuthKey);
    setOptionElementValue(doc, options, 'authHawkAlgorithmSelect', fields.hawkAlgorithm);
    setOptionElementValue(doc, options, 'authHawkUserInput', fields.hawkUser);
    setOptionElementValue(doc, options, 'authHawkNonceInput', fields.hawkNonce);
    setOptionElementValue(doc, options, 'authHawkExtraDataInput', fields.hawkExtraData);
    setOptionElementValue(doc, options, 'authHawkAppInput', fields.hawkApp);
    setOptionElementValue(doc, options, 'authHawkDelegationInput', fields.hawkDelegation);
    setOptionElementValue(doc, options, 'authHawkTimestampInput', fields.hawkTimestamp);
    setOptionElementChecked(doc, options, 'authHawkIncludePayloadHashInput', fields.hawkIncludePayloadHash);
    setOptionElementValue(doc, options, 'authAwsAccessKeyInput', fields.awsAccessKey);
    setOptionElementValue(doc, options, 'authAwsSecretKeyInput', fields.awsSecretKey);
    setOptionElementValue(doc, options, 'authAwsAddAuthDataToSelect', fields.awsAddAuthDataTo);
    setOptionElementValue(doc, options, 'authAwsRegionInput', fields.awsRegion);
    setOptionElementValue(doc, options, 'authAwsServiceInput', fields.awsService);
    setOptionElementValue(doc, options, 'authAwsSessionTokenInput', fields.awsSessionToken);
    setOptionElementValue(doc, options, 'authNtlmUsernameInput', fields.ntlmUsername);
    setOptionElementValue(doc, options, 'authNtlmPasswordInput', fields.ntlmPassword);
    setOptionElementChecked(doc, options, 'authNtlmDisableRetryingRequestInput', fields.ntlmDisableRetryingRequest);
    setOptionElementValue(doc, options, 'authNtlmDomainInput', fields.ntlmDomain);
    setOptionElementValue(doc, options, 'authNtlmWorkstationInput', fields.ntlmWorkstation);
    setOptionElementValue(doc, options, 'authAkamaiAccessTokenInput', fields.akamaiAccessToken);
    setOptionElementValue(doc, options, 'authAkamaiClientTokenInput', fields.akamaiClientToken);
    setOptionElementValue(doc, options, 'authAkamaiClientSecretInput', fields.akamaiClientSecret);
    setOptionElementValue(doc, options, 'authAkamaiNonceInput', fields.akamaiNonce);
    setOptionElementValue(doc, options, 'authAkamaiTimestampInput', fields.akamaiTimestamp);
    setOptionElementValue(doc, options, 'authAkamaiBaseUrlInput', fields.akamaiBaseUrl);
    setOptionElementValue(doc, options, 'authAkamaiHeadersToSignInput', fields.akamaiHeadersToSign);
    setOptionElementValue(doc, options, 'authAkamaiMaxBodySizeInput', fields.akamaiMaxBodySize);
    setOptionElementValue(doc, options, 'authJwtAlgorithmSelect', fields.jwtAlgorithm);
    setOptionElementValue(doc, options, 'authJwtSecretInput', fields.jwtSecret);
    setOptionElementChecked(doc, options, 'authJwtSecretBase64EncodedInput', fields.jwtSecretBase64Encoded);
    setOptionElementValue(doc, options, 'authJwtPrivateKeyInput', fields.jwtPrivateKey);
    setOptionElementValue(doc, options, 'authJwtAddTokenToSelect', fields.jwtAddTokenTo);
    setOptionElementValue(doc, options, 'authJwtPayloadInput', fields.jwtPayload);
    setOptionElementValue(doc, options, 'authJwtHeaderPrefixInput', fields.jwtHeaderPrefix);
    setOptionElementValue(doc, options, 'authJwtHeadersInput', fields.jwtHeaders);
    syncJwtAlgorithmFields({ ...options, doc });
    setOptionElementValue(doc, options, 'authAsapAlgorithmSelect', fields.asapAlgorithm);
    setOptionElementValue(doc, options, 'authAsapIssuerInput', fields.asapIssuer);
    setOptionElementValue(doc, options, 'authAsapAudienceInput', fields.asapAudience);
    setOptionElementValue(doc, options, 'authAsapKeyIdInput', fields.asapKeyId);
    setOptionElementValue(doc, options, 'authAsapPrivateKeyInput', fields.asapPrivateKey);
    setOptionElementValue(doc, options, 'authAsapSubjectInput', fields.asapSubject);
    setOptionElementValue(doc, options, 'authAsapAdditionalClaimsInput', fields.asapAdditionalClaims);
    setOptionElementValue(doc, options, 'authAsapExpiresInInput', fields.asapExpiresIn);
    setOptionElementValue(doc, options, 'authClientPfxPathInput', fields.clientPfxPath);
    setOptionElementValue(doc, options, 'authClientCertPathInput', fields.clientCertPath);
    setOptionElementValue(doc, options, 'authClientKeyPathInput', fields.clientKeyPath);
    setOptionElementValue(doc, options, 'authClientCaPathInput', fields.clientCaPath);
    setOptionElementValue(doc, options, 'authClientPassphraseInput', fields.clientPassphrase);
  }

  function collectAuthFromEditor(options = {}) {
    const doc = options.doc || document;
    syncOauth1SignatureFields({ ...options, doc });
    syncOauth2GrantFields({ ...options, doc });
    syncJwtAlgorithmFields({ ...options, doc });
    return authFromEditorState({
      type: optionElementValue(doc, options, 'authTypeSelect'),
      bearerToken: optionElementValue(doc, options, 'authBearerTokenInput'),
      basicUsername: optionElementValue(doc, options, 'authBasicUsernameInput'),
      basicPassword: optionElementValue(doc, options, 'authBasicPasswordInput'),
      apiKeyLocation: optionElementValue(doc, options, 'authApiKeyLocationSelect'),
      apiKeyName: optionElementValue(doc, options, 'authApiKeyNameInput'),
      apiKeyValue: optionElementValue(doc, options, 'authApiKeyValueInput'),
      cookieValue: optionElementValue(doc, options, 'authCookieValueInput'),
      oauthGrantType: optionElementValue(doc, options, 'authOauthGrantTypeSelect'),
      oauthTokenType: optionElementValue(doc, options, 'authOauthTokenTypeSelect'),
      oauthHeaderPrefix: optionElementValue(doc, options, 'authOauthHeaderPrefixInput'),
      oauthTokenName: optionElementValue(doc, options, 'authOauthTokenNameInput'),
      oauthAddAuthDataTo: optionElementValue(doc, options, 'authOauthAddAuthDataToSelect'),
      oauthAccessToken: optionElementValue(doc, options, 'authOauthAccessTokenInput'),
      oauthRefreshToken: optionElementValue(doc, options, 'authOauthRefreshTokenInput'),
      oauthAutoRefreshToken: optionElementChecked(doc, options, 'authOauthAutoRefreshTokenInput'),
      oauthShareToken: optionElementChecked(doc, options, 'authOauthShareTokenInput'),
      oauthAuthorizationUrl: optionElementValue(doc, options, 'authOauthAuthorizationUrlInput'),
      oauthCallbackUrl: optionElementValue(doc, options, 'authOauthCallbackUrlInput'),
      oauthAuthorizeUsingBrowser: optionElementChecked(doc, options, 'authOauthAuthorizeUsingBrowserInput'),
      oauthRedirectStrategy: optionElementValue(doc, options, 'authOauthRedirectStrategySelect'),
      oauthDeviceAuthorizationUrl: optionElementValue(doc, options, 'authOauthDeviceAuthorizationUrlInput'),
      oauthTokenUrl: optionElementValue(doc, options, 'authOauthTokenUrlInput'),
      oauthRefreshTokenUrl: optionElementValue(doc, options, 'authOauthRefreshTokenUrlInput'),
      oauthClientId: optionElementValue(doc, options, 'authOauthClientIdInput'),
      oauthClientSecret: optionElementValue(doc, options, 'authOauthClientSecretInput'),
      oauthUsername: optionElementValue(doc, options, 'authOauthUsernameInput'),
      oauthPassword: optionElementValue(doc, options, 'authOauthPasswordInput'),
      oauthScopes: optionElementValue(doc, options, 'authOauthScopesInput'),
      oauthState: optionElementValue(doc, options, 'authOauthStateInput'),
      oauthCodeChallengeMethod: optionElementValue(doc, options, 'authOauthCodeChallengeMethodSelect'),
      oauthCodeVerifier: optionElementValue(doc, options, 'authOauthCodeVerifierInput'),
      oauthClientAuthentication: optionElementValue(doc, options, 'authOauthClientAuthenticationSelect'),
      oauthAuthRequestParamKey: optionElementValue(doc, options, 'authOauthAuthRequestParamKeyInput'),
      oauthAuthRequestParamValue: optionElementValue(doc, options, 'authOauthAuthRequestParamValueInput'),
      oauthTokenRequestParamKey: optionElementValue(doc, options, 'authOauthTokenRequestParamKeyInput'),
      oauthTokenRequestParamValue: optionElementValue(doc, options, 'authOauthTokenRequestParamValueInput'),
      oauthTokenRequestParamSendIn: optionElementValue(doc, options, 'authOauthTokenRequestParamSendInSelect'),
      oauthRefreshRequestParamKey: optionElementValue(doc, options, 'authOauthRefreshRequestParamKeyInput'),
      oauthRefreshRequestParamValue: optionElementValue(doc, options, 'authOauthRefreshRequestParamValueInput'),
      oauthRefreshRequestParamSendIn: optionElementValue(doc, options, 'authOauthRefreshRequestParamSendInSelect'),
      oauthUserCode: optionElementValue(doc, options, 'authOauthUserCodeInput'),
      oauth1SignatureMethod: optionElementValue(doc, options, 'authOauth1SignatureMethodSelect'),
      oauth1ConsumerKey: optionElementValue(doc, options, 'authOauth1ConsumerKeyInput'),
      oauth1ConsumerSecret: optionElementValue(doc, options, 'authOauth1ConsumerSecretInput'),
      oauth1Token: optionElementValue(doc, options, 'authOauth1TokenInput'),
      oauth1TokenSecret: optionElementValue(doc, options, 'authOauth1TokenSecretInput'),
      oauth1PrivateKey: optionElementValue(doc, options, 'authOauth1PrivateKeyInput'),
      oauth1AddAuthDataTo: optionElementValue(doc, options, 'authOauth1AddAuthDataToSelect'),
      oauth1Callback: optionElementValue(doc, options, 'authOauth1CallbackInput'),
      oauth1Verifier: optionElementValue(doc, options, 'authOauth1VerifierInput'),
      oauth1Timestamp: optionElementValue(doc, options, 'authOauth1TimestampInput'),
      oauth1Nonce: optionElementValue(doc, options, 'authOauth1NonceInput'),
      oauth1Version: optionElementValue(doc, options, 'authOauth1VersionInput'),
      oauth1Realm: optionElementValue(doc, options, 'authOauth1RealmInput'),
      oauth1IncludeBodyHash: optionElementChecked(doc, options, 'authOauth1IncludeBodyHashInput'),
      oauth1AddEmptyParamsToSign: optionElementChecked(doc, options, 'authOauth1AddEmptyParamsToSignInput'),
      digestUsername: optionElementValue(doc, options, 'authDigestUsernameInput'),
      digestPassword: optionElementValue(doc, options, 'authDigestPasswordInput'),
      digestDisableRetryingRequest: optionElementChecked(doc, options, 'authDigestDisableRetryingRequestInput'),
      digestRealm: optionElementValue(doc, options, 'authDigestRealmInput'),
      digestNonce: optionElementValue(doc, options, 'authDigestNonceInput'),
      digestAlgorithm: optionElementValue(doc, options, 'authDigestAlgorithmSelect'),
      digestQop: optionElementValue(doc, options, 'authDigestQopInput'),
      digestNonceCount: optionElementValue(doc, options, 'authDigestNonceCountInput'),
      digestClientNonce: optionElementValue(doc, options, 'authDigestClientNonceInput'),
      digestOpaque: optionElementValue(doc, options, 'authDigestOpaqueInput'),
      hawkAuthId: optionElementValue(doc, options, 'authHawkAuthIdInput'),
      hawkAuthKey: optionElementValue(doc, options, 'authHawkAuthKeyInput'),
      hawkAlgorithm: optionElementValue(doc, options, 'authHawkAlgorithmSelect'),
      hawkUser: optionElementValue(doc, options, 'authHawkUserInput'),
      hawkNonce: optionElementValue(doc, options, 'authHawkNonceInput'),
      hawkExtraData: optionElementValue(doc, options, 'authHawkExtraDataInput'),
      hawkApp: optionElementValue(doc, options, 'authHawkAppInput'),
      hawkDelegation: optionElementValue(doc, options, 'authHawkDelegationInput'),
      hawkTimestamp: optionElementValue(doc, options, 'authHawkTimestampInput'),
      hawkIncludePayloadHash: optionElementChecked(doc, options, 'authHawkIncludePayloadHashInput'),
      awsAccessKey: optionElementValue(doc, options, 'authAwsAccessKeyInput'),
      awsSecretKey: optionElementValue(doc, options, 'authAwsSecretKeyInput'),
      awsAddAuthDataTo: optionElementValue(doc, options, 'authAwsAddAuthDataToSelect'),
      awsRegion: optionElementValue(doc, options, 'authAwsRegionInput'),
      awsService: optionElementValue(doc, options, 'authAwsServiceInput'),
      awsSessionToken: optionElementValue(doc, options, 'authAwsSessionTokenInput'),
      ntlmUsername: optionElementValue(doc, options, 'authNtlmUsernameInput'),
      ntlmPassword: optionElementValue(doc, options, 'authNtlmPasswordInput'),
      ntlmDisableRetryingRequest: optionElementChecked(doc, options, 'authNtlmDisableRetryingRequestInput'),
      ntlmDomain: optionElementValue(doc, options, 'authNtlmDomainInput'),
      ntlmWorkstation: optionElementValue(doc, options, 'authNtlmWorkstationInput'),
      akamaiAccessToken: optionElementValue(doc, options, 'authAkamaiAccessTokenInput'),
      akamaiClientToken: optionElementValue(doc, options, 'authAkamaiClientTokenInput'),
      akamaiClientSecret: optionElementValue(doc, options, 'authAkamaiClientSecretInput'),
      akamaiNonce: optionElementValue(doc, options, 'authAkamaiNonceInput'),
      akamaiTimestamp: optionElementValue(doc, options, 'authAkamaiTimestampInput'),
      akamaiBaseUrl: optionElementValue(doc, options, 'authAkamaiBaseUrlInput'),
      akamaiHeadersToSign: optionElementValue(doc, options, 'authAkamaiHeadersToSignInput'),
      akamaiMaxBodySize: optionElementValue(doc, options, 'authAkamaiMaxBodySizeInput'),
      jwtAlgorithm: optionElementValue(doc, options, 'authJwtAlgorithmSelect'),
      jwtSecret: optionElementValue(doc, options, 'authJwtSecretInput'),
      jwtSecretBase64Encoded: optionElementChecked(doc, options, 'authJwtSecretBase64EncodedInput'),
      jwtPrivateKey: optionElementValue(doc, options, 'authJwtPrivateKeyInput'),
      jwtAddTokenTo: optionElementValue(doc, options, 'authJwtAddTokenToSelect'),
      jwtPayload: optionElementValue(doc, options, 'authJwtPayloadInput'),
      jwtHeaderPrefix: optionElementValue(doc, options, 'authJwtHeaderPrefixInput'),
      jwtHeaders: optionElementValue(doc, options, 'authJwtHeadersInput'),
      asapAlgorithm: optionElementValue(doc, options, 'authAsapAlgorithmSelect'),
      asapIssuer: optionElementValue(doc, options, 'authAsapIssuerInput'),
      asapAudience: optionElementValue(doc, options, 'authAsapAudienceInput'),
      asapKeyId: optionElementValue(doc, options, 'authAsapKeyIdInput'),
      asapPrivateKey: optionElementValue(doc, options, 'authAsapPrivateKeyInput'),
      asapSubject: optionElementValue(doc, options, 'authAsapSubjectInput'),
      asapAdditionalClaims: optionElementValue(doc, options, 'authAsapAdditionalClaimsInput'),
      asapExpiresIn: optionElementValue(doc, options, 'authAsapExpiresInInput'),
      clientPfxPath: optionElementValue(doc, options, 'authClientPfxPathInput'),
      clientCertPath: optionElementValue(doc, options, 'authClientCertPathInput'),
      clientKeyPath: optionElementValue(doc, options, 'authClientKeyPathInput'),
      clientCaPath: optionElementValue(doc, options, 'authClientCaPathInput'),
      clientPassphrase: optionElementValue(doc, options, 'authClientPassphraseInput')
    }, options.existingAuth || {});
  }

  function renderVariablePairs(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId);
    const pairs = options.pairs || [];
    const onChange = options.onChange || (() => {});
    const onRemove = options.onRemove || (() => {});
    const rowClassName = options.rowClassName || 'kv-row env-row';
    const keyPlaceholder = options.keyPlaceholder || 'Variable';
    const valuePlaceholder = options.valuePlaceholder || 'Value';

    container.textContent = '';
    pairs.forEach((pair, index) => {
      const row = doc.createElement('div');
      row.className = rowClassName;

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = pair.enabled !== false;
      enabled.setAttribute('aria-label', `${keyPlaceholder} ${index + 1} enabled`);
      enabled.addEventListener('change', () => {
        pair.enabled = enabled.checked;
        onChange(index, pair);
      });

      const key = doc.createElement('input');
      key.placeholder = keyPlaceholder;
      key.setAttribute('aria-label', `${keyPlaceholder} ${index + 1}`);
      key.value = pair.key || '';
      key.addEventListener('input', () => {
        pair.key = key.value;
        onChange(index, pair);
      });

      const value = doc.createElement('input');
      value.placeholder = valuePlaceholder;
      value.type = 'text';
      value.setAttribute('aria-label', `${valuePlaceholder} ${index + 1}`);
      value.value = pair.value || '';
      value.addEventListener('input', () => {
        pair.value = value.value;
        onChange(index, pair);
      });

      const remove = doc.createElement('button');
      remove.className = 'danger-button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${keyPlaceholder.toLowerCase()} ${pair.key || index + 1}`);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        onRemove(index);
      });

      row.append(enabled, key, value, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function renderRequestPairs(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId);
    const pairs = options.pairs || [];
    const onDirty = options.onDirty || (() => {});
    const onRemove = options.onRemove || (() => {});
    const keyPlaceholder = options.keyPlaceholder || 'Key';
    const valuePlaceholder = options.valuePlaceholder || 'Value';

    container.textContent = '';
    pairs.forEach((pair, index) => {
      const row = doc.createElement('div');
      row.className = 'kv-row';

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = pair.enabled !== false;
      enabled.setAttribute('aria-label', `${keyPlaceholder} ${index + 1} enabled`);
      enabled.addEventListener('change', () => {
        pair.enabled = enabled.checked;
        onDirty();
      });

      const key = doc.createElement('input');
      key.placeholder = keyPlaceholder;
      key.setAttribute('aria-label', `${keyPlaceholder} ${index + 1}`);
      key.value = pair.key || '';
      key.addEventListener('input', () => {
        pair.key = key.value;
        onDirty();
      });

      const value = doc.createElement('input');
      value.placeholder = valuePlaceholder;
      value.setAttribute('aria-label', `${valuePlaceholder} ${index + 1}`);
      value.value = pair.value || '';
      value.addEventListener('input', () => {
        pair.value = value.value;
        onDirty();
      });

      const remove = doc.createElement('button');
      remove.className = 'danger-button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${keyPlaceholder.toLowerCase()} ${pair.key || index + 1}`);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        row.parentNode?.removeChild(row);
        onDirty();
        onRemove(index);
      });

      row.append(enabled, key, value, remove);
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function buildAvailableVariableRows(collection, environment, request, folder, folders = null) {
    const rows = [];
    let order = 0;
    const addScope = (source, variables, precedence, sourceName = '') => {
      for (const pair of variables || []) {
        const key = String(pair?.key || '').trim();
        if (!key || pair?.enabled === false) {
          continue;
        }
        rows.push({
          key,
          value: pair.value == null ? '' : String(pair.value),
          source,
          sourceName,
          status: 'Active',
          precedence,
          order: order++
        });
      }
    };

    addScope('Environment', environment?.variables || [], 10, environment?.name || '');
    addScope('Collection', collection?.variables || [], 20, collection?.name || '');
    const folderScopes = Array.isArray(folders) ? folders : (folder ? [folder] : []);
    folderScopes.forEach((folderScope, index) => {
      addScope('Folder', folderScope?.variables || [], 30 + index, folderScope?.name || '');
    });
    addScope('Request', request?.variables || [], 100, request?.name || '');

    const winners = new Map();
    for (const row of rows) {
      const existing = winners.get(row.key);
      if (!existing || row.precedence > existing.precedence || (row.precedence === existing.precedence && row.order > existing.order)) {
        winners.set(row.key, row);
      }
    }
    for (const row of rows) {
      row.status = winners.get(row.key) === row ? 'Active' : 'Shadowed';
    }

    return rows.sort((left, right) =>
      left.key.localeCompare(right.key)
      || right.precedence - left.precedence
      || left.order - right.order
    );
  }

  const VARIABLE_PREVIEW_DEFAULT_SORT = { column: 'Name', direction: 'asc' };
  const VARIABLE_PREVIEW_SORT_COLUMNS = new Set(['Name', 'Source', 'Status']);

  function buildVariablePreviewText(collection, environment, request, folder, folders = null) {
    const rows = buildAvailableVariableRows(collection, environment, request, folder, folders)
      .filter((item) => item.status === 'Active')
      .map((item) => `${item.key} = ${item.value} (${item.source})`);
    return rows.length ? rows.join('\n') : 'No variables';
  }

  function renderVariablePreview(options = {}) {
    const doc = options.doc || document;
    const container = element(doc, options.containerId || 'variablePreview');
    const sort = variablePreviewSortState(container, options.sort);
    const rows = sortAvailableVariableRows(
      buildAvailableVariableRows(options.collection, options.environment, options.request, options.folder, options.folders),
      sort
    );
    container.textContent = '';
    container.dataset.variablePreviewMode = 'grid';
    container.dataset.variablePreviewSortColumn = sort.column;
    container.dataset.variablePreviewSortDirection = sort.direction;
    if (!rows.length) {
      const empty = doc.createElement('div');
      empty.className = 'variable-preview-empty';
      empty.textContent = 'No variables';
      container.append(empty);
      return;
    }

    const heading = doc.createElement('div');
    heading.className = 'variable-preview-heading';
    const title = doc.createElement('strong');
    title.className = 'variable-preview-title';
    title.textContent = `Available Variables (${rows.length})`;
    heading.append(title);

    const tableWrap = doc.createElement('div');
    tableWrap.className = 'variable-preview-table-wrap';
    const table = doc.createElement('div');
    table.className = 'variable-preview-table';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Available variables');

    const header = variablePreviewRow(doc, {
      key: 'Name',
      value: 'Value',
      source: 'Source',
      status: 'Status'
    }, {
      header: true,
      sort,
      onSort: (column) => {
        const currentSort = variablePreviewSortState(container);
        const nextDirection = currentSort.column === column && currentSort.direction === 'asc' ? 'desc' : 'asc';
        container.dataset.variablePreviewSortColumn = column;
        container.dataset.variablePreviewSortDirection = nextDirection;
        const nextOptions = { ...options, doc };
        delete nextOptions.sort;
        renderVariablePreview(nextOptions);
      }
    });
    table.append(header);
    for (const row of rows) {
      table.append(variablePreviewRow(doc, row));
    }
    tableWrap.append(table);
    container.append(heading, tableWrap);
  }

  function variablePreviewRow(doc, row, options = {}) {
    const wrapper = doc.createElement('div');
    wrapper.className = options.header
      ? 'variable-preview-row variable-preview-header'
      : `variable-preview-row variable-preview-data variable-preview-${row.status.toLowerCase()}`;
    wrapper.setAttribute('role', 'row');
    wrapper.dataset.variableKey = row.key;
    wrapper.dataset.variableSource = row.source;
    wrapper.dataset.variableStatus = row.status;
    wrapper.append(
      variablePreviewCell(doc, row.key, 'Name', 'variable-preview-key', row.key, options),
      variablePreviewCell(doc, row.value, 'Value', 'variable-preview-value', row.value, options),
      variablePreviewCell(doc, row.source, 'Source', 'variable-preview-source', row.sourceName || row.source, options),
      variablePreviewStatusCell(doc, row.status, options.header, options)
    );
    return wrapper;
  }

  function variablePreviewCell(doc, value, column, className, title = '', options = {}) {
    const cell = doc.createElement('div');
    cell.className = `variable-preview-cell ${className}`;
    cell.setAttribute('role', options.header ? 'columnheader' : 'cell');
    cell.dataset.column = column;
    const text = value == null ? '' : String(value);
    if (options.header && VARIABLE_PREVIEW_SORT_COLUMNS.has(column)) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'variable-preview-sort-button';
      button.textContent = text;
      const isActiveSort = options.sort?.column === column;
      button.setAttribute('aria-label', `${text}: sort ${isActiveSort && options.sort?.direction === 'asc' ? 'descending' : 'ascending'}`);
      if (typeof options.onSort === 'function') {
        button.addEventListener('click', () => options.onSort(column));
      }
      const indicator = doc.createElement('span');
      indicator.className = 'variable-preview-sort-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.textContent = isActiveSort ? (options.sort.direction === 'asc' ? '^' : 'v') : '';
      button.append(indicator);
      cell.append(button);
      cell.setAttribute('aria-sort', isActiveSort ? (options.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    } else {
      cell.textContent = text;
    }
    if (title) {
      cell.title = String(title);
    }
    return cell;
  }

  function variablePreviewStatusCell(doc, status, header = false, options = {}) {
    const cell = variablePreviewCell(doc, status, 'Status', 'variable-preview-status-cell', status, { ...options, header });
    if (!header) {
      const badge = doc.createElement('span');
      badge.className = `variable-preview-status variable-preview-status-${String(status || '').toLowerCase()}`;
      badge.textContent = status;
      badge.title = status === 'Shadowed'
        ? 'A variable with this name exists in a higher-priority scope, so this value will not be used.'
        : 'This is the variable value that will be used for this name.';
      cell.textContent = '';
      cell.append(badge);
    }
    return cell;
  }

  function variablePreviewSortState(container, override = null) {
    const column = normalizeVariablePreviewSortColumn(override?.column || container?.dataset?.variablePreviewSortColumn);
    const direction = normalizeVariablePreviewSortDirection(override?.direction || container?.dataset?.variablePreviewSortDirection);
    return {
      column: column || VARIABLE_PREVIEW_DEFAULT_SORT.column,
      direction: direction || VARIABLE_PREVIEW_DEFAULT_SORT.direction
    };
  }

  function normalizeVariablePreviewSortColumn(column) {
    const normalized = String(column || '').trim().toLowerCase();
    if (normalized === 'name') {
      return 'Name';
    }
    if (normalized === 'source') {
      return 'Source';
    }
    if (normalized === 'status') {
      return 'Status';
    }
    return '';
  }

  function normalizeVariablePreviewSortDirection(direction) {
    return String(direction || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  }

  function sortAvailableVariableRows(rows, sort = VARIABLE_PREVIEW_DEFAULT_SORT) {
    const state = {
      column: normalizeVariablePreviewSortColumn(sort?.column) || VARIABLE_PREVIEW_DEFAULT_SORT.column,
      direction: normalizeVariablePreviewSortDirection(sort?.direction)
    };
    const multiplier = state.direction === 'desc' ? -1 : 1;
    return [...(rows || [])].sort((left, right) => {
      const primary = compareVariablePreviewColumn(left, right, state.column);
      if (primary) {
        return primary * multiplier;
      }
      return compareVariablePreviewFallback(left, right);
    });
  }

  function compareVariablePreviewColumn(left, right, column) {
    if (column === 'Source') {
      return (left.precedence || 0) - (right.precedence || 0);
    }
    if (column === 'Status') {
      return variablePreviewStatusRank(left.status) - variablePreviewStatusRank(right.status);
    }
    return compareVariablePreviewText(left.key, right.key);
  }

  function compareVariablePreviewFallback(left, right) {
    return compareVariablePreviewText(left.key, right.key)
      || right.precedence - left.precedence
      || left.order - right.order;
  }

  function variablePreviewStatusRank(status) {
    return String(status || '') === 'Active' ? 0 : 1;
  }

  function compareVariablePreviewText(left, right) {
    return String(left || '').localeCompare(String(right || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function renderCookieJarEditor(options = {}) {
    const doc = options.doc || document;
    const onDirty = options.onDirty || (() => {});
    const workspace = options.workspace;
    const rerender = options.rerender || (() => {});
    const setStatus = options.setStatus || (() => {});
    const container = options.containerId ? element(doc, options.containerId) : null;
    const filterInput = element(doc, options.filterInputId || 'filterCookiesToRequestHostInput');
    const filterLabel = options.filterLabelId ? element(doc, options.filterLabelId) : null;

    if (!workspace) {
      return;
    }
    workspace.cookies ||= [];

    const activeHost = domainFromRequestUrl(options.activeRequestUrl);
    const managedCookieNames = new Set((options.managedCookieNames || [])
      .map((name) => String(name || '').trim())
      .filter(Boolean));
    ensureManagedCookies(workspace, activeHost, managedCookieNames);
    const filterActive = filterInput?.checked === true && Boolean(activeHost);
    if (filterInput) {
      filterInput.disabled = !activeHost;
      if (!activeHost) {
        filterInput.checked = false;
      }
    }
    if (filterLabel) {
      filterLabel.textContent = activeHost ? `Host: ${activeHost}` : 'No active host';
    }
    if (!container) {
      return;
    }
    container.textContent = '';

    const visibleCookies = workspace.cookies
      .map((cookie, index) => ({ cookie, index }))
      .filter(({ cookie }) => !filterActive || rendererCookieMatchesHost(cookie, activeHost));

    if (!visibleCookies.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = workspace.cookies.length && filterActive ? 'No cookies for active host' : 'No cookies';
      container.append(empty);
      return;
    }

    visibleCookies.forEach(({ cookie, index }) => {
      const managedCookie = managedCookieNames.has(String(cookie.name || '').trim())
        && (!activeHost || rendererCookieMatchesHost(cookie, activeHost));
      const row = doc.createElement('div');
      row.className = 'cookie-row';
      row.classList.toggle('managed-cookie-row', managedCookie);
      if (managedCookie) {
        row.title = 'Managed by Refreshing Auth for this request.';
      }

      const enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = cookie.enabled !== false;
      enabled.disabled = managedCookie;
      enabled.setAttribute('aria-label', `Cookie ${cookie.name || index + 1} enabled`);
      enabled.addEventListener('change', () => {
        onDirty();
        cookie.enabled = enabled.checked;
      });

      const cookieLabel = cookie.name || index + 1;
      const name = cookieInput(doc, cookie.name || '', 'Name', (value) => {
        onDirty();
        cookie.name = value;
      }, 'text', `Cookie ${cookieLabel} name`);
      const value = cookieInput(doc, cookie.value || '', 'Value', (next) => {
        onDirty();
        cookie.value = next;
      }, 'text', `Cookie ${cookieLabel} value`);
      const domain = cookieInput(doc, cookie.domain || '', 'Domain', (next) => {
        onDirty();
        cookie.domain = next;
      }, 'text', `Cookie ${cookieLabel} domain`);
      const path = cookieInput(doc, cookie.path || '/', 'Path', (next) => {
        onDirty();
        cookie.path = next || '/';
      }, 'text', `Cookie ${cookieLabel} path`);
      const expires = cookieInput(doc, cookie.expiresAt || '', 'Expires ISO', (next) => {
        onDirty();
        cookie.expiresAt = next;
      }, 'text', `Cookie ${cookieLabel} expiration`);
      for (const input of [name, value, domain, path, expires]) {
        input.disabled = managedCookie;
      }

      const secureLabel = checkboxLabel(doc, 'Secure', cookie.secure === true, (checked) => {
        onDirty();
        cookie.secure = checked;
        if (!checked && cookie.sameSite === 'None') {
          cookie.sameSite = '';
          setStatus('SameSite=None requires Secure.');
          rerender();
        }
      });
      const httpOnlyLabel = checkboxLabel(doc, 'HttpOnly', cookie.httpOnly === true, (checked) => {
        onDirty();
        cookie.httpOnly = checked;
      });
      const hostOnlyLabel = checkboxLabel(doc, 'Host only', cookie.hostOnly !== false, (checked) => {
        onDirty();
        cookie.hostOnly = checked;
        rerender();
      });

      const sameSite = doc.createElement('select');
      for (const option of ['', 'Lax', 'Strict', 'None']) {
        sameSite.append(new Option(option || 'SameSite', option));
      }
      sameSite.value = cookie.sameSite || '';
      sameSite.disabled = managedCookie;
      sameSite.setAttribute('aria-label', `Cookie ${cookie.name || index + 1} SameSite`);
      sameSite.addEventListener('change', () => {
        if (sameSite.value === 'None' && cookie.secure !== true) {
          cookie.sameSite = '';
          sameSite.value = '';
          setStatus('SameSite=None requires Secure.');
          return;
        }
        onDirty();
        cookie.sameSite = sameSite.value;
      });

      const remove = doc.createElement('button');
      remove.className = 'danger-button';
      remove.textContent = 'Remove';
      remove.disabled = managedCookie;
      remove.setAttribute('aria-label', `Remove cookie ${cookie.name || index + 1}`);
      remove.addEventListener('click', () => {
        onDirty();
        workspace.cookies.splice(index, 1);
        rerender();
      });

      bindCookieFieldValidation(cookie, { domain, path, expires }, activeHost);
      row.append(enabled, name, value, domain, path, expires, secureLabel, httpOnlyLabel, hostOnlyLabel, sameSite, remove);
      if (managedCookie) {
        for (const input of row.querySelectorAll?.('input, select, button') || []) {
          input.disabled = true;
        }
      }
      container.append(row);
    });
    refreshVariableTextboxes(container);
  }

  function cookieInput(doc, initialValue, placeholder, onInput, type = 'text', ariaLabel = `Cookie ${placeholder}`) {
    const input = doc.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', ariaLabel);
    input.value = initialValue;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function ensureManagedCookies(workspace, activeHost, managedCookieNames) {
    if (!activeHost || !managedCookieNames?.size) {
      return;
    }
    workspace.cookies ||= [];
    for (const name of managedCookieNames) {
      const exists = workspace.cookies.some((cookie) => String(cookie?.name || '').trim() === name
        && rendererCookieMatchesHost(cookie, activeHost));
      if (exists) {
        continue;
      }
      workspace.cookies.push(newWorkspaceCookie({
        name,
        value: '',
        domain: activeHost,
        path: '/',
        hostOnly: true,
        httpOnly: true,
        sameSite: 'Lax',
        source: 'auth-refresh'
      }));
    }
  }

  function bindCookieFieldValidation(cookie, inputs, activeHost) {
    const refresh = () => {
      const issues = cookieFieldIssues(cookie, activeHost);
      applyCookieInputIssue(inputs.domain, issues.domain);
      applyCookieInputIssue(inputs.path, issues.path);
      applyCookieInputIssue(inputs.expires, issues.expires);
    };
    for (const input of Object.values(inputs)) {
      input.addEventListener('input', refresh);
    }
    refresh();
  }

  function applyCookieInputIssue(input, issue) {
    input.classList.toggle('invalid-input', Boolean(issue));
    input.setAttribute('aria-invalid', issue ? 'true' : 'false');
    input.title = issue || '';
  }

  function checkboxLabel(doc, label, checked, onChange) {
    const wrapper = doc.createElement('label');
    wrapper.className = 'inline-toggle';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onChange(input.checked));
    const text = doc.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    return wrapper;
  }

  function syncRefreshingAuthSelectOptions(select, options = {}) {
    if (!select) {
      return;
    }
    syncRefreshingAuthSelectOption(select, {
      value: options.accessTokenValue || 'autoRefresh',
      label: options.accessTokenLabel || 'Use Refreshing Access Token',
      available: options.accessTokenAvailable === true
    });
    syncRefreshingAuthSelectOption(select, {
      value: options.refreshTokenValue || 'autoRefreshRefreshToken',
      label: options.refreshTokenLabel || 'Refreshing Auth Refresh Token',
      available: options.refreshTokenAvailable === true
    });
    if (!authSelectOptionAvailable(select, select.value)) {
      select.value = 'none';
    }
  }

  function syncRefreshingAuthSelectOption(select, options = {}) {
    let option = select.querySelector?.(`option[value="${options.value}"]`) || null;
    if (options.available && !option) {
      option = select.ownerDocument?.createElement
        ? select.ownerDocument.createElement('option')
        : { dataset: {}, setAttribute() {}, removeAttribute() {} };
      option.value = options.value;
      option.dataset ||= {};
      option.dataset.authAutoRefreshOption = 'true';
      select.append?.(option);
    }
    if (!option) {
      return;
    }
    option.textContent = options.label;
    option.hidden = !options.available;
    option.disabled = !options.available;
  }

  function authSelectOptionAvailable(select, value) {
    const option = select.querySelector?.(`option[value="${value}"]`) || null;
    if (!option && ['autoRefresh', 'autoRefreshRefreshToken'].includes(String(value || ''))) {
      return false;
    }
    return !option || (option.hidden !== true && option.disabled !== true);
  }

  const exported = {
    beautifyBodyText,
    bodyTypeCodeLanguage,
    buildAvailableVariableRows,
    buildVariablePreviewText,
    collectAuthFromEditor,
    renderAuthEditor,
    renderCookieJarEditor,
    renderRequestPairs,
    sortAvailableVariableRows,
    syncJwtAlgorithmFields,
    syncOauth1SignatureFields,
    syncOauth2GrantFields,
    syncRefreshingAuthSelectOptions,
    renderVariablePairs,
    renderVariablePreview
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestEditorPanels = exported;
})(typeof window === 'undefined' ? globalThis : window);
