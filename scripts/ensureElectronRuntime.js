#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { shouldUseCiNoSandbox } = require('./electronCiSandboxWaiver');

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
  const firstStatus = electronRuntimeStatus(projectRoot, options);
  if (firstStatus.ok) {
    return firstStatus;
  }

  if (options.repair && firstStatus.repairable !== false) {
    const repairResult = repairElectronInstall(projectRoot, options);
    if (!repairResult.ok) {
      return repairResult;
    }
    const repairedStatus = electronRuntimeStatus(projectRoot, options);
    if (repairedStatus.ok) {
      return {
        ...repairedStatus,
        repaired: true
      };
    }
    return electronRuntimeFailure(repairedStatus.reason, projectRoot, {
      detail: `Electron install script completed, but the runtime is still unusable. ${repairedStatus.detail || ''}`.trim(),
      fixLines: repairedStatus.fixLines
    });
  }

  return electronRuntimeFailure(firstStatus.reason, projectRoot, {
    detail: firstStatus.detail,
    fixLines: firstStatus.fixLines
  });
}

function electronRuntimeStatus(projectRoot = PROJECT_ROOT, options = {}) {
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
  const chromeSandboxStatus = linuxChromeSandboxStatus(projectRoot, options);
  if (!chromeSandboxStatus.ok) {
    return chromeSandboxStatus;
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
  const fixLines = options.fixLines || [
    'Fix:',
    '  1. Make sure ELECTRON_SKIP_BINARY_DOWNLOAD is not set.',
    '  2. Run npm ci from the repository root.',
    '  3. If node_modules already exists, run npm rebuild electron or node node_modules/electron/install.js.'
  ];
  const message = ['Electron runtime check failed.'];
  if (options.detail) {
    message.push('', 'Reason:', ...indentLines(options.detail));
  }
  message.push('', ...fixLines, '', 'Checked:', `  ${electronPathFile(projectRoot)}`);
  return {
    ok: false,
    reason,
    message: message.join('\n')
  };
}

function indentLines(value) {
  return String(value).split('\n').map((line) => line ? `  ${line}` : '');
}

function linuxChromeSandboxStatus(projectRoot = PROJECT_ROOT, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'linux') {
    return { ok: true };
  }

  const chromeSandbox = electronChromeSandboxPath(projectRoot);
  if (!fs.existsSync(chromeSandbox)) {
    return {
      ok: false,
      reason: 'missing-linux-chrome-sandbox',
      repairable: false,
      detail: `Missing Linux Electron sandbox helper: ${chromeSandbox}`,
      fixLines: [
        'Fix:',
        '  Run npm rebuild electron from the repository root, then run npm start again.'
      ]
    };
  }

  let stat;
  try {
    stat = (options.statSync || fs.statSync)(chromeSandbox);
  } catch (error) {
    return {
      ok: false,
      reason: 'unreadable-linux-chrome-sandbox',
      repairable: false,
      detail: `Unable to inspect Linux Electron sandbox helper ${chromeSandbox}: ${error.message}`,
      fixLines: linuxChromeSandboxFixLines(chromeSandbox)
    };
  }

  const mode = stat.mode & 0o7777;
  if (stat.uid !== 0 || mode !== 0o4755) {
    if (shouldUseCiNoSandbox(options.env || process.env, platform)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'misconfigured-linux-chrome-sandbox',
      repairable: false,
      detail: [
        'Linux Electron sandbox helper is misconfigured.',
        `Path: ${chromeSandbox}`,
        'Expected: owner uid 0, mode 4755',
        `Actual: owner uid ${stat.uid}, mode ${formatMode(mode)}`
      ].join('\n'),
      fixLines: linuxChromeSandboxFixLines(chromeSandbox)
    };
  }

  return { ok: true };
}

function linuxChromeSandboxFixLines(chromeSandbox) {
  return [
    'Fix:',
    '  Copy and run this command once, then run npm start again:',
    '',
    `  ${linuxChromeSandboxRepairCommand(chromeSandbox)}`
  ];
}

function linuxChromeSandboxRepairCommand(chromeSandbox) {
  const quotedPath = shellQuote(chromeSandbox);
  return `sudo chown root:root ${quotedPath} && sudo chmod 4755 ${quotedPath}`;
}

function formatMode(mode) {
  return mode.toString(8).padStart(4, '0');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

function electronChromeSandboxPath(projectRoot = PROJECT_ROOT) {
  return path.join(electronPackageDirectory(projectRoot), 'dist', 'chrome-sandbox');
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultElectronExecutableName,
  electronChromeSandboxPath,
  electronExecutablePathFromMetadata,
  electronPackageDirectory,
  electronPathFile,
  electronRuntimeFailure,
  electronRuntimeStatus,
  ensureElectronRuntime,
  linuxChromeSandboxRepairCommand,
  linuxChromeSandboxStatus,
  repairElectronInstall
};
