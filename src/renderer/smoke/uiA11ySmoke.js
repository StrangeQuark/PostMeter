(function attachUiA11ySmoke(global) {
  const {
    assertUiSmoke,
    dispatchChange,
    dispatchInput,
    nextPaint,
    waitForUiSmoke
  } = resolveUiSmokeCommon(global);

  async function runUiA11ySmoke() {
    workspace.collections = [];
    workspace.environments = [];
    workspace.history = [];
    workspace.cookies = [];
    clearActiveWorkspaceItem();
    renderAll();
    await assertA11ySurface('empty workspace');

    const fixture = createA11yFixture();
    renderAll();
    await assertA11ySurface('request editor', { requireLiveRegion: true });
    assertTabRelationships('request editor');

    selectSidebarPanel('environments');
    activeEnvironmentEditorId = fixture.environment.id;
    ensureOpenEnvironmentTabForActive();
    renderAll();
    await assertA11ySurface('environment editor');

    selectSidebarPanel('runners');
    activeRunnerConfigId = fixture.runner.id;
    ensureOpenRunnerTabForActive();
    renderAll();
    await assertA11ySurface('runner editor');

    selectSidebarPanel('performance');
    activePerformanceTestId = fixture.performance.id;
    ensureOpenPerformanceTabForActive();
    renderAll();
    await assertA11ySurface('performance editor');

    selectSidebarPanel('collections');
    activeCollectionId = fixture.collection.id;
    activeRequestId = fixture.request.id;
    renderAll();
    activateTab('request', 'auth');
    $('authTypeSelect').value = 'basic';
    dispatchChange($('authTypeSelect'));
    await assertA11ySurface('basic auth editor', { requireLiveRegion: true });

    activateTab('request', 'body');
    $('bodyTypeSelect').value = 'FORM_DATA';
    dispatchChange($('bodyTypeSelect'));
    await assertA11ySurface('form-data body editor', { requireLiveRegion: true });

    displayResponse({
      statusCode: 418,
      durationMillis: 37,
      responseBytes: 24,
      finalUrl: 'https://a11y.example.test/widgets',
      headers: { 'content-type': ['application/json'], 'set-cookie': ['a11y=1; Path=/; HttpOnly'] },
      body: '{"error":"teapot"}',
      testScriptResult: {
        passed: false,
        tests: [{ name: 'response should not be a teapot', passed: false, error: 'Expected 200.' }]
      }
    });
    activateTab('results', 'response');
    await assertA11ySurface('response panel', { requireLiveRegion: true });
    activateTab('results', 'testResults');
    await assertA11ySurface('test results panel', { requireLiveRegion: true });

    await openSettingsSection('appearance');
    await assertA11ySurface('settings appearance modal');
    selectSettingsSection('certificates');
    await assertA11ySurface('settings certificates modal');
    selectSettingsSection('diagnostics');
    await assertA11ySurface('settings diagnostics modal', { requireLiveRegion: true });
    resolveActiveModal(null);

    await openVaultPromptState();
    await assertA11ySurface('vault prompt modal');
    hideAllModals();

    await openTutorialState();
    await assertA11ySurface('tutorial modal and overlay', { requireLiveRegion: true });
    if (typeof endTutorial === 'function') {
      endTutorial();
    }
    hideAllModals();

    assertNoBrokenAriaReferences('final');
  }

  function createA11yFixture() {
    const collection = newCollection();
    collection.name = 'Accessibility Collection';
    collection.variables = [{ enabled: true, key: 'baseUrl', value: 'https://a11y.example.test' }];
    const request = newRequest(collection.id, null);
    request.name = 'Accessibility Request';
    request.method = 'POST';
    request.url = '{{baseUrl}}/widgets';
    request.queryParams = [{ enabled: true, key: 'include', value: 'owner' }];
    request.headers = [{ enabled: true, key: 'Accept', value: 'application/json' }];
    request.bodyType = 'RAW_JSON';
    request.body = '{"name":"a11y"}';
    request.scripts = {
      preRequest: "pm.variables.set('a11y', 'ok');",
      tests: "pm.test('a11y response', function () { pm.expect(true).to.equal(true); });"
    };
    request.variables = [{ enabled: true, key: 'requestToken', value: 'request-value' }];
    request.docs = 'Accessibility fixture request.';

    const environment = newEnvironment();
    environment.name = 'Accessibility Environment';
    environment.variables = [{ enabled: true, key: 'baseUrl', value: 'https://a11y.example.test' }];

    const runner = newRunner();
    runner.name = 'Accessibility Runner';
    runner.requests = [{ ...newRequestObject('Runner Probe'), method: 'GET', url: '{{baseUrl}}/health' }];

    const performance = newPerformanceTest();
    performance.name = 'Accessibility Performance';
    performance.type = 'latency';
    performance.request = { ...newRequestObject('Performance Probe'), method: 'GET', url: '{{baseUrl}}/perf' };

    activeCollectionId = collection.id;
    activeRequestId = request.id;
    activeEnvironmentId = environment.id;
    activeRunnerConfigId = runner.id;
    activePerformanceTestId = performance.id;
    ensureOpenRequestTabForActive({ dirty: false });
    return { collection, environment, performance, request, runner };
  }

  async function openSettingsSection(section) {
    void openSettingsModal(section);
    await waitForUiSmoke(() => !$('settingsModal').hidden, 'Settings modal did not open.', 3000, global);
    selectSettingsSection(section);
    await nextPaint(global);
  }

  async function openVaultPromptState() {
    $('vaultPromptRequestName').textContent = 'Accessibility Request';
    $('vaultPromptCollectionName').textContent = 'Accessibility Collection';
    $('vaultPromptWorkspaceName').textContent = workspace.name || 'Workspace';
    $('vaultPromptSecretKey').textContent = 'a11ySecret';
    $('vaultPromptOperation').textContent = 'get';
    $('vaultPromptMessage').textContent = 'A script is asking to get a local vault secret.';
    $('modalBackdrop').hidden = false;
    for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
      modal.hidden = modal.id !== 'vaultPromptModal';
    }
    await nextPaint(global);
  }

  async function openTutorialState() {
    void openTutorialsModal();
    await waitForUiSmoke(() => !$('tutorialsModal').hidden, 'Tutorial modal did not open.', 3000, global);
    const firstTutorial = $('tutorialList')?.querySelector?.('button');
    assertUiSmoke(firstTutorial, 'Tutorial list should expose a selectable tutorial.');
    firstTutorial.click();
    $('startTutorialButton').click();
    await waitForUiSmoke(() => !$('tutorialOverlay').hidden, 'Tutorial overlay did not open.', 3000, global);
  }

  async function assertA11ySurface(label, options = {}) {
    await nextPaint(global);
    assertNoBrokenAriaReferences(label);
    assertInteractiveControlsHaveNames(label);
    assertImagesAreNamedOrHidden(label);
    assertDialogContracts(label);
    assertLiveRegions(label, options);
    assertNoPositiveTabIndex(label);
  }

  function assertNoBrokenAriaReferences(label) {
    for (const element of Array.from(document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls], [aria-owns], [aria-activedescendant]'))) {
      if (!isElementVisibleForA11y(element)) {
        continue;
      }
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant']) {
        const value = element.getAttribute(attr);
        if (!value || (attr === 'aria-activedescendant' && value === '')) {
          continue;
        }
        for (const id of value.trim().split(/\s+/)) {
          assertUiSmoke(document.getElementById(id), `${label}: ${attr} references missing id "${id}" on ${elementSummary(element)}.`);
        }
      }
    }
  }

  function assertInteractiveControlsHaveNames(label) {
    const selector = [
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="checkbox"]',
      '[role="combobox"]',
      '[role="textbox"]',
      '[role="switch"]'
    ].join(',');
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (!isElementVisibleForA11y(element)) {
        continue;
      }
      assertUiSmoke(accessibleName(element), `${label}: visible interactive control lacks an accessible name: ${elementSummary(element)}.`);
    }
  }

  function assertImagesAreNamedOrHidden(label) {
    for (const image of Array.from(document.querySelectorAll('img'))) {
      if (!isElementVisibleForA11y(image)) {
        continue;
      }
      assertUiSmoke(
        image.getAttribute('aria-hidden') === 'true' || image.hasAttribute('alt'),
        `${label}: visible image must have alt text or aria-hidden: ${elementSummary(image)}.`
      );
    }
  }

  function assertDialogContracts(label) {
    for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]:not([hidden])'))) {
      if (!isElementVisibleForA11y(dialog)) {
        continue;
      }
      assertUiSmoke(dialog.getAttribute('aria-modal') === 'true', `${label}: dialog must set aria-modal=true: ${elementSummary(dialog)}.`);
      const labelledBy = dialog.getAttribute('aria-labelledby');
      assertUiSmoke(labelledBy && labelledBy.split(/\s+/).every((id) => document.getElementById(id)), `${label}: dialog must be labelled by an existing title: ${elementSummary(dialog)}.`);
    }
  }

  function assertLiveRegions(label, options = {}) {
    if (options.requireLiveRegion !== true) {
      return;
    }
    const liveRegions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'))
      .filter(isElementVisibleForA11y);
    assertUiSmoke(liveRegions.length >= 1, `${label}: at least one visible live/status region should be present.`);
  }

  function assertNoPositiveTabIndex(label) {
    for (const element of Array.from(document.querySelectorAll('[tabindex]'))) {
      if (!isElementVisibleForA11y(element)) {
        continue;
      }
      const value = Number(element.getAttribute('tabindex'));
      assertUiSmoke(!Number.isFinite(value) || value <= 0, `${label}: positive tabindex is not allowed: ${elementSummary(element)}.`);
    }
  }

  function assertTabRelationships(label) {
    for (const tab of Array.from(document.querySelectorAll('[role="tab"]')).filter(isElementVisibleForA11y)) {
      const controls = tab.getAttribute('aria-controls');
      assertUiSmoke(controls && document.getElementById(controls), `${label}: tab lacks an existing aria-controls relationship: ${elementSummary(tab)}.`);
    }
  }

  function accessibleName(element) {
    const aria = element.getAttribute('aria-label');
    if (aria && aria.trim()) {
      return aria.trim();
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) {
        return text;
      }
    }
    if (element.id) {
      const label = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
      if (label?.textContent?.trim()) {
        return label.textContent.trim();
      }
    }
    const parentLabel = element.closest('label');
    if (parentLabel?.textContent?.trim()) {
      return parentLabel.textContent.trim();
    }
    const title = element.getAttribute('title');
    if (title?.trim()) {
      return title.trim();
    }
    if (element.tagName === 'IMG' && element.hasAttribute('alt')) {
      return element.getAttribute('alt');
    }
    return String(element.textContent || '').trim();
  }

  function isElementVisibleForA11y(element) {
    if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementSummary(element) {
    const id = element.id ? `#${element.id}` : '';
    const cls = String(element.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).map((part) => `.${part}`).join('');
    return `<${element.tagName.toLowerCase()}${id}${cls}>`;
  }

  function cssEscape(value) {
    if (global.CSS?.escape) {
      return global.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function resolveUiSmokeCommon(runtimeGlobal) {
    if (runtimeGlobal.PostMeterUiSmokeCommon) {
      return runtimeGlobal.PostMeterUiSmokeCommon;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./uiSmokeCommon');
    }
    throw new Error('PostMeter UI smoke common helpers must load before uiA11ySmoke.js.');
  }

  const exported = {
    runUiA11ySmoke
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterUiA11ySmoke = exported;
})(typeof window === 'undefined' ? globalThis : window);
