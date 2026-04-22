#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { collectionRunResultToCsv, runCollection } = require('../src/core/collectionRunner');
const { assertExportFormat } = require('../src/core/ipcValidation');
const { setVariable } = require('../src/core/variableScope');
const { WorkspaceStore, looksLikeNativeWorkspace } = require('../src/core/workspaceStore');

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.command !== 'run') {
    printUsage(args.command && args.command !== 'run' ? `Unknown command: ${args.command}` : '');
    return args.help ? 0 : 2;
  }
  if (!args.file) {
    printUsage('Missing required --file path.');
    return 2;
  }

  const { collection, environment } = await loadCollectionInput(args.file, {
    collectionSelector: args.collection,
    environmentSelector: args.environment
  });
  const runEnvironment = applyCliVariables(collection, environment, args);

  const result = await runCollection(collection, runEnvironment, {
    stopOnFailure: args.stopOnFailure === true
  });

  if (args.report) {
    const format = args.format || reportFormatFromPath(args.report);
    assertExportFormat(format);
    const content = format === 'csv' ? collectionRunResultToCsv(result) : JSON.stringify(result, null, 2);
    await fs.mkdir(path.dirname(path.resolve(args.report)), { recursive: true });
    await fs.writeFile(args.report, content);
  }

  printSummary(result);
  return result.passed ? 0 : 1;
}

function parseArgs(argv) {
  const args = {
    command: argv[0],
    file: '',
    collection: '',
    environment: '',
    report: '',
    format: '',
    vars: [],
    collectionVars: [],
    stopOnFailure: false,
    help: false
  };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--stop-on-failure') {
      args.stopOnFailure = true;
    } else if (token === '--file' || token === '-f') {
      args.file = requiredValue(argv, ++index, token);
    } else if (token === '--collection' || token === '-c') {
      args.collection = requiredValue(argv, ++index, token);
    } else if (token === '--environment' || token === '-e') {
      args.environment = requiredValue(argv, ++index, token);
    } else if (token === '--report' || token === '-r') {
      args.report = requiredValue(argv, ++index, token);
    } else if (token === '--format') {
      args.format = requiredValue(argv, ++index, token);
    } else if (token === '--var') {
      args.vars.push(requiredValue(argv, ++index, token));
    } else if (token === '--collection-var') {
      args.collectionVars.push(requiredValue(argv, ++index, token));
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return args;
}

function applyCliVariables(collection, environment, args) {
  collection.variables ||= [];
  for (const assignment of args.collectionVars || []) {
    const [key, value] = parseAssignment(assignment, '--collection-var');
    setVariable(collection.variables, key, value);
  }
  if ((args.vars || []).length) {
    const targetEnvironment = environment || { id: 'cli', name: 'CLI', variables: [] };
    targetEnvironment.variables ||= [];
    for (const assignment of args.vars) {
      const [key, value] = parseAssignment(assignment, '--var');
      setVariable(targetEnvironment.variables, key, value);
    }
    return targetEnvironment;
  }
  return environment;
}

function parseAssignment(value, option) {
  const index = String(value).indexOf('=');
  if (index <= 0) {
    throw new Error(`${option} expects key=value.`);
  }
  return [value.slice(0, index), value.slice(index + 1)];
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

async function loadCollectionInput(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const store = new WorkspaceStore(absolutePath);
  const content = await fs.readFile(absolutePath, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  if (looksLikeNativeWorkspace(parsed)) {
    let workspace;
    try {
      workspace = await store.importWorkspace(absolutePath);
    } catch (error) {
      if (String(error.message || '').includes('encrypted secrets')) {
        throw new Error('CLI cannot decrypt Electron safeStorage/passphrase workspace secrets. Export an exact local test collection or use unencrypted CI variables.');
      }
      throw error;
    }
    const collection = selectByIdOrName(workspace.collections, options.collectionSelector, 'collection');
    const environment = options.environmentSelector
      ? selectByIdOrName(workspace.environments, options.environmentSelector, 'environment')
      : null;
    return { collection, environment };
  }

  return {
    collection: await store.importCollection(absolutePath),
    environment: null
  };
}

function selectByIdOrName(items, selector, label) {
  const values = Array.isArray(items) ? items : [];
  if (!selector) {
    if (!values.length) {
      throw new Error(`No ${label}s are available.`);
    }
    return values[0];
  }
  const selected = values.find((item) => item.id === selector || item.name === selector);
  if (!selected) {
    throw new Error(`No ${label} matched "${selector}".`);
  }
  return selected;
}

function reportFormatFromPath(reportPath) {
  return path.extname(reportPath).toLowerCase() === '.csv' ? 'csv' : 'json';
}

function printSummary(result) {
  const status = result.passed ? 'passed' : 'failed';
  console.log(`PostMeter collection run ${status}.`);
  console.log(`Collection: ${result.collectionName || '-'}`);
  console.log(`Completed requests: ${result.totalRequests}`);
  console.log(`Passed requests: ${result.passedRequests}`);
  console.log(`Failed requests: ${result.failedRequests}`);
}

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(errorMessage);
  }
  console.error('Usage: npm run cli -- run --file <workspace-or-collection> [--collection <id-or-name>] [--environment <id-or-name>] [--var key=value] [--collection-var key=value] [--report <path>] [--format json|csv] [--stop-on-failure]');
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message || String(error));
      process.exitCode = 1;
    });
}

module.exports = {
  loadCollectionInput,
  main,
  parseArgs,
  parseAssignment,
  reportFormatFromPath
};
