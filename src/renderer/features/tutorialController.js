async function openCookiesModal() {
  renderWorkspaceCookieManager();
  await showModal('cookiesModal', true);
  renderCookieJarEditor();
  renderPerformanceCookieJarEditor();
}

const TUTORIAL_BACKGROUND_BLOCKED_EVENTS = Object.freeze([
  'pointerdown',
  'pointerup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'touchmove'
]);
const TUTORIAL_BACKGROUND_EVENT_OPTIONS = Object.freeze({ capture: true, passive: false });
let tutorialBackgroundInteractionHandler = null;

function renderTutorialsModal() {
  const list = $('tutorialList');
  const detailTitle = $('tutorialDetailTitle');
  const detailLevel = $('tutorialDetailLevel');
  const detailSummary = $('tutorialDetailSummary');
  const detailSteps = $('tutorialDetailSteps');
  const startButton = $('startTutorialButton');
  if (!list || !detailTitle || !detailLevel || !detailSummary || !detailSteps || !startButton) {
    return;
  }
  const selectedTutorial = tutorialById(selectedTutorialId) || TUTORIALS[0] || null;
  if (selectedTutorial) {
    selectedTutorialId = selectedTutorial.id;
  }
  list.textContent = '';
  for (const tutorial of TUTORIALS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tutorial-list-item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', tutorial.id === selectedTutorialId ? 'true' : 'false');
    button.dataset.tutorialId = tutorial.id;
    const title = document.createElement('strong');
    title.textContent = tutorial.title;
    const meta = document.createElement('span');
    meta.textContent = `${tutorial.level} - ${tutorial.duration}`;
    button.append(title, meta);
    button.addEventListener('click', () => selectTutorial(tutorial.id));
    list.append(button);
  }
  detailSteps.textContent = '';
  if (!selectedTutorial) {
    detailTitle.textContent = 'Select a tutorial';
    detailLevel.textContent = '';
    detailSummary.textContent = 'Choose a tutorial from the list.';
    startButton.disabled = true;
    return;
  }
  detailTitle.textContent = selectedTutorial.title;
  detailLevel.textContent = `${selectedTutorial.level} - ${selectedTutorial.duration}`;
  detailSummary.textContent = selectedTutorial.summary;
  for (const step of selectedTutorial.steps) {
    const item = document.createElement('li');
    item.textContent = step.title;
    detailSteps.append(item);
  }
  startButton.disabled = false;
}

function selectTutorial(tutorialId) {
  if (!tutorialById(tutorialId)) {
    return;
  }
  selectedTutorialId = tutorialId;
  renderTutorialsModal();
}

function startSelectedTutorial() {
  if (!tutorialById(selectedTutorialId)) {
    return;
  }
  resolveActiveModal(null, { flushNotifications: false });
  startTutorial(selectedTutorialId);
}

function startTutorial(tutorialId) {
  const tutorial = tutorialById(tutorialId);
  if (!tutorial) {
    return false;
  }
  endTutorial({ silent: true });
  activeTutorialId = tutorial.id;
  activeTutorialStepIndex = 0;
  tutorialPreferredNavigationFocusId = 'nextTutorialStepButton';
  attachTutorialOverlayListeners();
  showTutorialStep(0);
  return true;
}

function previousTutorialStep() {
  if (!activeTutorial()) {
    return;
  }
  tutorialPreferredNavigationFocusId = 'previousTutorialStepButton';
  showTutorialStep(Math.max(0, activeTutorialStepIndex - 1));
}

function nextTutorialStep() {
  const tutorial = activeTutorial();
  if (!tutorial) {
    return;
  }
  tutorialPreferredNavigationFocusId = 'nextTutorialStepButton';
  if (activeTutorialStepIndex >= tutorial.steps.length - 1) {
    endTutorial();
    return;
  }
  showTutorialStep(activeTutorialStepIndex + 1);
}

function endTutorial(options = {}) {
  clearTutorialFloatingUiState();
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  const overlay = $('tutorialOverlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.classList.remove('is-coach-only');
  }
  const frame = $('tutorialTargetFrame');
  if (frame) {
    frame.hidden = true;
  }
  detachTutorialOverlayListeners();
  activeTutorialId = '';
  activeTutorialStepIndex = 0;
  if (!options.silent) {
    setStatus('Tutorial ended.');
  }
}

function showTutorialStep(index) {
  const tutorial = activeTutorial();
  const overlay = $('tutorialOverlay');
  if (!tutorial || !overlay) {
    return;
  }
  const nextIndex = Math.min(Math.max(0, Number(index) || 0), tutorial.steps.length - 1);
  const step = tutorial.steps[nextIndex];
  activeTutorialStepIndex = nextIndex;
  clearTutorialFloatingUiState();
  tutorialFloatingUiPending = false;
  step.beforeStep?.();
  const floatingUiPending = tutorialFloatingUiPending;
  overlay.hidden = false;
  $('tutorialCoachProgress').textContent = `Step ${nextIndex + 1} of ${tutorial.steps.length}`;
  $('tutorialCoachTitle').textContent = step.title;
  $('tutorialCoachBody').textContent = step.body;
  $('tutorialCoachHint').textContent = step.hint || '';
  $('previousTutorialStepButton').disabled = nextIndex === 0;
  $('nextTutorialStepButton').textContent = nextIndex === tutorial.steps.length - 1 ? 'Finish' : 'Next';
  const frame = $('tutorialTargetFrame');
  const coach = $('tutorialCoach');
  if (frame && !floatingUiPending) {
    frame.hidden = true;
  }
  if (coach && floatingUiPending) {
    coach.hidden = true;
  }
  const target = tutorialTargetElement(step);
  if (step.scroll !== false && !floatingUiPending) {
    target?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'auto' });
  }
  if (!floatingUiPending) {
    positionTutorialOverlay();
    requestAnimationFrame(() => positionTutorialOverlay());
    restoreTutorialNavigationFocus();
  }
}

function restoreTutorialNavigationFocus() {
  const preferred = $(tutorialPreferredNavigationFocusId);
  const fallback = $('nextTutorialStepButton');
  const target = preferred && !preferred.disabled ? preferred : fallback;
  target?.focus?.({ preventScroll: true });
}

function tutorialById(tutorialId) {
  return TUTORIALS.find((tutorial) => tutorial.id === tutorialId) || null;
}

function activeTutorial() {
  return tutorialById(activeTutorialId);
}

function tutorialTargetElement(step) {
  if (!step?.selector) {
    return null;
  }
  try {
    return document.querySelector(step.selector);
  } catch {
    return null;
  }
}

function attachTutorialOverlayListeners() {
  detachTutorialOverlayListeners();
  tutorialOverlayPositionHandler = () => positionTutorialOverlay();
  tutorialBackgroundInteractionHandler = (event) => blockTutorialBackgroundInteraction(event);
  window.addEventListener('resize', tutorialOverlayPositionHandler);
  document.addEventListener('scroll', tutorialOverlayPositionHandler, true);
  document.addEventListener('keydown', tutorialBackgroundInteractionHandler, true);
  document.addEventListener('focusin', tutorialBackgroundInteractionHandler, true);
  for (const eventName of TUTORIAL_BACKGROUND_BLOCKED_EVENTS) {
    document.addEventListener(eventName, tutorialBackgroundInteractionHandler, TUTORIAL_BACKGROUND_EVENT_OPTIONS);
  }
}

function detachTutorialOverlayListeners() {
  if (!tutorialOverlayPositionHandler) {
    return;
  }
  window.removeEventListener('resize', tutorialOverlayPositionHandler);
  document.removeEventListener('scroll', tutorialOverlayPositionHandler, true);
  tutorialOverlayPositionHandler = null;
  document.removeEventListener('keydown', tutorialBackgroundInteractionHandler, true);
  document.removeEventListener('focusin', tutorialBackgroundInteractionHandler, true);
  for (const eventName of TUTORIAL_BACKGROUND_BLOCKED_EVENTS) {
    document.removeEventListener(eventName, tutorialBackgroundInteractionHandler, TUTORIAL_BACKGROUND_EVENT_OPTIONS);
  }
  tutorialBackgroundInteractionHandler = null;
}

function blockTutorialBackgroundInteraction(event) {
  if (!activeTutorial()) {
    return;
  }
  const coach = $('tutorialCoach');
  if (event.type === 'keydown') {
    blockTutorialBackgroundKeydown(event, coach);
    return;
  }
  if (event.type === 'focusin') {
    if (!tutorialEventTargetInsideCoach(event.target, coach)) {
      stopTutorialBackgroundEvent(event);
      restoreTutorialNavigationFocus();
    }
    return;
  }
  if (tutorialEventTargetInsideCoach(event.target, coach)) {
    return;
  }
  stopTutorialBackgroundEvent(event);
}

function blockTutorialBackgroundKeydown(event, coach) {
  if (event.key === 'Escape') {
    stopTutorialBackgroundEvent(event);
    endTutorial();
    return;
  }
  if (event.key === 'Tab') {
    trapTutorialCoachFocus(event, coach);
    return;
  }
  if (!tutorialEventTargetInsideCoach(event.target, coach)) {
    stopTutorialBackgroundEvent(event);
    restoreTutorialNavigationFocus();
  }
}

function trapTutorialCoachFocus(event, coach) {
  if (!coach || coach.hidden) {
    stopTutorialBackgroundEvent(event);
    return;
  }
  const focusable = tutorialFocusableElements(coach);
  if (!focusable.length) {
    stopTutorialBackgroundEvent(event);
    coach.focus?.();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (!tutorialEventTargetInsideCoach(active, coach)) {
    stopTutorialBackgroundEvent(event);
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    stopTutorialBackgroundEvent(event);
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    stopTutorialBackgroundEvent(event);
    first.focus();
  }
}

function tutorialFocusableElements(root) {
  return Array.from(root.querySelectorAll([
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','))).filter((element) => {
    if (element.hidden) {
      return false;
    }
    const rect = element.getBoundingClientRect?.();
    return element.offsetParent !== null || Boolean(rect && rect.width > 0 && rect.height > 0);
  });
}

function tutorialEventTargetInsideCoach(target, coach = $('tutorialCoach')) {
  return Boolean(coach && target && (target === coach || coach.contains?.(target)));
}

function stopTutorialBackgroundEvent(event) {
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

function positionTutorialOverlay() {
  const tutorial = activeTutorial();
  const overlay = $('tutorialOverlay');
  const frame = $('tutorialTargetFrame');
  const coach = $('tutorialCoach');
  if (!tutorial || overlay?.hidden || !frame || !coach || tutorialFloatingUiPending) {
    return;
  }
  coach.hidden = false;
  const step = tutorial.steps[activeTutorialStepIndex];
  const target = tutorialTargetElement(step);
  const targetRect = visibleTutorialTargetRect(target);
  if (targetRect) {
    overlay.classList.remove('is-coach-only');
    positionTutorialFrame(frame, targetRect);
    positionTutorialCoach(coach, targetRect, step);
  } else {
    overlay.classList.add('is-coach-only');
    frame.hidden = true;
    positionTutorialCoach(coach, null, step);
  }
}

function visibleTutorialTargetRect(target) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  let rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  rect = intersectTutorialRects(rect, {
    left: 0,
    top: 0,
    right: Number(window.innerWidth) || document.documentElement?.clientWidth || 0,
    bottom: Number(window.innerHeight) || document.documentElement?.clientHeight || 0
  });
  for (let ancestor = target.parentElement; rect && ancestor; ancestor = ancestor.parentElement) {
    if (ancestor === document.body || ancestor === document.documentElement) {
      continue;
    }
    const style = window.getComputedStyle?.(ancestor);
    const fixedAncestor = style?.position === 'fixed';
    const overflow = `${style?.overflow || ''} ${style?.overflowX || ''} ${style?.overflowY || ''}`;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      rect = intersectTutorialRects(rect, ancestor.getBoundingClientRect());
    }
    if (fixedAncestor) {
      break;
    }
  }
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return rect;
}

function intersectTutorialRects(first, second) {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  if (right <= left || bottom <= top) {
    return null;
  }
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function positionTutorialFrame(frame, rect) {
  const padding = 6;
  const left = clampNumber(rect.left - padding, 6, window.innerWidth - 12);
  const top = clampNumber(rect.top - padding, 6, window.innerHeight - 12);
  const right = clampNumber(rect.right + padding, 12, window.innerWidth - 6);
  const bottom = clampNumber(rect.bottom + padding, 12, window.innerHeight - 6);
  frame.style.left = `${left}px`;
  frame.style.top = `${top}px`;
  frame.style.width = `${Math.max(24, right - left)}px`;
  frame.style.height = `${Math.max(24, bottom - top)}px`;
  frame.hidden = false;
}

function positionTutorialCoach(coach, targetRect, step = null) {
  const margin = 16;
  const gap = 14;
  coach.style.left = `${margin}px`;
  coach.style.top = `${margin}px`;
  const rect = coach.getBoundingClientRect();
  const width = rect.width || Math.min(360, window.innerWidth - margin * 2);
  const height = rect.height || 180;
  let left;
  let top;
  if (step?.coachPlacement === 'top-left') {
    left = margin;
    top = margin;
  } else if (!targetRect) {
    left = (window.innerWidth - width) / 2;
    top = (window.innerHeight - height) / 2;
  } else if (targetRect.right + gap + width <= window.innerWidth - margin) {
    left = targetRect.right + gap;
    top = targetRect.top;
  } else if (targetRect.left - gap - width >= margin) {
    left = targetRect.left - gap - width;
    top = targetRect.top;
  } else if (targetRect.bottom + gap + height <= window.innerHeight - margin) {
    left = targetRect.left;
    top = targetRect.bottom + gap;
  } else {
    left = targetRect.left;
    top = targetRect.top - gap - height;
  }
  coach.style.left = `${clampNumber(left, margin, window.innerWidth - width - margin)}px`;
  coach.style.top = `${clampNumber(top, margin, window.innerHeight - height - margin)}px`;
}

function clampNumber(value, min, max) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : safeMin;
  const safeValue = Number.isFinite(value) ? value : safeMin;
  return Math.min(Math.max(safeValue, safeMin), safeMax);
}

function tutorialEnsureRequestContext(tabName = 'params') {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  if (activeMainPanel !== 'request' || activeRunnerRequestRunnerId || activeAuthRefreshRequestOwnerType || !activeRequest()) {
    newRequest(null, null);
  } else {
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    renderAll();
  }
  if (tabName) {
    activateTab('request', tabName);
  }
}

function tutorialEnsureEnvironmentContext() {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  workspace.environments ||= [];
  if (!activeEditorEnvironment() && workspace.environments.length) {
    activeEnvironmentEditorId = workspace.environments[0].id;
  }
  if (!activeEditorEnvironment()) {
    newEnvironment();
    return;
  }
  activeSidebarPanel = 'environments';
  activeMainPanel = 'environment';
  ensureOpenEnvironmentTabForActive();
  renderAll();
}

function tutorialEnsureRunnerContext() {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  ensureWorkspaceRunners();
  if (!activeRunner() && workspace.runners.length) {
    activeRunnerConfigId = workspace.runners[0].id;
  }
  if (!activeRunner()) {
    newRunner();
    return;
  }
  activeSidebarPanel = 'runners';
  activeMainPanel = 'runner';
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
  ensureOpenRunnerTabForActive();
  renderAll();
}

function closeTutorialOwnedModal() {
  const modalId = tutorialOwnedModalId;
  tutorialOwnedModalId = '';
  if (modalId && state.activeModalId === modalId) {
    resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
  }
  if (modalId === 'clientCertificateModal' && state.activeModalId === 'settingsModal') {
    resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
  }
}

function trackTutorialOwnedModal(modalId, promise) {
  tutorialOwnedModalId = modalId;
  void Promise.resolve(promise).finally(() => {
    if (tutorialOwnedModalId === modalId && state.activeModalId !== modalId) {
      tutorialOwnedModalId = '';
    }
  });
}

function deferTutorialFloatingUi(callback) {
  tutorialFloatingUiPending = true;
  try {
    callback();
  } finally {
    tutorialFloatingUiPending = false;
  }
}

function clearTutorialFloatingUiState() {
  tutorialFloatingUiPending = false;
}

function tutorialEnsureCollectionRequestContext(tabName = 'params') {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  workspace.collections ||= [];
  const normalRequestActive = activeRequest()
    && activeCollectionId
    && !activeRunnerRequestRunnerId
    && !activeAuthRefreshRequestOwnerType;
  if (!normalRequestActive) {
    let collection = workspace.collections.find((item) => item.id === activeCollectionId) || workspace.collections[0] || null;
    if (!collection) {
      collection = newCollection();
    }
    if (!collection) {
      return;
    }
    activeCollectionId = collection.id;
    activeFolderId = null;
    if (collection.requests.length) {
      activeRequestId = collection.requests[0].id;
      ensureOpenRequestTabForActive();
    } else {
      newRequest(collection.id, null);
    }
  }
  activeSidebarPanel = 'collections';
  activeMainPanel = 'request';
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
  ensureOpenRequestTabForActive();
  renderAll();
  if (tabName) {
    activateTab('request', tabName);
  }
}

function tutorialEnsureDraftRequestContext(tabName = 'params') {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  const draftActive = activeRequestId && draftRequests.has(activeRequestId)
    && !activeRunnerRequestRunnerId
    && !activeAuthRefreshRequestOwnerType;
  if (!draftActive || !activeRequest()) {
    newRequest(null, null);
  } else {
    activeSidebarPanel = 'collections';
    activeMainPanel = 'request';
    activeCollectionId = null;
    activeFolderId = null;
    renderAll();
  }
  if (tabName) {
    activateTab('request', tabName);
  }
}

function tutorialEnsureRequestBodyContext() {
  tutorialEnsureCollectionRequestContext('body');
}

function tutorialEnsureRawRequestBodyContext() {
  tutorialEnsureCollectionRequestContext('body');
  const request = activeRequest();
  if (!request) {
    return;
  }
  if (bodyModeForRequest(request) !== 'RAW') {
    request.bodyType = 'JSON';
    request.body = request.body || '{\n  \n}';
    request.postmanBody = {
      mode: 'raw',
      raw: request.body,
      options: {
        raw: {
          language: 'json'
        }
      }
    };
    renderAll();
    activateTab('request', 'body');
  }
}

function tutorialEnsureRequestSettingsOverviewContext() {
  tutorialEnsureCollectionRequestContext('requestSettings');
  const panel = $('requestSettingsTab');
  if (panel) {
    panel.scrollTop = 0;
    panel.scrollLeft = 0;
  }
}

function tutorialEnsureRequestAuthContext() {
  tutorialEnsureCollectionRequestContext('auth');
}

function tutorialEnsureGeneratedHeadersContext() {
  tutorialEnsureCollectionRequestContext('headers');
  const request = activeRequest();
  if (!request) {
    return;
  }
  request.autoHeaders ||= { sendPostMeterToken: false, showGeneratedHeaders: false };
  request.autoHeaders.showGeneratedHeaders = true;
  renderRequestEditor();
}

function tutorialEnsureRequestResultsContext(tabName = 'response') {
  tutorialEnsureCollectionRequestContext('params');
  activateTab('results', tabName);
}

function tutorialEnsurePerformanceContext() {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  ensureWorkspacePerformanceTests();
  if (!activePerformanceTest() && workspace.performanceTests.length) {
    activePerformanceTestId = workspace.performanceTests[0].id;
  }
  if (!activePerformanceTest()) {
    newPerformanceTest();
    return;
  }
  activeSidebarPanel = 'performance';
  activeMainPanel = 'performance';
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
  ensureOpenPerformanceTabForActive();
  renderAll();
}

function tutorialEnsurePerformanceRequestContext(tabName = 'performanceParams') {
  tutorialEnsurePerformanceContext();
  if (tabName) {
    activateTab('performanceRequest', tabName);
  }
}

function tutorialEnsurePerformanceTypeContext(type) {
  tutorialEnsurePerformanceContext();
  activateTab('performance', type);
}

function tutorialEnsureRunnerCaptureSettings() {
  tutorialEnsureRunnerContext();
  openCaptureSettingsPanelForTutorial('runner');
}

function tutorialEnsurePerformanceCaptureSettings() {
  tutorialEnsurePerformanceContext();
  openCaptureSettingsPanelForTutorial('performance');
}

function openCaptureSettingsPanelForTutorial(prefix) {
  deferTutorialFloatingUi(() => {
    const panel = $(`${prefix}CaptureSettingsPanel`);
    const button = $(`${prefix}CaptureSettingsButton`);
    if (!panel || !button || button.disabled) {
      return;
    }
    closeToolbarMenus();
    closeContextMenu();
    closeFileSourceMenu();
    closeCaptureSettingsPanels({ exceptPanel: panel });
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionCaptureSettingsPanel(prefix);
  });
}

function tutorialEnsureRunnerAdvancedSettings() {
  tutorialEnsureRunnerContext();
  deferTutorialFloatingUi(() => {
    const panel = $('runnerAdvancedSettingsPanel');
    const button = $('runnerAdvancedSettingsButton');
    if (!panel || !button || button.disabled) {
      return;
    }
    closeToolbarMenus();
    closeContextMenu();
    closeFileSourceMenu();
    closeCaptureSettingsPanels({ exceptPanel: panel });
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionRunnerAdvancedSettingsPanel();
  });
}

function tutorialEnsurePerformanceAdvancedSettings() {
  tutorialEnsurePerformanceContext();
  deferTutorialFloatingUi(() => {
    const panel = $('performanceAdvancedSettingsPanel');
    const button = $('performanceAdvancedSettingsButton');
    if (!panel || !button || button.disabled) {
      return;
    }
    closeToolbarMenus();
    closeContextMenu();
    closeFileSourceMenu();
    closeCaptureSettingsPanels({ exceptPanel: panel });
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionPerformanceAdvancedSettingsPanel();
  });
}

function tutorialEnsureToolbarMenu(buttonId, menuId) {
  closeTutorialOwnedModal();
  closeCaptureSettingsPanels();
  closeContextMenu();
  closeFileSourceMenu();
  deferTutorialFloatingUi(() => {
    const button = $(buttonId);
    const menu = $(menuId);
    if (!button || !menu || button.disabled) {
      return;
    }
    closeToolbarMenus();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionRendererToolbarMenu?.(button, menu, { windowObject: window });
  });
}

function tutorialEnsureCsvVariablesModal(prefix = 'runner') {
  if (state.activeModalId === 'csvVariablesModal') {
    tutorialOwnedModalId = 'csvVariablesModal';
    return;
  }
  if (prefix === 'performance') {
    tutorialEnsurePerformanceContext();
  } else {
    tutorialEnsureRunnerContext();
  }
  closeToolbarMenus();
  const modalPromise = prefix === 'performance' ? editActivePerformanceCsvVariables() : editActiveRunnerCsvVariables();
  trackTutorialOwnedModal('csvVariablesModal', modalPromise);
}

function tutorialEnsureRunnerCsvVariablesModal() {
  tutorialEnsureCsvVariablesModal('runner');
}

function tutorialEnsurePerformanceCsvVariablesModal() {
  tutorialEnsureCsvVariablesModal('performance');
}

function tutorialEnsureCsvVariablesValuesPanel(prefix = 'runner') {
  tutorialEnsureCsvVariablesModal(prefix);
  setCsvVariablesValuesExpanded(true);
}

function tutorialEnsureAuthRefreshPanel(prefix) {
  tutorialEnsureAuthRefreshBaseContext(prefix);
  deferTutorialFloatingUi(() => openAuthRefreshSettingsPanel(prefix));
}

function tutorialEnsureAuthRefreshManageMenu(prefix) {
  tutorialEnsureAuthRefreshBaseContext(prefix);
  deferTutorialFloatingUi(() => {
    openAuthRefreshSettingsPanel(prefix);
    const button = $(`${prefix}AuthRefreshManageRequestButton`);
    const menu = $(`${prefix}AuthRefreshManageRequestMenu`);
    if (!button || !menu || button.disabled) {
      return;
    }
    closeToolbarMenus();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionRendererToolbarMenu?.(button, menu, { windowObject: window });
  });
}

function tutorialEnsureAuthRefreshDetails(prefix, section) {
  tutorialEnsureAuthRefreshBaseContext(prefix);
  deferTutorialFloatingUi(() => {
    openAuthRefreshSettingsPanel(prefix);
    const panel = $(`${prefix}AuthRefreshPanel`);
    const detailsId = section === 'refreshToken'
      ? `${prefix}AuthRefreshRefreshTokenDetails`
      : `${prefix}AuthRefreshAdvancedDetails`;
    const details = $(detailsId);
    if (details) {
      details.hidden = false;
      details.open = true;
      if (section === 'advanced') {
        for (const id of [
          `${prefix}AuthRefreshAccessTokenVariableField`,
          `${prefix}AuthRefreshRefreshTokenVariableField`,
          `${prefix}AuthRefreshBeforeRunOption`,
          `${prefix}AuthRefreshFailurePolicyField`
        ]) {
          const field = $(id);
          if (field) {
            field.hidden = false;
          }
        }
      }
      positionAuthRefreshPanel(prefix);
      const stepTarget = tutorialTargetElement(activeTutorial()?.steps?.[activeTutorialStepIndex]) || details;
      scrollTutorialTargetIntoPanel(panel, stepTarget);
      positionAuthRefreshPanel(prefix);
    }
  });
}

function scrollTutorialTargetIntoPanel(panel, target) {
  if (!(panel instanceof HTMLElement) || !(target instanceof HTMLElement)) {
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const padding = 16;
  if (targetRect.top < panelRect.top + padding) {
    panel.scrollTop = Math.max(0, panel.scrollTop - ((panelRect.top + padding) - targetRect.top));
  } else if (targetRect.bottom > panelRect.bottom - padding) {
    panel.scrollTop += targetRect.bottom - (panelRect.bottom - padding);
  }
}

function tutorialEnsureAuthRefreshAutoDetectExample(prefix) {
  if (state.activeModalId === 'authRefreshAutoDetectModal') {
    tutorialOwnedModalId = 'authRefreshAutoDetectModal';
    return;
  }
  tutorialEnsureAuthRefreshBaseContext(prefix);
  deferTutorialFloatingUi(() => {
    closeToolbarMenus();
    closeCaptureSettingsPanels();
    renderAuthRefreshAutoDetectModal([
      {
        id: 'tutorial-body-token',
        source: 'body',
        path: 'access_token',
        label: 'JSON body path access_token',
        detail: 'Example value: pm-example-access-token',
        valuePreview: 'pm-example-access-token',
        compatible: true
      },
      {
        id: 'tutorial-header-token',
        source: 'header',
        path: 'x-access-token',
        label: 'Header x-access-token',
        detail: 'Example value: pm-example-header-token',
        valuePreview: 'pm-example-header-token',
        compatible: true
      },
      {
        id: 'tutorial-cookie-token',
        source: 'cookie',
        path: 'session',
        label: 'Cookie session',
        detail: 'Example value: pm-example-session',
        valuePreview: 'pm-example-session',
        compatible: true
      }
    ], { label: 'access token' });
    trackTutorialOwnedModal('authRefreshAutoDetectModal', showModal('authRefreshAutoDetectModal', null));
  });
}

function tutorialEnsureAuthRefreshBaseContext(prefix) {
  const activeInRequestedContext = prefix === 'performance'
    ? activeMainPanel === 'performance' && activeSidebarPanel === 'performance' && Boolean(activePerformanceTest())
    : activeMainPanel === 'runner' && activeSidebarPanel === 'runners' && Boolean(activeRunner());
  if (!activeInRequestedContext) {
    if (prefix === 'performance') {
      tutorialEnsurePerformanceContext();
    } else {
      tutorialEnsureRunnerContext();
    }
    return;
  }
  closeTutorialOwnedModal();
  closeContextMenu();
  closeFileSourceMenu();
  activeRunnerRequestRunnerId = null;
  activeAuthRefreshRequestOwnerType = '';
  activeAuthRefreshRequestOwnerId = null;
  if (prefix === 'performance') {
    ensureOpenPerformanceTabForActive();
  } else {
    ensureOpenRunnerTabForActive();
  }
}

function tutorialEnsureCookiesModal() {
  if (state.activeModalId === 'cookiesModal') {
    tutorialOwnedModalId = 'cookiesModal';
    renderWorkspaceCookieManager();
    return;
  }
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  trackTutorialOwnedModal('cookiesModal', openCookiesModal());
}

function tutorialEnsureCookieDomainInput() {
  tutorialEnsureCookiesModal();
  const input = $('cookiesDomainInput');
  if (input) {
    input.value = 'localhost';
  }
}

function tutorialEnsureLocalhostCookieDomain() {
  tutorialEnsureCookieDomainInput();
  cookieManagerExtraDomains.add('localhost');
  renderWorkspaceCookieManager();
}

function tutorialEnsureLocalhostCookieEditor() {
  tutorialEnsureLocalhostCookieDomain();
  workspace.cookies ||= [];
  let index = workspace.cookies.findIndex((cookie) => normalizeCookieManagerDomain(cookie?.domain) === 'localhost'
    && String(cookie?.name || '') === 'session');
  if (index < 0) {
    workspace.cookies.push(newWorkspaceCookie({
      name: 'session',
      value: 'local-dev-token',
      domain: 'localhost',
      path: '/',
      hostOnly: true,
      httpOnly: true,
      sameSite: 'Lax',
      source: 'tutorial'
    }));
    index = workspace.cookies.length - 1;
  }
  cookieManagerSelectedCookieIndex = index;
  cookieManagerDraftText = cookieToSetCookieText(workspace.cookies[index], 'localhost');
  cookieManagerErrorMessage = '';
  renderWorkspaceCookieManager();
}

function tutorialEnsureCookiesClearMenu() {
  tutorialEnsureLocalhostCookieEditor();
  deferTutorialFloatingUi(() => {
    const button = $('cookiesClearMenuButton');
    const menu = $('cookiesClearMenu');
    if (!button || !menu || button.disabled) {
      return;
    }
    closeContextMenu();
    closeFileSourceMenu();
    closeCaptureSettingsPanels();
    closeToolbarMenus();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionRendererToolbarMenu?.(button, menu, { windowObject: window });
  });
}

function tutorialEnsureRequestCookieSettingsContext() {
  closeTutorialOwnedModal();
  closeCaptureSettingsPanels();
  tutorialEnsureCollectionRequestContext('requestSettings');
  const settingsTab = $('requestSettingsTab');
  if (settingsTab) {
    settingsTab.scrollTop = 0;
    settingsTab.scrollLeft = 0;
  }
}

function tutorialEnsureWorkspaceContext() {
  closeTutorialOwnedModal();
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  const workspaceItem = activeWorkspaceItem() || workspaceListItems()[0] || null;
  if (workspaceItem) {
    selectWorkspaceItem(workspaceItem.id);
    return;
  }
  activeSidebarPanel = 'workspaces';
  activeMainPanel = 'workspace';
  renderAll();
}

function tutorialEnsureSettingsModal() {
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  if (state.activeModalId && state.activeModalId !== 'settingsModal') {
    closeTutorialOwnedModal();
  }
  if (state.activeModalId === 'settingsModal') {
    tutorialOwnedModalId = 'settingsModal';
    renderSettingsControls();
    return;
  }
  trackTutorialOwnedModal('settingsModal', openSettingsModal('appearance'));
}

function tutorialEnsureCoachOnlyStep() {
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  if (state.activeModalId) {
    closeTutorialOwnedModal();
  }
  if (state.activeModalId) {
    resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
  }
}

function tutorialEnsureSettingsSection(section) {
  closeToolbarMenus();
  closeCaptureSettingsPanels();
  if (state.activeModalId && state.activeModalId !== 'settingsModal') {
    closeTutorialOwnedModal();
  }
  if (state.activeModalId === 'settingsModal') {
    tutorialOwnedModalId = 'settingsModal';
    renderSettingsControls();
    selectSettingsSection(section);
    return;
  }
  trackTutorialOwnedModal('settingsModal', openSettingsModal(section));
}

function tutorialEnsureClientCertificateModal() {
  if (state.activeModalId === 'clientCertificateModal') {
    tutorialOwnedModalId = 'clientCertificateModal';
    return;
  }
  tutorialEnsureSettingsSection('certificates');
  trackTutorialOwnedModal('clientCertificateModal', promptClientCertificateModal(null, 'tutorial-client-certificate'));
}

function tutorialEnsureClientCertificateModalFormat(format) {
  tutorialEnsureClientCertificateModal();
  const normalizedFormat = format === 'pfx' ? 'pfx' : 'pem';
  const select = $('clientCertificateFormatSelect');
  if (select && select.value !== normalizedFormat) {
    select.value = normalizedFormat;
    updateClientCertificateModalFormat();
  }
}

function tutorialEnsureRequestCertificateSettingsContext() {
  closeTutorialOwnedModal();
  closeCaptureSettingsPanels();
  tutorialEnsureCollectionRequestContext('requestSettings');
  const settingsTab = $('requestSettingsTab');
  if (settingsTab) {
    settingsTab.scrollTop = 0;
    settingsTab.scrollLeft = 0;
  }
}
