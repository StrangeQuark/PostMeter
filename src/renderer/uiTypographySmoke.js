'use strict';

(function attachUiTypographySmoke(global) {
  const {
    assertUiSmoke,
    nextPaint,
    waitForUiSmoke
  } = resolveUiSmokeCommon(global);

  const SETTINGS_SECTIONS = [
    'appearance',
    'tabs',
    'modals',
    'updates',
    'scripts',
    'vault',
    'packages',
    'files',
    'diagnostics'
  ];
  const REQUEST_TABS = ['params', 'headers', 'auth', 'cookies', 'body', 'scripts', 'collectionVariables', 'docs'];
  const COLLECTION_TABS = ['collectionOverview', 'collectionAuth', 'collectionScripts', 'collectionLevelVariables'];
  const FOLDER_TABS = ['folderOverview', 'folderAuth', 'folderScripts', 'folderLevelVariables'];
  const PERFORMANCE_REQUEST_TABS = [
    'performanceParams',
    'performanceHeaders',
    'performanceAuth',
    'performanceCookies',
    'performanceBody',
    'performanceScripts',
    'performanceVariables',
    'performanceDocs'
  ];
  const PERFORMANCE_TYPE_TABS = ['latency', 'throughput', 'concurrency', 'stress', 'spike', 'soak', 'ramp'];
  const RESULTS_TABS = ['response', 'responseHeaders', 'responseCookies', 'testResults'];
  const FIT_SELECTORS = [
    '.brand',
    '.menu-trigger',
    '.toolbar-menu button',
    '.toolbar-submenu button',
    '.sidebar-tab',
    '.sidebar-panel-header h2',
    '.sidebar-header-action',
    '.tree-item',
    '.history-item',
    '.tab',
    '.request-main-title',
    '.editable-title',
    '.field > span',
    '.inline-toggle span',
    '.checkbox-line span',
    '.settings-nav-button',
    '.settings-card-title',
    '.settings-field > span',
    '.workspace-package-row strong',
    '.workspace-package-row button',
    '.modal-title-row h2',
    '.modal-actions button',
    '.request-actions button',
    '.table-actions button',
    '.environment-actions button',
    '.request-empty-content h2',
    '.request-empty-content button',
    '.document-section-title'
  ];
  const HORIZONTAL_OVERFLOW_SELECTORS = [
    '.topbar',
    '.sidebar',
    '.sidebar-tabs',
    '.sidebar-panel.active',
    '.workspace',
    '.request-line',
    '#requestEditorPanel',
    '#environmentMainPanel',
    '#workspaceMainPanel',
    '#runnerMainPanel',
    '#performanceMainPanel',
    '.tab-panel.active',
    '.settings-modal',
    '.settings-layout',
    '.settings-content'
  ];
  const OVERLAP_PARENT_SELECTORS = [
    '.topbar',
    '.sidebar-tabs',
    '.sidebar-panel-header',
    '.request-line',
    '.request-actions',
    '.table-actions',
    '.environment-actions',
    '.tabs',
    '.settings-sidebar',
    '.settings-theme-options',
    '.settings-typography-grid',
    '.workspace-package-row',
    '.modal-title-row',
    '.modal-actions',
    '.toolbar-menu',
    '.toolbar-submenu'
  ];

  async function runUiTypographySmoke() {
    assertUiSmoke(workspace.collections.length === 0, 'Typography smoke should start with an empty workspace.');
    assertUiSmoke(typeof setTypographyPreference === 'function', 'Typography preference setter should be available.');
    global.__postmeterSkipWorkspaceShutdownSave = true;
    const fixture = prepareTypographyFixture();
    const interfaceFonts = optionValues('interfaceFontSelect');
    const editorFonts = optionValues('editorFontSelect');
    assertUiSmoke(interfaceFonts.length >= 15, 'Interface font selector should expose every built-in font option.');
    assertUiSmoke(
      JSON.stringify(interfaceFonts) === JSON.stringify(editorFonts),
      `Interface and editor font lists should match. interface=${interfaceFonts.join(',')} editor=${editorFonts.join(',')}`
    );
    const interfaceSizes = numericInputRange('interfaceFontSizeInput');
    const editorSizes = numericInputRange('editorFontSizeInput');

    await assertInterfaceTypographyMatrix(fixture, interfaceFonts, interfaceSizes, editorFonts, editorSizes);
    await assertEditorTypographyMatrix(fixture, editorFonts, editorSizes, interfaceFonts, interfaceSizes);
    await assertCrossControlStressPairs(fixture, interfaceFonts, interfaceSizes, editorFonts, editorSizes);
    await applyTypography({ interfaceFont: 'default', interfaceFontSize: 13, editorFont: 'default', editorFontSize: 12 }, 'restore-defaults');
    hideTransientUi();
  }

  function prepareTypographyFixture() {
    const collection = newCollection();
    collection.name = 'Smoke API';
    collection.description = 'Typography layout coverage collection.';
    collection.variables = [{ enabled: true, key: 'baseUrl', value: 'https://api.example.test' }];
    const folder = newFolder(collection.id, null);
    folder.name = 'Billing';
    const request = newRequest(collection.id, null);
    request.name = 'Customer Lookup';
    request.url = '{{baseUrl}}/v1/customers';
    request.queryParams = [{ enabled: true, key: 'status', value: 'active' }];
    request.headers = [{ enabled: true, key: 'X-PostMeter-Typography', value: 'smoke' }];
    request.bodyType = 'RAW_JSON';
    request.body = JSON.stringify({ customerId: 42, include: ['profile', 'billing'] }, null, 2);
    request.scripts = {
      preRequest: "pm.variables.set('typography', 'ok');",
      tests: "pm.test('typography smoke', function () { pm.expect(true).to.equal(true); });"
    };
    request.variables = [{ enabled: true, key: 'requestToken', value: 'local-value' }];
    request.docs = 'Typography smoke documentation for request editor layout.';

    const environment = newEnvironment();
    environment.name = 'Local Env';
    environment.variables = [
      { enabled: true, key: 'baseUrl', value: 'https://api.example.test' },
      { enabled: true, key: 'token', value: 'example-token' }
    ];

    const runner = newRunner();
    runner.name = 'Smoke Runner';
    runner.requests = [{
      ...newRequestObject('Runner Probe'),
      url: 'https://api.example.test/runner',
      iterations: 2
    }];

    const performance = newPerformanceTest();
    performance.name = 'Latency Baseline';
    performance.request = {
      ...newRequestObject('Performance Probe'),
      url: 'https://api.example.test/performance',
      bodyType: 'RAW_JSON',
      body: JSON.stringify({ probe: true }, null, 2),
      scripts: {
        preRequest: "pm.variables.set('performanceTypography', 'ok');",
        tests: "pm.test('performance typography', function () { pm.expect(true).to.equal(true); });"
      },
      docs: 'Performance request documentation.'
    };
    performance.type = 'latency';
    workspace.history = [{
      id: crypto.randomUUID(),
      method: 'GET',
      url: 'https://api.example.test/v1/customers',
      statusCode: 200,
      durationMillis: 42,
      responseBytes: 128
    }];

    activeCollectionId = collection.id;
    activeFolderId = null;
    activeRequestId = request.id;
    activeRunnerRequestRunnerId = null;
    activeEnvironmentId = environment.id;
    activeRunnerConfigId = runner.id;
    activePerformanceTestId = performance.id;
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    ensureOpenRequestTabForActive({ dirty: false });
    renderAll();
    displayResponse({
      statusCode: 200,
      durationMillis: 42,
      responseBytes: 128,
      finalUrl: 'https://api.example.test/v1/customers?status=active',
      headers: { 'content-type': ['application/json'], 'x-smoke': ['typography'] },
      body: JSON.stringify({ ok: true, typography: 'smoke' }),
      testScriptResult: {
        tests: [{ name: 'typography smoke', passed: true }]
      }
    });
    return {
      collectionId: collection.id,
      folderId: folder.id,
      requestId: request.id,
      environmentId: environment.id,
      runnerId: runner.id,
      performanceId: performance.id
    };
  }

  async function assertInterfaceTypographyMatrix(fixture, fonts, sizes, editorFonts, editorSizes) {
    const screens = interfaceScreens(fixture);
    const stressEditorFont = preferredOption(editorFonts, 'georgia');
    const stressEditorSize = editorSizes.at(-1);
    for (const font of fonts) {
      for (const size of sizes) {
        const label = `interface:${font}:${size}`;
        await applyTypography({
          interfaceFont: font,
          interfaceFontSize: size,
          editorFont: stressEditorFont,
          editorFontSize: stressEditorSize
        }, label);
        for (const screen of screens) {
          screen.setup();
          assertTypographyLayout(`${label}:${screen.name}`);
        }
      }
    }
  }

  async function assertEditorTypographyMatrix(fixture, fonts, sizes, interfaceFonts, interfaceSizes) {
    const screens = editorScreens(fixture);
    const stressInterfaceFont = preferredOption(interfaceFonts, 'system-mono');
    const stressInterfaceSize = interfaceSizes.at(-1);
    for (const font of fonts) {
      for (const size of sizes) {
        const label = `editor:${font}:${size}`;
        await applyTypography({
          interfaceFont: stressInterfaceFont,
          interfaceFontSize: stressInterfaceSize,
          editorFont: font,
          editorFontSize: size
        }, label);
        for (const screen of screens) {
          screen.setup();
          assertTypographyLayout(`${label}:${screen.name}`);
          assertActiveEditorFontSize(size, `${label}:${screen.name}`);
        }
      }
    }
  }

  async function assertCrossControlStressPairs(fixture, interfaceFonts, interfaceSizes, editorFonts, editorSizes) {
    const pairs = [
      {
        interfaceFont: interfaceFonts.at(-1),
        interfaceFontSize: interfaceSizes.at(-1),
        editorFont: editorFonts.at(-1),
        editorFontSize: editorSizes.at(-1)
      },
      {
        interfaceFont: 'system-mono',
        interfaceFontSize: interfaceSizes.at(-1),
        editorFont: 'georgia',
        editorFontSize: editorSizes.at(-1)
      },
      {
        interfaceFont: 'georgia',
        interfaceFontSize: interfaceSizes.at(-1),
        editorFont: 'system-mono',
        editorFontSize: editorSizes.at(-1)
      }
    ];
    const screens = [
      ...interfaceScreens(fixture),
      ...editorScreens(fixture)
    ];
    for (const pair of pairs) {
      const label = `combined:${pair.interfaceFont}:${pair.interfaceFontSize}:${pair.editorFont}:${pair.editorFontSize}`;
      await applyTypography(pair, label);
      for (const screen of screens) {
        screen.setup();
        assertTypographyLayout(`${label}:${screen.name}`);
      }
    }
  }

  function interfaceScreens(fixture) {
    return [
      { name: 'toolbar', setup: () => showRequest(fixture, 'params') },
      { name: 'new-menu', setup: () => showToolbarMenu('newMenuButton', 'newMenu') },
      { name: 'import-menu', setup: () => showToolbarMenu('importMenuButton', 'importMenu') },
      { name: 'export-menu', setup: () => showToolbarMenu('exportMenuButton', 'exportMenu') },
      ...REQUEST_TABS.map((tab) => ({ name: `request-${tab}`, setup: () => showRequest(fixture, tab) })),
      ...RESULTS_TABS.map((tab) => ({ name: `results-${tab}`, setup: () => showResults(fixture, tab) })),
      ...COLLECTION_TABS.map((tab) => ({ name: `collection-${tab}`, setup: () => showCollection(fixture, tab) })),
      ...FOLDER_TABS.map((tab) => ({ name: `folder-${tab}`, setup: () => showFolder(fixture, tab) })),
      { name: 'environment', setup: () => showEnvironment(fixture) },
      { name: 'workspace', setup: () => showWorkspace() },
      { name: 'runner', setup: () => showRunner(fixture) },
      ...PERFORMANCE_TYPE_TABS.map((tab) => ({ name: `performance-${tab}`, setup: () => showPerformance(fixture, tab, 'performanceParams') })),
      ...PERFORMANCE_REQUEST_TABS.map((tab) => ({ name: `performance-request-${tab}`, setup: () => showPerformance(fixture, 'latency', tab) })),
      { name: 'history', setup: () => showHistory(fixture) },
      ...SETTINGS_SECTIONS.map((section) => ({ name: `settings-${section}`, setup: () => showSettingsSection(section) }))
    ];
  }

  function editorScreens(fixture) {
    return [
      { name: 'request-url', setup: () => showRequest(fixture, 'params') },
      { name: 'request-body', setup: () => showRequest(fixture, 'body') },
      { name: 'request-scripts', setup: () => showRequest(fixture, 'scripts') },
      { name: 'request-docs', setup: () => showRequest(fixture, 'docs') },
      { name: 'response-body', setup: () => showResults(fixture, 'response') },
      { name: 'response-headers', setup: () => showResults(fixture, 'responseHeaders') },
      { name: 'performance-body', setup: () => showPerformance(fixture, 'latency', 'performanceBody') },
      { name: 'performance-scripts', setup: () => showPerformance(fixture, 'latency', 'performanceScripts') },
      { name: 'performance-docs', setup: () => showPerformance(fixture, 'latency', 'performanceDocs') }
    ];
  }

  async function applyTypography(patch, label) {
    hideTransientUi();
    await setTypographyPreference(patch, { save: false, showStatus: false });
    await waitForUiSmoke(
      () => {
        const appearance = workspace.settings?.appearance || {};
        return (!Object.hasOwn(patch, 'interfaceFont') || appearance.interfaceFont === patch.interfaceFont)
          && (!Object.hasOwn(patch, 'interfaceFontSize') || appearance.interfaceFontSize === patch.interfaceFontSize)
          && (!Object.hasOwn(patch, 'editorFont') || appearance.editorFont === patch.editorFont)
          && (!Object.hasOwn(patch, 'editorFontSize') || appearance.editorFontSize === patch.editorFontSize);
      },
      `Typography setting did not apply for ${label}.`,
      1000,
      global
    );
    await nextPaint(global);
  }

  function showRequest(fixture, tab) {
    hideTransientUi();
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    activeCollectionId = fixture.collectionId;
    activeFolderId = null;
    activeRequestId = fixture.requestId;
    activeRunnerRequestRunnerId = null;
    ensureOpenRequestTabForActive({ dirty: false });
    renderAll();
    activateTab('request', tab);
  }

  function showResults(fixture, tab) {
    showRequest(fixture, 'params');
    activateTab('results', tab);
  }

  function showCollection(fixture, tab) {
    hideTransientUi();
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    activeCollectionId = fixture.collectionId;
    activeFolderId = null;
    activeRequestId = null;
    activeRunnerRequestRunnerId = null;
    ensureOpenCollectionTabForActive({ dirty: false });
    renderAll();
    activateTab('collection', tab);
  }

  function showFolder(fixture, tab) {
    hideTransientUi();
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    activeCollectionId = fixture.collectionId;
    activeFolderId = fixture.folderId;
    activeRequestId = null;
    activeRunnerRequestRunnerId = null;
    ensureOpenFolderTabForActive({ dirty: false });
    renderAll();
    activateTab('folder', tab);
  }

  function showEnvironment(fixture) {
    hideTransientUi();
    activeEnvironmentId = fixture.environmentId;
    selectSidebarPanel('environments');
  }

  function showWorkspace() {
    hideTransientUi();
    const workspaceItem = workspaceListItems()[0] || null;
    if (workspaceItem?.id) {
      selectWorkspaceItem(workspaceItem.id);
      return;
    }
    activeSidebarPanel = 'workspaces';
    activeMainPanel = 'workspace';
    renderAll();
  }

  function showRunner(fixture) {
    hideTransientUi();
    selectRunnerItem(fixture.runnerId);
  }

  function showPerformance(fixture, performanceType, requestTab) {
    hideTransientUi();
    selectPerformanceTestItem(fixture.performanceId);
    activateTab('performance', performanceType);
    activateTab('performanceRequest', requestTab);
  }

  function showHistory(fixture) {
    hideTransientUi();
    showRequest(fixture, 'params');
    selectSidebarPanel('history');
  }

  function showSettingsSection(section) {
    hideTransientUi();
    $('modalBackdrop').hidden = false;
    for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
      modal.hidden = modal.id !== 'settingsModal';
    }
    renderSettingsControls();
    selectSettingsSection(section);
  }

  function showToolbarMenu(buttonId, menuId) {
    hideTransientUi();
    showRequest({ collectionId: activeCollectionId, requestId: activeRequestId }, 'params');
    const button = $(buttonId);
    const menu = $(menuId);
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  }

  function hideTransientUi() {
    if ($('modalBackdrop')) {
      $('modalBackdrop').hidden = true;
      for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
        modal.hidden = true;
      }
    }
    if (typeof closeToolbarMenus === 'function') {
      closeToolbarMenus();
    }
    if (typeof closeContextMenu === 'function') {
      closeContextMenu();
    }
  }

  function assertTypographyLayout(context) {
    assertUiSmoke(
      document.documentElement.scrollWidth <= window.innerWidth + 3,
      `${context}: document should not have horizontal overflow. scrollWidth=${document.documentElement.scrollWidth} width=${window.innerWidth}`
    );
    assertSidebarTabsFit(context);
    assertVisibleElementsFit(context);
    assertHorizontalContainersFit(context);
    assertNoSiblingOverlaps(context);
    assertLineNumberEditorsAligned(context);
    assertVisibleModalFitsViewport(context);
  }

  function assertSidebarTabsFit(context) {
    const rail = document.querySelector('.sidebar-tabs');
    assertUiSmoke(rail, `${context}: sidebar tab rail should exist.`);
    for (const tab of document.querySelectorAll('.sidebar-tab')) {
      assertUiSmoke(
        tab.scrollWidth <= tab.clientWidth + 1,
        `${context}: sidebar tab "${tab.textContent.trim()}" should fit. scrollWidth=${tab.scrollWidth} clientWidth=${tab.clientWidth}`
      );
    }
  }

  function assertVisibleElementsFit(context) {
    for (const selector of FIT_SELECTORS) {
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element) || !hasTextForFitCheck(element) || allowsTextClipping(element)) {
          continue;
        }
        assertUiSmoke(
          element.scrollWidth <= element.clientWidth + 2,
          `${context}: "${fitLabel(element)}" should not spill out of ${selector}. scrollWidth=${element.scrollWidth} clientWidth=${element.clientWidth}`
        );
      }
    }
  }

  function assertHorizontalContainersFit(context) {
    for (const selector of HORIZONTAL_OVERFLOW_SELECTORS) {
      for (const element of document.querySelectorAll(selector)) {
        if (!isVisible(element) || allowsHorizontalScroll(element)) {
          continue;
        }
        assertUiSmoke(
          element.scrollWidth <= element.clientWidth + 3,
          `${safeContextLabel(context)}: overflow ${selector} ${elementLabel(element)} ${element.scrollWidth}/${element.clientWidth} ${overflowDebug(element)}`
        );
      }
    }
  }

  function assertNoSiblingOverlaps(context) {
    for (const selector of OVERLAP_PARENT_SELECTORS) {
      for (const parent of document.querySelectorAll(selector)) {
        if (!isVisible(parent)) {
          continue;
        }
        const children = Array.from(parent.children).filter((child) => isVisible(child) && measurable(child));
        for (let index = 0; index < children.length; index += 1) {
          for (let next = index + 1; next < children.length; next += 1) {
            const first = children[index].getBoundingClientRect();
            const second = children[next].getBoundingClientRect();
            assertUiSmoke(
              !rectsOverlap(first, second),
              `${context}: children in ${selector} should not overlap: "${fitLabel(children[index])}" and "${fitLabel(children[next])}".`
            );
          }
        }
      }
    }
  }

  function assertLineNumberEditorsAligned(context) {
    for (const wrapper of document.querySelectorAll('.code-editor.has-line-numbers')) {
      if (!isVisible(wrapper)) {
        continue;
      }
      const textarea = wrapper.querySelector('textarea.code-editor-input');
      const lineNumbers = wrapper.querySelector('.code-editor-line-numbers');
      const lineNumberCode = wrapper.querySelector('.code-editor-line-numbers code');
      const highlight = wrapper.querySelector('.code-editor-highlight');
      if (!isVisible(textarea) || !isVisible(lineNumbers)) {
        continue;
      }
      const textareaRect = textarea.getBoundingClientRect();
      const lineNumberRect = lineNumbers.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      assertUiSmoke(
        Math.abs(lineNumberRect.right - textareaRect.left) <= 1.5,
        `${context}: line-number gutter should touch ${textarea.id}. right=${lineNumberRect.right} textareaLeft=${textareaRect.left}`
      );
      assertUiSmoke(
        textareaRect.right <= wrapperRect.right + 1.5,
        `${context}: ${textarea.id} should stay inside its editor wrapper when line numbers are enabled. textareaRight=${textareaRect.right} wrapperRight=${wrapperRect.right}`
      );
      assertUiSmoke(
        cssPixels(getComputedStyle(textarea), 'border-top-left-radius') <= 0.5
          && cssPixels(getComputedStyle(textarea), 'border-bottom-left-radius') <= 0.5,
        `${context}: ${textarea.id} should not keep a rounded left edge when line numbers are enabled.`
      );
      assertUiSmoke(
        Math.abs(lineNumberRect.top - textareaRect.top) <= 1.5 && Math.abs(lineNumberRect.bottom - textareaRect.bottom) <= 1.5,
        `${context}: line-number gutter should match ${textarea.id} height. gutter=${lineNumberRect.top}/${lineNumberRect.bottom} textarea=${textareaRect.top}/${textareaRect.bottom}`
      );
      assertCodeEditorMetricMatches(textarea, lineNumbers, 'fontSize', `${context}: line-number font size should match ${textarea.id}.`);
      assertCodeEditorMetricMatches(textarea, lineNumbers, 'lineHeight', `${context}: line-number line height should match ${textarea.id}.`);
      if (isVisible(highlight)) {
        const highlightRect = highlight.getBoundingClientRect();
        assertUiSmoke(
          Math.abs(highlightRect.left - textareaRect.left) <= 1.5
            && Math.abs(highlightRect.top - textareaRect.top) <= 1.5
            && Math.abs(highlightRect.right - textareaRect.right) <= 1.5
            && Math.abs(highlightRect.bottom - textareaRect.bottom) <= 1.5,
          `${context}: editor highlight should match ${textarea.id} bounds. highlight=${highlightRect.left}/${highlightRect.top}/${highlightRect.right}/${highlightRect.bottom} textarea=${textareaRect.left}/${textareaRect.top}/${textareaRect.right}/${textareaRect.bottom}`
        );
        assertCodeEditorMetricMatches(textarea, highlight, 'fontSize', `${context}: highlight font size should match ${textarea.id}.`);
        assertCodeEditorMetricMatches(textarea, highlight, 'lineHeight', `${context}: highlight line height should match ${textarea.id}.`);
        const numberRight = firstLineNumberTextRight(lineNumberCode);
        if (Number.isFinite(numberRight)) {
          const gap = editorTextLeft(highlight) - numberRight;
          assertUiSmoke(
            gap >= 8 && gap <= 40,
            `${context}: line-number to editor text gap should stay readable for ${textarea.id}. gap=${gap}`
          );
        }
      }
    }
  }

  function assertCodeEditorMetricMatches(textarea, target, property, message) {
    assertUiSmoke(
      getComputedStyle(target)[property] === getComputedStyle(textarea)[property],
      `${message} expected=${getComputedStyle(textarea)[property]} actual=${getComputedStyle(target)[property]}`
    );
  }

  function editorTextLeft(highlight) {
    const rect = highlight.getBoundingClientRect();
    const style = getComputedStyle(highlight);
    return rect.left + cssPixels(style, 'border-left-width') + cssPixels(style, 'padding-left');
  }

  function cssPixels(style, property) {
    const value = Number.parseFloat(style.getPropertyValue(property));
    return Number.isFinite(value) ? value : 0;
  }

  function firstLineNumberTextRight(code) {
    const textNode = code?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.textContent) {
      return NaN;
    }
    const firstBreak = textNode.textContent.indexOf('\n');
    const endOffset = firstBreak === -1 ? textNode.textContent.length : firstBreak;
    if (endOffset <= 0) {
      return NaN;
    }
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, endOffset);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    return rect.width > 0 ? rect.right : NaN;
  }

  function assertVisibleModalFitsViewport(context) {
    const modal = document.querySelector('.modal:not([hidden])');
    if (!isVisible(modal)) {
      return;
    }
    const rect = modal.getBoundingClientRect();
    assertUiSmoke(rect.left >= -1 && rect.right <= window.innerWidth + 1, `${context}: modal should fit horizontally in the viewport.`);
    assertUiSmoke(rect.top >= -1 && rect.bottom <= window.innerHeight + 1, `${context}: modal should fit vertically in the viewport.`);
  }

  function assertActiveEditorFontSize(expectedSize, context) {
    const candidates = [
      'urlInput',
      'bodyInput',
      'preRequestScriptInput',
      'postRequestScriptInput',
      'docsInput',
      'responseBody',
      'responseHeaders',
      'performanceUrlInput',
      'performanceBodyInput',
      'performancePreRequestScriptInput',
      'performancePostRequestScriptInput',
      'performanceDocsInput'
    ];
    const visible = candidates
      .map((id) => $(id))
      .filter((element) => element && isVisible(element));
    assertUiSmoke(visible.length > 0, `${context}: at least one editor text control should be visible.`);
    for (const element of visible) {
      assertUiSmoke(
        getComputedStyle(element).fontSize === `${expectedSize}px`,
        `${context}: ${element.id} should use editor font size ${expectedSize}px, got ${getComputedStyle(element).fontSize}.`
      );
    }
  }

  function optionValues(id) {
    const select = $(id);
    assertUiSmoke(select, `${id} should exist.`);
    return Array.from(select.options).map((option) => option.value);
  }

  function numericInputRange(id) {
    const input = $(id);
    assertUiSmoke(input, `${id} should exist.`);
    const min = Number(input.min);
    const max = Number(input.max);
    assertUiSmoke(Number.isInteger(min) && Number.isInteger(max) && min <= max, `${id} should expose a valid integer range.`);
    return Array.from({ length: max - min + 1 }, (_unused, index) => min + index);
  }

  function preferredOption(options, preferred) {
    return options.includes(preferred) ? preferred : options.at(-1);
  }

  function isVisible(element) {
    if (!element || !element.getClientRects || element.getClientRects().length === 0) {
      return false;
    }
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function measurable(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function hasTextForFitCheck(element) {
    const tag = String(element.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
      return false;
    }
    return String(element.textContent || '').trim().length > 0;
  }

  function allowsTextClipping(element) {
    const style = getComputedStyle(element);
    return style.overflowX !== 'visible' || style.textOverflow === 'ellipsis';
  }

  function allowsHorizontalScroll(element) {
    const style = getComputedStyle(element);
    if (style.overflowX === 'hidden') {
      return true;
    }
    return ['auto', 'scroll'].includes(style.overflowX)
      && (element.id === 'requestTabBar' || element.classList.contains('tree') || element.classList.contains('history'));
  }

  function rectsOverlap(first, second) {
    const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    return horizontal > 1 && vertical > 1;
  }

  function fitLabel(element) {
    return String(element.getAttribute?.('aria-label') || element.textContent || element.id || element.className || element.tagName || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function safeContextLabel(context) {
    return String(context || '')
      .replace(/request/gi, 'req')
      .replace(/response/gi, 'res')
      .replace(/body/gi, 'payload');
  }

  function elementLabel(element) {
    return `[id=${element.id || 'none'} class=${String(element.className || '').replace(/\s+/g, '.').slice(0, 80) || 'none'}]`;
  }

  function overflowDebug(element) {
    const child = firstOverflowingChild(element);
    if (!child) {
      return '';
    }
    return `child=${elementLabel(child)} ${child.scrollWidth}/${child.clientWidth}`;
  }

  function firstOverflowingChild(element) {
    for (const child of Array.from(element.children || [])) {
      if (isVisible(child) && child.scrollWidth > child.clientWidth + 3) {
        return firstOverflowingChild(child) || child;
      }
    }
    return null;
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiTypographySmoke.js.');
  }

  const exported = {
    runUiTypographySmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiTypographySmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
