const test = require('node:test');
const assert = require('node:assert/strict');

const { fileBindingStatusRows } = require('../../src/core/http/fileAttachmentBindings');

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
