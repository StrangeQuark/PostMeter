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
    'authOauthAccessTokenInput',
    'authOauthRefreshTokenInput',
    'authOauthAuthorizationUrlInput',
    'authOauthRedirectStrategySelect',
    'authOauthDeviceAuthorizationUrlInput',
    'authOauthTokenUrlInput',
    'authOauthClientIdInput',
    'authOauthClientSecretInput',
    'authOauthScopesInput',
    'authOauthUserCodeInput',
    'authOauthVerificationUriInput',
    'authClientPfxPathInput',
    'authClientCertPathInput',
    'authClientKeyPathInput',
    'authClientCaPathInput',
    'authClientPassphraseInput'
  ];

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

      await options.onReady?.({ doc, windowObject, registerCleanup });

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

  function bindUi(options = {}) {
    const doc = options.doc || document;
    const windowObject = options.windowObject || window;

    bindToolbarMenus(doc);
    bindClick(doc, 'newCollectionButton', options.onNewCollection);
    bindClick(doc, 'newFolderButton', options.onNewFolder);
    bindClick(doc, 'newRequestButton', options.onNewRequest);
    bindClick(doc, 'emptyCreateRequestButton', options.onNewRequest);
    bindClick(doc, 'emptyCreateEnvironmentButton', options.onNewEnvironment);
    bindClick(doc, 'newEnvironmentMenuButton', options.onNewEnvironment);
    bindClick(doc, 'saveButton', options.onSaveWorkspace);
    bindClick(doc, 'importWorkspaceButton', options.onImportWorkspace);
    bindClick(doc, 'exportWorkspaceButton', options.onExportWorkspace);
    bindClick(doc, 'importCollectionButton', options.onImportCollection);
    bindClick(doc, 'exportCollectionButton', options.onExportCollection);
    bindClick(doc, 'exportOpenApiButton', options.onExportOpenApi);
    bindClick(doc, 'exportJMeterButton', options.onExportJMeter);
    bindClick(doc, 'exportCurlButton', options.onExportCurl);
    bindClick(doc, 'exportHarButton', options.onExportHar);
    bindClick(doc, 'sendButton', options.onSendRequest);
    bindClick(doc, 'addParamButton', options.onAddParam);
    bindClick(doc, 'addHeaderButton', options.onAddHeader);
    bindClick(doc, 'addAssertionButton', options.onAddAssertion);
    bindClick(doc, 'addAssertionTemplateButton', options.onAddAssertionTemplate);
    bindClick(doc, 'addExampleButton', options.onAddExample);
    bindClick(doc, 'captureResponseExampleButton', options.onCaptureResponseExample);
    bindClick(doc, 'exportExamplesButton', options.onExportExamples);
    bindClick(doc, 'deleteEnvironmentButton', options.onDeleteEnvironment);
    bindClick(doc, 'addVariableButton', options.onAddEnvironmentVariable);
    bindClick(doc, 'saveWorkspacePanelButton', options.onSaveWorkspace);
    bindClick(doc, 'importWorkspacePanelButton', options.onImportWorkspace);
    bindClick(doc, 'exportWorkspacePanelButton', options.onExportWorkspace);
    bindClick(doc, 'addCollectionVariableButton', options.onAddCollectionVariable);
    bindClick(doc, 'addRequestVariableButton', options.onAddRequestVariable);
    bindClick(doc, 'addCookieButton', options.onAddCookie);
    bindClick(doc, 'clearExpiredCookiesButton', options.onClearExpiredCookies);
    bindClick(doc, 'runLoadButton', options.onRunLoadTest);
    bindClick(doc, 'cancelLoadButton', options.onCancelLoadTest);
    bindClick(doc, 'exportLoadJsonButton', options.onExportLoadJson);
    bindClick(doc, 'exportLoadCsvButton', options.onExportLoadCsv);
    bindClick(doc, 'runCollectionButton', options.onRunCollection);
    bindClick(doc, 'cancelRunnerButton', options.onCancelCollectionRun);
    bindClick(doc, 'exportRunnerJsonButton', options.onExportRunnerJson);
    bindClick(doc, 'exportRunnerCsvButton', options.onExportRunnerCsv);
    bindClick(doc, 'startPkceFlowButton', options.onStartPkceFlow);
    bindClick(doc, 'startDeviceFlowButton', options.onStartDeviceFlow);
    bindClick(doc, 'cancelOauthFlowButton', options.onCancelOauthFlow);

    for (const button of doc.querySelectorAll('[data-theme-option]')) {
      button.addEventListener('click', () => options.onSelectTheme?.(button.dataset.themeOption));
    }

    bindChange(doc, 'environmentSelect', () => {
      options.onEnvironmentSelectChange?.(getElement(doc, 'environmentSelect')?.value || 'none');
    });
    bindInput(doc, 'requestNameInput', options.onRequestNameInput);
    bindChange(doc, 'methodSelect', options.onMethodChange);
    bindInput(doc, 'urlInput', options.onUrlInput);
    bindChange(doc, 'bodyTypeSelect', options.onBodyTypeChange);
    bindInput(doc, 'bodyInput', options.onBodyInput);
    bindInput(doc, 'preRequestScriptInput', options.onPreRequestScriptInput);
    bindInput(doc, 'testScriptInput', options.onTestScriptInput);
    bindChange(doc, 'requestCookieJarEnabledInput', options.onRequestCookieJarChange);
    bindChange(doc, 'requestCookieJarStoreInput', options.onRequestCookieJarChange);
    bindChange(doc, 'filterCookiesToRequestHostInput', options.onFilterCookiesChange);
    bindInput(doc, 'environmentNameInput', options.onEnvironmentNameInput);

    for (const id of AUTH_EDITOR_INPUT_IDS) {
      const input = getElement(doc, id);
      if (!input) {
        continue;
      }
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (id === 'authTypeSelect') {
          options.onAuthTypeChange?.(input.value);
        }
        options.onAuthInput?.();
      });
    }

    for (const button of doc.querySelectorAll('.tab')) {
      button.addEventListener('click', () => options.onActivateTab?.(button.dataset.tabGroup, button.dataset.tab));
    }

    for (const button of doc.querySelectorAll('.sidebar-tab')) {
      button.addEventListener('click', () => options.onSelectSidebarPanel?.(button.dataset.sidebarPanel));
    }

    bindEvent(doc, 'contextMenu', 'click', (event) => event.stopPropagation());
    bindEvent(doc, 'modalBackdrop', 'click', (event) => {
      if (event.target === getElement(doc, 'modalBackdrop')) {
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

    doc.addEventListener('click', () => {
      options.onCloseContextMenu?.();
      closeToolbarMenus(doc);
    });
    doc.addEventListener('keydown', (event) => {
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

  function bindToolbarMenus(doc = document) {
    for (const [buttonId, menuId] of [
      ['newMenuButton', 'newMenu'],
      ['importMenuButton', 'importMenu'],
      ['exportMenuButton', 'exportMenu']
    ]) {
      const button = getElement(doc, buttonId);
      const menu = getElement(doc, menuId);
      if (!button || !menu) {
        continue;
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleToolbarMenu(doc, button, menu);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openToolbarMenu(doc, button, menu);
          menu.querySelector?.('button')?.focus?.();
        }
      });
      menu.addEventListener('click', (event) => {
        event.stopPropagation();
        closeToolbarMenus(doc);
      });
    }
  }

  function toggleToolbarMenu(doc, button, menu) {
    if (menu.hidden) {
      openToolbarMenu(doc, button, menu);
    } else {
      closeToolbarMenus(doc);
    }
  }

  function openToolbarMenu(doc, button, menu) {
    closeToolbarMenus(doc);
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function closeToolbarMenus(doc = document) {
    for (const menu of doc.querySelectorAll('.toolbar-menu')) {
      menu.hidden = true;
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
    initializeRenderer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRendererBootstrap = exported;
})(typeof window === 'undefined' ? globalThis : window);
