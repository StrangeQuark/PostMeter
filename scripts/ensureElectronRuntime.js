#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');

function main() {
  const repair = process.argv.includes('--repair');
  const result = ensureElectronRuntime({
    repair,
    stderr: console.error,
    stdout: console.log,
    stdio: 'inherit'
  });
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  if (result.repaired) {
    console.log(`Electron runtime repaired: ${path.relative(PROJECT_ROOT, result.executable)}`);
  }
}

function ensureElectronRuntime(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const firstStatus = electronRuntimeStatus(projectRoot);
  if (firstStatus.ok) {
    return firstStatus;
  }

  if (options.repair) {
    const repairResult = repairElectronInstall(projectRoot, options);
    if (!repairResult.ok) {
      return repairResult;
    }
    const repairedStatus = electronRuntimeStatus(projectRoot);
    if (repairedStatus.ok) {
      return {
        ...repairedStatus,
        repaired: true
      };
    }
    return electronRuntimeFailure(repairedStatus.reason, projectRoot, {
      detail: `Electron install script completed, but the runtime is still unusable. ${repairedStatus.detail || ''}`.trim()
    });
  }

  return electronRuntimeFailure(firstStatus.reason, projectRoot, {
    detail: firstStatus.detail
  });
}

function electronRuntimeStatus(projectRoot = PROJECT_ROOT) {
  const electronDir = electronPackageDirectory(projectRoot);
  const pathFile = electronPathFile(projectRoot);
  if (!fs.existsSync(electronDir)) {
    return {
      ok: false,
      reason: 'missing-package',
      detail: `Missing Electron package directory: ${electronDir}`
    };
  }
  if (!fs.existsSync(pathFile)) {
    return {
      ok: false,
      reason: 'missing-path-metadata',
      detail: `Missing Electron runtime metadata: ${pathFile}`
    };
  }

  let relativeExecutable = '';
  try {
    relativeExecutable = fs.readFileSync(pathFile, 'utf8').trim();
  } catch (error) {
    return {
      ok: false,
      reason: 'unreadable-path-metadata',
      detail: `Unable to read ${pathFile}: ${error.message}`
    };
  }
  if (!relativeExecutable) {
    return {
      ok: false,
      reason: 'empty-path-metadata',
      detail: `Electron runtime metadata is empty: ${pathFile}`
    };
  }

  const executable = electronExecutablePathFromMetadata(electronDir, relativeExecutable, process.env);
  if (!fs.existsSync(executable)) {
    return {
      ok: false,
      reason: 'missing-executable',
      detail: `Electron runtime executable is missing: ${executable}`
    };
  }
  return {
    ok: true,
    executable,
    pathFile,
    repaired: false
  };
}

function repairElectronInstall(projectRoot = PROJECT_ROOT, options = {}) {
  const installScript = path.join(electronPackageDirectory(projectRoot), 'install.js');
  if (!fs.existsSync(installScript)) {
    return electronRuntimeFailure('missing-install-script', projectRoot, {
      detail: `Missing Electron install script: ${installScript}`
    });
  }
  const spawn = options.spawnSync || spawnSync;
  const result = spawn(process.execPath, [installScript], {
    cwd: projectRoot,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.stdio ? undefined : 'utf8'
  });
  if (result.error) {
    return electronRuntimeFailure('install-script-error', projectRoot, {
      detail: result.error.message
    });
  }
  if ((result.status ?? 1) !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    return electronRuntimeFailure('install-script-failed', projectRoot, {
      detail: output || `Electron install script exited with ${result.status ?? 1}.`
    });
  }
  return { ok: true };
}

function electronRuntimeFailure(reason, projectRoot = PROJECT_ROOT, options = {}) {
  const detail = options.detail ? `\n\nDetail: ${options.detail}` : '';
  return {
    ok: false,
    reason,
    message: [
      'Electron is not installed correctly for this workspace.',
      detail,
      '',
      'Fix:',
      '  1. Make sure ELECTRON_SKIP_BINARY_DOWNLOAD is not set.',
      '  2. Run npm ci from the repository root.',
      '  3. If node_modules already exists, run npm rebuild electron or node node_modules/electron/install.js.',
      '',
      `Checked: ${electronPathFile(projectRoot)}`
    ].filter(Boolean).join('\n')
  };
}

function electronExecutablePathFromMetadata(electronDir, executablePath, env = process.env) {
  if (env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || defaultElectronExecutableName());
  }
  if (path.isAbsolute(executablePath)) {
    return executablePath;
  }
  return path.join(electronDir, 'dist', executablePath);
}

function defaultElectronExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'electron.exe' : 'electron';
}

function electronPackageDirectory(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, 'node_modules', 'electron');
}

function electronPathFile(projectRoot = PROJECT_ROOT) {
  return path.join(electronPackageDirectory(projectRoot), 'path.txt');
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultElectronExecutableName,
  electronExecutablePathFromMetadata,
  electronPackageDirectory,
  electronPathFile,
  electronRuntimeFailure,
  electronRuntimeStatus,
  ensureElectronRuntime,
  repairElectronInstall
};
