function markUiWorkflowStartupStep(step) {
  if (isAutomatedUiSmoke() && document?.documentElement?.dataset) {
    document.documentElement.dataset.uiWorkflowStartupStep = String(step || '');
  }
}

function initializeCollectionAuthEditor() {
  const target = $('collectionAuthEditor');
  const source = document.querySelector('#authTab .auth-grid');
  if (!target || !source || target.children.length) {
    return;
  }
  const clone = source.cloneNode(true);
  clone.querySelector('.oauth-actions')?.remove();
  clone.querySelector('.oauth-progress')?.remove();
  for (const element of clone.querySelectorAll('[id]')) {
    element.id = `collection${element.id[0].toUpperCase()}${element.id.slice(1)}`;
  }
  target.append(clone);
}

function initializeFolderAuthEditor() {
  const target = $('folderAuthEditor');
  const source = document.querySelector('#authTab .auth-grid');
  if (!target || !source || target.children.length) {
    return;
  }
  const clone = source.cloneNode(true);
  clone.querySelector('.oauth-actions')?.remove();
  clone.querySelector('.oauth-progress')?.remove();
  for (const element of clone.querySelectorAll('[id]')) {
    element.id = `folder${element.id[0].toUpperCase()}${element.id.slice(1)}`;
  }
  target.append(clone);
}

function bindUi() {
  initializeCollectionAuthEditor();
  initializeFolderAuthEditor();
  bindRendererUi({
    doc: document,
    windowObject: window,
    onNewCollection: newCollection,
    onCollapseCollections: collapseAllCollections,
    onNewFolder: () => { void newFolderFromToolbar(); },
    onNewRequest: newRequest,
    onNewRunner: () => newRunner(),
    onNewPerformanceTest: () => newPerformanceTest(),
    onNewWorkspace: () => { void newWorkspace(); },
    onNewEnvironment: () => newEnvironment(),
    onSaveRequest: () => { void saveRequestFromPane(); },
    onExportCurrentRequest: () => { void exportRequestFromPane('postmeter'); },
    onExportCurrentRequestCurl: () => { void exportRequestFromPane('curl'); },
    onSaveCollection: () => { void saveCollectionFromPane(); },
    onSaveFolder: () => { void saveFolderFromPane(); },
    onSaveEnvironment: () => { void saveEnvironmentFromPane(); },
    onSetEnvironment: () => setActiveEnvironmentFromPane(),
    onImportWorkspace: importWorkspace,
    onExportWorkspace: () => { void exportWorkspaceFromPicker(); },
    onImportRequest: () => { void importRequest(); },
    onExportRequest: () => { void exportRequestFromPicker('postmeter'); },
    onExportRequestCurl: () => { void exportRequestFromPicker('curl'); },
    onImportCollection: importCollection,
    onImportEnvironment: () => { void importEnvironment(); },
    onImportRunner: () => { void importRunner(); },
    onImportPerformanceTest: () => { void importPerformanceTest(); },
    onExportCollection: () => exportCollection(null, 'postmeter'),
    onExportPostman: () => exportCollection(null, 'postman'),
    onExportOpenApi: () => exportCollection(null, 'openapi'),
    onExportCurl: () => exportCollection(null, 'curl'),
    onExportEnvironment: () => { void exportEnvironmentFromPicker('postmeter'); },
    onExportPostmanEnvironment: () => { void exportEnvironmentFromPicker('postman'); },
    onExportRunnerDefinition: () => { void exportRunnerDefinitionFromPicker(); },
    onOpenSettings: () => { openSettingsModalSafely(); },
    onStartSelectedTutorial: startSelectedTutorial,
    onPreviousTutorialStep: previousTutorialStep,
    onNextTutorialStep: nextTutorialStep,
    onEndTutorial: endTutorial,
    onSelectSettingsSection: selectSettingsSection,
    onKeyboardShortcutKeydown: handleKeyboardShortcutCapture,
    onKeyboardShortcutCaptureModeChange: setKeyboardShortcutCaptureMode,
    onResetKeyboardShortcut: resetKeyboardShortcutFromButton,
    onResetAllKeyboardShortcuts: resetAllKeyboardShortcuts,
    onSelectTheme: (themeOption) => setThemePreference(themeOption, { save: true }),
    onInterfaceTypographyChange: () => setInterfaceTypographyFromControls({ save: true }),
    onEditorTypographyChange: () => setEditorTypographyFromControls({ save: true }),
    onResetInterfaceTypography: () => resetInterfaceTypography({ save: true }),
    onResetEditorTypography: () => resetEditorTypography({ save: true }),
    onSaveOnForceCloseChange: () => setSaveOnForceClose($('saveOnForceCloseInput')?.checked === true, { save: true }),
    onCloseModalsOnBackdropClickChange: () => setCloseModalsOnBackdropClick($('closeModalsOnBackdropClickInput')?.checked === true, { save: true }),
    onIncludePrereleasesChange: () => setIncludePrereleases($('includePrereleasesInput')?.checked === true, { save: true }),
    onAutomaticUpdatesChange: () => setAutomaticUpdatesEnabled($('automaticUpdatesInput')?.checked === true, { save: true }),
    onStartupUpdateRemindersChange: () => setStartupUpdateRemindersEnabled($('startupUpdateRemindersInput')?.checked === true, { save: true }),
    onShowEditorLineNumbersChange: (event) => {
      const input = event?.currentTarget || $('showEditorLineNumbersInput');
      return setEditorLineNumbers(input?.checked === true, { save: true });
    },
    onShowVariableTooltipHintsChange: (event) => {
      const input = event?.currentTarget || $('showVariableTooltipHintsInput');
      return setVariableTooltipHints(input?.checked === true, { save: true });
    },
    onTlsSettingsChange: () => { void setTlsSettingsFromInputs(); },
    onChooseCaCertificate: () => { void chooseWorkspaceCaCertificate(); },
    onClearCaCertificate: () => { void clearWorkspaceCaCertificate(); },
    onAddClientCertificate: () => { void addClientCertificateFromPrompt(); },
    onSendRequest: sendActiveRequest,
    onAddParam: () => addPair('queryParams'),
    onAddHeader: () => addPair('headers'),
    onPostMeterTokenHeaderChange: () => setActiveRequestAutoHeaderOption('sendPostMeterToken', $('sendPostMeterTokenInput')?.checked === true),
    onShowGeneratedHeadersChange: () => setActiveRequestAutoHeaderOption('showGeneratedHeaders', $('showGeneratedHeadersInput')?.checked === true),
    onRequestTlsSettingsChange: (event) => setActiveRequestTlsSettingsFromInputs(event),
    onDeleteEnvironment: () => deleteEnvironment(),
    onDeleteWorkspace: () => { void deleteWorkspace(); },
    onUnlockWorkspace: () => { void unlockWorkspace(); },
    onEncryptWorkspace: () => { void encryptWorkspace(); },
    onRemoveWorkspaceEncryption: () => { void removeWorkspaceEncryption(); },
    onSwitchWorkspace: () => { void switchWorkspace(selectedWorkspaceId || activeWorkspaceId, { focus: 'workspace' }); },
    onAddSandboxPackage: () => { void addSandboxPackageFromPrompt(); },
    onFetchSandboxPackage: () => { void fetchSandboxPackageFromPrompt(); },
    onRefreshSandboxPackages: refreshSandboxPackageStatus,
    onBindSandboxFile: () => { void bindSandboxFileFromPrompt(); },
    onRefreshSandboxFiles: refreshSandboxFileBindings,
    onExportDiagnostics: exportDiagnostics,
    onBindVaultSecret: () => { void bindVaultSecretFromPrompt(); },
    onRefreshVaultMetadata: () => { void refreshVaultMetadata(); },
    onResetVault: () => { void resetVaultFromWorkspacePanel(); },
    onAddEnvironmentVariable: addVariable,
    onAddCollectionVariable: addCollectionVariable,
    onAddFolderVariable: addFolderVariable,
    onAddRequestVariable: addRequestVariable,
    onOpenCookies: () => { void openCookiesModal(); },
    onAddCookieDomain: addCookieDomainFromInput,
    onClearExpiredWorkspaceCookies: clearExpiredWorkspaceCookies,
    onClearAllWorkspaceCookies: () => { void clearAllWorkspaceCookies(); },
    onRunCollection: runActiveCollection,
    onCancelCollectionRun: cancelCollectionRun,
    onExportRunnerHtml: () => openHtmlReportOptionsModal('runner'),
    onExportRunnerJson: () => exportRunnerResult('json'),
    onExportRunnerCsv: () => exportRunnerResult('csv'),
    onToggleRunnerCsvVariables: toggleActiveRunnerCsvVariables,
    onToggleRunnerCaptureSettings: (event) => toggleCaptureSettingsPanel('runner', event),
    onToggleRunnerAdvancedSettings: (event) => toggleRunnerAdvancedSettingsPanel(event),
    onToggleRunnerAuthRefresh: toggleActiveRunnerAuthRefresh,
    onEditRunnerAuthRefresh: (event) => toggleAuthRefreshPanel('runner', event),
    onOpenRunnerAuthRefreshRequest: () => openExistingAuthRefreshRequest('runner'),
    onAutoDetectRunnerAuthRefreshRequest: () => { void autoDetectAuthRefreshRequest('runner'); },
    onNewRunnerAuthRefreshRequest: () => openNewAuthRefreshRequest('runner'),
    onImportRunnerAuthRefreshRequest: () => { void promptAndImportAuthRefreshRequest('runner'); },
    onRemoveRunnerAuthRefreshRequest: () => removeAuthRefreshRequest('runner'),
    onOpenRunnerAuthRefreshTokenRequest: () => openExistingAuthRefreshRequest('runner', 'refreshToken'),
    onAutoDetectRunnerAuthRefreshTokenRequest: () => { void autoDetectAuthRefreshRequest('runner', 'refreshToken'); },
    onNewRunnerAuthRefreshTokenRequest: () => openNewAuthRefreshRequest('runner', 'refreshToken'),
    onImportRunnerAuthRefreshTokenRequest: () => { void promptAndImportAuthRefreshRequest('runner', 'refreshToken'); },
    onRemoveRunnerAuthRefreshTokenRequest: () => removeAuthRefreshRequest('runner', 'refreshToken'),
    onSaveRunner: () => { void saveRunnerFromPane(); },
    onDeleteRunner: () => { void deleteRunner(); },
    onAddRunnerRequest: (event) => showAddRunnerRequestMenu(event),
    onTogglePerformanceCsvVariables: toggleActivePerformanceCsvVariables,
    onTogglePerformanceCaptureSettings: (event) => toggleCaptureSettingsPanel('performance', event),
    onTogglePerformanceAdvancedSettings: (event) => togglePerformanceAdvancedSettingsPanel(event),
    onTogglePerformanceAuthRefresh: toggleActivePerformanceAuthRefresh,
    onEditPerformanceAuthRefresh: (event) => toggleAuthRefreshPanel('performance', event),
    onOpenPerformanceAuthRefreshRequest: () => openExistingAuthRefreshRequest('performance'),
    onAutoDetectPerformanceAuthRefreshRequest: () => { void autoDetectAuthRefreshRequest('performance'); },
    onNewPerformanceAuthRefreshRequest: () => openNewAuthRefreshRequest('performance'),
    onImportPerformanceAuthRefreshRequest: () => { void promptAndImportAuthRefreshRequest('performance'); },
    onRemovePerformanceAuthRefreshRequest: () => removeAuthRefreshRequest('performance'),
    onOpenPerformanceAuthRefreshTokenRequest: () => openExistingAuthRefreshRequest('performance', 'refreshToken'),
    onAutoDetectPerformanceAuthRefreshTokenRequest: () => { void autoDetectAuthRefreshRequest('performance', 'refreshToken'); },
    onNewPerformanceAuthRefreshTokenRequest: () => openNewAuthRefreshRequest('performance', 'refreshToken'),
    onImportPerformanceAuthRefreshTokenRequest: () => { void promptAndImportAuthRefreshRequest('performance', 'refreshToken'); },
    onRemovePerformanceAuthRefreshTokenRequest: () => removeAuthRefreshRequest('performance', 'refreshToken'),
    onSavePerformanceTest: () => { void savePerformanceTestFromPane(); },
    onDeletePerformanceTest: () => { void deletePerformanceTest(); },
    onRunPerformanceTest: () => { void runActivePerformanceTest(); },
    onCancelPerformanceTest: () => { void cancelPerformanceTestRun(); },
    onExportPerformanceTest: () => { void exportPerformanceTestFromPicker(); },
    onExportPerformanceResultHtml: () => openHtmlReportOptionsModal('performance'),
    onExportPerformanceResultJson: () => { void exportActivePerformanceResult('json'); },
    onExportPerformanceResultCsv: () => { void exportActivePerformanceResult('csv'); },
    onImportPerformanceRequest: () => { void promptAndImportPerformanceRequest(); },
    onAddPerformanceParam: () => addPerformancePair('queryParams'),
    onAddPerformanceHeader: () => addPerformancePair('headers'),
    onPerformancePostMeterTokenHeaderChange: () => setActivePerformanceRequestAutoHeaderOption('sendPostMeterToken', $('performanceSendPostMeterTokenInput')?.checked === true),
    onPerformanceShowGeneratedHeadersChange: () => setActivePerformanceRequestAutoHeaderOption('showGeneratedHeaders', $('performanceShowGeneratedHeadersInput')?.checked === true),
    onAddPerformanceRequestVariable: addPerformanceRequestVariable,
    onCalibratePerformance: () => { void startPerformanceCalibration(); },
    onClosePerformanceCalibration: closePerformanceCalibrationModal,
    onStartPkceFlow: startPkceFlow,
    onStartDeviceFlow: startDeviceFlow,
    onCancelOauthFlow: cancelOauthFlow,
    onHtmlReportIncludeResultsChange: syncHtmlReportOptionsModal,
    onHtmlReportIncludeDetailsChange: syncHtmlReportOptionsModal,
    onCancelHtmlReportOptions: () => resolveActiveModal(null),
    onConfirmHtmlReportOptions: confirmHtmlReportOptionsModal,
    onEnvironmentSelectChange: (environmentId) => {
      activeEnvironmentId = environmentId;
      renderVariablePreview();
      renderPerformanceVariablePreview();
      renderAuthRefreshVariableSuggestions('runner');
      renderAuthRefreshVariableSuggestions('performance');
      refreshVariableHighlights();
      scheduleSessionSave();
    },
    onRunnerConfigChange: collectRunnerAndMarkDirty,
    onEditRunnerCsvVariables: () => { void editActiveRunnerCsvVariables(); },
    onPerformanceTypeChange: setActivePerformanceTypeFromControl,
    onPerformanceConfigChange: collectPerformanceTestAndMarkDirty,
    onPerformanceRequestChange: collectPerformanceTestAndMarkDirty,
    onEditPerformanceCsvVariables: () => { void editActivePerformanceCsvVariables(); },
    onPerformanceMethodChange: () => {
      updatePerformanceMethodSelectClass();
      collectPerformanceTestAndMarkDirty();
    },
    onPerformanceUrlInput: () => {
      syncPerformanceParamsFromUrlInput();
      collectPerformanceTestAndMarkDirty();
      renderPerformanceCookieJarEditor();
    },
    onPerformanceBodyTypeChange: () => {
      updatePerformanceRequestBodyEditorLanguage();
      collectPerformanceTestAndMarkDirty();
    },
    onBeautifyPerformanceBody: () => beautifyBodyEditor('performance'),
    onAddPerformanceFormDataBodyRow: () => addBodyFormDataRow('performance'),
    onAddPerformanceUrlencodedBodyRow: () => addBodyUrlencodedRow('performance'),
    onPerformanceAuthTypeChange: showPerformanceAuthSection,
    onPerformanceAuthInput: collectPerformanceTestAndMarkDirty,
    onPerformanceRequestTlsSettingsChange: (event) => setActivePerformanceRequestTlsSettingsFromInputs(event),
    onCollectionAuthTypeChange: showCollectionAuthSection,
    onCollectionInput: collectCollectionAndMarkDirty,
    onCollectionAuthInput: collectCollectionAndMarkDirty,
    onEditCollectionDescription: () => beginMarkdownPaneEdit('collectionOverview'),
    onSaveCollectionDescription: () => saveMarkdownPaneEdit('collectionOverview'),
    onCancelCollectionDescription: () => cancelMarkdownPaneEdit('collectionOverview'),
    onFolderAuthTypeChange: showFolderAuthSection,
    onFolderInput: collectFolderAndMarkDirty,
    onFolderAuthInput: collectFolderAndMarkDirty,
    onEditFolderDescription: () => beginMarkdownPaneEdit('folderOverview'),
    onSaveFolderDescription: () => saveMarkdownPaneEdit('folderOverview'),
    onCancelFolderDescription: () => cancelMarkdownPaneEdit('folderOverview'),
    onPerformanceFilterCookiesChange: renderPerformanceCookieJarEditor,
    onMethodChange: () => {
      updateMethodSelectClass();
      collectRequestAndMarkDirty();
      if (activeRunnerRequestRunnerId) {
        renderRunnerEditor();
      } else if (activeCollectionId) {
        renderCollections();
      }
      renderRequestTabs();
    },
    onUrlInput: () => {
      syncRequestParamsFromUrlInput();
      collectRequestAndMarkDirty();
      renderCookieJarEditor();
    },
    onBodyTypeChange: () => {
      updateRequestBodyEditorLanguage();
      collectRequestAndMarkDirty();
    },
    onBeautifyBody: () => beautifyBodyEditor(''),
    onAddFormDataBodyRow: () => addBodyFormDataRow(''),
    onAddUrlencodedBodyRow: () => addBodyUrlencodedRow(''),
    onBodyInput: collectRequestAndMarkDirty,
    onPreRequestScriptInput: collectRequestAndMarkDirty,
    onTestScriptInput: collectRequestAndMarkDirty,
    onEditRequestDocs: () => beginMarkdownPaneEdit('requestDocs'),
    onSaveRequestDocs: () => saveMarkdownPaneEdit('requestDocs'),
    onCancelRequestDocs: () => cancelMarkdownPaneEdit('requestDocs'),
    onRequestCookieJarChange: collectRequestAndMarkDirty,
    onFilterCookiesChange: renderCookieJarEditor,
    onTrustedScriptCapabilityChange: setTrustedScriptCapabilitiesFromInputs,
    onDiagnosticsSettingsChange: setDiagnosticsSettingsFromInputs,
    onAuthTypeChange: showAuthSection,
    onAuthInput: collectRequestAndMarkDirty,
    onActivateTab: activateTab,
    onSelectSidebarPanel: selectSidebarPanel,
    onCancelActiveModal: cancelActiveModal,
    closeModalsOnBackdropClick: () => modalsCloseOnBackdropClick(),
    onResolveActiveModal: resolveActiveModal,
    onConfirmClientCertificateModal: confirmClientCertificateModal,
    onConfirmWorkspaceEncryptionModal: confirmWorkspaceEncryptionModal,
    onChooseClientCertificateCertPath: () => { void chooseClientCertificatePath('cert'); },
    onChooseClientCertificateKeyPath: () => { void chooseClientCertificatePath('key'); },
    onChooseClientCertificatePfxPath: () => { void chooseClientCertificatePath('pfx'); },
    onClientCertificateFormatChange: updateClientCertificateModalFormat,
    onToggleClientCertificatePassphraseVisibility: toggleClientCertificatePassphraseVisibility,
    onConfirmCsvVariablesModal: confirmCsvVariablesModal,
    onImportCsvVariablesFile: importCsvVariablesFile,
    onClearCsvVariablesFile: clearCsvVariablesFile,
    onCsvVariablesFileSelected: csvVariablesFileSelected,
    onSelectCsvVariablesSource: selectCsvVariablesSource,
    onToggleCsvVariablesValues: toggleCsvVariablesValuesPanel,
    onCsvVariablesValuesInput: csvVariablesValuesInputChanged,
    onCsvVariablesRowModeChange: csvVariablesRowModeChanged,
    onLoadCsvVariablesFile: () => { void loadPendingCsvVariablesFile(); },
    onKeepCsvVariablesFile: keepPendingCsvVariablesFile,
    onConfirmAuthRefreshAutoDetectModal: confirmAuthRefreshAutoDetectModal,
    onResolveVaultPrompt: resolveVaultPrompt,
    onTrapActiveModalFocus: trapActiveModalFocus,
    getSelectedDraftSaveCollectionId: () => selectedDraftSaveCollectionId,
    getSelectedExportCollectionId: () => selectedExportCollectionId,
    getSelectedExportItemId: () => selectedExportItemId,
    getSelectedFolderDestination: () => selectedFolderDestinationValue,
    getSelectedRunnerImportTarget: () => selectedRunnerImportTarget,
    onCloseContextMenu: closeContextMenu,
    onCloseFileSourceMenu: closeFileSourceMenu,
    onCloseCaptureSettingsPanels: closeCaptureSettingsPanels,
    onInitResizablePanes: initResizablePanes
  });
  bindRequestTitleEditor();
  bindCollectionTitleEditor();
  bindFolderTitleEditor();
  bindWorkspaceTitleEditor();
  bindEnvironmentTitleEditor();
  bindRunnerTitleEditor();
  bindPerformanceTitleEditor();
  bindAuthRefreshDisclosurePlacement();
  if (typeof setContextMenuPeerCloser === 'function') {
    setContextMenuPeerCloser(() => {
      closeToolbarMenus();
      closeFileSourceMenu();
    });
  }
  bindHistoryContextMenu();
  bindLocalFilePickerUi();
}

function bindHistoryContextMenu() {
  const tab = $('historyPanelTab');
  if (!tab) {
    return;
  }
  attachTreeContextMenu(tab, [
    ['Clear History', () => { void clearHistory(); }, 'danger']
  ]);
}

function showOpenTabContextMenu(event, kind, tab, _item, options = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const targetRef = openTabRef(kind, tab);
  const x = Number.isFinite(options.x) ? options.x : event?.clientX || 0;
  const y = Number.isFinite(options.y) ? options.y : event?.clientY || 0;
  showContextMenu(x, y, [
    ['New Request', () => newRequest()],
    openTabExportMenuItem(targetRef),
    ['Close Tab', () => { void queueOpenTabCloseSequence([targetRef]); }],
    ['Close Other Tabs', () => { void queueOpenTabCloseSequence(openTabRefs().filter((ref) => ref.key !== targetRef.key)); }],
    ['Close All Tabs', () => { void queueOpenTabCloseSequence(openTabRefs()); }],
    ['Force Close Tab', () => { void queueOpenTabCloseSequence([targetRef], { force: true }); }, 'danger'],
    ['Force Close Other Tabs', () => { void queueOpenTabCloseSequence(openTabRefs().filter((ref) => ref.key !== targetRef.key), { force: true }); }, 'danger'],
    ['Force Close All Tabs', () => { void queueOpenTabCloseSequence(openTabRefs(), { force: true }); }, 'danger']
  ], {
    focusFirst: options.keyboard === true,
    trigger: options.trigger || event?.currentTarget || null
  });
}

function openTabExportMenuItem(ref) {
  if (ref?.kind === 'collection') {
    return ['Export', [
      ['PostMeter', () => { void exportOpenTab(ref, 'postmeter'); }],
      ['Postman', () => { void exportOpenTab(ref, 'postman'); }],
      ['OpenAPI', () => { void exportOpenTab(ref, 'openapi'); }],
      ['curl', () => { void exportOpenTab(ref, 'curl'); }]
    ]];
  }
  if (ref?.kind === 'request') {
    return ['Export', [
      ['PostMeter', () => { void exportOpenTab(ref, 'postmeter'); }],
      ['curl', () => { void exportOpenTab(ref, 'curl'); }]
    ]];
  }
  if (ref?.kind === 'environment') {
    return ['Export', [
      ['PostMeter', () => { void exportOpenTab(ref, 'postmeter'); }],
      ['Postman', () => { void exportOpenTab(ref, 'postman'); }]
    ]];
  }
  return ['Export', () => { void exportOpenTab(ref); }];
}

async function exportOpenTab(ref, format = 'postmeter') {
  if (!openTabRefStillExists(ref)) {
    return setStatus('Select an open tab before exporting.');
  }
  if (ref.kind === 'request') {
    return exportRequest(requestForTab(ref.tab), format);
  }
  if (ref.kind === 'collection') {
    return exportCollection(collectionForTab(ref.tab), format);
  }
  if (ref.kind === 'environment') {
    return exportEnvironment(environmentForTab(ref.tab), format);
  }
  if (ref.kind === 'workspace') {
    const workspaceItem = workspaceForTab(ref.tab);
    return exportWorkspace(workspaceItem?.id || null);
  }
  if (ref.kind === 'runner') {
    return exportRunnerDefinition(runnerForTab(ref.tab));
  }
  if (ref.kind === 'performance') {
    return exportActivePerformanceTest(performanceTestForTab(ref.tab));
  }
  return setStatus('Select an open tab before exporting.');
}

function openTabRef(kind, tab) {
  return {
    kind,
    key: tab?.key || '',
    tab
  };
}

function openTabRefs() {
  return [
    ...openCollectionTabs.map((tab) => openTabRef('collection', tab)),
    ...openFolderTabs.map((tab) => openTabRef('folder', tab)),
    ...openRequestTabs.map((tab) => openTabRef('request', tab)),
    ...openEnvironmentTabs.map((tab) => openTabRef('environment', tab)),
    ...openWorkspaceTabs.map((tab) => openTabRef('workspace', tab)),
    ...openRunnerTabs.map((tab) => openTabRef('runner', tab)),
    ...openPerformanceTabs.map((tab) => openTabRef('performance', tab))
  ];
}

function openTabRefStillExists(ref) {
  if (!ref?.key) {
    return false;
  }
  return openTabRefs().some((candidate) => candidate.key === ref.key);
}

let openTabCloseSequence = Promise.resolve(true);

function queueOpenTabCloseSequence(refs, options = {}) {
  const refsSnapshot = Array.isArray(refs) ? refs.slice() : [];
  openTabCloseSequence = openTabCloseSequence
    .catch(() => false)
    .then(async () => {
      try {
        return await closeOpenTabsSequential(refsSnapshot, options);
      } catch (error) {
        const message = error?.message || String(error || 'Unknown error');
        setStatus(`Tab close failed: ${message}`);
        return false;
      }
    });
  return openTabCloseSequence;
}

async function closeOpenTabsSequential(refs, options = {}) {
  for (const ref of refs) {
    if (!openTabRefStillExists(ref)) {
      continue;
    }
    const closed = options.force === true
      ? await forceCloseOpenTab(ref)
      : await closeOpenTab(ref);
    if (!closed && openTabRefStillExists(ref)) {
      return false;
    }
  }
  return true;
}

async function closeOpenTab(ref) {
  if (ref?.kind === 'collection') {
    await closeCollectionTab(ref.tab);
  } else if (ref?.kind === 'folder') {
    await closeFolderTab(ref.tab);
  } else if (ref?.kind === 'request') {
    await closeRequestTab(ref.tab);
  } else if (ref?.kind === 'environment') {
    await closeEnvironmentTab(ref.tab);
  } else if (ref?.kind === 'workspace') {
    await closeWorkspaceTab(ref.tab);
  } else if (ref?.kind === 'runner') {
    await closeRunnerTab(ref.tab);
  } else if (ref?.kind === 'performance') {
    await closePerformanceTab(ref.tab);
  }
  return !openTabRefStillExists(ref);
}

async function forceCloseOpenTab(ref) {
  const options = { save: forceCloseSavesChanges() };
  if (ref?.kind === 'collection') {
    await forceCloseCollectionTab(ref.tab, options);
  } else if (ref?.kind === 'folder') {
    await forceCloseFolderTab(ref.tab, options);
  } else if (ref?.kind === 'request') {
    await forceCloseRequestTab(ref.tab, options);
  } else if (ref?.kind === 'environment') {
    await forceCloseEnvironmentTab(ref.tab, options);
  } else if (ref?.kind === 'workspace') {
    await forceCloseWorkspaceTab(ref.tab, options);
  } else if (ref?.kind === 'runner') {
    await forceCloseRunnerTab(ref.tab, options);
  } else if (ref?.kind === 'performance') {
    await forceClosePerformanceTab(ref.tab, options);
  }
  return !openTabRefStillExists(ref);
}
