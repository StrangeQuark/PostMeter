(function attachRendererBootstrap(global) {
  const AUTH_EDITOR_INPUT_IDS = [
    'authTypeSelect',
    'authBearerTokenInput',
    'authBasicUsernameInput',
    'authBasicPasswordInput',
    'authApiKeyLocationSelect',
    'authApiKeyNameInput',
    'authApiKeyValueInput',
    'authCookieValueInput',
    'authOauthGrantTypeSelect',
    'authOauthTokenTypeSelect',
    'authOauthHeaderPrefixInput',
    'authOauthTokenNameInput',
    'authOauthAddAuthDataToSelect',
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthAutoRefreshTokenInput',
    'authOauthShareTokenInput',
    'authOauthAuthorizationUrlInput',
    'authOauthCallbackUrlInput',
    'authOauthAuthorizeUsingBrowserInput',
    'authOauthRedirectStrategySelect',
    'authOauthDeviceAuthorizationUrlInput',
    'authOauthTokenUrlInput',
    'authOauthRefreshTokenUrlInput',
    'authOauthClientIdInput',
    'authOauthClientSecretInput',
    'authOauthUsernameInput',
    'authOauthPasswordInput',
    'authOauthScopesInput',
    'authOauthStateInput',
    'authOauthCodeChallengeMethodSelect',
    'authOauthCodeVerifierInput',
    'authOauthClientAuthenticationSelect',
    'authOauthAuthRequestParamKeyInput',
    'authOauthAuthRequestParamValueInput',
    'authOauthTokenRequestParamKeyInput',
    'authOauthTokenRequestParamValueInput',
    'authOauthTokenRequestParamSendInSelect',
    'authOauthRefreshRequestParamKeyInput',
    'authOauthRefreshRequestParamValueInput',
    'authOauthRefreshRequestParamSendInSelect',
    'authOauthUserCodeInput',
    'authOauthVerificationUriInput',
    'authOauth1SignatureMethodSelect',
    'authOauth1ConsumerKeyInput',
    'authOauth1ConsumerSecretInput',
    'authOauth1TokenInput',
    'authOauth1TokenSecretInput',
    'authOauth1PrivateKeyInput',
    'authOauth1AddAuthDataToSelect',
    'authOauth1CallbackInput',
    'authOauth1VerifierInput',
    'authOauth1TimestampInput',
    'authOauth1NonceInput',
    'authOauth1VersionInput',
    'authOauth1RealmInput',
    'authOauth1IncludeBodyHashInput',
    'authOauth1AddEmptyParamsToSignInput',
    'authDigestUsernameInput',
    'authDigestPasswordInput',
    'authDigestDisableRetryingRequestInput',
    'authDigestRealmInput',
    'authDigestNonceInput',
    'authDigestAlgorithmSelect',
    'authDigestQopInput',
    'authDigestNonceCountInput',
    'authDigestClientNonceInput',
    'authDigestOpaqueInput',
    'authHawkAuthIdInput',
    'authHawkAuthKeyInput',
    'authHawkAlgorithmSelect',
    'authHawkUserInput',
    'authHawkNonceInput',
    'authHawkExtraDataInput',
    'authHawkAppInput',
    'authHawkDelegationInput',
    'authHawkTimestampInput',
    'authHawkIncludePayloadHashInput',
    'authAwsAccessKeyInput',
    'authAwsSecretKeyInput',
    'authAwsAddAuthDataToSelect',
    'authAwsRegionInput',
    'authAwsServiceInput',
    'authAwsSessionTokenInput',
    'authNtlmUsernameInput',
    'authNtlmPasswordInput',
    'authNtlmDisableRetryingRequestInput',
    'authNtlmDomainInput',
    'authNtlmWorkstationInput',
    'authAkamaiAccessTokenInput',
    'authAkamaiClientTokenInput',
    'authAkamaiClientSecretInput',
    'authAkamaiNonceInput',
    'authAkamaiTimestampInput',
    'authAkamaiBaseUrlInput',
    'authAkamaiHeadersToSignInput',
    'authAkamaiMaxBodySizeInput',
    'authJwtAlgorithmSelect',
    'authJwtSecretInput',
    'authJwtSecretBase64EncodedInput',
    'authJwtPrivateKeyInput',
    'authJwtAddTokenToSelect',
    'authJwtPayloadInput',
    'authJwtHeaderPrefixInput',
    'authJwtHeadersInput',
    'authAsapAlgorithmSelect',
    'authAsapIssuerInput',
    'authAsapAudienceInput',
    'authAsapKeyIdInput',
    'authAsapPrivateKeyInput',
    'authAsapSubjectInput',
    'authAsapAdditionalClaimsInput',
    'authAsapExpiresInInput',
    'authClientPfxPathInput',
    'authClientCertPathInput',
    'authClientKeyPathInput',
    'authClientCaPathInput',
    'authClientPassphraseInput'
  ];
  const PERFORMANCE_AUTH_EDITOR_INPUT_IDS = AUTH_EDITOR_INPUT_IDS.map((id) => `performance${id[0].toUpperCase()}${id.slice(1)}`);
  const COLLECTION_AUTH_EDITOR_INPUT_IDS = AUTH_EDITOR_INPUT_IDS.map((id) => `collection${id[0].toUpperCase()}${id.slice(1)}`);
  const FOLDER_AUTH_EDITOR_INPUT_IDS = AUTH_EDITOR_INPUT_IDS.map((id) => `folder${id[0].toUpperCase()}${id.slice(1)}`);
  const AUTH_EDITOR_INPUT_ID_SET = new Set(AUTH_EDITOR_INPUT_IDS);
  const PERFORMANCE_AUTH_EDITOR_INPUT_ID_SET = new Set(PERFORMANCE_AUTH_EDITOR_INPUT_IDS);
  const COLLECTION_AUTH_EDITOR_INPUT_ID_SET = new Set(COLLECTION_AUTH_EDITOR_INPUT_IDS);
  const FOLDER_AUTH_EDITOR_INPUT_ID_SET = new Set(FOLDER_AUTH_EDITOR_INPUT_IDS);

  function initializeRenderer(options = {}) {
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;
    try {
      options.applyThemePreference?.(options.getStoredThemePreference?.() || 'system');
    } catch {
      options.applyThemePreference?.('system');
    }

    doc.addEventListener('DOMContentLoaded', async () => {
      const cleanups = [];
      const registerCleanup = (cleanup) => {
        if (typeof cleanup === 'function') {
          cleanups.push(cleanup);
        }
        return cleanup;
      };

      try {
        await options.onReady?.({ doc, windowObject, registerCleanup });
      } catch (error) {
        reportSmokeInitFailure(doc, windowObject, error);
        throw error;
      }

      windowObject.addEventListener('beforeunload', () => {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            continue;
          }
        }
      }, { once: true });
    }, { once: true });
  }

  function reportSmokeInitFailure(doc, windowObject, error) {
    const search = windowObject?.location?.search || '';
    const params = new URLSearchParams(search);
    const message = smokeFailureText(error);
    for (const [flag, prefix] of [
      ['uiWorkflowSmoke', 'PostMeter UI Workflow'],
      ['uiRegressionSmoke', 'PostMeter UI Regression'],
      ['uiSnapshotSmoke', 'PostMeter UI Snapshot'],
      ['uiTypographySmoke', 'PostMeter UI Typography'],
      ['uiOauthSmoke', 'PostMeter UI OAuth'],
      ['uiHawkSmoke', 'PostMeter UI Hawk'],
      ['uiAwsSmoke', 'PostMeter UI AWS'],
      ['uiA11ySmoke', 'PostMeter UI Accessibility']
    ]) {
      if (params.get(flag) === '1') {
        doc.title = `${prefix}:FAIL:${message}`;
        break;
      }
    }
  }

  function smokeFailureText(error) {
    const primary = String(error?.message || error || 'Renderer initialization failed.');
    const stackLine = String(error?.stack || '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && line !== primary && !line.endsWith(primary) && !line.startsWith('TypeError:') && !line.startsWith('Error:'));
    return stackLine ? `${primary} @ ${stackLine}`.slice(0, 160) : primary.slice(0, 160);
  }

  function bindUi(options = {}) {
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;

    bindToolbarMenus(doc, options);
    bindClick(doc, 'newCollectionButton', options.onNewCollection);
    bindClick(doc, 'collapseCollectionsButton', options.onCollapseCollections);
    bindClick(doc, 'newFolderButton', options.onNewFolder);
    bindClick(doc, 'newRequestButton', options.onNewRequest);
    bindClick(doc, 'newWorkspaceMenuButton', options.onNewWorkspace);
    bindClick(doc, 'newRunnerMenuButton', options.onNewRunner);
    bindClick(doc, 'newPerformanceTestMenuButton', options.onNewPerformanceTest);
    bindClick(doc, 'emptyCreateRequestButton', options.onNewRequest);
    bindClick(doc, 'emptyCreateEnvironmentButton', options.onNewEnvironment);
    bindClick(doc, 'emptyCreateRunnerButton', options.onNewRunner);
    bindClick(doc, 'emptyCreatePerformanceTestButton', options.onNewPerformanceTest);
    bindClick(doc, 'lockedWorkspaceUnlockButton', options.onUnlockActiveWorkspace);
    bindClick(doc, 'lockedWorkspaceSwitchButton', options.onSwitchWorkspaceFromLockedGate);
    bindClick(doc, 'lockedWorkspaceNewButton', options.onNewWorkspaceFromLockedGate);
    bindClick(doc, 'newEnvironmentMenuButton', options.onNewEnvironment);
    bindClick(doc, 'importWorkspaceButton', options.onImportWorkspace);
    bindClick(doc, 'exportWorkspaceButton', options.onExportWorkspace);
    bindClick(doc, 'importRequestButton', options.onImportRequest);
    bindClick(doc, 'exportRequestButton', options.onExportRequest);
    bindClick(doc, 'exportRequestCurlButton', options.onExportRequestCurl);
    bindClick(doc, 'importCollectionButton', options.onImportCollection);
    bindClick(doc, 'importEnvironmentButton', options.onImportEnvironment);
    bindClick(doc, 'importRunnerButton', options.onImportRunner);
    bindClick(doc, 'importPerformanceTestButton', options.onImportPerformanceTest);
    bindClick(doc, 'exportCollectionButton', options.onExportCollection);
    bindClick(doc, 'exportPostmanButton', options.onExportPostman);
    bindClick(doc, 'exportOpenApiButton', options.onExportOpenApi);
    bindClick(doc, 'exportCurlButton', options.onExportCurl);
    bindClick(doc, 'exportEnvironmentButton', options.onExportEnvironment);
    bindClick(doc, 'exportPostmanEnvironmentButton', options.onExportPostmanEnvironment);
    bindClick(doc, 'exportRunnerDefinitionButton', options.onExportRunnerDefinition);
    bindClick(doc, 'exportPerformanceTestMenuButton', options.onExportPerformanceTest);
    bindClick(doc, 'sendButton', options.onSendRequest);
    bindClick(doc, 'saveCollectionButton', options.onSaveCollection);
    bindClick(doc, 'addCollectionVariableButton', options.onAddCollectionVariable);
    bindClick(doc, 'collectionDescriptionPreview', options.onEditCollectionDescription);
    bindKey(doc, 'collectionDescriptionPreview', options.onEditCollectionDescription, ['Enter', ' ']);
    bindClick(doc, 'collectionDescriptionSaveButton', options.onSaveCollectionDescription);
    bindClick(doc, 'collectionDescriptionCancelButton', options.onCancelCollectionDescription);
    bindInput(doc, 'collectionPreRequestScriptInput', options.onCollectionInput);
    bindInput(doc, 'collectionTestScriptInput', options.onCollectionInput);
    bindClick(doc, 'saveFolderButton', options.onSaveFolder);
    bindClick(doc, 'addFolderVariableButton', options.onAddFolderVariable);
    bindClick(doc, 'folderDescriptionPreview', options.onEditFolderDescription);
    bindKey(doc, 'folderDescriptionPreview', options.onEditFolderDescription, ['Enter', ' ']);
    bindClick(doc, 'folderDescriptionSaveButton', options.onSaveFolderDescription);
    bindClick(doc, 'folderDescriptionCancelButton', options.onCancelFolderDescription);
    bindInput(doc, 'folderPreRequestScriptInput', options.onFolderInput);
    bindInput(doc, 'folderTestScriptInput', options.onFolderInput);
    bindClick(doc, 'addParamButton', options.onAddParam);
    bindClick(doc, 'addHeaderButton', options.onAddHeader);
    bindChange(doc, 'sendPostMeterTokenInput', options.onPostMeterTokenHeaderChange);
    bindChange(doc, 'showGeneratedHeadersInput', options.onShowGeneratedHeadersChange);
    bindClick(doc, 'saveRequestButton', options.onSaveRequest);
    bindClick(doc, 'exportRequestPanelPostmeterButton', options.onExportCurrentRequest);
    bindClick(doc, 'exportRequestPanelCurlButton', options.onExportCurrentRequestCurl);
    bindClick(doc, 'saveEnvironmentButton', options.onSaveEnvironment);
    bindClick(doc, 'setEnvironmentButton', options.onSetEnvironment);
    bindClick(doc, 'deleteEnvironmentButton', options.onDeleteEnvironment);
    bindClick(doc, 'deleteWorkspacePanelButton', options.onDeleteWorkspace);
    bindClick(doc, 'encryptWorkspacePanelButton', options.onEncryptWorkspace);
    bindClick(doc, 'removeWorkspaceEncryptionPanelButton', options.onRemoveWorkspaceEncryption);
    bindClick(doc, 'resetWorkspaceEncryptionKeyPanelButton', options.onResetWorkspaceEncryptionKey);
    bindClick(doc, 'addVariableButton', options.onAddEnvironmentVariable);
    bindClick(doc, 'switchWorkspacePanelButton', options.onSwitchWorkspace);
    bindClick(doc, 'exportWorkspacePanelButton', options.onExportWorkspace);
    bindClick(doc, 'addSandboxPackageButton', options.onAddSandboxPackage);
    bindClick(doc, 'fetchSandboxPackageButton', options.onFetchSandboxPackage);
    bindClick(doc, 'refreshSandboxPackagesButton', options.onRefreshSandboxPackages);
    bindClick(doc, 'bindSandboxFileButton', options.onBindSandboxFile);
    bindClick(doc, 'refreshSandboxFilesButton', options.onRefreshSandboxFiles);
    bindClick(doc, 'exportDiagnosticsButton', options.onExportDiagnostics);
    bindClick(doc, 'bindVaultSecretButton', options.onBindVaultSecret);
    bindClick(doc, 'refreshVaultMetadataButton', options.onRefreshVaultMetadata);
    bindClick(doc, 'resetVaultButton', options.onResetVault);
    bindClick(doc, 'addRequestVariableButton', options.onAddRequestVariable);
    bindClick(doc, 'openCookiesButton', options.onOpenCookies);
    bindClick(doc, 'openRequestCookiesButton', options.onOpenCookies);
    bindClick(doc, 'openPerformanceCookiesButton', options.onOpenCookies);
    bindClick(doc, 'cookiesAddDomainButton', options.onAddCookieDomain);
    bindKey(doc, 'cookiesDomainInput', options.onAddCookieDomain, ['Enter']);
    bindClick(doc, 'clearExpiredWorkspaceCookiesButton', options.onClearExpiredWorkspaceCookies);
    bindClick(doc, 'clearAllWorkspaceCookiesButton', options.onClearAllWorkspaceCookies);
    bindClick(doc, 'runCollectionButton', options.onRunCollection);
    bindClick(doc, 'cancelRunnerButton', options.onCancelCollectionRun);
    bindClick(doc, 'exportRunnerHtmlButton', options.onExportRunnerHtml);
    bindClick(doc, 'exportRunnerJsonButton', options.onExportRunnerJson);
    bindClick(doc, 'exportRunnerCsvButton', options.onExportRunnerCsv);
    bindClick(doc, 'runnerToggleCsvVariablesButton', options.onToggleRunnerCsvVariables);
    bindClick(doc, 'runnerEditCsvVariablesButton', options.onEditRunnerCsvVariables);
    bindClick(doc, 'runnerCaptureSettingsButton', options.onToggleRunnerCaptureSettings);
    bindClick(doc, 'runnerAdvancedSettingsButton', options.onToggleRunnerAdvancedSettings);
    bindClick(doc, 'runnerToggleAuthRefreshButton', options.onToggleRunnerAuthRefresh);
    bindClick(doc, 'runnerEditAuthRefreshButton', options.onEditRunnerAuthRefresh);
    bindClick(doc, 'runnerAuthRefreshOpenRequestButton', options.onOpenRunnerAuthRefreshRequest);
    bindClick(doc, 'runnerAuthRefreshAutoDetectRequestButton', options.onAutoDetectRunnerAuthRefreshRequest);
    bindClick(doc, 'runnerAuthRefreshNewRequestButton', options.onNewRunnerAuthRefreshRequest);
    bindClick(doc, 'runnerAuthRefreshImportButton', options.onImportRunnerAuthRefreshRequest);
    bindClick(doc, 'runnerAuthRefreshRemoveRequestButton', options.onRemoveRunnerAuthRefreshRequest);
    bindClick(doc, 'runnerAuthRefreshTokenOpenRequestButton', options.onOpenRunnerAuthRefreshTokenRequest);
    bindClick(doc, 'runnerAuthRefreshTokenAutoDetectRequestButton', options.onAutoDetectRunnerAuthRefreshTokenRequest);
    bindClick(doc, 'runnerAuthRefreshTokenNewRequestButton', options.onNewRunnerAuthRefreshTokenRequest);
    bindClick(doc, 'runnerAuthRefreshTokenImportButton', options.onImportRunnerAuthRefreshTokenRequest);
    bindClick(doc, 'runnerAuthRefreshTokenRemoveRequestButton', options.onRemoveRunnerAuthRefreshTokenRequest);
    bindClick(doc, 'saveRunnerButton', options.onSaveRunner);
    bindClick(doc, 'deleteRunnerButton', options.onDeleteRunner);
    bindClick(doc, 'addRunnerRequestButton', options.onAddRunnerRequest);
    bindClick(doc, 'performanceToggleCsvVariablesButton', options.onTogglePerformanceCsvVariables);
    bindClick(doc, 'performanceEditCsvVariablesButton', options.onEditPerformanceCsvVariables);
    bindClick(doc, 'performanceCaptureSettingsButton', options.onTogglePerformanceCaptureSettings);
    bindClick(doc, 'performanceAdvancedSettingsButton', options.onTogglePerformanceAdvancedSettings);
    bindClick(doc, 'performanceToggleAuthRefreshButton', options.onTogglePerformanceAuthRefresh);
    bindClick(doc, 'performanceEditAuthRefreshButton', options.onEditPerformanceAuthRefresh);
    bindClick(doc, 'performanceAuthRefreshOpenRequestButton', options.onOpenPerformanceAuthRefreshRequest);
    bindClick(doc, 'performanceAuthRefreshAutoDetectRequestButton', options.onAutoDetectPerformanceAuthRefreshRequest);
    bindClick(doc, 'performanceAuthRefreshNewRequestButton', options.onNewPerformanceAuthRefreshRequest);
    bindClick(doc, 'performanceAuthRefreshImportButton', options.onImportPerformanceAuthRefreshRequest);
    bindClick(doc, 'performanceAuthRefreshRemoveRequestButton', options.onRemovePerformanceAuthRefreshRequest);
    bindClick(doc, 'performanceAuthRefreshTokenOpenRequestButton', options.onOpenPerformanceAuthRefreshTokenRequest);
    bindClick(doc, 'performanceAuthRefreshTokenAutoDetectRequestButton', options.onAutoDetectPerformanceAuthRefreshTokenRequest);
    bindClick(doc, 'performanceAuthRefreshTokenNewRequestButton', options.onNewPerformanceAuthRefreshTokenRequest);
    bindClick(doc, 'performanceAuthRefreshTokenImportButton', options.onImportPerformanceAuthRefreshTokenRequest);
    bindClick(doc, 'performanceAuthRefreshTokenRemoveRequestButton', options.onRemovePerformanceAuthRefreshTokenRequest);
    bindClick(doc, 'savePerformanceTestButton', options.onSavePerformanceTest);
    bindClick(doc, 'deletePerformanceTestButton', options.onDeletePerformanceTest);
    bindClick(doc, 'runPerformanceTestButton', options.onRunPerformanceTest);
    bindClick(doc, 'cancelPerformanceTestButton', options.onCancelPerformanceTest);
    bindClick(doc, 'exportPerformanceResultHtmlButton', options.onExportPerformanceResultHtml);
    bindClick(doc, 'exportPerformanceResultJsonButton', options.onExportPerformanceResultJson);
    bindClick(doc, 'exportPerformanceResultCsvButton', options.onExportPerformanceResultCsv);
    bindChange(doc, 'htmlReportIncludeResultsInput', options.onHtmlReportIncludeResultsChange);
    bindChange(doc, 'htmlReportIncludeDetailsInput', options.onHtmlReportIncludeDetailsChange);
    bindClick(doc, 'cancelHtmlReportOptionsButton', options.onCancelHtmlReportOptions);
    bindClick(doc, 'confirmHtmlReportOptionsButton', options.onConfirmHtmlReportOptions);
    bindClick(doc, 'importPerformanceRequestButton', options.onImportPerformanceRequest);
    bindClick(doc, 'addPerformanceParamButton', options.onAddPerformanceParam);
    bindClick(doc, 'addPerformanceHeaderButton', options.onAddPerformanceHeader);
    bindChange(doc, 'performanceSendPostMeterTokenInput', options.onPerformancePostMeterTokenHeaderChange);
    bindChange(doc, 'performanceShowGeneratedHeadersInput', options.onPerformanceShowGeneratedHeadersChange);
    bindClick(doc, 'addPerformanceRequestVariableButton', options.onAddPerformanceRequestVariable);
    bindClick(doc, 'calibratePerformanceButton', options.onCalibratePerformance);
    bindClick(doc, 'startPkceFlowButton', options.onStartPkceFlow);
    bindClick(doc, 'startDeviceFlowButton', options.onStartDeviceFlow);
    bindClick(doc, 'cancelOauthFlowButton', options.onCancelOauthFlow);

    for (const button of doc.querySelectorAll('[data-theme-option]')) {
      button.addEventListener('click', () => options.onSelectTheme?.(button.dataset.themeOption));
    }

    for (const button of doc.querySelectorAll('[data-settings-section]')) {
      button.addEventListener('click', () => options.onSelectSettingsSection?.(button.dataset.settingsSection));
      button.addEventListener('keydown', (event) => {
        moveRovingTabFocus(event, Array.from(doc.querySelectorAll('[data-settings-section]')));
      });
    }
    doc.addEventListener('keydown', (event) => {
      if (event.target?.closest?.('[data-shortcut-action]')) {
        options.onKeyboardShortcutKeydown?.(event);
      }
    });
    doc.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-shortcut-reset]')) {
        options.onResetKeyboardShortcut?.(event);
      }
    });

    bindChange(doc, 'environmentSelect', () => {
      options.onEnvironmentSelectChange?.(getElement(doc, 'environmentSelect')?.value || 'none');
    });
    bindChange(doc, 'runnerStopOnFailure', options.onRunnerConfigChange);
    bindChange(doc, 'runnerAllowEnvironmentMutation', options.onRunnerConfigChange);
    bindAll(doc, '#runnerCaptureSettingsPanel input, #runnerCaptureSettingsPanel select', 'change', options.onRunnerConfigChange);
    bindAll(doc, '#runnerCaptureSettingsPanel input', 'input', options.onRunnerConfigChange);
    bindAll(doc, '#runnerAuthRefreshPanel input, #runnerAuthRefreshPanel select, #runnerAuthRefreshPanel textarea', 'change', options.onRunnerConfigChange);
    bindAll(doc, '#runnerAuthRefreshPanel input, #runnerAuthRefreshPanel textarea', 'input', options.onRunnerConfigChange);
    bindChange(doc, 'performanceTypeSelect', options.onPerformanceTypeChange || options.onPerformanceConfigChange);
    bindAll(doc, '[data-performance-mutation]', 'change', options.onPerformanceConfigChange);
    bindAll(doc, '[data-performance-config]', 'input', options.onPerformanceConfigChange);
    bindAll(doc, '[data-performance-config]', 'change', options.onPerformanceConfigChange);
    bindAll(doc, '[data-performance-safety]', 'input', options.onPerformanceConfigChange);
    bindAll(doc, '#performanceCaptureSettingsPanel input, #performanceCaptureSettingsPanel select', 'change', options.onPerformanceConfigChange);
    bindAll(doc, '#performanceCaptureSettingsPanel input', 'input', options.onPerformanceConfigChange);
    bindAll(doc, '#performanceAuthRefreshPanel input, #performanceAuthRefreshPanel select, #performanceAuthRefreshPanel textarea', 'change', options.onPerformanceConfigChange);
    bindAll(doc, '#performanceAuthRefreshPanel input, #performanceAuthRefreshPanel textarea', 'input', options.onPerformanceConfigChange);
    bindChange(doc, 'performanceMethodSelect', options.onPerformanceMethodChange || options.onPerformanceRequestChange);
    bindInput(doc, 'performanceUrlInput', options.onPerformanceUrlInput || options.onPerformanceRequestChange);
    bindChange(doc, 'performanceBodyTypeSelect', options.onPerformanceBodyTypeChange || options.onPerformanceRequestChange);
    bindChange(doc, 'performanceBodyRawFormatSelect', options.onPerformanceBodyTypeChange || options.onPerformanceRequestChange);
    bindClick(doc, 'performanceBeautifyBodyButton', options.onBeautifyPerformanceBody || options.onPerformanceRequestChange);
    bindInput(doc, 'performanceBodyInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performanceGraphqlQueryInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performanceGraphqlVariablesInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performanceGraphqlOperationNameInput', options.onPerformanceRequestChange);
    bindClick(doc, 'addPerformanceFormDataBodyRowButton', options.onAddPerformanceFormDataBodyRow || options.onPerformanceRequestChange);
    bindClick(doc, 'addPerformanceUrlencodedBodyRowButton', options.onAddPerformanceUrlencodedBodyRow || options.onPerformanceRequestChange);
    bindInput(doc, 'performanceBinaryBodySourceInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performancePreRequestScriptInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performanceTestScriptInput', options.onPerformanceRequestChange);
    bindInput(doc, 'performanceDocsInput', options.onPerformanceRequestChange);
    bindChange(doc, 'performanceRequestCookieJarEnabledInput', options.onPerformanceRequestChange);
    bindChange(doc, 'performanceRequestCookieJarStoreInput', options.onPerformanceRequestChange);
    bindChange(doc, 'performanceFilterCookiesToRequestHostInput', options.onPerformanceFilterCookiesChange);
    bindAll(doc, '[data-performance-request-setting]', 'change', options.onPerformanceRequestTlsSettingsChange);
    bindAll(doc, '[data-performance-request-setting]', 'input', options.onPerformanceRequestTlsSettingsChange);
    bindChange(doc, 'methodSelect', options.onMethodChange);
    bindInput(doc, 'urlInput', options.onUrlInput);
    bindChange(doc, 'bodyTypeSelect', options.onBodyTypeChange);
    bindChange(doc, 'bodyRawFormatSelect', options.onBodyTypeChange);
    bindClick(doc, 'beautifyBodyButton', options.onBeautifyBody || options.onBodyInput);
    bindInput(doc, 'bodyInput', options.onBodyInput);
    bindInput(doc, 'graphqlQueryInput', options.onBodyInput);
    bindInput(doc, 'graphqlVariablesInput', options.onBodyInput);
    bindInput(doc, 'graphqlOperationNameInput', options.onBodyInput);
    bindClick(doc, 'addFormDataBodyRowButton', options.onAddFormDataBodyRow || options.onBodyInput);
    bindClick(doc, 'addUrlencodedBodyRowButton', options.onAddUrlencodedBodyRow || options.onBodyInput);
    bindInput(doc, 'binaryBodySourceInput', options.onBodyInput);
    bindInput(doc, 'preRequestScriptInput', options.onPreRequestScriptInput);
    bindInput(doc, 'testScriptInput', options.onTestScriptInput);
    bindClick(doc, 'docsPreview', options.onEditRequestDocs);
    bindKey(doc, 'docsPreview', options.onEditRequestDocs, ['Enter', ' ']);
    bindClick(doc, 'docsSaveButton', options.onSaveRequestDocs);
    bindClick(doc, 'docsCancelButton', options.onCancelRequestDocs);
    bindChange(doc, 'requestCookieJarEnabledInput', options.onRequestCookieJarChange);
    bindChange(doc, 'requestCookieJarStoreInput', options.onRequestCookieJarChange);
    bindChange(doc, 'filterCookiesToRequestHostInput', options.onFilterCookiesChange);
    bindAll(doc, '[data-request-setting]', 'change', options.onRequestTlsSettingsChange);
    bindAll(doc, '[data-request-setting]', 'input', options.onRequestTlsSettingsChange);
    bindChange(doc, 'trustedScriptSendRequestInput', options.onTrustedScriptCapabilityChange);
    bindChange(doc, 'trustedScriptCookiesInput', options.onTrustedScriptCapabilityChange);
    bindChange(doc, 'trustedScriptVaultInput', options.onTrustedScriptCapabilityChange);
    bindChange(doc, 'saveOnForceCloseInput', options.onSaveOnForceCloseChange);
    bindChange(doc, 'closeModalsOnBackdropClickInput', options.onCloseModalsOnBackdropClickChange);
    bindChange(doc, 'includePrereleasesInput', options.onIncludePrereleasesChange);
    bindChange(doc, 'automaticUpdatesInput', options.onAutomaticUpdatesChange);
    bindChange(doc, 'startupUpdateRemindersInput', options.onStartupUpdateRemindersChange);
    bindChange(doc, 'showEditorLineNumbersInput', options.onShowEditorLineNumbersChange);
    bindChange(doc, 'showVariableTooltipHintsInput', options.onShowVariableTooltipHintsChange);
    bindChange(doc, 'interfaceFontSelect', options.onInterfaceTypographyChange);
    bindChange(doc, 'interfaceFontSizeInput', options.onInterfaceTypographyChange);
    bindClick(doc, 'resetInterfaceTypographyButton', options.onResetInterfaceTypography);
    bindChange(doc, 'editorFontSelect', options.onEditorTypographyChange);
    bindChange(doc, 'editorFontSizeInput', options.onEditorTypographyChange);
    bindClick(doc, 'resetEditorTypographyButton', options.onResetEditorTypography);
    bindClick(doc, 'resetAllKeyboardShortcutsButton', options.onResetAllKeyboardShortcuts);
    bindChange(doc, 'sslCertificateVerificationInput', options.onTlsSettingsChange);
    bindChange(doc, 'caCertificatePathInput', options.onTlsSettingsChange);
    bindClick(doc, 'chooseCaCertificateButton', options.onChooseCaCertificate);
    bindClick(doc, 'clearCaCertificateButton', options.onClearCaCertificate);
    bindClick(doc, 'addClientCertificateButton', options.onAddClientCertificate);
    for (const id of [
      'diagnosticLoggingEnabledInput',
      'diagnosticLogLevelSelect',
      'diagnosticLogUrlsInput',
      'diagnosticLogHeadersInput',
      'diagnosticLogCookiesInput',
      'diagnosticLogBodiesInput',
      'diagnosticLogProtocolMessagesInput',
      'diagnosticLogScriptConsoleInput',
      'diagnosticLogPayloadIdentifiersInput'
    ]) {
      bindChange(doc, id, options.onDiagnosticsSettingsChange);
    }

    for (const id of AUTH_EDITOR_INPUT_IDS) {
      const input = getElement(doc, id);
      if (!input) {
        continue;
      }
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
        event.__postmeterAuthHandled = true;
        handleAuthEditorInput(id, input, options);
      });
    }
    for (const id of PERFORMANCE_AUTH_EDITOR_INPUT_IDS) {
      const input = getElement(doc, id);
      if (!input) {
        continue;
      }
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
        event.__postmeterAuthHandled = true;
        handlePerformanceAuthEditorInput(id, input, options);
      });
    }
    for (const id of COLLECTION_AUTH_EDITOR_INPUT_IDS) {
      const input = getElement(doc, id);
      if (!input) {
        continue;
      }
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
        event.__postmeterAuthHandled = true;
        handleCollectionAuthEditorInput(id, input, options);
      });
    }
    for (const id of FOLDER_AUTH_EDITOR_INPUT_IDS) {
      const input = getElement(doc, id);
      if (!input) {
        continue;
      }
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', (event) => {
        event.__postmeterAuthHandled = true;
        handleFolderAuthEditorInput(id, input, options);
      });
    }
    bindDelegatedAuthEditorInputs(doc, options);

    for (const button of doc.querySelectorAll('.tab')) {
      button.addEventListener('click', () => options.onActivateTab?.(button.dataset.tabGroup, button.dataset.tab));
      button.addEventListener('keydown', (event) => {
        moveRovingTabFocus(event, Array.from(doc.querySelectorAll(`.tab[data-tab-group="${button.dataset.tabGroup}"]`)));
      });
    }

    for (const button of doc.querySelectorAll('.sidebar-tab')) {
      button.addEventListener('click', () => options.onSelectSidebarPanel?.(button.dataset.sidebarPanel));
      button.addEventListener('keydown', (event) => {
        moveRovingTabFocus(event, Array.from(doc.querySelectorAll('.sidebar-tab')));
      });
    }

    bindEvent(doc, 'contextMenu', 'click', (event) => event.stopPropagation());
    bindEvent(doc, 'modalBackdrop', 'click', (event) => {
      if (event.target === getElement(doc, 'modalBackdrop') && shouldCloseModalsOnBackdropClick(options)) {
        options.onCancelActiveModal?.();
      }
    });
    bindClick(doc, 'cancelCloseRequestButton', () => options.onResolveActiveModal?.('cancel'));
    bindClick(doc, 'closeWithoutSavingButton', () => options.onResolveActiveModal?.('discard'));
    bindClick(doc, 'saveAndCloseRequestButton', () => options.onResolveActiveModal?.('save'));
    bindClick(doc, 'cancelSaveDraftButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmSaveDraftButton', () => {
      const selectedCollectionId = options.getSelectedDraftSaveCollectionId?.();
      if (selectedCollectionId) {
        options.onResolveActiveModal?.(selectedCollectionId);
      }
    });
    bindClick(doc, 'cancelExportCollectionButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmExportCollectionButton', () => {
      const selectedCollectionId = options.getSelectedExportCollectionId?.();
      if (selectedCollectionId) {
        options.onResolveActiveModal?.(selectedCollectionId);
      }
    });
    bindClick(doc, 'cancelExportItemButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmExportItemButton', () => {
      const selectedExportItemId = options.getSelectedExportItemId?.();
      if (selectedExportItemId) {
        options.onResolveActiveModal?.(selectedExportItemId);
      }
    });
    bindClick(doc, 'cancelFolderDestinationButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmFolderDestinationButton', () => {
      const selectedFolderDestination = options.getSelectedFolderDestination?.();
      if (selectedFolderDestination) {
        options.onResolveActiveModal?.(selectedFolderDestination);
      }
    });
    bindClick(doc, 'cancelRunnerImportButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmRunnerImportButton', () => {
      const selectedImportTarget = options.getSelectedRunnerImportTarget?.();
      if (selectedImportTarget) {
        options.onResolveActiveModal?.(selectedImportTarget);
      }
    });
    bindClick(doc, 'cancelTextInputModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmTextInputModalButton', () => {
      const modal = getElement(doc, 'textInputModal');
      const valueControlId = modal?.dataset?.valueControl || 'textInputModalInput';
      options.onResolveActiveModal?.(getElement(doc, valueControlId)?.value || '');
    });
    bindClick(doc, 'cancelWorkspaceEncryptionButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmWorkspaceEncryptionButton', options.onConfirmWorkspaceEncryptionModal);
    bindKey(doc, 'workspaceEncryptionKeyInput', options.onConfirmWorkspaceEncryptionModal, ['Enter']);
    bindKey(doc, 'workspaceEncryptionNewKeyInput', options.onConfirmWorkspaceEncryptionModal, ['Enter']);
    bindKey(doc, 'workspaceEncryptionConfirmInput', options.onConfirmWorkspaceEncryptionModal, ['Enter']);
    bindClick(doc, 'closeClientCertificateModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'cancelClientCertificateModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'saveClientCertificateModalButton', options.onConfirmClientCertificateModal);
    bindClick(doc, 'chooseClientCertificateCertPathButton', options.onChooseClientCertificateCertPath);
    bindClick(doc, 'chooseClientCertificateKeyPathButton', options.onChooseClientCertificateKeyPath);
    bindClick(doc, 'chooseClientCertificatePfxPathButton', options.onChooseClientCertificatePfxPath);
    bindClick(doc, 'toggleClientCertificatePassphraseButton', options.onToggleClientCertificatePassphraseVisibility);
    bindChange(doc, 'clientCertificateFormatSelect', options.onClientCertificateFormatChange);
    bindClick(doc, 'closeCsvVariablesModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'cancelCsvVariablesModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'saveCsvVariablesModalButton', options.onConfirmCsvVariablesModal);
    bindClick(doc, 'csvVariablesImportButton', options.onImportCsvVariablesFile);
    bindClick(doc, 'clearCsvVariablesFileButton', options.onClearCsvVariablesFile);
    bindClick(doc, 'csvVariablesLoadFileButton', options.onLoadCsvVariablesFile);
    bindClick(doc, 'csvVariablesKeepFileButton', options.onKeepCsvVariablesFile);
    bindChange(doc, 'csvVariablesFileInput', options.onCsvVariablesFileSelected);
    bindClick(doc, 'csvVariablesFileSourceButton', () => options.onSelectCsvVariablesSource?.('file'));
    bindClick(doc, 'csvVariablesInlineSourceButton', () => options.onSelectCsvVariablesSource?.('inline'));
    bindClick(doc, 'csvVariablesValuesToggle', options.onToggleCsvVariablesValues);
    bindInput(doc, 'csvVariablesValuesInput', options.onCsvVariablesValuesInput);
    bindChange(doc, 'csvVariablesReuseFirstRowInput', () => options.onCsvVariablesRowModeChange?.('reuse'));
    bindChange(doc, 'csvVariablesLoopRowsInput', () => options.onCsvVariablesRowModeChange?.('loop'));
    bindChange(doc, 'csvVariablesContinueWithoutRowsInput', () => options.onCsvVariablesRowModeChange?.('continue'));
    bindClick(doc, 'cancelConfirmActionButton', () => options.onResolveActiveModal?.(false));
    bindClick(doc, 'confirmActionButton', () => options.onResolveActiveModal?.(true));
    bindClick(doc, 'stopUpdateReminderButton', () => options.onResolveActiveModal?.('stop'));
    bindClick(doc, 'cancelUpdateReminderButton', () => options.onResolveActiveModal?.('cancel'));
    bindClick(doc, 'updateNowButton', () => options.onResolveActiveModal?.('update'));
    bindClick(doc, 'closeAuthRefreshAutoDetectModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'cancelAuthRefreshAutoDetectButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'confirmAuthRefreshAutoDetectButton', options.onConfirmAuthRefreshAutoDetectModal);
    bindClick(doc, 'closeNotificationModalButton', () => options.onResolveActiveModal?.(true));
    bindClick(doc, 'closeCookiesModalButton', () => options.onResolveActiveModal?.(true));
    bindClick(doc, 'closeSettingsModalButton', () => options.onResolveActiveModal?.(true));
    bindClick(doc, 'closeSettingsModalFooterButton', () => options.onResolveActiveModal?.(true));
    bindClick(doc, 'closeTutorialsModalButton', () => options.onResolveActiveModal?.(null));
    bindClick(doc, 'startTutorialButton', options.onStartSelectedTutorial);
    bindClick(doc, 'previousTutorialStepButton', options.onPreviousTutorialStep);
    bindClick(doc, 'nextTutorialStepButton', options.onNextTutorialStep);
    bindClick(doc, 'endTutorialButton', options.onEndTutorial);
    bindClick(doc, 'closePerformanceCalibrationModalButton', options.onClosePerformanceCalibration);
    bindClick(doc, 'denyVaultPromptButton', () => options.onResolveVaultPrompt?.({ granted: false, scope: 'request' }));
    bindClick(doc, 'allowVaultPromptRequestButton', () => options.onResolveVaultPrompt?.({ granted: true, scope: 'request' }));
    bindClick(doc, 'allowVaultPromptCollectionButton', () => options.onResolveVaultPrompt?.({ granted: true, scope: 'collection' }));
    bindClick(doc, 'allowVaultPromptWorkspaceButton', () => options.onResolveVaultPrompt?.({ granted: true, scope: 'workspace' }));
    bindClick(doc, 'resetVaultPromptGrantsButton', () => options.onResolveVaultPrompt?.({ granted: false, reset: true, scope: 'request' }));

    doc.addEventListener('click', (event) => {
      if (event.target?.closest?.('#tutorialCoach')) {
        return;
      }
      options.onCloseContextMenu?.();
      closeToolbarMenus(doc);
    });
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' && options.onTrapActiveModalFocus?.(event)) {
        return;
      }
      if (event.key === 'Escape') {
        options.onCancelActiveModal?.();
        options.onCloseContextMenu?.();
        closeToolbarMenus(doc);
      }
    });
    windowObject.addEventListener('blur', () => {
      options.onCloseContextMenu?.();
      closeToolbarMenus(doc);
    });
    windowObject.addEventListener('resize', () => {
      options.onCloseContextMenu?.();
      closeToolbarMenus(doc);
    });

    options.onInitResizablePanes?.();
  }

  function bindDelegatedAuthEditorInputs(doc, options) {
    const handleDelegatedAuthEvent = (event) => {
      if (event.__postmeterAuthHandled) {
        return;
      }
      const target = event.target;
      const id = target?.id || '';
      if (AUTH_EDITOR_INPUT_ID_SET.has(id)) {
        handleAuthEditorInput(id, target, options);
      } else if (PERFORMANCE_AUTH_EDITOR_INPUT_ID_SET.has(id)) {
        handlePerformanceAuthEditorInput(id, target, options);
      } else if (COLLECTION_AUTH_EDITOR_INPUT_ID_SET.has(id)) {
        handleCollectionAuthEditorInput(id, target, options);
      } else if (FOLDER_AUTH_EDITOR_INPUT_ID_SET.has(id)) {
        handleFolderAuthEditorInput(id, target, options);
      }
    };
    doc.addEventListener('input', handleDelegatedAuthEvent);
    doc.addEventListener('change', handleDelegatedAuthEvent);
  }

  function handleAuthEditorInput(id, input, options) {
    if (id === 'authTypeSelect') {
      options.onAuthTypeChange?.(input.value);
    }
    if (id === 'authOauthGrantTypeSelect') {
      syncOauth2GrantDataset(input);
    }
    if (id === 'authJwtAlgorithmSelect') {
      syncJwtAlgorithmDataset(input);
    }
    options.onAuthInput?.();
  }

  function handlePerformanceAuthEditorInput(id, input, options) {
    if (id === 'performanceAuthTypeSelect') {
      options.onPerformanceAuthTypeChange?.(input.value);
    }
    if (id === 'performanceAuthOauthGrantTypeSelect') {
      syncOauth2GrantDataset(input);
    }
    if (id === 'performanceAuthJwtAlgorithmSelect') {
      syncJwtAlgorithmDataset(input);
    }
    options.onPerformanceAuthInput?.();
  }

  function handleCollectionAuthEditorInput(id, input, options) {
    if (id === 'collectionAuthTypeSelect') {
      options.onCollectionAuthTypeChange?.(input.value);
    }
    if (id === 'collectionAuthOauthGrantTypeSelect') {
      syncOauth2GrantDataset(input);
    }
    if (id === 'collectionAuthJwtAlgorithmSelect') {
      syncJwtAlgorithmDataset(input);
    }
    options.onCollectionAuthInput?.();
  }

  function handleFolderAuthEditorInput(id, input, options) {
    if (id === 'folderAuthTypeSelect') {
      options.onFolderAuthTypeChange?.(input.value);
    }
    if (id === 'folderAuthOauthGrantTypeSelect') {
      syncOauth2GrantDataset(input);
    }
    if (id === 'folderAuthJwtAlgorithmSelect') {
      syncJwtAlgorithmDataset(input);
    }
    options.onFolderAuthInput?.();
  }

  function syncOauth2GrantDataset(input) {
    const section = input?.closest?.('[data-auth-section="oauth2"]');
    if (section) {
      section.dataset.oauth2GrantType = input.value || 'authorizationCode';
    }
  }

  function syncJwtAlgorithmDataset(input) {
    const section = input?.closest?.('[data-auth-section="jwtBearer"]');
    if (section) {
      section.dataset.jwtAlgorithmKind = String(input.value || 'HS256').toUpperCase().startsWith('HS') ? 'secret' : 'private';
    }
  }

  function bindToolbarMenus(doc = document, options = {}) {
    for (const [buttonId, menuId] of [
      ['newMenuButton', 'newMenu'],
      ['importMenuButton', 'importMenu'],
      ['exportMenuButton', 'exportMenu'],
      ['exportRequestPanelButton', 'exportRequestPanelMenu'],
      ['runnerCsvVariablesButton', 'runnerCsvVariablesMenu'],
      ['performanceCsvVariablesButton', 'performanceCsvVariablesMenu'],
      ['runnerAuthRefreshButton', 'runnerAuthRefreshMenu'],
      ['performanceAuthRefreshButton', 'performanceAuthRefreshMenu'],
      ['runnerAuthRefreshManageRequestButton', 'runnerAuthRefreshManageRequestMenu'],
      ['runnerAuthRefreshTokenManageRequestButton', 'runnerAuthRefreshTokenManageRequestMenu'],
      ['performanceAuthRefreshManageRequestButton', 'performanceAuthRefreshManageRequestMenu'],
      ['performanceAuthRefreshTokenManageRequestButton', 'performanceAuthRefreshTokenManageRequestMenu'],
      ['exportRunnerResultsButton', 'exportRunnerResultsMenu'],
      ['exportPerformanceResultsButton', 'exportPerformanceResultsMenu'],
      ['cookiesClearMenuButton', 'cookiesClearMenu']
    ]) {
      const button = getElement(doc, buttonId);
      const menu = getElement(doc, menuId);
      if (!button || !menu) {
        continue;
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleToolbarMenu(doc, button, menu, options);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openToolbarMenu(doc, button, menu, options);
          menu.querySelector?.('button')?.focus?.();
        }
      });
      menu.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.target?.matches?.('.toolbar-submenu-row > button[aria-haspopup="menu"]')) {
          event.preventDefault();
          event.target.focus?.();
          return;
        }
        closeToolbarMenus(doc);
      });
      for (const submenuRow of Array.from(menu.querySelectorAll?.('.toolbar-submenu-row') || [])) {
        submenuRow.addEventListener('mouseenter', () => {
          const activeElement = doc.activeElement;
          const activeRow = activeElement?.closest?.('.toolbar-submenu-row');
          if (activeRow && activeRow !== submenuRow && menu.contains?.(activeRow)) {
            activeElement?.blur?.();
          }
        });
      }
      menu.addEventListener('keydown', (event) => {
        if (event.__postmeterMenuHandled === true) {
          return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('.toolbar-submenu-row > button[aria-haspopup="menu"]')) {
          event.preventDefault();
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          event.target.focus?.();
          return;
        }
        if (event.key === 'ArrowRight' && event.target?.matches?.('.toolbar-submenu-row > button[aria-haspopup="menu"]')) {
          event.preventDefault();
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          event.target.parentElement?.querySelector?.('.toolbar-submenu button:not([disabled])')?.focus?.();
          return;
        }
        if (event.key === 'ArrowLeft' && event.target?.closest?.('.toolbar-submenu')) {
          event.preventDefault();
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          event.target.closest('.toolbar-submenu-row')?.querySelector?.(':scope > button[aria-haspopup="menu"]')?.focus?.();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          closeToolbarMenus(doc);
          button.focus?.();
          return;
        }
        if (event.key === 'Tab') {
          event.__postmeterMenuHandled = true;
          closeToolbarMenus(doc);
          return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('button')) {
          event.preventDefault();
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          closeToolbarMenus(doc);
          button.focus?.();
          event.target.click();
          return;
        }
        if (moveMenuItemFocus(event, getToolbarMenuNavigationButtons(menu, event.target))) {
          event.__postmeterMenuHandled = true;
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        }
      }, true);
    }
  }

  function moveRovingTabFocus(event, buttons) {
    const tabList = event.currentTarget?.closest?.('[role="tablist"]');
    const vertical = tabList?.getAttribute?.('aria-orientation') === 'vertical';
    const previousKeys = vertical ? ['ArrowUp', 'ArrowLeft'] : ['ArrowLeft'];
    const nextKeys = vertical ? ['ArrowDown', 'ArrowRight'] : ['ArrowRight'];
    if (!['Home', 'End', ...previousKeys, ...nextKeys].includes(event.key) || !buttons.length) {
      return;
    }
    event.preventDefault();
    const eventSource = buttons.includes(event.currentTarget)
      ? event.currentTarget
      : buttons.includes(event.target)
        ? event.target
        : event.target?.ownerDocument?.activeElement;
    const currentIndex = Math.max(0, buttons.indexOf(eventSource));
    let nextIndex = currentIndex;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (previousKeys.includes(event.key)) {
      nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
    } else if (nextKeys.includes(event.key)) {
      nextIndex = (currentIndex + 1) % buttons.length;
    }
    buttons[nextIndex]?.focus?.();
    buttons[nextIndex]?.click?.();
  }

  function moveMenuItemFocus(event, buttons) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) {
      return false;
    }
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(event.target));
    let nextIndex = currentIndex;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
    } else if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % buttons.length;
    }
    buttons[nextIndex]?.focus?.();
    return true;
  }

  function getToolbarMenuNavigationButtons(menu, target) {
    const submenu = target?.closest?.('.toolbar-submenu');
    if (submenu) {
      return Array.from(submenu.querySelectorAll('button:not([disabled])'));
    }
    return Array.from(menu.children)
      .flatMap((child) => {
        if (child.matches?.('button:not([disabled])')) {
          return [child];
        }
        if (child.matches?.('.toolbar-submenu-row')) {
          const parentButton = child.querySelector(':scope > button:not([disabled])');
          return parentButton ? [parentButton] : [];
        }
        return [];
      });
  }

  function toggleToolbarMenu(doc, button, menu, options = {}) {
    if (menu.hidden) {
      openToolbarMenu(doc, button, menu, options);
    } else {
      closeToolbarMenus(doc);
    }
  }

  function openToolbarMenu(doc, button, menu, options = {}) {
    const openModal = menu.closest?.('.modal');
    if (isModalBackdropOpen(doc) && !(openModal && openModal.hidden === false)) {
      closeToolbarMenus(doc);
      return;
    }
    options.onCloseContextMenu?.();
    options.onCloseFileSourceMenu?.();
    if (!menu.closest?.('.capture-settings-panel')) {
      options.onCloseCaptureSettingsPanels?.();
    }
    closeToolbarMenus(doc);
    menu.hidden = false;
    positionToolbarMenu(button, menu, options);
    button.setAttribute('aria-expanded', 'true');
  }

  function positionToolbarMenu(button, menu, options = {}) {
    const fixed = shouldUseFixedToolbarMenu(menu);
    clearToolbarMenuPlacement(menu);
    if (fixed) {
      menu.classList?.add?.('toolbar-menu-fixed');
    }
    const buttonRect = typeof button.getBoundingClientRect === 'function' ? button.getBoundingClientRect() : null;
    const menuRect = typeof menu.getBoundingClientRect === 'function' ? menu.getBoundingClientRect() : null;
    if (!buttonRect || !menuRect) {
      return;
    }
    if (fixed) {
      positionFixedToolbarMenu(button, menu, options, buttonRect, menuRect);
      return;
    }
    const panel = menu.closest?.('.capture-settings-panel');
    const boundaryRect = typeof panel?.getBoundingClientRect === 'function'
      ? panel.getBoundingClientRect()
      : {
          top: 0,
          bottom: Number(options.windowObject?.innerHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || 0)
        };
    const margin = 8;
    const downwardSpace = boundaryRect.bottom - buttonRect.bottom - margin;
    const upwardSpace = buttonRect.top - boundaryRect.top - margin;
    if (menuRect.height > downwardSpace && upwardSpace > downwardSpace) {
      menu.classList?.add?.('toolbar-menu-open-up');
    }
  }

  function shouldUseFixedToolbarMenu(menu) {
    return Boolean(menu.closest?.('.result-export-menu-group'));
  }

  function clearToolbarMenuPlacement(menu) {
    menu.classList?.remove?.('toolbar-menu-open-up');
    menu.classList?.remove?.('toolbar-menu-fixed');
    if (!menu.style) {
      return;
    }
    menu.style.left = '';
    menu.style.top = '';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';
  }

  function positionFixedToolbarMenu(_button, menu, options, buttonRect, menuRect) {
    if (!menu.style) {
      return;
    }
    const margin = 8;
    const gap = 6;
    const viewportWidth = Number(options.windowObject?.innerWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1024);
    const viewportHeight = Number(options.windowObject?.innerHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || 768);
    const widthLimit = Math.max(0, viewportWidth - margin * 2);
    const heightLimit = Math.max(0, viewportHeight - margin * 2);
    const menuWidth = Math.min(Number(menuRect.width || menu.offsetWidth || 170), widthLimit);
    const menuHeight = Math.min(Number(menu.scrollHeight || menuRect.height || menu.offsetHeight || 0), heightLimit);
    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const left = Math.min(Math.max(margin, Number(buttonRect.right || 0) - menuWidth), maxLeft);
    const preferredTop = Number(buttonRect.bottom || 0) + gap;
    const downwardSpace = viewportHeight - preferredTop - margin;
    const upwardSpace = Number(buttonRect.top || 0) - margin - gap;
    let top = preferredTop;
    if (menuHeight > downwardSpace && upwardSpace > downwardSpace) {
      menu.classList?.add?.('toolbar-menu-open-up');
      top = Number(buttonRect.top || 0) - menuHeight - gap;
    }
    const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
    top = Math.min(Math.max(margin, top), maxTop);
    const availableHeight = Math.max(80, viewportHeight - top - margin);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
    menu.style.maxHeight = `${availableHeight}px`;
    menu.style.overflowY = 'auto';
  }

  function isModalBackdropOpen(doc) {
    const backdrop = getElement(doc, 'modalBackdrop');
    return Boolean(backdrop && backdrop.hidden === false);
  }

  function shouldCloseModalsOnBackdropClick(options = {}) {
    const preference = options.closeModalsOnBackdropClick;
    if (typeof preference === 'function') {
      try {
        return preference() === true;
      } catch {
        return false;
      }
    }
    return preference === true;
  }

  function closeToolbarMenus(doc = document) {
    for (const menu of doc.querySelectorAll('.toolbar-menu')) {
      menu.hidden = true;
      clearToolbarMenuPlacement(menu);
    }
    for (const button of doc.querySelectorAll('.menu-trigger')) {
      button.setAttribute('aria-expanded', 'false');
    }
  }

  function getElement(doc, id) {
    return doc.getElementById(id);
  }

  function bindClick(doc, id, handler) {
    bindEvent(doc, id, 'click', handler);
  }

  function bindInput(doc, id, handler) {
    bindEvent(doc, id, 'input', handler);
  }

  function bindChange(doc, id, handler) {
    bindEvent(doc, id, 'change', handler);
  }

  function bindKey(doc, id, handler, keys = []) {
    const element = getElement(doc, id);
    if (!element || typeof handler !== 'function') {
      return;
    }
    element.addEventListener('keydown', (event) => {
      if (!keys.includes(event.key)) {
        return;
      }
      event.preventDefault();
      handler(event);
    });
  }

  function bindAll(doc, selector, eventName, handler) {
    if (typeof handler !== 'function') {
      return;
    }
    for (const element of doc.querySelectorAll(selector) || []) {
      element.addEventListener(eventName, handler);
    }
  }

  function bindEvent(doc, id, eventName, handler) {
    const element = getElement(doc, id);
    if (!element || typeof handler !== 'function') {
      return;
    }
    element.addEventListener(eventName, handler);
  }

  const exported = {
    bindUi,
    closeToolbarMenus,
    initializeRenderer,
    positionToolbarMenu
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRendererBootstrap = exported;
})(typeof window === 'undefined' ? globalThis : window);
