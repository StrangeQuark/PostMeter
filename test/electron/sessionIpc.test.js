const assert = require('node:assert/strict');
const test = require('node:test');
const { registerSessionIpc } = require('../../electron/sessionIpc');

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
