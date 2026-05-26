const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fileBindingStatusRows,
  mainOwnedFileBindingsForWorkspace,
  mergeRendererFileBindingMetadataWithMainPaths,
  resolveFileAttachmentBinding,
  sanitizeSandboxFileBindingsForRenderer
} = require('../../src/core/http/fileAttachmentBindings');

test('file binding status rows include collection runner and performance Postman body file references', () => {
  const workspace = {
    collections: [{
      requests: [{
        postmanBody: {
          mode: 'formdata',
          formdata: [
            { key: 'upload', type: 'file', src: 'fixtures/upload.txt', contentType: 'text/plain' },
            { key: 'disabled', type: 'file', src: 'fixtures/disabled.txt', disabled: true },
            { key: 'message', value: 'text', type: 'text' }
          ]
        }
      }]
    }],
    runners: [{
      requests: [{
        postmanBody: {
          mode: 'binary',
          binary: { src: 'fixtures/runner.bin', contentType: 'application/octet-stream' }
        }
      }]
    }],
    performanceTests: [{
      request: {
        postmanBody: {
          mode: 'file',
          file: { src: 'fixtures/performance.bin', contentType: 'application/octet-stream' }
        }
      }
    }],
    settings: {
      sandbox: {
        fileBindings: [
          { source: 'fixtures/runner.bin', bound: true, enabled: true },
          { source: 'fixtures/performance.bin', bound: true, enabled: false }
        ]
      }
    },
    localsettings: {
      sandbox: {
        fileBindings: [
          { source: 'fixtures/runner.bin', localPath: '/tmp/runner.bin', enabled: true },
          { source: 'fixtures/performance.bin', localPath: '/tmp/performance.bin', enabled: false }
        ]
      }
    }
  };

  const rows = fileBindingStatusRows(workspace);
  assert.deepEqual(rows.map((row) => row.source).sort(), [
    'fixtures/performance.bin',
    'fixtures/runner.bin',
    'fixtures/upload.txt'
  ]);
  assert.equal(rows.find((row) => row.source === 'fixtures/runner.bin').bound, true);
  assert.equal(rows.find((row) => row.source === 'fixtures/performance.bin').bound, false);
  assert.equal(rows.find((row) => row.source === 'fixtures/upload.txt').mode, 'formdata');
});

test('renderer file binding metadata cannot supply local paths as authority', () => {
  const rendererBindings = [{
    source: 'fixtures/upload.txt',
    localPath: '/etc/passwd',
    fileName: 'upload.txt',
    mode: 'formdata',
    bound: true
  }];
  const publicBindings = sanitizeSandboxFileBindingsForRenderer(rendererBindings);
  assert.equal(publicBindings[0].localPath, undefined);
  assert.equal(publicBindings[0].bound, true);

  const mergedWithoutMainPath = mergeRendererFileBindingMetadataWithMainPaths(rendererBindings, []);
  assert.throws(
    () => resolveFileAttachmentBinding({ source: 'fixtures/upload.txt' }, mergedWithoutMainPath),
    /File attachment binding is required/
  );

  const mergedWithMainPath = mergeRendererFileBindingMetadataWithMainPaths(rendererBindings, [{
    source: 'fixtures/upload.txt',
    localPath: '/safe/main-owned/upload.txt'
  }]);
  assert.equal(resolveFileAttachmentBinding({ source: 'fixtures/upload.txt' }, mergedWithMainPath).localPath, '/safe/main-owned/upload.txt');
});

test('main-owned file bindings ignore renderer-visible settings paths', () => {
  const bindings = mainOwnedFileBindingsForWorkspace({
    settings: {
      sandbox: {
        fileBindings: [{ source: 'fixtures/upload.txt', localPath: '/etc/passwd', bound: true }]
      }
    },
    localsettings: {
      sandbox: { fileBindings: [] }
    }
  });

  assert.throws(
    () => resolveFileAttachmentBinding({ source: 'fixtures/upload.txt' }, bindings),
    /File attachment binding is required/
  );
});
