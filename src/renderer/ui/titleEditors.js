function bindEnvironmentTitleEditor() {
  const title = $('environmentMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginEnvironmentTitleEdit);
  title.addEventListener('keydown', handleEnvironmentTitleKeydown);
  title.addEventListener('input', collectEnvironmentAndMarkDirty);
  title.addEventListener('blur', () => finishEnvironmentTitleEdit());
}

function beginEnvironmentTitleEdit() {
  const environment = activeEditorEnvironment();
  const title = $('environmentMainTitle');
  if (!environment || !title || title.dataset.editing === 'true') {
    return;
  }
  environmentTitleEditOriginal = environment.name || 'Untitled Environment';
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Environment name');
  title.focus();
  selectElementContents(title);
}

function handleEnvironmentTitleKeydown(event) {
  const title = $('environmentMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginEnvironmentTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (environmentTitleInputValue() || 'Untitled Environment')
      !== (environmentTitleEditOriginal || 'Untitled Environment');
    finishEnvironmentTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveEnvironmentFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishEnvironmentTitleEdit({ revert: true });
    title.blur();
  }
}

function finishEnvironmentTitleEdit(options = {}) {
  const title = $('environmentMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const environment = activeEditorEnvironment();
  if (environment && options.revert === true) {
    environment.name = environmentTitleEditOriginal || 'Untitled Environment';
    title.textContent = environment.name;
    renderEnvironmentSelect();
    renderEnvironments();
    renderWorkspacePanel();
  } else {
    collectEnvironmentFromEditor();
    if (environment) {
      title.textContent = environment.name;
    }
  }
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Environment name');
}

function bindRequestTitleEditor() {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginRequestTitleEdit);
  title.addEventListener('keydown', handleRequestTitleKeydown);
  title.addEventListener('input', handleRequestTitleInput);
  title.addEventListener('blur', () => finishRequestTitleEdit());
}

function beginRequestTitleEdit() {
  const request = activeRequest();
  const title = $('requestNameTitle');
  if (!request || !title || title.dataset.editing === 'true') {
    return;
  }
  requestTitleEditOriginal = requestDisplayName(request);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Request name');
  title.focus();
  selectElementContents(title);
}

function handleRequestTitleKeydown(event) {
  const title = $('requestNameTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginRequestTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (requestTitleInputValue() || 'Untitled Request')
      !== (requestTitleEditOriginal || 'Untitled Request');
    finishRequestTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveRequestFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishRequestTitleEdit({ revert: true });
    title.blur();
  }
}

function handleRequestTitleInput() {
  if (collectRequestNameFromTitle({ markDirty: true, render: false })) {
    if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
    renderRequestTabs();
  }
}

function finishRequestTitleEdit(options = {}) {
  const title = $('requestNameTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const request = activeRequest();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Request name');
  if (request && options.revert === true) {
    request.name = requestTitleEditOriginal || 'Untitled Request';
    title.textContent = requestDisplayName(request);
    if (activeRunnerRequestRunnerId) {
      renderRunnerEditor();
    } else {
      renderCollections();
    }
    renderRequestTabs();
    return;
  }
  collectRequestNameFromTitle({ markDirty: true, render: false });
  if (request) {
    title.textContent = requestDisplayName(request);
  }
  if (activeRunnerRequestRunnerId) {
    renderRunnerEditor();
  } else {
    renderCollections();
  }
  renderRequestTabs();
}

function bindCollectionTitleEditor() {
  const title = $('collectionMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginCollectionTitleEdit);
  title.addEventListener('keydown', handleCollectionTitleKeydown);
  title.addEventListener('input', collectCollectionAndMarkDirty);
  title.addEventListener('blur', () => finishCollectionTitleEdit());
}

function beginCollectionTitleEdit() {
  const collection = activeCollection();
  const title = $('collectionMainTitle');
  if (!collection || !title || title.dataset.editing === 'true') {
    return;
  }
  collectionTitleEditOriginal = collection.name || 'Untitled Collection';
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Collection name');
  title.focus();
  selectElementContents(title);
}

function handleCollectionTitleKeydown(event) {
  const title = $('collectionMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginCollectionTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (collectionTitleInputValue() || 'Untitled Collection')
      !== (collectionTitleEditOriginal || 'Untitled Collection');
    finishCollectionTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveCollectionFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishCollectionTitleEdit({ revert: true });
    title.blur();
  }
}

function finishCollectionTitleEdit(options = {}) {
  const title = $('collectionMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const collection = activeCollection();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Collection name');
  if (collection && options.revert === true) {
    collection.name = collectionTitleEditOriginal || 'Untitled Collection';
    title.textContent = collection.name;
    renderCollections();
    return;
  }
  collectCollectionFromEditor();
  if (collection) {
    title.textContent = collection.name || 'Untitled Collection';
  }
  renderCollections();
}

function bindFolderTitleEditor() {
  const title = $('folderMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginFolderTitleEdit);
  title.addEventListener('keydown', handleFolderTitleKeydown);
  title.addEventListener('input', collectFolderAndMarkDirty);
  title.addEventListener('blur', () => finishFolderTitleEdit());
}

function beginFolderTitleEdit() {
  const folder = activeFolder();
  const title = $('folderMainTitle');
  if (!folder || !title || title.dataset.editing === 'true') {
    return;
  }
  folderTitleEditOriginal = folder.name || 'Untitled Folder';
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Folder name');
  title.focus();
  selectElementContents(title);
}

function handleFolderTitleKeydown(event) {
  const title = $('folderMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginFolderTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (folderTitleInputValue() || 'Untitled Folder')
      !== (folderTitleEditOriginal || 'Untitled Folder');
    finishFolderTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveFolderFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishFolderTitleEdit({ revert: true });
    title.blur();
  }
}

function finishFolderTitleEdit(options = {}) {
  const title = $('folderMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const folder = activeFolder();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Folder name');
  if (folder && options.revert === true) {
    folder.name = folderTitleEditOriginal || 'Untitled Folder';
    title.textContent = folder.name;
    renderCollections();
    return;
  }
  collectFolderFromEditor();
  if (folder) {
    title.textContent = folder.name || 'Untitled Folder';
  }
  renderCollections();
}

function bindWorkspaceTitleEditor() {
  const title = $('workspaceMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginWorkspaceTitleEdit);
  title.addEventListener('keydown', handleWorkspaceTitleKeydown);
  title.addEventListener('blur', () => { void finishWorkspaceTitleEdit(); });
}

function beginWorkspaceTitleEdit() {
  const workspaceItem = activeWorkspaceItem();
  const title = $('workspaceMainTitle');
  if (!workspaceItem || !title || title.dataset.editing === 'true') {
    return;
  }
  workspaceTitleEditOriginal = workspaceDisplayName(workspaceItem);
  title.dataset.editing = 'true';
  title.dataset.workspaceId = workspaceItem.id;
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Workspace name');
  title.focus();
  selectElementContents(title);
}

function handleWorkspaceTitleKeydown(event) {
  const title = $('workspaceMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginWorkspaceTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    void finishWorkspaceTitleEdit().then(() => title.blur());
  } else if (event.key === 'Escape') {
    event.preventDefault();
    void finishWorkspaceTitleEdit({ revert: true }).then(() => title.blur());
  }
}

async function finishWorkspaceTitleEdit(options = {}) {
  const title = $('workspaceMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return null;
  }
  const workspaceId = title.dataset.workspaceId || selectedWorkspaceId || activeWorkspaceId;
  const workspaceItem = workspaceListItems().find((item) => item.id === workspaceId);
  const originalName = workspaceTitleEditOriginal || workspaceDisplayName(workspaceItem);
  const nextName = workspaceTitleInputValue();
  delete title.dataset.editing;
  delete title.dataset.workspaceId;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Workspace name');
  if (options.revert === true || !nextName || nextName === originalName) {
    title.textContent = originalName;
    return null;
  }
  const renamedWorkspace = await renameWorkspaceToName(workspaceId, nextName);
  if (title.dataset.editing !== 'true') {
    const visibleWorkspaceItem = activeWorkspaceItem();
    title.textContent = visibleWorkspaceItem ? workspaceDisplayName(visibleWorkspaceItem) : 'Select a workspace';
    renderWorkspacePanel();
  }
  return renamedWorkspace;
}

function bindRunnerTitleEditor() {
  const title = $('runnerMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginRunnerTitleEdit);
  title.addEventListener('keydown', handleRunnerTitleKeydown);
  title.addEventListener('input', collectRunnerAndMarkDirty);
  title.addEventListener('blur', () => finishRunnerTitleEdit());
}

function beginRunnerTitleEdit() {
  const runner = activeRunner();
  const title = $('runnerMainTitle');
  if (!runner || !title || title.dataset.editing === 'true') {
    return;
  }
  runnerTitleEditOriginal = runnerDisplayName(runner);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Runner name');
  title.focus();
  selectElementContents(title);
}

function handleRunnerTitleKeydown(event) {
  const title = $('runnerMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginRunnerTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (runnerTitleInputValue() || 'Untitled Runner')
      !== (runnerTitleEditOriginal || 'Untitled Runner');
    finishRunnerTitleEdit();
    title.blur();
    if (shouldSave) {
      void saveRunnerFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishRunnerTitleEdit({ revert: true });
    title.blur();
  }
}

function finishRunnerTitleEdit(options = {}) {
  const title = $('runnerMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const runner = activeRunner();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Runner name');
  if (runner && options.revert === true) {
    runner.name = runnerTitleEditOriginal || 'Untitled Runner';
    title.textContent = runnerDisplayName(runner);
    renderRunners();
    renderRequestTabs();
    return;
  }
  collectRunnerFromEditor();
  if (runner) {
    title.textContent = runnerDisplayName(runner);
  }
  renderRunners();
  renderRequestTabs();
}

function bindPerformanceTitleEditor() {
  const title = $('performanceMainTitle');
  if (!title) {
    return;
  }
  title.addEventListener('click', beginPerformanceTitleEdit);
  title.addEventListener('keydown', handlePerformanceTitleKeydown);
  title.addEventListener('input', collectPerformanceTestAndMarkDirty);
  title.addEventListener('blur', () => finishPerformanceTitleEdit());
}

function beginPerformanceTitleEdit() {
  const test = activePerformanceTest();
  const title = $('performanceMainTitle');
  if (!test || !title || title.dataset.editing === 'true') {
    return;
  }
  performanceTitleEditOriginal = performanceTestDisplayName(test);
  title.dataset.editing = 'true';
  title.classList.add('is-editing');
  title.setAttribute('contenteditable', 'plaintext-only');
  title.setAttribute('role', 'textbox');
  title.setAttribute('aria-label', 'Performance test name');
  title.focus();
  selectElementContents(title);
}

function handlePerformanceTitleKeydown(event) {
  const title = $('performanceMainTitle');
  if (!title) {
    return;
  }
  if (title.dataset.editing !== 'true') {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      beginPerformanceTitleEdit();
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const shouldSave = (performanceTitleInputValue() || 'Untitled Performance Test')
      !== (performanceTitleEditOriginal || 'Untitled Performance Test');
    finishPerformanceTitleEdit();
    title.blur();
    if (shouldSave) {
      void savePerformanceTestFromPane();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishPerformanceTitleEdit({ revert: true });
    title.blur();
  }
}

function finishPerformanceTitleEdit(options = {}) {
  const title = $('performanceMainTitle');
  if (!title || title.dataset.editing !== 'true') {
    return;
  }
  const test = activePerformanceTest();
  delete title.dataset.editing;
  title.classList.remove('is-editing');
  title.setAttribute('contenteditable', 'false');
  title.removeAttribute('role');
  title.setAttribute('aria-label', 'Performance test name');
  if (test && options.revert === true) {
    test.name = performanceTitleEditOriginal || 'Untitled Performance Test';
    title.textContent = performanceTestDisplayName(test);
    renderPerformanceTests();
    renderRequestTabs();
    return;
  }
  collectPerformanceTestFromEditor();
  if (test) {
    title.textContent = performanceTestDisplayName(test);
  }
  renderPerformanceTests();
  renderRequestTabs();
}

function selectElementContents(element) {
  const selection = window.getSelection?.();
  if (!selection || !document.createRange) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
