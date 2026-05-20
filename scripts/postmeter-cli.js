#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { collectionRunResultToCsv, runCollection } = require('../src/core/runtime/collectionRunner');
const { assertExportFormat } = require('../src/core/contracts/ipcValidation');
const { resultHtmlReportToHtml } = require('../src/core/import-export/resultHtmlReport');
const { setVariable } = require('../src/core/workspace/variableScope');
const { WorkspaceStore, looksLikeNativeWorkspace, migrate, normalizeWorkspace } = require('../src/core/workspace/workspaceStore');

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

  const { collection, environment, globals, settings } = await loadCollectionInput(args.file, {
    collectionSelector: args.collection,
    environmentSelector: args.environment
  });
  const runEnvironment = applyCliVariables(collection, environment, args);
  const tlsSettings = cliTlsSettings(args, settings);

  const result = await runCollection(collection, runEnvironment, {
    globals,
    scriptOptions: {
      requireNodePermission: cliShouldRequireNodePermission()
    },
    tlsSettings,
    stopOnFailure: args.stopOnFailure === true
  });

  if (args.report) {
    const format = args.format || reportFormatFromPath(args.report);
    assertExportFormat(format);
    const content = format === 'csv'
      ? collectionRunResultToCsv(result)
      : format === 'html'
        ? await resultHtmlReportToHtml({ kind: 'runner', result })
        : JSON.stringify(result, null, 2);
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
    caCertificatePath: '',
    clientCertificate: {},
    insecure: false,
    stopOnFailure: false,
    help: false
  };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--stop-on-failure') {
      args.stopOnFailure = true;
    } else if (token === '--insecure' || token === '-k') {
      args.insecure = true;
    } else if (token === '--cacert' || token === '--ssl-extra-ca-certs') {
      args.caCertificatePath = requiredValue(argv, ++index, token);
    } else if (token === '--client-cert-host') {
      args.clientCertificate.host = requiredValue(argv, ++index, token);
    } else if (token === '--client-cert-port') {
      args.clientCertificate.port = requiredValue(argv, ++index, token);
    } else if (token === '--client-cert' || token === '--ssl-client-cert') {
      args.clientCertificate.certPath = requiredValue(argv, ++index, token);
    } else if (token === '--client-key' || token === '--ssl-client-key') {
      args.clientCertificate.keyPath = requiredValue(argv, ++index, token);
    } else if (token === '--client-pfx') {
      args.clientCertificate.pfxPath = requiredValue(argv, ++index, token);
    } else if (token === '--client-passphrase' || token === '--ssl-client-passphrase') {
      args.clientCertificate.passphrase = requiredValue(argv, ++index, token);
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

function cliTlsSettings(args, workspaceSettings = {}) {
  const base = workspaceSettings?.request && typeof workspaceSettings.request === 'object'
    ? JSON.parse(JSON.stringify(workspaceSettings.request))
    : {};
  if (args.insecure === true) {
    base.sslCertificateVerification = false;
  }
  if (args.caCertificatePath) {
    base.caCertificatePath = args.caCertificatePath;
  }
  const cert = args.clientCertificate || {};
  if (cert.certPath || cert.keyPath || cert.pfxPath) {
    base.clientCertificates = [
      ...(Array.isArray(base.clientCertificates) ? base.clientCertificates : []),
      {
        id: 'cli-client-certificate',
        name: 'CLI Client Certificate',
        enabled: true,
        host: cert.host || '*',
        port: cert.port || '',
        certPath: cert.certPath || '',
        keyPath: cert.keyPath || '',
        pfxPath: cert.pfxPath || '',
        passphrase: cert.passphrase || ''
      }
    ];
  }
  return { request: base };
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
    migrate(parsed);
    const workspace = normalizeWorkspace(parsed);
    const collection = selectByIdOrName(workspace.collections, options.collectionSelector, 'collection');
    const environment = options.environmentSelector
      ? selectByIdOrName(workspace.environments, options.environmentSelector, 'environment')
      : null;
    return { collection, environment, globals: workspace.globals || [], settings: workspace.settings || workspace.localsettings || {} };
  }

  return {
    collection: await store.importCollection(absolutePath),
    environment: null,
    globals: [],
    settings: {}
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
  const extension = path.extname(reportPath).toLowerCase();
  if (extension === '.csv') {
    return 'csv';
  }
  if (extension === '.html' || extension === '.htm') {
    return 'html';
  }
  return 'json';
}

function printSummary(result) {
  const status = result.passed ? 'passed' : 'failed';
  console.log(`PostMeter collection run ${status}.`);
  console.log(`Collection: ${result.collectionName || '-'}`);
  console.log(`Completed requests: ${result.totalRequests}`);
  console.log(`Passed requests: ${result.passedRequests}`);
  console.log(`Failed requests: ${result.failedRequests}`);
}

function cliShouldRequireNodePermission() {
  const major = Number(String(process.versions.node || '').split('.')[0]);
  return Number.isFinite(major) && major >= 22;
}

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(errorMessage);
  }
  console.error('Usage: npm run cli -- run --file <workspace-or-collection> [--collection <id-or-name>] [--environment <id-or-name>] [--var key=value] [--collection-var key=value] [--report <path>] [--format json|csv|html] [--stop-on-failure] [--insecure|-k] [--cacert|--ssl-extra-ca-certs <pem>] [--client-cert-host <host>] [--client-cert-port <port>] [--client-cert|--ssl-client-cert <crt>] [--client-key|--ssl-client-key <key>] [--client-pfx <p12>] [--client-passphrase|--ssl-client-passphrase <value>]');
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
  cliShouldRequireNodePermission,
  cliTlsSettings,
  main,
  parseArgs,
  parseAssignment,
  reportFormatFromPath
};
