const { fetchSandboxPackageForReview } = require('../src/core/sandboxPackageFetcher');

function registerSandboxPackageIpc(options = {}) {
  const {
    fetchPackageForReview = fetchSandboxPackageForReview,
    ipcMain,
    recordDiagnosticEvent = async () => {}
  } = options;

  ipcMain.handle('sandbox-package:fetch', async (_event, specifier, fetchOptions = {}) => {
    const normalizedSpecifier = String(specifier || '').trim();
    const options = normalizeFetchOptions(fetchOptions);
    try {
      const result = await fetchPackageForReview(normalizedSpecifier, options);
      const normalized = normalizePackageReviewResult(result);
      await recordDiagnosticEvent({
        type: 'sandbox.package.fetch.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          registry: normalized.registry || packageSpecifierKind(normalizedSpecifier),
          fileCount: normalized.files.length,
          sourceBytes: Buffer.byteLength(normalized.source || '', 'utf8')
        }
      });
      return normalized;
    } catch (error) {
      await recordDiagnosticEvent({
        type: 'sandbox.package.fetch.failed',
        level: 'warn',
        outcome: 'failed',
        failureCode: 'sandbox_package_fetch_failed',
        fields: {
          registry: packageSpecifierKind(normalizedSpecifier),
          error: error?.message || String(error)
        }
      });
      throw error;
    }
  });
}

function packageSpecifierKind(specifier) {
  const value = String(specifier || '').trim().toLowerCase();
  if (value.startsWith('npm:')) {
    return 'npm';
  }
  if (value.startsWith('jsr:')) {
    return 'jsr';
  }
  if (value.startsWith('@')) {
    return 'team';
  }
  return 'unknown';
}

function normalizeFetchOptions(value = {}) {
  const options = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    sourceUrl: options.sourceUrl == null ? '' : String(options.sourceUrl).trim().slice(0, 2048)
  };
}

function normalizePackageReviewResult(value = {}) {
  if (!value || typeof value !== 'object') {
    throw new Error('Package fetch returned an invalid review payload.');
  }
  const source = String(value.source || '');
  const files = normalizeReviewFiles(value.files);
  if (!source.trim() || Buffer.byteLength(source, 'utf8') > 128 * 1024) {
    throw new Error('Package fetch returned source outside the reviewed package size policy.');
  }
  if (files.reduce((total, file) => total + Buffer.byteLength(file.source, 'utf8'), 0) > 128 * 1024) {
    throw new Error('Package fetch returned files outside the reviewed package size policy.');
  }
  const integrity = String(value.integrity || '').trim();
  if (!integrity.startsWith('sha256-')) {
    throw new Error('Package fetch returned invalid integrity metadata.');
  }
  return {
    dependencyAliases: normalizeDependencyAliases(value.dependencyAliases || value.dependencyMap),
    dependencies: Array.isArray(value.dependencies) ? value.dependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 32) : [],
    entrypoint: value.entrypoint == null ? '' : String(value.entrypoint).slice(0, 256),
    fetchedAt: value.fetchedAt == null ? '' : String(value.fetchedAt).slice(0, 256),
    files,
    integrity,
    maxExportKeys: Number.isFinite(Number(value.maxExportKeys)) ? Number(value.maxExportKeys) : undefined,
    packageDependencies: Array.isArray(value.packageDependencies) ? value.packageDependencies.map((dependency) => String(dependency || '').trim()).filter(Boolean).slice(0, 64) : [],
    packageIntegrity: value.packageIntegrity == null ? '' : String(value.packageIntegrity).slice(0, 512),
    packageJson: normalizePackageJson(value.packageJson || value.package || value.manifest),
    packageName: value.packageName == null ? '' : String(value.packageName).slice(0, 256),
    packageVersion: value.packageVersion == null ? '' : String(value.packageVersion).slice(0, 128),
    registry: value.registry == null ? '' : String(value.registry).slice(0, 32),
    source,
    sourceUrl: value.sourceUrl == null ? '' : String(value.sourceUrl).slice(0, 2048),
    specifier: String(value.specifier || '').trim()
  };
}

function normalizeReviewFiles(files) {
  const output = [];
  const entries = Array.isArray(files)
    ? files.map((file) => [
      file?.path ?? file?.name ?? file?.filename,
      file?.source ?? file?.code ?? file?.text
    ])
    : Object.entries(files || {});
  for (const [rawPath, rawSource] of entries.slice(0, 128)) {
    const filePath = normalizePackageFilePath(rawPath);
    if (!filePath || output.some((file) => file.path === filePath)) {
      continue;
    }
    output.push({
      path: filePath,
      source: String(rawSource ?? '')
    });
  }
  return output;
}

function normalizePackageFilePath(filePath) {
  let value = String(filePath || '').replace(/\\/g, '/').trim();
  while (value.startsWith('./')) {
    value = value.slice(2);
  }
  value = value.replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || parts.some((part) => part === '.' || part.includes('\0'))) {
    return '';
  }
  return parts.join('/').slice(0, 512);
}

function normalizePackageJson(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    return {};
  }
  try {
    const text = JSON.stringify(packageJson);
    if (Buffer.byteLength(text || '', 'utf8') > 16 * 1024) {
      return {};
    }
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalizeDependencyAliases(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).slice(0, 32).reduce((output, [key, target]) => {
    const alias = String(key || '').trim();
    const specifier = String(target || '').trim();
    if (alias && specifier) {
      output[alias] = specifier;
    }
    return output;
  }, {});
}

module.exports = {
  registerSandboxPackageIpc
};
