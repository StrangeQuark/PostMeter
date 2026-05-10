const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeSettings } = require('./models');
const {
  fsyncDirectory,
  moveFileNoOverwrite,
  pathExists,
  siblingPath,
  writeJsonFileAtomic,
  writeJsonFileAtomicSync
} = require('./workspacePersistence');

const APP_SETTINGS_FORMAT = 'postmeter.settings';
const APP_SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS_FILENAME = 'settings.json';
const DEFAULT_WORKSPACE_SETTINGS_KEY = 'default';

function defaultSettingsPath() {
  if (process.env.POSTMETER_SETTINGS_PATH && process.env.POSTMETER_SETTINGS_PATH.trim()) {
    return process.env.POSTMETER_SETTINGS_PATH;
  }
  if (process.env.POSTMETER_DATA_PATH && process.env.POSTMETER_DATA_PATH.trim()) {
    return path.join(path.dirname(path.resolve(process.env.POSTMETER_DATA_PATH)), DEFAULT_SETTINGS_FILENAME);
  }
  return path.join(os.homedir(), '.postmeter', DEFAULT_SETTINGS_FILENAME);
}

function defaultAppSettings() {
  return normalizeAppSettings({
    format: APP_SETTINGS_FORMAT,
    version: APP_SETTINGS_VERSION,
    app: {},
    workspaces: {}
  });
}

function normalizeAppSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const version = Number(source.version || APP_SETTINGS_VERSION);
  if (version > APP_SETTINGS_VERSION) {
    throw new Error(`Settings version ${version} is newer than this app supports (${APP_SETTINGS_VERSION}).`);
  }

  const appSource = source.format === APP_SETTINGS_FORMAT || source.app || source.workspaces
    ? source.app || {}
    : source;
  const workspaceSource = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
    ? source.workspaces
    : {};

  const normalized = {
    format: APP_SETTINGS_FORMAT,
    version: APP_SETTINGS_VERSION,
    app: appScopedSettings(appSource),
    workspaces: {}
  };

  for (const [workspaceId, settings] of Object.entries(workspaceSource)) {
    const normalizedWorkspaceId = normalizeWorkspaceSettingsKey(workspaceId);
    if (!normalizedWorkspaceId) {
      continue;
    }
    normalized.workspaces[normalizedWorkspaceId] = workspaceScopedSettings(settings);
  }

  return normalized;
}

function appScopedSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    appearance: normalized.appearance,
    tabs: normalized.tabs,
    modals: normalized.modals,
    updates: normalized.updates
  };
}

function workspaceScopedSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    diagnostics: normalized.diagnostics,
    sandbox: normalized.sandbox
  };
}

function effectiveSettingsForWorkspace(appSettings, workspaceId, fallbackSettings = {}) {
  const normalizedAppSettings = normalizeAppSettings(appSettings || defaultAppSettings());
  const workspaceSettings = normalizedAppSettings.workspaces[normalizeWorkspaceSettingsKey(workspaceId)] || {};
  const fallback = normalizeSettings(fallbackSettings || {});
  return normalizeSettings({
    appearance: normalizedAppSettings.app.appearance,
    tabs: normalizedAppSettings.app.tabs,
    modals: normalizedAppSettings.app.modals,
    updates: normalizedAppSettings.app.updates,
    diagnostics: workspaceSettings.diagnostics || fallback.diagnostics,
    sandbox: workspaceSettings.sandbox || fallback.sandbox
  });
}

function mergeEffectiveSettings(appSettings, workspaceId, effectiveSettings = {}) {
  const normalizedAppSettings = normalizeAppSettings(appSettings || defaultAppSettings());
  const normalizedEffectiveSettings = normalizeSettings(effectiveSettings || {});
  const next = {
    ...normalizedAppSettings,
    app: appScopedSettings(normalizedEffectiveSettings),
    workspaces: {
      ...normalizedAppSettings.workspaces,
      [normalizeWorkspaceSettingsKey(workspaceId)]: workspaceScopedSettings(normalizedEffectiveSettings)
    }
  };
  return normalizeAppSettings(next);
}

function normalizeWorkspaceSettingsKey(workspaceId) {
  const normalized = String(workspaceId || DEFAULT_WORKSPACE_SETTINGS_KEY).trim();
  return normalized || DEFAULT_WORKSPACE_SETTINGS_KEY;
}

class AppSettingsStore {
  constructor(settingsPath = defaultSettingsPath()) {
    this.settingsPath = path.resolve(settingsPath);
    this.settings = null;
  }

  getSettingsPath() {
    return this.settingsPath;
  }

  async load() {
    if (!(await pathExists(this.settingsPath))) {
      this.settings = defaultAppSettings();
      await this.save(this.settings, { overwrite: false });
      return this.settings;
    }

    try {
      this.settings = normalizeAppSettings(JSON.parse(await fs.readFile(this.settingsPath, 'utf8')));
      return this.settings;
    } catch (error) {
      if (error?.message?.includes('newer than this app supports')) {
        throw error;
      }
      await this.quarantineCorruptSettings();
      this.settings = defaultAppSettings();
      await this.save(this.settings, { overwrite: false });
      return this.settings;
    }
  }

  async save(settings, options = {}) {
    const normalized = normalizeAppSettings(settings);
    await writeJsonFileAtomic(this.settingsPath, normalized, {
      ...options,
      mode: 0o600,
      prefix: 'postmeter-settings'
    });
    this.settings = normalized;
    return normalized;
  }

  saveSync(settings, options = {}) {
    const normalized = normalizeAppSettings(settings);
    writeJsonFileAtomicSync(this.settingsPath, normalized, {
      ...options,
      mode: 0o600,
      prefix: 'postmeter-settings'
    });
    this.settings = normalized;
    return normalized;
  }

  async mergeWorkspaceSettings(workspaceId, settings) {
    const base = this.settings || await this.load();
    return this.save(mergeEffectiveSettings(base, workspaceId, settings));
  }

  mergeWorkspaceSettingsSync(workspaceId, settings) {
    const base = this.settings || defaultAppSettings();
    return this.saveSync(mergeEffectiveSettings(base, workspaceId, settings));
  }

  async renameWorkspaceSettings(previousWorkspaceId, nextWorkspaceId) {
    const previousKey = normalizeWorkspaceSettingsKey(previousWorkspaceId);
    const nextKey = normalizeWorkspaceSettingsKey(nextWorkspaceId);
    const base = this.settings || await this.load();
    if (previousKey === nextKey || !base.workspaces[previousKey]) {
      return base;
    }
    const next = {
      ...base,
      workspaces: {
        ...base.workspaces,
        [nextKey]: base.workspaces[previousKey]
      }
    };
    delete next.workspaces[previousKey];
    return this.save(next);
  }

  async deleteWorkspaceSettings(workspaceId) {
    const workspaceKey = normalizeWorkspaceSettingsKey(workspaceId);
    const base = this.settings || await this.load();
    if (!base.workspaces[workspaceKey]) {
      return base;
    }
    const next = {
      ...base,
      workspaces: { ...base.workspaces }
    };
    delete next.workspaces[workspaceKey];
    return this.save(next);
  }

  settingsForWorkspace(workspaceId, fallbackSettings = {}) {
    return effectiveSettingsForWorkspace(this.settings || defaultAppSettings(), workspaceId, fallbackSettings);
  }

  async quarantineCorruptSettings() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const recoveredPath = siblingPath(this.settingsPath, 'corrupt');
      try {
        await moveFileNoOverwrite(this.settingsPath, recoveredPath);
        await fsyncDirectory(path.dirname(recoveredPath));
        return recoveredPath;
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          throw error;
        }
      }
    }
    throw new Error('Could not allocate a non-conflicting corrupt settings recovery path.');
  }
}

module.exports = {
  APP_SETTINGS_FORMAT,
  APP_SETTINGS_VERSION,
  AppSettingsStore,
  appScopedSettings,
  defaultAppSettings,
  defaultSettingsPath,
  effectiveSettingsForWorkspace,
  mergeEffectiveSettings,
  normalizeAppSettings,
  workspaceScopedSettings
};
