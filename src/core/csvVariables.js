(function attachCsvVariables(global) {
  const MAX_CSV_VARIABLE_SCHEMA_CHARS = 32 * 1024;
  const MAX_CSV_VARIABLE_VALUES_CHARS = 10 * 1024 * 1024;
  const MAX_CSV_VARIABLE_PATH_CHARS = 8192;
  const MAX_CSV_VARIABLE_SOURCE_NAME_CHARS = 512;

  function normalizeCsvVariableData(value = {}) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const filePath = boundedString(input.filePath, MAX_CSV_VARIABLE_PATH_CHARS);
    const values = boundedString(input.values, MAX_CSV_VARIABLE_VALUES_CHARS);
    const activeSource = normalizeCsvVariableActiveSource(input.activeSource, values, filePath);
    const loopRows = input.loopRows === true;
    return {
      enabled: input.enabled !== false,
      schema: boundedString(input.schema, MAX_CSV_VARIABLE_SCHEMA_CHARS),
      values,
      filePath,
      sourceName: boundedString(input.sourceName, MAX_CSV_VARIABLE_SOURCE_NAME_CHARS),
      activeSource,
      loopRows,
      continueWithoutRows: !loopRows && input.continueWithoutRows === true
    };
  }

  function normalizeCsvVariableActiveSource(source, values, filePath) {
    const hasValues = Boolean(String(values || '').trim());
    const hasFile = Boolean(String(filePath || '').trim());
    if (source === 'inline' && hasValues) {
      return 'inline';
    }
    if (source === 'file' && hasFile) {
      return 'file';
    }
    if (hasFile) {
      return 'file';
    }
    if (hasValues) {
      return 'inline';
    }
    return '';
  }

  function csvVariablesConfigured(value = {}) {
    const normalized = normalizeCsvVariableData(value);
    return Boolean(normalized.schema.trim() && (normalized.values.trim() || normalized.filePath.trim()));
  }

  function csvVariablesEnabled(value = {}) {
    const normalized = normalizeCsvVariableData(value);
    return normalized.enabled === true && csvVariablesConfigured(normalized);
  }

  function csvVariableNames(value = {}) {
    try {
      return parseCsvVariableSchema(normalizeCsvVariableData(value).schema);
    } catch {
      return [];
    }
  }

  function parseCsvVariableSchema(schemaText) {
    const records = parseCsvRecords(schemaText);
    if (!records.length) {
      return [];
    }
    const names = records[0].map((name) => String(name || '').trim());
    if (names.some((name) => !name)) {
      throw new Error('CSV variable schema cannot contain empty variable names.');
    }
    const seen = new Set();
    for (const name of names) {
      if (seen.has(name)) {
        throw new Error(`CSV variable schema contains duplicate variable "${name}".`);
      }
      seen.add(name);
    }
    return names;
  }

  function csvVariablesToIterationRows(definition = {}, valuesText = '', options = {}) {
    const normalized = normalizeCsvVariableData(definition);
    return csvRecordsToIterationRows(normalized, parseCsvRecords(valuesText), options);
  }

  function csvRecordsToIterationRows(definition = {}, records = [], options = {}) {
    const normalized = normalizeCsvVariableData(definition);
    const names = parseCsvVariableSchema(normalized.schema);
    if (!names.length) {
      return [];
    }
    const rows = (Array.isArray(records) ? records : []).map((record, index) => {
      if (record.length !== names.length) {
        throw new Error(`CSV variable row ${index + 1} has ${record.length} value${record.length === 1 ? '' : 's'} but the schema defines ${names.length}.`);
      }
      return names.map((name, columnIndex) => ({
        enabled: true,
        key: name,
        value: record[columnIndex] == null ? '' : String(record[columnIndex])
      }));
    });
    const requiredRows = Number.isFinite(Number(options.requiredRows))
      ? Math.max(0, Math.floor(Number(options.requiredRows)))
      : 0;
    if (requiredRows > 0 && rows.length < requiredRows) {
      if (normalized.loopRows === true && rows.length > 0) {
        return Array.from({ length: requiredRows }, (_item, index) => cloneIterationRow(rows[index % rows.length]));
      }
      if (normalized.continueWithoutRows === true) {
        return rows;
      }
      throw new Error(`CSV variable data has ${rows.length} row${rows.length === 1 ? '' : 's'}, but this run needs ${requiredRows}.`);
    }
    return requiredRows > 0 ? rows.slice(0, requiredRows) : rows;
  }

  function cloneIterationRow(row) {
    return (row || []).map((variable) => ({ ...variable }));
  }

  function parseCsvRecords(text = '') {
    const input = String(text || '').replace(/^\uFEFF/, '');
    const records = [];
    let record = [];
    let field = '';
    let inQuotes = false;
    let hasOpenRecord = false;

    const pushField = () => {
      record.push(field);
      field = '';
      hasOpenRecord = true;
    };
    const finishRecord = () => {
      pushField();
      if (!isBlankCsvRecord(record)) {
        records.push(record);
      }
      record = [];
      hasOpenRecord = false;
    };

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (inQuotes) {
        if (char === '"') {
          if (input[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        if (field.length === 0) {
          inQuotes = true;
        } else {
          field += char;
        }
      } else if (char === ',') {
        pushField();
      } else if (char === '\n' || char === '\r') {
        finishRecord();
        if (char === '\r' && input[index + 1] === '\n') {
          index += 1;
        }
      } else {
        field += char;
      }
    }

    if (inQuotes) {
      throw new Error('CSV input has an unterminated quoted field.');
    }
    if (hasOpenRecord || field.length > 0) {
      finishRecord();
    }
    return records;
  }

  function isBlankCsvRecord(record) {
    return record.every((value) => String(value || '').trim() === '');
  }

  function boundedString(value, maxLength) {
    return String(value == null ? '' : value).slice(0, maxLength);
  }

  const exported = {
    MAX_CSV_VARIABLE_PATH_CHARS,
    MAX_CSV_VARIABLE_SCHEMA_CHARS,
    MAX_CSV_VARIABLE_SOURCE_NAME_CHARS,
    MAX_CSV_VARIABLE_VALUES_CHARS,
    csvRecordsToIterationRows,
    csvVariablesConfigured,
    csvVariableNames,
    csvVariablesEnabled,
    csvVariablesToIterationRows,
    normalizeCsvVariableData,
    parseCsvRecords,
    parseCsvVariableSchema
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterCsvVariables = exported;
})(typeof window === 'undefined' ? globalThis : window);
