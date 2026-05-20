const { defineLazyModule } = require('../lazyExport');

const modules = {};

defineLazyModule(modules, 'auth', () => require('../../http/auth'));
defineLazyModule(modules, 'authModel', () => require('../../http/authModel'));
defineLazyModule(modules, 'authRefresh', () => require('../../http/authRefresh'));
defineLazyModule(modules, 'cookieJar', () => require('../../http/cookieJar'));
defineLazyModule(modules, 'fileAttachmentBindings', () => require('../../http/fileAttachmentBindings'));
defineLazyModule(modules, 'grpcClient', () => require('../../http/grpcClient'));
defineLazyModule(modules, 'httpClient', () => require('../../http/httpClient'));
defineLazyModule(modules, 'pfxCertificate', () => require('../../http/pfxCertificate'));
defineLazyModule(modules, 'requestSettings', () => require('../../http/requestSettings'));
defineLazyModule(modules, 'tlsSettings', () => require('../../http/tlsSettings'));

module.exports = modules;
