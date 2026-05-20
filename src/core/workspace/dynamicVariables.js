const crypto = require('node:crypto');

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX = '0123456789abcdef';

const VALUE_SETS = Object.freeze({
  colors: ['red', 'green', 'blue', 'yellow', 'purple', 'fuchsia', 'grey', 'black', 'white', 'orange'],
  abbreviations: ['SQL', 'JSON', 'HTTP', 'API', 'TLS', 'PCI', 'XML', 'CSV'],
  locales: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'sr', 'si', 'ny'],
  firstNames: ['Ada', 'Ethan', 'Chandler', 'Megane', 'Connie', 'Sylvan', 'Jonathon', 'Iva'],
  lastNames: ['Lovelace', 'Schaden', 'Schneider', 'Willms', 'Runolfsdottir', 'Fay', 'Kunze', 'Kovacek'],
  namePrefixes: ['Dr.', 'Ms.', 'Mr.', 'Mx.', 'Prof.'],
  nameSuffixes: ['I', 'II', 'III', 'MD', 'DDS', 'PhD'],
  jobAreas: ['Mobility', 'Intranet', 'Configuration', 'Security', 'Integration', 'Data'],
  jobDescriptors: ['Forward', 'Corporate', 'Senior', 'Dynamic', 'Principal', 'Global'],
  jobTypes: ['Supervisor', 'Manager', 'Coordinator', 'Engineer', 'Analyst', 'Designer'],
  cities: ['Spinkahaven', 'Korbinburgh', 'Lefflerport', 'North Ada', 'Lake Grace'],
  streets: ['Kuhic Island', 'General Street', 'Kendrick Springs', 'Protocol Avenue'],
  countries: ['Austria', 'Kazakhstan', 'Canada', 'Japan', 'Brazil', 'Kenya'],
  countryCodes: ['AT', 'KZ', 'CA', 'JP', 'BR', 'KE', 'US', 'GB'],
  currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CDF', 'GNF', 'ZMK'],
  currencyNames: ['US Dollar', 'Euro', 'Pound Sterling', 'Yen', 'CFP Franc', 'Cordoba Oro'],
  currencySymbols: ['$', 'EUR', 'GBP', 'JPY'],
  transactionTypes: ['invoice', 'payment', 'deposit', 'withdrawal', 'transfer'],
  companySuffixes: ['Inc', 'LLC', 'Group', 'Ltd', 'Systems'],
  databaseColumns: ['id', 'name', 'updatedAt', 'token', 'group', 'createdAt'],
  databaseTypes: ['tinyint', 'text', 'varchar', 'json', 'timestamp'],
  databaseCollations: ['utf8_general_ci', 'utf8mb4_unicode_ci', 'cp1250_bin', 'cp1250_general_ci'],
  databaseEngines: ['MyISAM', 'InnoDB', 'Memory', 'SQLite'],
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'],
  domainSuffixes: ['com', 'net', 'org', 'biz', 'info', 'name', 'example'],
  fileTypes: ['model', 'application', 'video', 'audio', 'image', 'text'],
  fileExtensions: ['war', 'book', 'fsc', 'gdoc', 'mpg4', 'cpio'],
  commonFileTypes: ['application', 'audio', 'image', 'text', 'video'],
  commonFileExtensions: ['png', 'jpg', 'wav', 'txt', 'json', 'csv', 'm2v'],
  mimeTypes: ['application/json', 'text/plain', 'image/png', 'audio/wav', 'video/mp4'],
  products: ['Towels', 'Pizza', 'Pants', 'Keyboard', 'Bottle', 'Chair'],
  productAdjectives: ['Unbranded', 'Incredible', 'Tasty', 'Practical', 'Refined', 'Handmade'],
  productMaterials: ['Steel', 'Plastic', 'Frozen', 'Concrete', 'Rubber', 'Cotton'],
  departments: ['Tools', 'Movies', 'Electronics', 'Garden', 'Games', 'Books'],
  nouns: ['matrix', 'bus', 'bandwidth', 'monitor', 'program', 'array'],
  verbs: ['parse', 'quantify', 'navigate', 'generate', 'compile', 'index'],
  ingverbs: ['synthesizing', 'navigating', 'backing up', 'parsing', 'generating'],
  adjectives: ['auxiliary', 'multi-byte', 'back-end', 'virtual', 'wireless', 'primary'],
  words: ['withdrawal', 'infrastructures', 'IB', 'quality', 'springs', 'copying'],
  lorem: ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'vel', 'repellat', 'nobis', 'molestias', 'consequuntur']
});

const DYNAMIC_VARIABLE_NAMES = Object.freeze([
  '$guid', '$timestamp', '$isoTimestamp', '$randomUUID',
  '$randomAlphaNumeric', '$randomBoolean', '$randomInt', '$randomColor', '$randomHexColor', '$randomAbbreviation',
  '$randomIP', '$randomIPV6', '$randomIPv6', '$randomMACAddress', '$randomPassword', '$randomLocale', '$randomUserAgent', '$randomProtocol', '$randomSemver',
  '$randomFirstName', '$randomLastName', '$randomFullName', '$randomNamePrefix', '$randomNameSuffix',
  '$randomJobArea', '$randomJobDescriptor', '$randomJobTitle', '$randomJobType',
  '$randomPhoneNumber', '$randomPhoneNumberExt', '$randomCity', '$randomStreetName', '$randomStreetAddress', '$randomCountry', '$randomCountryCode', '$randomLatitude', '$randomLongitude',
  '$randomAvatarImage', '$randomImageUrl', '$randomAbstractImage', '$randomAnimalsImage', '$randomBusinessImage', '$randomCatsImage', '$randomCityImage', '$randomFoodImage', '$randomNightlifeImage', '$randomFashionImage', '$randomPeopleImage', '$randomNatureImage', '$randomSportsImage', '$randomTransportImage', '$randomImageDataUri',
  '$randomBankAccount', '$randomBankAccountName', '$randomCreditCardMask', '$randomBankAccountBic', '$randomBankAccountIban', '$randomTransactionType', '$randomCurrencyCode', '$randomCurrencyName', '$randomCurrencySymbol', '$randomBitcoin',
  '$randomCompanyName', '$randomCompanySuffix', '$randomBs', '$randomBsAdjective', '$randomBsBuzz', '$randomBsNoun',
  '$randomCatchPhrase', '$randomCatchPhraseAdjective', '$randomCatchPhraseDescriptor', '$randomCatchPhraseNoun',
  '$randomDatabaseColumn', '$randomDatabaseType', '$randomDatabaseCollation', '$randomDatabaseEngine',
  '$randomDateFuture', '$randomDatePast', '$randomDateRecent', '$randomWeekday', '$randomMonth',
  '$randomDomainName', '$randomDomainSuffix', '$randomDomainWord', '$randomEmail', '$randomExampleEmail', '$randomUserName', '$randomUrl',
  '$randomFileName', '$randomFileType', '$randomFileExt', '$randomCommonFileName', '$randomCommonFileType', '$randomCommonFileExt', '$randomFilePath', '$randomDirectoryPath', '$randomMimeType',
  '$randomPrice', '$randomProduct', '$randomProductAdjective', '$randomProductMaterial', '$randomProductName', '$randomDepartment',
  '$randomNoun', '$randomVerb', '$randomIngverb', '$randomAdjective', '$randomWord', '$randomWords', '$randomPhrase',
  '$randomLoremWord', '$randomLoremWords', '$randomLoremSentence', '$randomLoremSentences', '$randomLoremParagraph', '$randomLoremParagraphs', '$randomLoremText', '$randomLoremSlug', '$randomLoremLines'
]);

const DYNAMIC_VARIABLE_SET = new Set(DYNAMIC_VARIABLE_NAMES);

function isDynamicVariableName(name) {
  return DYNAMIC_VARIABLE_SET.has(String(name || ''));
}

function resolveDynamicVariable(name, options = {}) {
  const key = String(name || '');
  const now = options.now instanceof Date ? options.now : new Date();
  if (!isDynamicVariableName(key)) {
    return undefined;
  }
  switch (key) {
    case '$guid':
    case '$randomUUID':
      return crypto.randomUUID();
    case '$timestamp':
      return String(Math.floor(now.getTime() / 1000));
    case '$isoTimestamp':
      return now.toISOString();
    case '$randomAlphaNumeric':
      return randomCharacters(1);
    case '$randomBoolean':
      return randomInt(0, 1) === 1 ? 'true' : 'false';
    case '$randomInt':
      return String(randomInt(0, 1000));
    case '$randomColor':
      return pick(VALUE_SETS.colors);
    case '$randomHexColor':
      return `#${randomHex(6)}`;
    case '$randomAbbreviation':
      return pick(VALUE_SETS.abbreviations);
    case '$randomIP':
      return `${randomInt(1, 254)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
    case '$randomIPV6':
    case '$randomIPv6':
      return Array.from({ length: 8 }, () => randomHex(4)).join(':');
    case '$randomMACAddress':
      return Array.from({ length: 6 }, () => randomHex(2)).join(':');
    case '$randomPassword':
      return randomCharacters(15);
    case '$randomLocale':
      return pick(VALUE_SETS.locales);
    case '$randomUserAgent':
      return `Mozilla/5.0 (${pick(['Macintosh', 'Windows NT 10.0', 'X11; Linux x86_64'])}) AppleWebKit/537.36 Chrome/${randomInt(90, 130)}.0.${randomInt(1000, 9999)}.0 Safari/537.36`;
    case '$randomProtocol':
      return pick(['http', 'https']);
    case '$randomSemver':
      return `${randomInt(0, 9)}.${randomInt(0, 20)}.${randomInt(0, 30)}`;
    case '$randomFirstName':
      return pick(VALUE_SETS.firstNames);
    case '$randomLastName':
      return pick(VALUE_SETS.lastNames);
    case '$randomFullName':
      return `${pick(VALUE_SETS.firstNames)} ${pick(VALUE_SETS.lastNames)}`;
    case '$randomNamePrefix':
      return pick(VALUE_SETS.namePrefixes);
    case '$randomNameSuffix':
      return pick(VALUE_SETS.nameSuffixes);
    case '$randomJobArea':
      return pick(VALUE_SETS.jobAreas);
    case '$randomJobDescriptor':
      return pick(VALUE_SETS.jobDescriptors);
    case '$randomJobTitle':
      return `${pick(VALUE_SETS.jobDescriptors)} ${pick(VALUE_SETS.jobAreas)} ${pick(VALUE_SETS.jobTypes)}`;
    case '$randomJobType':
      return pick(VALUE_SETS.jobTypes);
    case '$randomPhoneNumber':
      return `${randomDigits(3)}-${randomDigits(3)}-${randomDigits(4)}`;
    case '$randomPhoneNumberExt':
      return `${randomDigits(2)}-${randomDigits(3)}-${randomDigits(3)}-${randomDigits(4)}`;
    case '$randomCity':
      return pick(VALUE_SETS.cities);
    case '$randomStreetName':
      return pick(VALUE_SETS.streets);
    case '$randomStreetAddress':
      return `${randomInt(100, 99999)} ${pick(VALUE_SETS.streets)}`;
    case '$randomCountry':
      return pick(VALUE_SETS.countries);
    case '$randomCountryCode':
      return pick(VALUE_SETS.countryCodes);
    case '$randomLatitude':
      return randomDecimal(-90, 90, 4);
    case '$randomLongitude':
      return randomDecimal(-180, 180, 4);
    case '$randomAvatarImage':
      return `https://avatars.githubusercontent.com/u/${randomInt(1000, 99999999)}`;
    case '$randomImageUrl':
      return `https://picsum.photos/seed/${randomHex(8)}/640/480`;
    case '$randomAbstractImage':
    case '$randomAnimalsImage':
    case '$randomBusinessImage':
    case '$randomCatsImage':
    case '$randomCityImage':
    case '$randomFoodImage':
    case '$randomNightlifeImage':
    case '$randomFashionImage':
    case '$randomPeopleImage':
    case '$randomNatureImage':
    case '$randomSportsImage':
    case '$randomTransportImage':
      return `https://lorempixel.com/640/480/${key.replace('$random', '').replace('Image', '').toLowerCase()}`;
    case '$randomImageDataUri':
      return `data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22640%22%20height%3D%22480%22%3E%3Crect%20width%3D%22640%22%20height%3D%22480%22%20fill%3D%22%23${randomHex(6)}%22%2F%3E%3C%2Fsvg%3E`;
    case '$randomBankAccount':
      return randomDigits(8);
    case '$randomBankAccountName':
      return pick(['Checking Account', 'Savings Account', 'Home Loan Account', 'Auto Loan Account']);
    case '$randomCreditCardMask':
      return randomDigits(4);
    case '$randomBankAccountBic':
      return `${randomUpper(6)}${randomUpperOrDigit(2)}`;
    case '$randomBankAccountIban':
      return `${pick(VALUE_SETS.countryCodes)}${randomDigits(2)}${randomUpperOrDigit(randomInt(11, 27))}`;
    case '$randomTransactionType':
      return pick(VALUE_SETS.transactionTypes);
    case '$randomCurrencyCode':
      return pick(VALUE_SETS.currencies);
    case '$randomCurrencyName':
      return pick(VALUE_SETS.currencyNames);
    case '$randomCurrencySymbol':
      return pick(VALUE_SETS.currencySymbols);
    case '$randomBitcoin':
      return `${pick(['1', '3', 'bc1'])}${randomUpperOrDigit(30)}`;
    case '$randomCompanyName':
      return `${pick(VALUE_SETS.lastNames)} ${pick(['-', '&'])} ${pick(VALUE_SETS.lastNames)} ${pick(VALUE_SETS.companySuffixes)}`;
    case '$randomCompanySuffix':
      return pick(VALUE_SETS.companySuffixes);
    case '$randomBs':
      return `${pick(['killer', 'viral', '24/7'])} ${pick(['leverage', 'repurpose', 'harness'])} ${pick(['schemas', 'markets', 'interfaces'])}`;
    case '$randomBsAdjective':
      return pick(['viral', '24/7', '24/365', 'killer', 'frictionless']);
    case '$randomBsBuzz':
      return pick(['repurpose', 'harness', 'transition', 'synergize', 'architect']);
    case '$randomBsNoun':
      return pick(['e-services', 'markets', 'interfaces', 'schemas', 'solutions']);
    case '$randomCatchPhrase':
      return `${pick(['Future-proofed', 'Self-enabling', 'Business-focused'])} ${pick(['heuristic', 'bandwidth-monitored', 'needs-based'])} ${pick(['architecture', 'secured line', 'installation'])}`;
    case '$randomCatchPhraseAdjective':
      return pick(['Self-enabling', 'Business-focused', 'Down-sized', 'Future-proofed']);
    case '$randomCatchPhraseDescriptor':
      return pick(['bandwidth-monitored', 'needs-based', 'homogeneous', 'heuristic']);
    case '$randomCatchPhraseNoun':
      return pick(['secured line', 'superstructure', 'installation', 'architecture']);
    case '$randomDatabaseColumn':
      return pick(VALUE_SETS.databaseColumns);
    case '$randomDatabaseType':
      return pick(VALUE_SETS.databaseTypes);
    case '$randomDatabaseCollation':
      return pick(VALUE_SETS.databaseCollations);
    case '$randomDatabaseEngine':
      return pick(VALUE_SETS.databaseEngines);
    case '$randomDateFuture':
      return randomDate(now, 1, 365).toString();
    case '$randomDatePast':
      return randomDate(now, -3650, -1).toString();
    case '$randomDateRecent':
      return randomDate(now, -30, 0).toString();
    case '$randomWeekday':
      return pick(VALUE_SETS.weekdays);
    case '$randomMonth':
      return pick(VALUE_SETS.months);
    case '$randomDomainName':
      return `${domainWord()}.${pick(VALUE_SETS.domainSuffixes)}`;
    case '$randomDomainSuffix':
      return pick(VALUE_SETS.domainSuffixes);
    case '$randomDomainWord':
      return domainWord();
    case '$randomEmail':
      return `${userName()}@${domainWord()}.${pick(VALUE_SETS.domainSuffixes)}`;
    case '$randomExampleEmail':
      return `${userName()}@example.${pick(['com', 'net', 'org'])}`;
    case '$randomUserName':
      return userName();
    case '$randomUrl':
      return `${pick(['http', 'https'])}://${domainWord()}.${pick(VALUE_SETS.domainSuffixes)}`;
    case '$randomFileName':
      return `${slugWords('_', 3)}.${pick(VALUE_SETS.fileExtensions)}`;
    case '$randomFileType':
      return pick(VALUE_SETS.fileTypes);
    case '$randomFileExt':
      return pick(VALUE_SETS.fileExtensions);
    case '$randomCommonFileName':
      return `${slugWords('_', 2)}.${pick(VALUE_SETS.commonFileExtensions)}`;
    case '$randomCommonFileType':
      return pick(VALUE_SETS.commonFileTypes);
    case '$randomCommonFileExt':
      return pick(VALUE_SETS.commonFileExtensions);
    case '$randomFilePath':
      return `/home/${slugWords('_', 2)}.${pick(VALUE_SETS.fileExtensions)}`;
    case '$randomDirectoryPath':
      return pick(['/usr/bin', '/root', '/usr/local/bin', '/var/tmp', '/home/postman']);
    case '$randomMimeType':
      return pick(VALUE_SETS.mimeTypes);
    case '$randomPrice':
      return randomDecimal(0, 1000, 2);
    case '$randomProduct':
      return pick(VALUE_SETS.products);
    case '$randomProductAdjective':
      return pick(VALUE_SETS.productAdjectives);
    case '$randomProductMaterial':
      return pick(VALUE_SETS.productMaterials);
    case '$randomProductName':
      return `${pick(VALUE_SETS.productAdjectives)} ${pick(VALUE_SETS.productMaterials)} ${pick(VALUE_SETS.products)}`;
    case '$randomDepartment':
      return pick(VALUE_SETS.departments);
    case '$randomNoun':
      return pick(VALUE_SETS.nouns);
    case '$randomVerb':
      return pick(VALUE_SETS.verbs);
    case '$randomIngverb':
      return pick(VALUE_SETS.ingverbs);
    case '$randomAdjective':
      return pick(VALUE_SETS.adjectives);
    case '$randomWord':
      return pick(VALUE_SETS.words);
    case '$randomWords':
      return words(VALUE_SETS.words, randomInt(2, 5));
    case '$randomPhrase':
      return `${pick(['You cannot', 'Try to', 'Always'])} ${pick(VALUE_SETS.verbs)} the ${pick(VALUE_SETS.nouns)} without ${pick(VALUE_SETS.ingverbs)} the ${pick(VALUE_SETS.adjectives)} ${pick(VALUE_SETS.nouns)}.`;
    case '$randomLoremWord':
      return pick(VALUE_SETS.lorem);
    case '$randomLoremWords':
      return words(VALUE_SETS.lorem, randomInt(2, 5));
    case '$randomLoremSentence':
      return sentence(words(VALUE_SETS.lorem, randomInt(5, 10)));
    case '$randomLoremSentences':
      return Array.from({ length: randomInt(2, 6) }, () => sentence(words(VALUE_SETS.lorem, randomInt(5, 10)))).join(' ');
    case '$randomLoremParagraph':
      return Array.from({ length: randomInt(3, 6) }, () => sentence(words(VALUE_SETS.lorem, randomInt(5, 12)))).join(' ');
    case '$randomLoremParagraphs':
      return Array.from({ length: 3 }, () => Array.from({ length: randomInt(3, 6) }, () => sentence(words(VALUE_SETS.lorem, randomInt(5, 12)))).join(' ')).join('\n\n');
    case '$randomLoremText':
      return Array.from({ length: randomInt(2, 5) }, () => sentence(words(VALUE_SETS.lorem, randomInt(5, 12)))).join(' ');
    case '$randomLoremSlug':
      return slugWords('-', randomInt(2, 4), VALUE_SETS.lorem);
    case '$randomLoremLines':
      return Array.from({ length: randomInt(1, 5) }, () => sentence(words(VALUE_SETS.lorem, randomInt(3, 8)))).join('\n');
    default:
      return undefined;
  }
}

function randomInt(minimum, maximum) {
  return crypto.randomInt(Number(minimum), Number(maximum) + 1);
}

function randomCharacters(length) {
  return Array.from({ length }, () => ALPHANUMERIC[randomInt(0, ALPHANUMERIC.length - 1)]).join('');
}

function randomDigits(length) {
  return Array.from({ length }, () => String(randomInt(0, 9))).join('');
}

function randomHex(length) {
  return Array.from({ length }, () => HEX[randomInt(0, HEX.length - 1)]).join('');
}

function randomUpper(length) {
  return Array.from({ length }, () => String.fromCharCode(randomInt(65, 90))).join('');
}

function randomUpperOrDigit(length) {
  return Array.from({ length }, () => (randomInt(0, 1) ? String.fromCharCode(randomInt(65, 90)) : String(randomInt(0, 9)))).join('');
}

function randomDecimal(minimum, maximum, places) {
  const value = minimum + Math.random() * (maximum - minimum);
  return value.toFixed(places);
}

function randomDate(now, minimumDays, maximumDays) {
  const days = randomInt(minimumDays, maximumDays);
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000 + randomInt(0, 86_399) * 1000);
}

function pick(values) {
  return values[randomInt(0, values.length - 1)];
}

function domainWord() {
  return pick([...VALUE_SETS.firstNames, ...VALUE_SETS.lastNames]).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function userName() {
  return `${pick(VALUE_SETS.firstNames)}.${pick(VALUE_SETS.lastNames)}${randomInt(1, 99)}`;
}

function slugWords(separator, count, source = VALUE_SETS.words) {
  return Array.from({ length: count }, () => pick(source).toLowerCase().replace(/[^a-z0-9]+/g, '')).join(separator);
}

function words(source, count) {
  return Array.from({ length: count }, () => pick(source)).join(' ');
}

function sentence(value) {
  const text = String(value || '').trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

module.exports = {
  DYNAMIC_VARIABLE_NAMES,
  isDynamicVariableName,
  resolveDynamicVariable
};
