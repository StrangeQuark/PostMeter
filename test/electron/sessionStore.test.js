const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SessionStore } = require('../../electron/sessionStore');

test('session store returns defaults when no session file exists', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-session-store-'));
  const store = new SessionStore(path.join(temp, 'session.json'));

  const session = await store.load();

  assert.equal(session.activeWorkspaceId, '');
  assert.equal(session.selectedWorkspaceId, '');
  assert.equal(session.activeEnvironmentId, 'none');
  assert.deepEqual(session.openRequestTabs, []);
  assert.deepEqual(session.draftRequests, []);
});

test('session store recovers defaults from unreadable JSON without clobbering the file on load', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-session-store-corrupt-'));
  const sessionPath = path.join(temp, 'session.json');
  await fs.writeFile(sessionPath, '{not-json');
  const store = new SessionStore(sessionPath);

  const session = await store.load();

  assert.equal(session.activeWorkspaceId, '');
  assert.equal(session.activeEnvironmentId, 'none');
  assert.equal(await fs.readFile(sessionPath, 'utf8'), '{not-json');
});

test('session store ignores stale atomic temp files while loading the committed session', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-session-store-stale-'));
  const sessionPath = path.join(temp, 'session.json');
  await fs.writeFile(path.join(temp, 'postmeter-session-stale.json.tmp'), '{partial');
  const store = new SessionStore(sessionPath);
  await store.save({ activeWorkspaceId: 'Workspace.json' });

  const session = await store.load();

  assert.equal(session.activeWorkspaceId, 'Workspace.json');
  assert.equal(await fs.readFile(path.join(temp, 'postmeter-session-stale.json.tmp'), 'utf8'), '{partial');
});

test('session store saves normalized renderer session state', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-session-store-'));
  const sessionPath = path.join(temp, 'session.json');
  const store = new SessionStore(sessionPath);

  const saved = await store.save({
    activeWorkspaceId: 'Workspace.json',
    selectedWorkspaceId: 'Workspace 2.json',
    activeEnvironmentId: 'environment-1',
    activeCollectionId: 'collection-1',
    activeFolderId: 'folder-1',
    activeRequestId: 'request-1',
    activeRunnerRequestRunnerId: 'runner-1',
    activeRunnerConfigId: 'runner-1',
    activeSidebarPanel: 'workspaces',
    activeMainPanel: 'workspace',
    activeRequestTab: 'auth',
    activeResultsTab: 'runner',
    openRequestTabs: [
      {
        key: 'request:collection-1:request-1',
        collectionId: 'collection-1',
        requestId: 'request-1',
        dirty: true,
        snapshot: '{"saved":true}',
        currentState: { id: 'request-1', name: 'Dirty Request', method: 'post', url: ' https://example.test ', bodyType: 'RAW_JSON', body: '{}' }
      },
      {
        key: 'runner-request:runner-1:runner-request-1',
        runnerId: 'runner-1',
        requestId: 'runner-request-1',
        runnerRequest: true,
        dirty: true,
        snapshot: '{"saved":true}',
        currentState: { id: 'runner-request-1', name: 'Runner Tab Request', method: 'patch', url: 'https://runner-tab.test' }
      }
    ],
    openEnvironmentTabs: [{
      key: 'environment:environment-1',
      environmentId: 'environment-1',
      dirty: true,
      currentState: { id: 'environment-1', name: 'Dirty Environment', variables: [{ enabled: true, key: 'baseUrl', value: 'https://example.test' }] }
    }],
    openWorkspaceTabs: [{
      key: 'workspace:Workspace.json',
      workspaceId: 'Workspace.json'
    }],
    openRunnerTabs: [{
      key: 'runner:runner-1',
      runnerId: 'runner-1',
      dirty: true,
      snapshot: '{"saved":true}',
      currentState: {
        id: 'runner-1',
        name: 'Dirty Runner',
        environmentId: 'none',
        requests: [{ id: 'runner-request-1', name: 'Runner Request', method: 'post', url: 'https://runner.test' }]
      }
    }],
    draftRequests: [{
      id: 'draft-1',
      name: 'Draft',
      method: 'patch',
      url: 'https://draft.test',
      queryParams: [],
      headers: [],
      bodyType: 'RAW_TEXT',
      body: 'body'
    }]
  });

  assert.equal(saved.activeWorkspaceId, 'Workspace.json');
  assert.equal(saved.selectedWorkspaceId, 'Workspace 2.json');
  assert.equal(saved.openRequestTabs[0].currentState.method, 'POST');
  assert.equal(saved.openRequestTabs[0].currentState.url, ' https://example.test ');
  assert.equal(saved.openRequestTabs[1].runnerRequest, true);
  assert.equal(saved.openRequestTabs[1].runnerId, 'runner-1');
  assert.equal(saved.openRequestTabs[1].collectionId, '');
  assert.equal(saved.openRequestTabs[1].currentState.method, 'PATCH');
  assert.equal(saved.activeResultsTab, 'response');
  assert.equal(saved.activeRunnerRequestRunnerId, 'runner-1');
  assert.equal(saved.activeRunnerConfigId, 'runner-1');
  assert.equal(saved.openRunnerTabs[0].currentState.requests[0].method, 'POST');
  assert.equal(saved.draftRequests[0].method, 'PATCH');

  const raw = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
  assert.equal(raw.activeMainPanel, 'workspace');
  assert.equal(raw.openRequestTabs[1].key, 'runner-request:runner-1:runner-request-1');
  assert.equal(raw.openEnvironmentTabs[0].currentState.name, 'Dirty Environment');
  assert.equal(raw.openRunnerTabs[0].currentState.name, 'Dirty Runner');
});

test('session store can synchronously save normalized renderer session state', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-session-store-'));
  const sessionPath = path.join(temp, 'session.json');
  const store = new SessionStore(sessionPath);

  const saved = store.saveSync({
    activeWorkspaceId: 'Workspace.json',
    selectedWorkspaceId: 'Workspace.json',
    activeEnvironmentId: 'environment-1',
    openRequestTabs: [],
    draftRequests: []
  });

  assert.equal(saved.activeWorkspaceId, 'Workspace.json');
  assert.equal(saved.selectedWorkspaceId, 'Workspace.json');
  const raw = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
  assert.equal(raw.activeEnvironmentId, 'environment-1');
});
