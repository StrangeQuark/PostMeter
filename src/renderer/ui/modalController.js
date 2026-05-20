async function promptForCollectionExport(collections, preferredCollection) {
  const collectionId = await promptCollectionExport(collections, preferredCollection);
  return (collections || []).find((collection) => collection.id === collectionId) || null;
}

function promptCollectionExport(collections, preferredCollection) {
  selectedExportCollectionId = '';
  const availableCollections = Array.isArray(collections) ? collections : [];
  $('exportCollectionMessage').textContent = availableCollections.length
    ? 'Choose a collection to export.'
    : 'There are no collections present to export.';
  renderExportCollectionList(availableCollections, preferredCollection);
  return showModal('exportCollectionModal', null);
}

const EXPORT_ITEM_PICKER_COPY = {
  workspace: {
    title: 'Export workspace',
    message: 'Choose a workspace to export.',
    empty: 'There are no workspaces present to export.',
    ariaLabel: 'Workspaces'
  },
  environment: {
    title: 'Export environment',
    message: 'Choose an environment to export.',
    empty: 'There are no environments present to export.',
    ariaLabel: 'Environments'
  },
  runner: {
    title: 'Export runner',
    message: 'Choose a runner to export.',
    empty: 'There are no runners present to export.',
    ariaLabel: 'Runners'
  },
  request: {
    title: 'Export request',
    message: 'Choose a collection request to export.',
    empty: 'There are no collection requests present to export.',
    ariaLabel: 'Requests'
  },
  performance: {
    title: 'Export performance test',
    message: 'Choose a performance test to export.',
    empty: 'There are no performance tests present to export.',
    ariaLabel: 'Performance tests'
  }
};

async function promptForItemExport(kind, items, preferredItem) {
  const itemId = await promptItemExport(kind, items, preferredItem);
  return (items || []).find((item) => item.id === itemId) || null;
}

function promptItemExport(kind, items, preferredItem) {
  selectedExportItemId = '';
  const availableItems = Array.isArray(items) ? items : [];
  const copy = EXPORT_ITEM_PICKER_COPY[kind] || {
    title: 'Export item',
    message: 'Choose an item to export.',
    empty: 'There are no items present to export.',
    ariaLabel: 'Items'
  };
  $('exportItemTitle').textContent = copy.title;
  $('exportItemMessage').textContent = availableItems.length ? copy.message : copy.empty;
  $('exportItemList').setAttribute('aria-label', copy.ariaLabel);
  renderExportItemList(kind, availableItems, preferredItem);
  return showModal('exportItemModal', null);
}

async function newFolderFromToolbar() {
  const destination = await promptForFolderDestination();
  if (!destination) {
    return null;
  }
  return newFolder(destination.collectionId, destination.folderId || null);
}

async function promptForFolderDestination() {
  const collections = Array.isArray(workspace.collections) ? workspace.collections : [];
  if (!collections.length) {
    setStatus('Create a collection before creating a folder.');
    renderToolbarState();
    return null;
  }
  const preferred = preferredFolderDestination(collections);
  selectedFolderDestinationValue = '';
  renderFolderDestinationList(collections, preferred);
  const selection = await showModal('folderDestinationModal', null);
  return parseFolderDestinationValue(selection);
}

function preferredFolderDestination(collections) {
  const collection = collections.find((item) => item.id === activeCollectionId) || collections[0] || null;
  if (!collection) {
    return null;
  }
  if (activeFolderId && findFolder(collection, activeFolderId)) {
    return { collectionId: collection.id, folderId: activeFolderId };
  }
  return { collectionId: collection.id, folderId: null };
}

function renderFolderDestinationList(collections = workspace.collections, preferredDestination = null) {
  const list = $('folderDestinationList');
  list.textContent = '';
  $('confirmFolderDestinationButton').disabled = true;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections present for a folder.';
    list.append(empty);
    return;
  }
  const preferredValue = folderDestinationValue(preferredDestination || { collectionId: availableCollections[0]?.id || '', folderId: null });
  for (const collection of availableCollections) {
    appendFolderDestinationOption(list, {
      collectionId: collection.id,
      folderId: null,
      label: collection.name || 'Untitled Collection',
      detail: 'Collection root',
      depth: 0,
      preferredValue
    });
    appendFolderDestinationFolderOptions(list, collection, collection.folders || [], 1, [collection.name || 'Untitled Collection'], preferredValue);
  }
}

function appendFolderDestinationFolderOptions(list, collection, folders, depth, pathParts, preferredValue) {
  for (const folder of folders || []) {
    const name = folder.name || 'Untitled Folder';
    const nextPathParts = [...pathParts, name];
    appendFolderDestinationOption(list, {
      collectionId: collection.id,
      folderId: folder.id,
      label: name,
      detail: nextPathParts.join(' / '),
      depth,
      preferredValue
    });
    appendFolderDestinationFolderOptions(list, collection, folder.folders || [], depth + 1, nextPathParts, preferredValue);
  }
}

function appendFolderDestinationOption(list, options = {}) {
  const label = document.createElement('label');
  label.className = 'collection-pick-option folder-destination-option';
  label.style.paddingLeft = `${Math.min(Number(options.depth) || 0, 8) * 16 + 12}px`;
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'folderDestination';
  input.value = folderDestinationValue(options);
  input.addEventListener('change', () => {
    selectedFolderDestinationValue = input.value;
    $('confirmFolderDestinationButton').disabled = false;
  });
  if (input.value === options.preferredValue) {
    input.checked = true;
    selectedFolderDestinationValue = input.value;
    $('confirmFolderDestinationButton').disabled = false;
  }
  const text = document.createElement('span');
  text.textContent = options.label || 'Untitled Destination';
  const detail = document.createElement('small');
  detail.textContent = options.detail || '';
  label.append(input, text, detail);
  list.append(label);
}

function folderDestinationValue(destination = {}) {
  return JSON.stringify({
    collectionId: destination.collectionId || '',
    folderId: destination.folderId || null
  });
}

function parseFolderDestinationValue(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed?.collectionId) {
      return null;
    }
    return {
      collectionId: parsed.collectionId,
      folderId: parsed.folderId || null
    };
  } catch {
    return null;
  }
}

function renderSaveDraftCollectionList() {
  const list = $('saveDraftCollectionList');
  list.textContent = '';
  $('confirmSaveDraftButton').disabled = true;
  if (!workspace.collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Create a collection before saving this request.';
    list.append(empty);
    return;
  }
  for (const collection of workspace.collections) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'saveDraftCollection';
    input.value = collection.id;
    input.addEventListener('change', () => {
      selectedDraftSaveCollectionId = input.value;
      $('confirmSaveDraftButton').disabled = false;
    });
    const text = document.createElement('span');
    text.textContent = collection.name || 'Untitled Collection';
    label.append(input, text);
    list.append(label);
  }
}

function renderExportCollectionList(collections = workspace.collections, preferredCollection = null) {
  const list = $('exportCollectionList');
  list.textContent = '';
  $('confirmExportCollectionButton').disabled = true;
  const availableCollections = Array.isArray(collections) ? collections : [];
  if (!availableCollections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'There are no collections present to export.';
    list.append(empty);
    return;
  }
  const preferredId = preferredCollection?.id || availableCollections[0]?.id || '';
  for (const collection of availableCollections) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'exportCollection';
    input.value = collection.id;
    input.addEventListener('change', () => {
      selectedExportCollectionId = input.value;
      $('confirmExportCollectionButton').disabled = false;
    });
    if (collection.id === preferredId) {
      input.checked = true;
      selectedExportCollectionId = input.value;
      $('confirmExportCollectionButton').disabled = false;
    }
    const text = document.createElement('span');
    text.textContent = collection.name || 'Untitled Collection';
    label.append(input, text);
    list.append(label);
  }
}

function renderExportItemList(kind, items = [], preferredItem = null) {
  const list = $('exportItemList');
  list.textContent = '';
  $('confirmExportItemButton').disabled = true;
  const availableItems = Array.isArray(items) ? items : [];
  if (!availableItems.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = EXPORT_ITEM_PICKER_COPY[kind]?.empty || 'There are no items present to export.';
    list.append(empty);
    return;
  }
  const preferredId = preferredItem?.id || availableItems[0]?.id || '';
  for (const item of availableItems) {
    const label = document.createElement('label');
    label.className = 'collection-pick-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `export${kind}`;
    input.value = item.id;
    input.addEventListener('change', () => {
      selectedExportItemId = input.value;
      $('confirmExportItemButton').disabled = false;
    });
    if (item.id === preferredId) {
      input.checked = true;
      selectedExportItemId = input.value;
      $('confirmExportItemButton').disabled = false;
    }
    const text = document.createElement('span');
    text.textContent = exportItemDisplayName(kind, item);
    label.append(input, text);
    if (item?.detail) {
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      label.append(detail);
    }
    list.append(label);
  }
}

function exportItemDisplayName(kind, item) {
  if (kind === 'workspace') {
    return workspaceDisplayName(item);
  }
  if (kind === 'runner') {
    return runnerDisplayName(item);
  }
  if (kind === 'request') {
    const request = item?.request || item || {};
    return `${String(request.method || 'GET').toUpperCase()} ${requestDisplayName(request)}`;
  }
  if (kind === 'performance') {
    return performanceTestDisplayName(item);
  }
  return String(item?.name || '').trim() || 'Untitled Environment';
}

function showModal(modalId, cancelValue) {
  if (state.activeModalResolver) {
    if (shouldStackModal(state.activeModalId, modalId)) {
      modalStack.push({
        modalId: state.activeModalId,
        cancelValue: state.activeModalCancelValue,
        resolver: state.activeModalResolver,
        focusTarget: lastModalFocusTarget
      });
    } else {
      resolveActiveModal(state.activeModalCancelValue, { flushNotifications: false });
    }
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closeContextMenu();
  closeToolbarMenus();
  closeFileSourceMenu();
  lastModalFocusTarget = modalRestoreFocusTarget(previousFocus);
  showModalStack(modalId);
  return new Promise((resolve) => {
    openModalState(state, modalId, resolve, cancelValue);
    focusInitialModalElement(modalId);
  });
}

function resolveActiveModal(value, options = {}) {
  if (state.activeModalId === 'settingsModal') {
    setKeyboardShortcutCaptureMode(false);
  }
  const resolver = resolveModalState(state);
  if (resolver) {
    resolver(value);
  }
  const parentModal = modalStack.pop();
  if (parentModal) {
    const childFocusTarget = lastModalFocusTarget;
    showModalStack(parentModal.modalId);
    openModalState(state, parentModal.modalId, parentModal.resolver, parentModal.cancelValue);
    lastModalFocusTarget = parentModal.focusTarget;
    restoreFocusTarget(childFocusTarget);
  } else {
    hideAllModals();
    restoreModalFocus();
  }
  if (options.flushNotifications !== false) {
    void flushNotificationModalQueue();
  }
}

function showOnlyModal(modalId) {
  $('modalBackdrop').hidden = false;
  $('modalBackdrop').classList.remove('is-stacked');
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.classList.remove('is-stack-parent', 'is-stack-top');
    modal.hidden = modal.id !== modalId;
    if (modal.id === modalId) {
      modal.classList.add('is-stack-top');
    }
  }
}

function showModalStack(modalId) {
  const backdrop = $('modalBackdrop');
  const visibleModalIds = new Set(modalStack.map((modal) => modal.modalId));
  visibleModalIds.add(modalId);
  backdrop.hidden = false;
  backdrop.classList.toggle('is-stacked', visibleModalIds.size > 1);
  for (const modal of backdrop.querySelectorAll('.modal')) {
    const isVisible = visibleModalIds.has(modal.id);
    modal.hidden = !isVisible;
    modal.classList.toggle('is-stack-parent', isVisible && modal.id !== modalId);
    modal.classList.toggle('is-stack-top', isVisible && modal.id === modalId);
  }
}

function hideAllModals() {
  $('modalBackdrop').hidden = true;
  $('modalBackdrop').classList.remove('is-stacked');
  for (const modal of $('modalBackdrop').querySelectorAll('.modal')) {
    modal.hidden = true;
    modal.classList.remove('is-stack-parent', 'is-stack-top');
  }
}

function restoreFocusTarget(target) {
  if (isRestorableFocusTarget(target)) {
    target.focus?.();
  }
}

function shouldStackModal(parentModalId, childModalId) {
  return (parentModalId === 'settingsModal' && childModalId !== parentModalId)
    || (parentModalId === 'clientCertificateModal' && childModalId === 'filePickerModal')
    || (parentModalId === 'cookiesModal' && childModalId === 'confirmActionModal');
}

function cancelActiveModal() {
  if (!state.activeModalResolver) {
    return;
  }
  resolveActiveModal(state.activeModalCancelValue);
}

function openTutorialsModalSafely() {
  void openTutorialsModal().catch((error) => {
    const message = error?.message || String(error);
    setStatus(`Could not open tutorials: ${message}`);
    notifyUser('Tutorials Failed', message);
  });
}

async function openTutorialsModal() {
  if (!tutorialById(selectedTutorialId)) {
    selectedTutorialId = TUTORIALS[0]?.id || '';
  }
  renderTutorialsModal();
  return showModal('tutorialsModal', null);
}
