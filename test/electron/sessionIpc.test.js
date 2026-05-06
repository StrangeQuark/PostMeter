const assert = require('node:assert/strict');
const test = require('node:test');
const { registerSessionIpc } = require('../../electron/sessionIpc');
const { MAX_OPEN_TABS } = require('../../src/core/sessionState');

test('session IPC registers stable load/save channels', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let session = { activeWorkspaceId: 'Workspace.json', openRequestTabs: [] };
  const sessionStore = {
    load: async () => session,
    save: async (nextSession) => ({ ...nextSession, normalized: true }),
    saveSync: (nextSession) => ({ ...nextSession, normalized: true, sync: true })
  };

  registerSessionIpc({
    getSession: () => session,
    getSessionStore: () => sessionStore,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    setSession: (nextSession) => {
      session = nextSession;
    }
  });

  assert.deepEqual([...handlers.keys()].sort(), ['session:load', 'session:save']);
  assert.deepEqual([...syncHandlers.keys()].sort(), ['session:saveSync']);
  assert.deepEqual(await handlers.get('session:load')(), { activeWorkspaceId: 'Workspace.json', openRequestTabs: [] });
  assert.deepEqual(await handlers.get('session:save')(null, { activeWorkspaceId: 'Renamed Workspace.json' }), {
    activeWorkspaceId: 'Renamed Workspace.json',
    normalized: true
  });
  assert.equal(session.activeWorkspaceId, 'Renamed Workspace.json');
  const event = { returnValue: undefined };
  syncHandlers.get('session:saveSync')(event, { activeWorkspaceId: 'Synced Workspace.json' });
  assert.deepEqual(event.returnValue, {
    activeWorkspaceId: 'Synced Workspace.json',
    normalized: true,
    sync: true
  });
  assert.equal(session.activeWorkspaceId, 'Synced Workspace.json');
});

test('session IPC accepts many tabs under the bounded limit and rejects invalid payloads before persistence', async () => {
  const handlers = new Map();
  const syncHandlers = new Map();
  let saveCalls = 0;
  const sessionStore = {
    load: async () => ({}),
    save: async (nextSession) => {
      saveCalls += 1;
      return nextSession;
    },
    saveSync: (nextSession) => {
      saveCalls += 1;
      return nextSession;
    }
  };

  registerSessionIpc({
    getSession: () => ({}),
    getSessionStore: () => sessionStore,
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      on(channel, handler) {
        syncHandlers.set(channel, handler);
      }
    },
    setSession: () => {}
  });

  const validManyTabs = {
    activeRunnerRequestRunnerId: 'runner-1',
    openRequestTabs: [
      ...Array.from({ length: 12 }, (_, index) => ({
        collectionId: 'collection',
        key: `request:${index}`,
        requestId: `request-${index}`
      })),
      {
        key: 'runner-request:runner-1:runner-request-1',
        runnerId: 'runner-1',
        requestId: 'runner-request-1',
        runnerRequest: true
      }
    ],
    openRunnerTabs: [{
      key: 'runner:runner-1',
      runnerId: 'runner-1',
      dirty: false
    }]
  };
  assert.equal((await handlers.get('session:save')(null, validManyTabs)).openRequestTabs.length, 13);
  const validSyncEvent = { returnValue: undefined };
  syncHandlers.get('session:saveSync')(validSyncEvent, validManyTabs);
  assert.equal(validSyncEvent.returnValue.openRequestTabs.length, 13);
  assert.equal(saveCalls, 2);

  const tooManyTabs = {
    openRequestTabs: Array.from({ length: MAX_OPEN_TABS + 1 }, (_, index) => ({
      collectionId: 'collection',
      key: `request:${index}`,
      requestId: `request-${index}`
    }))
  };
  await assert.rejects(
    () => handlers.get('session:save')(null, tooManyTabs),
    new RegExp(`Invalid IPC payload: session\\.openRequestTabs cannot contain more than ${MAX_OPEN_TABS} items`)
  );
  assert.equal(saveCalls, 2);

  assert.throws(
    () => syncHandlers.get('session:saveSync')({ returnValue: undefined }, {
      openRequestTabs: [{ key: 'request:1', requestId: 'request-1', dirty: 'yes' }]
    }),
    /Invalid IPC payload: session\.openRequestTabs\[0\]\.dirty must be a boolean/
  );
  assert.equal(saveCalls, 2);
});
