const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CURRENT_SCHEMA_VERSION, normalizeSettings } = require('../../src/core/workspace/models');
const { moveFileNoOverwrite, temporaryJsonPath, writeTextFileAtomic } = require('../../src/core/workspace/workspacePersistence');
const {
  WorkspaceRecoveryError,
  WorkspaceStore,
  defaultWorkspacePath,
  looksLikeNativeWorkspace
} = require('../../src/core/workspace/workspaceStore');
const {
  WorkspaceEncryptionKeyRequiredError,
  WorkspaceUnlockFailedError,
  isEncryptedWorkspaceEnvelope
} = require('../../src/core/workspace/workspaceEncryption');

test('creates a default current-schema workspace when no file exists', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  const { workspace } = await store.load();

  assert.equal(store.getWorkspacePath(), workspacePath);
  assert.equal(workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(workspace.settings, normalizeSettings());
  assert.deepEqual(workspace.collections, []);
  assert.deepEqual(workspace.environments, []);
  assert.deepEqual(workspace.cookies, []);
  assert.deepEqual(workspace.runners, []);
  const persisted = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(persisted.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(Object.hasOwn(persisted, 'name'), false);
  assert.equal(Object.hasOwn(persisted, 'settings'), false);
  assert.equal(Object.hasOwn(persisted, 'localsettings'), true);
  assert.deepEqual(persisted.localsettings.diagnostics.requestResponseLogging, {
    urls: false,
    headers: false,
    cookies: false,
    bodies: false,
    protocolMessages: false,
    scriptConsole: false,
    payloadIdentifiers: false
  });
});

test('default workspace path uses the profile workspace directory unless POSTMETER_DATA_PATH is explicit', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-default-workspace-path-'));
  const previousDataPath = process.env.POSTMETER_DATA_PATH;
  const previousUserDataPath = process.env.POSTMETER_USER_DATA_PATH;
  try {
    process.env.POSTMETER_USER_DATA_PATH = path.join(temp, 'userData');
    delete process.env.POSTMETER_DATA_PATH;
    assert.equal(defaultWorkspacePath(), path.join(temp, 'userData', 'profile', 'workspace', 'workspace.json'));

    process.env.POSTMETER_DATA_PATH = path.join(temp, 'explicit-workspace.json');
    assert.equal(defaultWorkspacePath(), path.join(temp, 'explicit-workspace.json'));
  } finally {
    if (previousDataPath === undefined) {
      delete process.env.POSTMETER_DATA_PATH;
    } else {
      process.env.POSTMETER_DATA_PATH = previousDataPath;
    }
    if (previousUserDataPath === undefined) {
      delete process.env.POSTMETER_USER_DATA_PATH;
    } else {
      process.env.POSTMETER_USER_DATA_PATH = previousUserDataPath;
    }
  }
});

test('default workspace creation does not overwrite a file that appears before publish', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-default-race-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);
  const originalLink = fs.link;
  let injected = false;
  fs.link = async (sourcePath, targetPath) => {
    if (!injected && targetPath === workspacePath) {
      injected = true;
      await fs.writeFile(workspacePath, JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        collections: [{ id: 'race-collection', name: 'Race Collection', requests: [], folders: [] }],
        environments: [],
        history: []
      }));
      const error = new Error('simulated destination race');
      error.code = 'EEXIST';
      throw error;
    }
    return originalLink(sourcePath, targetPath);
  };
  try {
    const { workspace } = await store.load();
    assert.equal(workspace.collections[0].id, 'race-collection');
  } finally {
    fs.link = originalLink;
  }
});

test('migrates schema 2 workspaces to the current schema and creates a backup', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: 2,
    collections: [{ id: 'c1', name: 'Old', description: '', requests: [{ id: 'r1', name: 'Old Request', method: 'GET', url: 'https://example.test' }] }],
    environments: [],
    history: []
  }));

  const store = new WorkspaceStore(workspacePath);
  const { workspace } = await store.load();
  const backups = (await fs.readdir(temp)).filter((entry) => entry.includes('pre-migration.backup'));

  assert.equal(workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(workspace.settings.updates.includePrereleases, false);
  assert.equal(workspace.settings.appearance.theme, 'system');
  assert.deepEqual(workspace.localsettings.sandbox.fileBindings, []);
  assert.equal(workspace.settings.loadTestPolicy, undefined);
  assert.deepEqual(workspace.cookies, []);
  assert.deepEqual(workspace.runners, []);
  assert.deepEqual(workspace.collections[0].folders, []);
  assert.deepEqual(workspace.collections[0].variables, []);
  assert.deepEqual(workspace.collections[0].certificates, []);
  assert.equal(workspace.collections[0].requests.length, 1);
  assert.deepEqual(workspace.collections[0].requests[0].scripts, {
    preRequest: '',
    tests: '',
    beforeQuery: '',
    afterResponse: '',
    beforeInvoke: '',
    onMessage: '',
    onIncomingMessage: '',
    mock: ''
  });
  assert.deepEqual(workspace.collections[0].requests[0].variables, []);
  assert.equal(workspace.collections[0].requests[0].docs, '');
  assert.deepEqual(workspace.collections[0].requests[0].cookieJar, { enabled: false, storeResponses: true });
  assert.equal(workspace.collections[0].requests[0].loadTestPolicy, undefined);
  assert.equal(backups.length, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(temp, backups[0]), 'utf8')).schemaVersion, 2);
});

test('migrates every historical schema while preserving imported durability metadata', async () => {
  for (let schemaVersion = 1; schemaVersion < CURRENT_SCHEMA_VERSION; schemaVersion += 1) {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), `postmeter-store-schema-${schemaVersion}-`));
    const workspacePath = path.join(temp, 'workspace.json');
    await fs.writeFile(workspacePath, JSON.stringify(legacyWorkspaceFixture(schemaVersion)));

    const store = new WorkspaceStore(workspacePath);
    const { workspace } = await store.load();
    const backups = (await fs.readdir(temp)).filter((entry) => entry.includes('pre-migration.backup'));

    assert.equal(workspace.schemaVersion, CURRENT_SCHEMA_VERSION, `schema ${schemaVersion} should migrate`);
    assert.equal(backups.length, 1, `schema ${schemaVersion} should create one pre-migration backup`);
    assertLegacyMetadataPreserved(workspace, schemaVersion);
    assertLegacyLocalSettingsPreserved(workspace);
    assert.equal(workspace.settings.appearance.theme, 'system');
    assert.equal(workspace.settings.updates.includePrereleases, false);
    const persistedWorkspace = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
    assert.equal(Object.hasOwn(persistedWorkspace, 'settings'), false);
    assert.equal(Object.hasOwn(persistedWorkspace, 'localsettings'), true);
  }
});

test('quarantines unreadable workspace JSON and recovers a default workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, '{not-json');

  const store = new WorkspaceStore(workspacePath);
  await assert.rejects(
    () => store.load(),
    (error) => {
      assert.ok(error instanceof WorkspaceRecoveryError);
      assert.equal(error.recoveredWorkspace.schemaVersion, CURRENT_SCHEMA_VERSION);
      assert.ok(error.recoveredPath.includes('corrupt'));
      return true;
    }
  );

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 1);
  assert.equal(await fs.readFile(path.join(temp, quarantined[0]), 'utf8'), '{not-json');
});

test('corrupt workspace recovery preserves a replacement file that appears after quarantine', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-corrupt-replacement-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, '{not-json');
  const store = new WorkspaceStore(workspacePath);
  const originalLink = fs.link;
  let injected = false;
  fs.link = async (sourcePath, targetPath) => {
    if (!injected && targetPath === workspacePath) {
      injected = true;
      await fs.writeFile(workspacePath, JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        collections: [{ id: 'replacement-collection', name: 'Replacement Collection', requests: [], folders: [] }],
        environments: [],
        history: []
      }));
      const error = new Error('simulated recovery destination race');
      error.code = 'EEXIST';
      throw error;
    }
    return originalLink(sourcePath, targetPath);
  };

  try {
    await assert.rejects(
      () => store.load(),
      (error) => {
        assert.ok(error instanceof WorkspaceRecoveryError);
        assert.equal(error.recoveredWorkspace.collections[0].id, 'replacement-collection');
        assert.match(error.message, /replacement workspace was preserved/);
        return true;
      }
    );
  } finally {
    fs.link = originalLink;
  }

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).collections[0].id, 'replacement-collection');
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 1);
  assert.equal(await fs.readFile(path.join(temp, quarantined[0]), 'utf8'), '{not-json');
});

test('creates collision-resistant backup files without overwriting existing backups', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-backup-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);
  await store.save({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: [],
    environments: [],
    history: []
  });

  const firstBackupPath = await store.backupCurrentWorkspace('manual.backup');
  const secondBackupPath = await store.backupCurrentWorkspace('manual.backup');

  assert.notEqual(firstBackupPath, secondBackupPath);
  assert.equal(JSON.parse(await fs.readFile(firstBackupPath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(JSON.parse(await fs.readFile(secondBackupPath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal((await fs.readdir(temp)).filter((entry) => entry.includes('manual.backup')).length, 2);
});

test('refuses future workspace schemas without quarantining or overwriting user data', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-future-schema-'));
  const workspacePath = path.join(temp, 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    collections: [],
    environments: [],
    history: []
  }));

  const store = new WorkspaceStore(workspacePath);
  await assert.rejects(
    () => store.load(),
    new RegExp(`newer than this app supports \\(${CURRENT_SCHEMA_VERSION}\\)`)
  );

  assert.equal(JSON.parse(await fs.readFile(workspacePath, 'utf8')).schemaVersion, CURRENT_SCHEMA_VERSION + 1);
  const quarantined = (await fs.readdir(temp)).filter((entry) => entry.includes('corrupt'));
  assert.equal(quarantined.length, 0);
});

test('ignores stale atomic temp files and uses collision-resistant temp names', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const staleTempPath = path.join(temp, 'postmeter-workspace-stale.json.tmp');
  await fs.writeFile(workspacePath, JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: [],
    environments: [],
    history: []
  }));
  await fs.writeFile(staleTempPath, '{partial-write');

  const store = new WorkspaceStore(workspacePath);
  const { workspace } = await store.load();

  assert.equal(workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(await fs.readFile(staleTempPath, 'utf8'), '{partial-write');
  const firstTempName = temporaryJsonPath(workspacePath, 'postmeter-workspace');
  const secondTempName = temporaryJsonPath(workspacePath, 'postmeter-workspace');
  assert.equal(path.dirname(firstTempName), temp);
  assert.equal(path.dirname(secondTempName), temp);
  assert.notEqual(firstTempName, secondTempName);
});

test('atomic text writes preserve existing files and clean temp files when rename fails', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-fail-'));
  const targetPath = path.join(temp, 'export.json');
  await fs.writeFile(targetPath, 'original');
  const originalRename = fs.rename;
  let renameCalls = 0;
  fs.rename = async () => {
    renameCalls += 1;
    throw new Error('simulated atomic rename failure');
  };
  try {
    await assert.rejects(
      () => writeTextFileAtomic(targetPath, 'replacement', { prefix: 'postmeter-atomic-test' }),
      /simulated atomic rename failure/
    );
  } finally {
    fs.rename = originalRename;
  }

  assert.equal(renameCalls, 1);
  assert.equal(await fs.readFile(targetPath, 'utf8'), 'original');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-test'));
  assert.deepEqual(tempFiles, []);
});

test('atomic text writes can refuse to replace existing files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-no-overwrite-'));
  const targetPath = path.join(temp, 'backup.json');
  await fs.writeFile(targetPath, 'existing');

  await assert.rejects(
    () => writeTextFileAtomic(targetPath, 'replacement', { prefix: 'postmeter-atomic-no-overwrite', overwrite: false }),
    (error) => error?.code === 'EEXIST'
  );

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'existing');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-no-overwrite'));
  assert.deepEqual(tempFiles, []);
});

test('no-overwrite file moves preserve source and destination on destination collision', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-move-no-overwrite-'));
  const sourcePath = path.join(temp, 'source.json');
  const targetPath = path.join(temp, 'target.json');
  await fs.writeFile(sourcePath, 'source');
  await fs.writeFile(targetPath, 'target');

  await assert.rejects(
    () => moveFileNoOverwrite(sourcePath, targetPath),
    (error) => error?.code === 'EEXIST'
  );

  assert.equal(await fs.readFile(sourcePath, 'utf8'), 'source');
  assert.equal(await fs.readFile(targetPath, 'utf8'), 'target');
});

test('no-overwrite atomic writes fall back when hard links are unavailable', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-copy-fallback-'));
  const targetPath = path.join(temp, 'backup.json');
  const originalLink = fs.link;
  fs.link = async () => {
    const error = new Error('hard links unavailable');
    error.code = 'ENOTSUP';
    throw error;
  };
  try {
    await writeTextFileAtomic(targetPath, 'backup', { prefix: 'postmeter-atomic-copy-fallback', overwrite: false });
  } finally {
    fs.link = originalLink;
  }

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'backup');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-copy-fallback'));
  assert.deepEqual(tempFiles, []);
});

test('no-overwrite atomic copy fallback removes target when target fsync fails', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-copy-fsync-fail-'));
  const targetPath = path.join(temp, 'backup.json');
  const originalLink = fs.link;
  const originalOpen = fs.open;
  fs.link = async () => {
    const error = new Error('hard links unavailable');
    error.code = 'ENOTSUP';
    throw error;
  };
  fs.open = async (filePath, flags, mode) => {
    if (filePath === targetPath && flags === 'r') {
      return {
        sync: async () => {
          throw new Error('simulated target fsync failure');
        },
        close: async () => {}
      };
    }
    return originalOpen(filePath, flags, mode);
  };
  try {
    await assert.rejects(
      () => writeTextFileAtomic(targetPath, 'backup', { prefix: 'postmeter-atomic-copy-fsync-fail', overwrite: false }),
      /simulated target fsync failure/
    );
  } finally {
    fs.link = originalLink;
    fs.open = originalOpen;
  }

  await assert.rejects(() => fs.access(targetPath));
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-copy-fsync-fail'));
  assert.deepEqual(tempFiles, []);
});

test('no-overwrite atomic copy fallback tolerates unsupported target fsync', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-copy-fsync-unsupported-'));
  const targetPath = path.join(temp, 'backup.json');
  const originalLink = fs.link;
  const originalOpen = fs.open;
  fs.link = async () => {
    const error = new Error('hard links unavailable');
    error.code = 'ENOTSUP';
    throw error;
  };
  fs.open = async (filePath, flags, mode) => {
    if (filePath === targetPath && flags === 'r') {
      return {
        sync: async () => {
          const error = new Error('operation not permitted');
          error.code = 'EPERM';
          throw error;
        },
        close: async () => {}
      };
    }
    return originalOpen(filePath, flags, mode);
  };
  try {
    await writeTextFileAtomic(targetPath, 'backup', { prefix: 'postmeter-atomic-copy-fsync-unsupported', overwrite: false });
  } finally {
    fs.link = originalLink;
    fs.open = originalOpen;
  }

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'backup');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-copy-fsync-unsupported'));
  assert.deepEqual(tempFiles, []);
});

test('no-overwrite atomic copy fallback removes target when copy fails after creating it', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-copy-fail-'));
  const targetPath = path.join(temp, 'backup.json');
  const originalLink = fs.link;
  const originalCopyFile = fs.copyFile;
  fs.link = async () => {
    const error = new Error('hard links unavailable');
    error.code = 'ENOTSUP';
    throw error;
  };
  fs.copyFile = async (_sourcePath, destinationPath) => {
    await fs.writeFile(destinationPath, 'partial-copy');
    throw new Error('simulated copy failure');
  };
  try {
    await assert.rejects(
      () => writeTextFileAtomic(targetPath, 'backup', { prefix: 'postmeter-atomic-copy-fail', overwrite: false }),
      /simulated copy failure/
    );
  } finally {
    fs.link = originalLink;
    fs.copyFile = originalCopyFile;
  }

  await assert.rejects(() => fs.access(targetPath));
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-copy-fail'));
  assert.deepEqual(tempFiles, []);
});

test('no-overwrite atomic writes tolerate stale temp cleanup failures after publish', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-cleanup-fail-'));
  const targetPath = path.join(temp, 'backup.json');
  const originalRm = fs.rm;
  fs.rm = async (filePath, options) => {
    if (String(filePath).includes('postmeter-atomic-cleanup-fail')) {
      throw new Error('simulated temp cleanup failure');
    }
    return originalRm(filePath, options);
  };
  try {
    await writeTextFileAtomic(targetPath, 'backup', { prefix: 'postmeter-atomic-cleanup-fail', overwrite: false });
  } finally {
    fs.rm = originalRm;
  }

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'backup');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-cleanup-fail'));
  assert.equal(tempFiles.length, 1);
  await fs.rm(path.join(temp, tempFiles[0]), { force: true });
});

test('no-overwrite atomic writes still fail when destination exists and temp cleanup fails', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-atomic-existing-cleanup-fail-'));
  const targetPath = path.join(temp, 'backup.json');
  await fs.writeFile(targetPath, 'existing');
  const originalRm = fs.rm;
  fs.rm = async (filePath, options) => {
    if (String(filePath).includes('postmeter-atomic-existing-cleanup-fail')) {
      throw new Error('simulated temp cleanup failure');
    }
    return originalRm(filePath, options);
  };
  try {
    await assert.rejects(
      () => writeTextFileAtomic(targetPath, 'replacement', { prefix: 'postmeter-atomic-existing-cleanup-fail', overwrite: false }),
      (error) => error?.code === 'EEXIST'
    );
  } finally {
    fs.rm = originalRm;
  }

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'existing');
  const tempFiles = (await fs.readdir(temp)).filter((entry) => entry.includes('postmeter-atomic-existing-cleanup-fail'));
  assert.equal(tempFiles.length, 1);
  await fs.rm(path.join(temp, tempFiles[0]), { force: true });
});

test('no-overwrite file moves fall back when hard links are unavailable', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-move-copy-fallback-'));
  const sourcePath = path.join(temp, 'source.json');
  const targetPath = path.join(temp, 'target.json');
  await fs.writeFile(sourcePath, 'source');
  const originalLink = fs.link;
  fs.link = async () => {
    const error = new Error('hard links unavailable');
    error.code = 'ENOTSUP';
    throw error;
  };
  try {
    await moveFileNoOverwrite(sourcePath, targetPath);
  } finally {
    fs.link = originalLink;
  }

  assert.equal(await fs.readFile(targetPath, 'utf8'), 'source');
  await assert.rejects(() => fs.access(sourcePath));
});

test('preserves an intentionally empty collection list on save and reload', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  const saved = await store.save({
    schemaVersion: 11,
    settings: { appearance: { theme: 'dark' }, updates: { includePrereleases: true }, loadTestPolicy: { concurrency: 42 } },
    collections: [],
    environments: [],
    cookies: [],
    history: []
  });

  assert.equal(saved.settings.updates.includePrereleases, true);
  assert.equal(saved.settings.appearance.theme, 'dark');
  assert.equal(saved.settings.loadTestPolicy, undefined);
  assert.equal(Object.hasOwn(JSON.parse(await fs.readFile(workspacePath, 'utf8')), 'settings'), false);

  const { workspace } = await store.load();
  assert.equal(workspace.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(workspace.settings.updates.includePrereleases, false);
  assert.equal(workspace.settings.appearance.theme, 'system');
  assert.equal(workspace.settings.loadTestPolicy, undefined);
  assert.deepEqual(workspace.collections, []);
  assert.deepEqual(workspace.cookies, []);
});

test('persists only workspace-local settings and strips app-wide shortcuts from workspace files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-settings-split-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);

  await store.save({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      appearance: { theme: 'dark' },
      shortcuts: { 'new-environment': 'CmdOrCtrl+8' },
      updates: { includePrereleases: true },
      request: {
        sslCertificateVerification: false,
        caCertificatePath: '/tmp/local-ca.pem'
      }
    },
    collections: [],
    environments: [],
    cookies: [],
    history: []
  });

  const persisted = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(Object.hasOwn(persisted, 'settings'), false);
  assert.equal(Object.hasOwn(persisted.localsettings, 'shortcuts'), false);
  assert.equal(Object.hasOwn(persisted.localsettings, 'appearance'), false);
  assert.equal(Object.hasOwn(persisted.localsettings, 'updates'), false);
  assert.equal(persisted.localsettings.request.sslCertificateVerification, false);
  assert.equal(persisted.localsettings.request.caCertificatePath, '/tmp/local-ca.pem');

  const { workspace } = await store.load();
  assert.equal(workspace.settings.shortcuts['new-environment'], 'CmdOrCtrl+E');
  assert.equal(workspace.settings.appearance.theme, 'system');
  assert.equal(workspace.settings.updates.includePrereleases, false);
  assert.equal(workspace.settings.request.sslCertificateVerification, false);
  assert.equal(workspace.settings.request.caCertificatePath, '/tmp/local-ca.pem');
});

function legacyWorkspaceFixture(schemaVersion) {
  return {
    schemaVersion,
    collections: [{
      id: 'collection-1',
      name: 'Imported Collection',
      description: 'Legacy imported collection',
      variables: [{ enabled: true, key: 'collectionToken', value: 'collection-secret' }],
      certificates: [{
        id: 'cert-1',
        name: 'Imported Cert',
        matches: ['https://example.test/*'],
        certPath: '/tmp/client.pem',
        keyPath: '/tmp/client.key',
        pfxPath: '/tmp/client.p12',
        caPath: '/tmp/ca.pem',
        passphrase: 'cert-passphrase',
        postman: { ids: { original: 'postman-cert-1' } }
      }],
      postman: {
        ids: { original: 'postman-collection-1' },
        bindings: {
          visualizerAssets: [{ name: 'legacy-chart', source: 'postman://asset/chart' }],
          vaultKeys: ['apiToken']
        },
        packageReferences: ['@team/legacy-utils']
      },
      requests: [legacyRequestFixture('request-1', 'postman-request-1')],
      folders: [{
        id: 'folder-1',
        name: 'Imported Folder',
        postman: { ids: { original: 'postman-folder-1' } },
        requests: [legacyRequestFixture('nested-request-1', 'postman-nested-request-1')],
        folders: []
      }]
    }],
    environments: [{
      id: 'environment-1',
      name: 'Imported Environment',
      variables: [{ enabled: true, key: 'envToken', value: 'env-secret' }]
    }],
    globals: [{ enabled: true, key: 'globalToken', value: 'global-secret' }],
    cookies: [{
      id: 'cookie-1',
      enabled: true,
      name: 'sid',
      value: 'cookie-secret',
      domain: 'example.test',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      hostOnly: true,
      source: 'postman'
    }],
    history: [{ method: 'GET', url: 'https://example.test/history', statusCode: 200, durationMillis: 12 }],
    settings: {
      appearance: { theme: 'dark' },
      sandbox: {
        fileBindings: [{
          id: 'file-binding-1',
          source: 'fixtures/upload.bin',
          localPath: '/tmp/upload.bin',
          mode: 'file',
          reviewedAt: '2026-04-30T00:00:00.000Z'
        }],
        packageCache: [{
          specifier: '@team/legacy-utils',
          source: 'module.exports = { value: 1 };',
          files: [{ path: 'index.js', source: 'module.exports = { value: 1 };' }],
          integrity: 'sha256-test-integrity',
          dependencyAliases: { dep: 'npm:dep@1.0.0' },
          dependencies: ['npm:dep@1.0.0'],
          packageJson: { main: 'index.js' },
          reviewedAt: '2026-04-30T00:00:00.000Z'
        }],
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: ['collection-1'],
            requests: ['request-1'],
            deniedCollections: ['blocked-collection'],
            deniedRequests: ['blocked-request']
          }
        }
      },
      updates: { includePrereleases: true }
    }
  };
}

function legacyRequestFixture(id, originalPostmanId) {
  return {
    id,
    name: `Imported ${id}`,
    protocol: 'grpc',
    method: 'POST',
    url: 'https://example.test/grpc',
    queryParams: [{ enabled: true, key: 'q', value: '1' }],
    headers: [{ enabled: true, key: 'Content-Type', value: 'application/grpc' }],
    bodyType: 'RAW_JSON',
    body: '{"ok":true}',
    auth: { type: 'bearer', token: 'request-token' },
    scripts: {
      preRequest: 'pm.variables.set("before", "yes");',
      tests: 'pm.test("ok", function () { pm.expect(true).to.equal(true); });',
      mock: 'pm.state.set("count", 1);'
    },
    variables: [{ enabled: true, key: 'requestLocal', value: 'local-secret' }],
    docs: 'Imported request docs',
    cookieJar: { enabled: true, storeResponses: true },
    methodPath: 'Greeter/SayHello',
    metadata: [{ enabled: true, key: 'grpc-status', value: '0' }],
    messages: [{ type: 'outgoing', name: 'hello', data: '{"name":"Ada"}' }],
    postmanBody: { mode: 'graphql', graphql: { query: 'query { ok }', variables: '{}' } },
    protocolProfile: { disableBodyPruning: true },
    graphql: { query: 'query { ok }', variables: { id: 1 }, operationName: 'GetOk' },
    grpc: { protoPath: 'service.proto', service: 'Greeter', method: 'SayHello' },
    websocket: { url: 'wss://example.test/socket' },
    postman: {
      ids: { original: originalPostmanId },
      bindings: {
        visualizerAssets: [{ name: 'legacy-chart', source: 'postman://asset/chart' }],
        vaultKeys: ['apiToken']
      },
      fileReferences: [{ source: 'fixtures/upload.bin', mode: 'file' }]
    }
  };
}

function assertLegacyMetadataPreserved(workspace, schemaVersion) {
  const collection = workspace.collections[0];
  const request = collection.requests[0];
  const nestedRequest = collection.folders[0].requests[0];
  assert.equal(collection.postman.ids.original, 'postman-collection-1', `schema ${schemaVersion} collection metadata`);
  assert.equal(collection.postman.bindings.visualizerAssets[0].name, 'legacy-chart');
  assert.equal(collection.certificates[0].postman.ids.original, 'postman-cert-1');
  assert.equal(collection.certificates[0].passphrase, 'cert-passphrase');
  assert.equal(collection.folders[0].postman.ids.original, 'postman-folder-1');
  assert.equal(request.postman.ids.original, 'postman-request-1');
  assert.equal(nestedRequest.postman.ids.original, 'postman-nested-request-1');
  assert.equal(request.scripts.mock, 'pm.state.set("count", 1);');
  assert.equal(request.protocol, 'grpc');
  assert.equal(request.methodPath, 'Greeter/SayHello');
  assert.equal(request.postmanBody.mode, 'graphql');
  assert.equal(request.protocolProfile.disableBodyPruning, true);
  assert.equal(request.graphql.operationName, 'GetOk');
  assert.equal(request.grpc.service, 'Greeter');
  assert.equal(request.websocket.url, 'wss://example.test/socket');
  assert.equal(request.docs, 'Imported request docs');
  assert.equal(workspace.globals[0].key, 'globalToken');
  assert.equal(workspace.cookies[0].httpOnly, true);
}

function assertLegacyLocalSettingsPreserved(workspace) {
  assert.equal(workspace.settings.sandbox.fileBindings[0].source, 'fixtures/upload.bin');
  assert.equal(workspace.settings.sandbox.packageCache[0].specifier, '@team/legacy-utils');
  assert.equal(workspace.settings.sandbox.packageCache[0].files[0].path, 'index.js');
  assert.equal(workspace.localsettings.sandbox.fileBindings[0].source, 'fixtures/upload.bin');
  assert.equal(workspace.localsettings.sandbox.packageCache[0].specifier, '@team/legacy-utils');
  assert.equal(workspace.localsettings.sandbox.packageCache[0].files[0].path, 'index.js');
  assert.deepEqual(workspace.settings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: ['collection-1'],
    requests: ['request-1'],
    deniedCollections: ['blocked-collection'],
    deniedRequests: ['blocked-request']
  });
  assert.deepEqual(workspace.localsettings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: ['collection-1'],
    requests: ['request-1'],
    deniedCollections: ['blocked-collection'],
    deniedRequests: ['blocked-request']
  });
}

test('imports native collection exports and Postman collections without confusing formats', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));

  const nativePath = path.join(temp, 'native.json');
  await fs.writeFile(nativePath, JSON.stringify({
    schemaVersion: 6,
    collections: [{
      id: 'native',
      name: 'Native',
      description: '',
      requests: [{ id: 'r1', name: 'Saved', method: 'GET', url: 'https://example.test', queryParams: [], headers: [], bodyType: 'NONE', body: '' }],
      folders: []
    }],
    environments: [],
    history: []
  }));

  const native = await store.importCollection(nativePath);
  assert.equal(native.name, 'Native');
  assert.notEqual(native.id, 'native');
  assert.equal(native.requests[0].name, 'Saved');

  const postmanPath = path.join(temp, 'postman.json');
  await fs.writeFile(postmanPath, JSON.stringify({
    info: {
      name: 'Postman Nested',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: 'https://api.example.test' },
      { key: 'token', value: 'collection-token', type: 'string' }
    ],
    event: [{
      listen: 'prerequest',
      script: { exec: ["pm.collectionVariables.set('fromCollection', 'yes');"] }
    }],
    item: [{
      name: 'Folder A',
      event: [{
        listen: 'test',
        script: { exec: ["pm.test('folder test', function () { pm.expect(pm.response.code).to.equal(200); });"] }
      }],
      item: [{
        name: 'Folder B',
        item: [{
          name: 'Nested Request',
          event: [{
            listen: 'test',
            script: { exec: "pm.test('request test', function () { pm.expect(pm.response.json().ok).to.eql(true); });" }
          }],
          request: {
            method: 'POST',
            url: {
              raw: 'https://api.example.test/widgets?from=raw',
              query: [{ key: 'enabled', value: 'yes' }, { key: 'off', value: 'no', disabled: true }]
            },
            header: [{ key: 'Accept', value: 'application/json' }],
            body: { mode: 'raw', raw: '{"ok":true}', options: { raw: { language: 'json' } } }
          }
        }]
      }]
    }]
  }));

  const postman = await store.importCollection(postmanPath);
  assert.equal(postman.name, 'Postman Nested');
  assert.equal(postman.requests.length, 0);
  assert.equal(postman.variables.length, 2);
  assert.equal(postman.variables[0].key, 'baseUrl');
  assert.match(postman.scripts.preRequest, /fromCollection/);
  assert.equal(postman.folders[0].name, 'Folder A');
  assert.match(postman.folders[0].scripts.tests, /folder test/);
  const nestedRequest = postman.folders[0].folders[0].requests[0];
  assert.equal(nestedRequest.name, 'Nested Request');
  assert.equal(nestedRequest.bodyType, 'RAW_JSON');
  assert.equal(nestedRequest.queryParams.length, 2);
  assert.equal(nestedRequest.scripts.preRequest, '');
  assert.doesNotMatch(nestedRequest.scripts.tests, /folder test/);
  assert.match(nestedRequest.scripts.tests, /request test/);

  const openApiYamlPath = path.join(temp, 'openapi.yaml');
  await fs.writeFile(openApiYamlPath, [
    'openapi: 3.0.0',
    'info:',
    '  title: YAML API',
    '  version: 1.0.0',
    'servers:',
    `  - url: https://yaml.example.test`,
    'paths:',
    '  /widgets:',
    '    get:',
    '      operationId: listWidgets',
    '      responses:',
    '        "200":',
    '          description: OK'
  ].join('\n'));
  const openApiYaml = await store.importCollection(openApiYamlPath);
  assert.equal(openApiYaml.name, 'YAML API');
  assert.equal(openApiYaml.requests[0].url, 'https://yaml.example.test/widgets');
});

test('round-trips native PostMeter workspaces and collection exports with metadata-rich imported features', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-native-roundtrip-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const workspaceExportPath = path.join(temp, 'workspace-export.json');
  const collectionExportPath = path.join(temp, 'collection-export.json');
  const store = new WorkspaceStore(workspacePath);

  const savedWorkspace = await store.save(legacyWorkspaceFixture(CURRENT_SCHEMA_VERSION));
  assertLegacyLocalSettingsPreserved(savedWorkspace);
  const { workspace } = await store.load();
  assertLegacyMetadataPreserved(workspace, CURRENT_SCHEMA_VERSION);
  assert.equal(workspace.settings.appearance.theme, 'system');
  await store.exportWorkspace(savedWorkspace, workspaceExportPath);
  const exportedWorkspace = JSON.parse(await fs.readFile(workspaceExportPath, 'utf8'));
  assert.equal(Object.hasOwn(exportedWorkspace, 'settings'), false);
  assert.equal(Object.hasOwn(exportedWorkspace, 'localsettings'), false);
  const importedWorkspace = await store.importWorkspace(workspaceExportPath);
  assertLegacyMetadataPreserved(importedWorkspace, CURRENT_SCHEMA_VERSION);
  assert.equal(importedWorkspace.settings.appearance.theme, 'system');
  assert.equal(importedWorkspace.settings.updates.includePrereleases, false);
  assert.deepEqual(importedWorkspace.localsettings.sandbox.fileBindings, []);
  assert.deepEqual(importedWorkspace.settings.diagnostics.requestResponseLogging, {
    urls: false,
    headers: false,
    cookies: false,
    bodies: false,
    protocolMessages: false,
    scriptConsole: false,
    payloadIdentifiers: false
  });

  await store.exportCollection(importedWorkspace.collections[0], collectionExportPath, { format: 'postmeter' });
  const importedCollection = await store.importCollection(collectionExportPath);
  const request = importedCollection.requests[0];
  const nestedRequest = importedCollection.folders[0].requests[0];
  assert.notEqual(importedCollection.id, 'collection-1');
  assert.equal(importedCollection.postman.ids.original, 'postman-collection-1');
  assert.equal(importedCollection.postman.bindings.visualizerAssets[0].name, 'legacy-chart');
  assert.equal(importedCollection.postman.packageReferences[0], '@team/legacy-utils');
  assert.equal(importedCollection.certificates[0].postman.ids.original, 'postman-cert-1');
  assert.equal(importedCollection.folders[0].postman.ids.original, 'postman-folder-1');
  assert.equal(request.postman.ids.original, 'postman-request-1');
  assert.equal(nestedRequest.postman.ids.original, 'postman-nested-request-1');
  assert.equal(request.scripts.mock, 'pm.state.set("count", 1);');
  assert.equal(request.protocol, 'grpc');
  assert.equal(request.methodPath, 'Greeter/SayHello');
  assert.equal(request.postmanBody.mode, 'graphql');
  assert.equal(request.protocolProfile.disableBodyPruning, true);
  assert.equal(request.graphql.operationName, 'GetOk');
  assert.equal(request.grpc.service, 'Greeter');
  assert.equal(request.websocket.url, 'wss://example.test/socket');
  assert.equal(request.docs, 'Imported request docs');
  assert.equal(request.postman.bindings.vaultKeys[0], 'apiToken');
  assert.equal(request.postman.fileReferences[0].source, 'fixtures/upload.bin');
});

test('workspace import ignores local settings from native files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-import-diagnostics-reset-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const importPath = path.join(temp, 'imported-workspace.json');
  const store = new WorkspaceStore(workspacePath);
  await fs.writeFile(importPath, JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      appearance: { theme: 'dark' },
      diagnostics: {
        logging: { enabled: true, level: 'debug' },
        requestResponseLogging: {
          urls: true,
          headers: true,
          cookies: true,
          bodies: true,
          protocolMessages: true,
          scriptConsole: true,
          payloadIdentifiers: true
        }
      }
    },
    localsettings: {
      request: {
        sslCertificateVerification: false,
        caCertificatePath: '/tmp/imported-ca.pem',
        clientCertificates: [{
          id: 'imported-managed-cert',
          host: 'api.example.test',
          certPath: '/tmp/client.crt',
          keyPath: '/tmp/client.key',
          passphraseSecretKey: 'client-certificate:imported-managed-cert:passphrase'
        }]
      },
      diagnostics: {
        requestResponseLogging: {
          urls: true,
          headers: true,
          cookies: true,
          bodies: true,
          protocolMessages: true,
          scriptConsole: true,
          payloadIdentifiers: true
        }
      },
      sandbox: {
        fileBindings: [{ id: 'binding-1', source: 'upload.bin', localPath: '/tmp/upload.bin', mode: 'file' }],
        packageCache: [{ specifier: '@team/imported', source: 'module.exports = {};', integrity: 'sha256-imported' }],
        trustedCapabilities: {
          vaultGrants: {
            workspace: true,
            collections: ['imported-collection'],
            requests: ['imported-request'],
            deniedCollections: ['blocked-collection'],
            deniedRequests: ['blocked-request']
          }
        }
      }
    },
    collections: [],
    environments: [],
    cookies: [],
    history: []
  }));

  const imported = await store.importWorkspace(importPath);

  assert.equal(imported.settings.appearance.theme, 'system');
  assert.deepEqual(imported.settings.diagnostics, {
    logging: {
      enabled: true,
      level: 'info'
    },
    requestResponseLogging: {
      urls: false,
      headers: false,
      cookies: false,
      bodies: false,
      protocolMessages: false,
      scriptConsole: false,
      payloadIdentifiers: false
    }
  });
  assert.deepEqual(imported.localsettings.diagnostics.requestResponseLogging, {
    urls: false,
    headers: false,
    cookies: false,
    bodies: false,
    protocolMessages: false,
    scriptConsole: false,
    payloadIdentifiers: false
  });
  assert.deepEqual(imported.localsettings.request, {
    sslCertificateVerification: true,
    caCertificatePath: '',
    clientCertificates: []
  });
  assert.deepEqual(imported.localsettings.sandbox.fileBindings, []);
  assert.deepEqual(imported.localsettings.sandbox.packageCache, []);
  assert.deepEqual(imported.localsettings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: [],
    requests: [],
    deniedCollections: [],
    deniedRequests: []
  });
});

test('workspace export strips workspace-local TLS trust settings', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-export-tls-localsettings-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'export.json');
  const store = new WorkspaceStore(workspacePath);
  const saved = await store.save({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    settings: {
      request: {
        sslCertificateVerification: false,
        caCertificatePath: '/tmp/postmeter-ca.pem',
        clientCertificates: [{
          id: 'local-client-cert',
          host: 'api.example.test',
          certPath: '/tmp/client.crt',
          keyPath: '/tmp/client.key',
          passphraseSecretKey: 'client-certificate:local-client-cert:passphrase'
        }]
      }
    }
  });

  const rawWorkspace = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(rawWorkspace.localsettings.request.sslCertificateVerification, false);
  assert.equal(rawWorkspace.localsettings.request.caCertificatePath, '/tmp/postmeter-ca.pem');
  assert.equal(rawWorkspace.localsettings.request.clientCertificates[0].id, 'local-client-cert');

  await store.exportWorkspace(saved, exportPath);
  const exportedText = await fs.readFile(exportPath, 'utf8');
  assert.equal(exportedText.includes('/tmp/postmeter-ca.pem'), false);
  assert.equal(exportedText.includes('/tmp/client.crt'), false);
  assert.equal(exportedText.includes('client-certificate:local-client-cert:passphrase'), false);
  const exported = JSON.parse(exportedText);
  assert.equal(Object.hasOwn(exported, 'localsettings'), false);

  const imported = await store.importWorkspace(exportPath);
  assert.deepEqual(imported.localsettings.request, {
    sslCertificateVerification: true,
    caCertificatePath: '',
    clientCertificates: []
  });
});

test('rejects workspace import when the file is not a native PostMeter workspace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const store = new WorkspaceStore(path.join(temp, 'workspace.json'));
  const postmanPath = path.join(temp, 'postman.json');
  await fs.writeFile(postmanPath, JSON.stringify({
    info: {
      name: 'Postman Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: []
  }));

  await assert.rejects(
    () => store.importWorkspace(postmanPath),
    /Selected file is not a native PostMeter workspace\./
  );
});

test('detects native workspace shape explicitly', () => {
  assert.equal(looksLikeNativeWorkspace({ schemaVersion: 6 }), true);
  assert.equal(looksLikeNativeWorkspace({ collections: [] }), true);
  assert.equal(looksLikeNativeWorkspace({ info: {}, item: [] }), false);
});

test('encrypts workspace files at rest and requires the key to load them', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-encrypted-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 6,
    collections: [{
      id: 'c1',
      name: 'PII Requests',
      requests: [{
        id: 'r1',
        name: 'Lookup Person',
        method: 'POST',
        url: 'https://api.example.test/person/123-45-6789',
        headers: [{ enabled: true, key: 'Authorization', value: 'Bearer sensitive-token' }],
        queryParams: [],
        bodyType: 'RAW_JSON',
        body: '{"ssn":"123-45-6789"}'
      }],
      folders: []
    }],
    environments: [],
    cookies: [],
    history: []
  };

  await store.encryptWorkspace(workspace, 'secret1');
  const rawText = await fs.readFile(workspacePath, 'utf8');
  const raw = JSON.parse(rawText);
  assert.equal(isEncryptedWorkspaceEnvelope(raw), true);
  assert.doesNotMatch(rawText, /123-45-6789|sensitive-token|Lookup Person/);
  await assert.rejects(() => store.load(), WorkspaceEncryptionKeyRequiredError);
  await assert.rejects(() => store.load({ encryptionKey: 'wrong1' }), WorkspaceUnlockFailedError);

  const loaded = await store.load({ encryptionKey: 'secret1' });
  assert.equal(loaded.encrypted, true);
  assert.equal(loaded.workspace.collections[0].requests[0].url, 'https://api.example.test/person/123-45-6789');

  loaded.workspace.collections[0].requests[0].name = 'Updated Person Lookup';
  await store.save(loaded.workspace, { encryptionKey: 'secret1' });
  const savedText = await fs.readFile(workspacePath, 'utf8');
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(savedText)), true);
  assert.doesNotMatch(savedText, /Updated Person Lookup|123-45-6789/);
});

test('encrypting and removing encryption deletes obsolete workspace backups', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-encrypted-backups-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 6,
    collections: [{ id: 'c1', name: 'Backup Secrets', requests: [], folders: [] }],
    environments: [],
    cookies: [],
    history: []
  };
  await store.save(workspace);
  const plaintextBackup = await store.createBackup('manual.backup');

  await store.encryptWorkspace(workspace, 'secret1');
  await assert.rejects(() => fs.access(plaintextBackup));
  const encryptedBackup = await store.createBackup('manual.backup');
  assert.equal(isEncryptedWorkspaceEnvelope(JSON.parse(await fs.readFile(encryptedBackup, 'utf8'))), true);

  await store.removeEncryption('secret1');
  await assert.rejects(() => fs.access(encryptedBackup));
  const raw = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(isEncryptedWorkspaceEnvelope(raw), false);
  assert.equal(raw.collections[0].name, 'Backup Secrets');
});

test('persists and exports workspace values as plain JSON', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'export.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 6,
    name: 'Legacy Workspace Name',
    collections: [{
      id: 'c1',
      name: 'Secrets',
      description: '',
      certificates: [{
        id: 'cert1',
        name: 'Client Cert',
        matches: ['https://example.test/*'],
        certPath: '/tmp/client.crt',
        keyPath: '/tmp/client.key',
        passphrase: 'cert-secret'
      }],
      variables: [
        { enabled: true, key: 'collectionToken', value: 'secret-collection-value' },
        { enabled: true, key: 'collectionBase', value: 'https://collection.example.test' }
      ],
      requests: [{
        id: 'r1',
        name: 'Auth',
        method: 'GET',
        url: 'https://example.test',
        queryParams: [],
        headers: [],
        bodyType: 'NONE',
        body: '',
        variables: [{ enabled: true, key: 'requestSecret', value: 'secret-request-value' }],
        auth: { type: 'bearer', token: 'saved-token' }
      }],
      folders: []
    }],
    environments: [{
      id: 'e1',
      name: 'Env',
      variables: [
        { enabled: true, key: 'apiKey', value: 'secret-env-value' },
        { enabled: true, key: 'baseUrl', value: 'https://example.test' }
      ]
    }],
    cookies: [{
      id: 'cookie1',
      enabled: true,
      name: 'sid',
      value: 'secret-cookie-value',
      domain: 'example.test',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      hostOnly: true,
      priority: 'High',
      partitioned: true,
      source: 'postman',
      extensions: ['SameParty']
    }],
    history: []
  };

  await store.save(workspace);
  const raw = JSON.parse(await fs.readFile(workspacePath, 'utf8'));
  assert.equal(Object.hasOwn(raw, 'name'), false);
  assert.equal(Object.hasOwn(raw, 'settings'), false);
  assert.equal(Object.hasOwn(raw, 'localsettings'), true);
  assert.equal(raw.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(raw.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(raw.collections[0].variables[1].value, 'https://collection.example.test');
  assert.equal(raw.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(raw.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(raw.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(raw.cookies[0].value, 'secret-cookie-value');
  assert.equal(raw.environments[0].variables[1].value, 'https://example.test');

  const loaded = await store.load();
  assert.equal(Object.hasOwn(loaded.workspace, 'name'), false);
  assert.equal(loaded.workspace.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(loaded.workspace.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(loaded.workspace.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(loaded.workspace.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(loaded.workspace.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(loaded.workspace.cookies[0].value, 'secret-cookie-value');
  assert.equal(loaded.workspace.cookies[0].priority, 'High');
  assert.equal(loaded.workspace.cookies[0].partitioned, true);
  assert.equal(loaded.workspace.cookies[0].source, 'postman');
  assert.deepEqual(loaded.workspace.cookies[0].extensions, ['SameParty']);

  await store.exportWorkspace(loaded.workspace, exportPath);
  const exported = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  assert.equal(Object.hasOwn(exported, 'name'), false);
  assert.equal(Object.hasOwn(exported, 'settings'), false);
  assert.equal(Object.hasOwn(exported, 'localsettings'), false);
  assert.equal(exported.collections[0].variables[0].value, 'secret-collection-value');
  assert.equal(exported.collections[0].certificates[0].passphrase, 'cert-secret');
  assert.equal(exported.collections[0].variables[1].value, 'https://collection.example.test');
  assert.equal(exported.collections[0].requests[0].variables[0].value, 'secret-request-value');
  assert.equal(exported.collections[0].requests[0].auth.token, 'saved-token');
  assert.equal(exported.environments[0].variables[0].value, 'secret-env-value');
  assert.equal(exported.cookies[0].value, 'secret-cookie-value');
  assert.equal(exported.cookies[0].priority, 'High');
  assert.equal(exported.cookies[0].source, 'postman');
  assert.equal(exported.environments[0].variables[1].value, 'https://example.test');
});

test('excludes local vault plaintext and ciphertext from workspace save and export', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-store-vault-export-'));
  const workspacePath = path.join(temp, 'workspace.json');
  const exportPath = path.join(temp, 'workspace-export.json');
  const store = new WorkspaceStore(workspacePath);
  const workspace = {
    schemaVersion: 11,
    settings: {
      sandbox: {
        trustedCapabilities: {
          sendRequest: true,
          cookies: true,
          vault: false,
          vaultGrants: {
            workspace: false,
            collections: ['collection-1'],
            requests: ['request-1'],
            deniedCollections: ['collection-denied'],
            deniedRequests: ['request-denied']
          }
        }
      }
    },
    collections: [],
    environments: [],
    cookies: [],
    history: [],
    vault: {
      secrets: [{ key: 'apiToken', value: 'vault-plaintext-secret' }],
      entries: [{ key: 'apiToken', ciphertext: 'vault-ciphertext-secret' }]
    }
  };

  const saved = await store.save(workspace);
  const rawText = await fs.readFile(workspacePath, 'utf8');
  assert.equal(rawText.includes('vault-plaintext-secret'), false);
  assert.equal(rawText.includes('vault-ciphertext-secret'), false);
  const rawWorkspace = JSON.parse(rawText);
  assert.equal(Object.hasOwn(rawWorkspace, 'vault'), false);
  assert.equal(Object.hasOwn(rawWorkspace, 'settings'), false);
  assert.equal(Object.hasOwn(rawWorkspace, 'localsettings'), true);
  assert.deepEqual(rawWorkspace.localsettings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: ['collection-1'],
    requests: ['request-1'],
    deniedCollections: ['collection-denied'],
    deniedRequests: ['request-denied']
  });
  assert.deepEqual(saved.settings.sandbox.trustedCapabilities.vaultGrants, {
    workspace: false,
    collections: ['collection-1'],
    requests: ['request-1'],
    deniedCollections: ['collection-denied'],
    deniedRequests: ['request-denied']
  });

  await store.exportWorkspace({ ...saved, vault: workspace.vault }, exportPath);
  const exportedText = await fs.readFile(exportPath, 'utf8');
  assert.equal(exportedText.includes('vault-plaintext-secret'), false);
  assert.equal(exportedText.includes('vault-ciphertext-secret'), false);
  const exportedWorkspace = JSON.parse(exportedText);
  assert.equal(Object.hasOwn(exportedWorkspace, 'vault'), false);
  assert.equal(Object.hasOwn(exportedWorkspace, 'settings'), false);
  assert.equal(Object.hasOwn(exportedWorkspace, 'localsettings'), false);
});
