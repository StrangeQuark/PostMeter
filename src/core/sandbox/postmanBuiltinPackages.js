const crypto = require('node:crypto');
const vm = require('node:vm');
const {
  POSTMAN_SANDBOX_BOOTCODE_SHA256,
  POSTMAN_SANDBOX_BOOTCODE_SOURCE_VERSION,
  getPostmanSandboxBootcode
} = require('./postmanSandboxBootcodeBundle');

const POSTMAN_SANDBOX_BUILTIN_PACKAGE_VERSIONS = Object.freeze({
  ajv: '6.12.5',
  assert: '2.0.0',
  backbone: '1.6.0',
  buffer: '6.0.3',
  chai: '4.4.1',
  cheerio: '0.22.0',
  'crypto-js': '3.3.0',
  'csv-parse/lib/sync': '1.2.4',
  events: 'browserify-events',
  json: '0.3.1',
  lodash: '4.17.21',
  moment: '2.30.1',
  path: 'browserify-path',
  'postman-collection': '5.2.0',
  punycode: 'browserify-punycode',
  querystring: 'browserify-querystring',
  stream: 'browserify-stream',
  'string-decoder': 'browserify-string_decoder',
  timers: 'browserify-timers',
  tv4: '1.3.0',
  url: 'browserify-url',
  util: 'browserify-util',
  uuid: 'postman-sandbox-vendor',
  xml2js: '0.6.2'
});

const POSTMAN_SANDBOX_BUILTIN_REQUIRE_SPECIFIERS = Object.freeze({
  ajv: 'ajv',
  assert: 'assert',
  backbone: 'backbone',
  buffer: 'buffer',
  chai: 'chai',
  cheerio: 'cheerio',
  'crypto-js': 'crypto-js',
  'csv-parse/lib/sync': 'csv-parse/lib/sync',
  events: 'events',
  json: 'json',
  lodash: 'lodash',
  moment: 'moment',
  path: 'path',
  'postman-collection': 'postman-collection',
  punycode: 'punycode',
  querystring: 'querystring',
  stream: 'stream',
  'string-decoder': 'string_decoder',
  timers: 'timers',
  tv4: 'tv4',
  url: 'url',
  util: 'util',
  uuid: 'uuid',
  xml2js: 'xml2js'
});

const POSTMAN_SANDBOX_BUILTIN_PACKAGE_NAMES = Object.freeze(Object.keys(POSTMAN_SANDBOX_BUILTIN_REQUIRE_SPECIFIERS).sort());
const TEMPORARY_BOOTCODE_GLOBALS = Object.freeze(['require', 'File', '_nodeRequires', 'bridge']);

function installPostmanBuiltinPackageRuntime(registry) {
  if (!registry || !registry.vmContext) {
    throw new Error('Postman bundled packages cannot load before the script context is ready.');
  }
  if (typeof registry.postmanBuiltinRequire === 'function') {
    return registry.postmanBuiltinRequire;
  }

  const vmContext = registry.vmContext;
  const restore = new Map();
  for (const name of TEMPORARY_BOOTCODE_GLOBALS) {
    restore.set(name, {
      exists: Object.prototype.hasOwnProperty.call(vmContext, name),
      value: vmContext[name]
    });
  }

  try {
    // The Browserify prelude falls back to an ambient require when one exists.
    // Hide PostMeter's safe package require during installation so the bundle
    // cannot capture it as a parent resolver, then restore it immediately.
    vmContext.require = undefined;
    if (registry.fileFacade && vmContext.File === undefined) {
      vmContext.File = registry.fileFacade;
    }
    vm.runInContext(getPostmanSandboxBootcode(), vmContext, {
      filename: `postman-sandbox-${POSTMAN_SANDBOX_BOOTCODE_SOURCE_VERSION}:builtins.js`,
      timeout: Math.max(1, Math.min(10_000, Number(registry.timeoutMillis || 10_000)))
    });
    if (typeof vmContext.require !== 'function') {
      throw new Error('Postman bundled package resolver was not installed.');
    }
    registry.postmanBuiltinRequire = vmContext.require;
  } finally {
    for (const [name, entry] of restore) {
      if (entry.exists) {
        vmContext[name] = entry.value;
      } else {
        try {
          delete vmContext[name];
        } catch {
          vmContext[name] = undefined;
        }
      }
    }
    try {
      vm.runInContext('delete this.globalThis; delete this.WebAssembly; delete this._nodeRequires; delete this.bridge;', vmContext, { timeout: 50 });
    } catch {
      // The normal runtime absent-global pass also runs before package loading;
      // this cleanup is defense in depth for the temporary bootcode install.
    }
  }

  return registry.postmanBuiltinRequire;
}

function loadPostmanBuiltinPackage(registry, packageName) {
  const specifier = POSTMAN_SANDBOX_BUILTIN_REQUIRE_SPECIFIERS[packageName];
  if (!specifier) {
    throw new Error(`Postman bundled package "${packageName}" is not available.`);
  }
  const builtinRequire = installPostmanBuiltinPackageRuntime(registry);
  const bridgeName = `__postmeterPostmanBuiltinRequire_${crypto.randomBytes(8).toString('hex')}`;
  const previousBridge = registry.vmContext[bridgeName];
  const hadFile = Object.prototype.hasOwnProperty.call(registry.vmContext, 'File');
  const previousFile = registry.vmContext.File;
  registry.vmContext[bridgeName] = builtinRequire;
  if (registry.fileFacade && registry.vmContext.File === undefined) {
    registry.vmContext.File = registry.fileFacade;
  }
  try {
    return vm.runInContext(`this[${JSON.stringify(bridgeName)}](${JSON.stringify(specifier)})`, registry.vmContext, {
      filename: `postman-sandbox-${POSTMAN_SANDBOX_BOOTCODE_SOURCE_VERSION}:require:${packageName}`,
      timeout: Math.max(1, Math.min(10_000, Number(registry.timeoutMillis || 10_000)))
    });
  } finally {
    if (hadFile) {
      registry.vmContext.File = previousFile;
    } else {
      try {
        delete registry.vmContext.File;
      } catch {
        registry.vmContext.File = undefined;
      }
    }
    if (previousBridge === undefined) {
      try {
        delete registry.vmContext[bridgeName];
      } catch {
        registry.vmContext[bridgeName] = undefined;
      }
    } else {
      registry.vmContext[bridgeName] = previousBridge;
    }
  }
}

module.exports = {
  POSTMAN_SANDBOX_BOOTCODE_SHA256,
  POSTMAN_SANDBOX_BOOTCODE_SOURCE_VERSION,
  POSTMAN_SANDBOX_BUILTIN_PACKAGE_NAMES,
  POSTMAN_SANDBOX_BUILTIN_PACKAGE_VERSIONS,
  loadPostmanBuiltinPackage
};
