const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  mergeSettingsWithWorkspaceLocalSettings,
  normalizeSettings,
  normalizeWorkspaceLocalSettings
} = require('./models');
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
    app: {}
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
  return {
    format: APP_SETTINGS_FORMAT,
    version: APP_SETTINGS_VERSION,
    app: appScopedSettings(appSource)
  };
}

function appScopedSettings(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    appearance: normalized.appearance,
    editor: normalized.editor,
    tabs: normalized.tabs,
    modals: normalized.modals,
    updates: normalized.updates,
    diagnostics: {
      logging: normalized.diagnostics.logging
    },
    sandbox: {
      trustedCapabilities: {
        sendRequest: normalized.sandbox.trustedCapabilities.sendRequest,
        cookies: normalized.sandbox.trustedCapabilities.cookies,
        vault: normalized.sandbox.trustedCapabilities.vault
      }
    }
  };
}

function workspaceScopedSettings(settings = {}) {
  return normalizeWorkspaceLocalSettings(settings);
}

function legacyWorkspaceSettingsMap(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const workspaceSource = source.workspaces && typeof source.workspaces === 'object' && !Array.isArray(source.workspaces)
    ? source.workspaces
    : {};
  const output = {};
  for (const [workspaceId, settings] of Object.entries(workspaceSource)) {
    const normalizedWorkspaceId = normalizeWorkspaceSettingsKey(workspaceId);
    if (normalizedWorkspaceId) {
      output[normalizedWorkspaceId] = workspaceScopedSettings(settings);
    }
  }
  return output;
}

function effectiveSettingsForWorkspace(appSettings, workspaceId, fallbackSettings = {}) {
  const normalizedAppSettings = normalizeAppSettings(appSettings || defaultAppSettings());
  const fallback = normalizeWorkspaceLocalSettings(fallbackSettings || {});
  const appSettingsOnly = normalizeSettings({
    appearance: normalizedAppSettings.app.appearance,
    editor: normalizedAppSettings.app.editor,
    tabs: normalizedAppSettings.app.tabs,
    modals: normalizedAppSettings.app.modals,
    updates: normalizedAppSettings.app.updates,
    diagnostics: normalizedAppSettings.app.diagnostics,
    sandbox: normalizedAppSettings.app.sandbox
  });
  return mergeSettingsWithWorkspaceLocalSettings(appSettingsOnly, fallback);
}

function mergeEffectiveSettings(appSettings, workspaceId, effectiveSettings = {}) {
  const normalizedAppSettings = normalizeAppSettings(appSettings || defaultAppSettings());
  const normalizedEffectiveSettings = normalizeSettings(effectiveSettings || {});
  const next = {
    ...normalizedAppSettings,
    app: appScopedSettings(normalizedEffectiveSettings)
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
    this.legacyWorkspaceSettings = {};
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
      const parsed = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'));
      this.legacyWorkspaceSettings = legacyWorkspaceSettingsMap(parsed);
      this.settings = normalizeAppSettings(parsed);
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
    if (previousKey === nextKey || !this.legacyWorkspaceSettings[previousKey]) {
      return base;
    }
    this.legacyWorkspaceSettings[nextKey] = this.legacyWorkspaceSettings[previousKey];
    delete this.legacyWorkspaceSettings[previousKey];
    return base;
  }

  async deleteWorkspaceSettings(workspaceId) {
    const workspaceKey = normalizeWorkspaceSettingsKey(workspaceId);
    const base = this.settings || await this.load();
    delete this.legacyWorkspaceSettings[workspaceKey];
    return base;
  }

  settingsForWorkspace(workspaceId, fallbackSettings = {}) {
    const workspaceKey = normalizeWorkspaceSettingsKey(workspaceId);
    const fallbackLocalSettings = normalizeWorkspaceLocalSettings(fallbackSettings || {});
    const legacyLocalSettings = this.legacyWorkspaceSettings[workspaceKey];
    return effectiveSettingsForWorkspace(
      this.settings || defaultAppSettings(),
      workspaceId,
      workspaceLocalSettingsHasValues(fallbackLocalSettings)
        ? fallbackLocalSettings
        : legacyLocalSettings || fallbackLocalSettings
    );
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

function workspaceLocalSettingsHasValues(settings = {}) {
  const local = normalizeWorkspaceLocalSettings(settings);
  const requestResponseLogging = local.diagnostics?.requestResponseLogging || {};
  if (Object.values(requestResponseLogging).some((value) => value === true)) {
    return true;
  }
  if ((local.sandbox?.fileBindings || []).length || (local.sandbox?.packageCache || []).length) {
    return true;
  }
  const vaultGrants = local.sandbox?.trustedCapabilities?.vaultGrants || {};
  return vaultGrants.workspace === true
    || (vaultGrants.collections || []).length > 0
    || (vaultGrants.requests || []).length > 0
    || (vaultGrants.deniedRequests || []).length > 0;
}

module.exports = {
  APP_SETTINGS_FORMAT,
  APP_SETTINGS_VERSION,
  AppSettingsStore,
  appScopedSettings,
  defaultAppSettings,
  defaultSettingsPath,
  effectiveSettingsForWorkspace,
  legacyWorkspaceSettingsMap,
  mergeEffectiveSettings,
  normalizeAppSettings,
  workspaceLocalSettingsHasValues,
  workspaceScopedSettings
};
