/**
 * CSV Worker Script Generator
 *
 * Generates a self-contained inline worker script for CSV operations.
 * The worker handles CPU-intensive operations off the main thread.
 *
 * Features:
 * - Parse/Format: RFC 4180 compliant CSV parsing and formatting
 * - Session Management: Keep data in memory for repeated operations
 * - Data Operations: sort, filter, search, groupBy, aggregate, pagination
 * - Batch Query: Execute multiple operations in single message
 * - Unified Response Format: All operations return { type: "result", data, duration }
 * - Zero dependencies: Self-contained script
 */

// =============================================================================
// Blob URL Management
// =============================================================================

let workerBlobUrl: string | null = null;
let workerBlobRefCount = 0;

/** Get or create the worker blob URL */
export function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const script = generateWorkerScript();
    const blob = new Blob([script], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  workerBlobRefCount++;
  return workerBlobUrl;
}

/** Release the worker blob URL reference */
export function releaseWorkerBlobUrl(): void {
  workerBlobRefCount--;
  if (workerBlobRefCount <= 0 && workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
    workerBlobRefCount = 0;
  }
}

/** Generate the complete worker script code */
export function generateWorkerScript(): string {
  return `'use strict';

// Session storage
const sessions = new Map();

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session not found: ' + sessionId);
  return session;
}

// =============================================================================
// CSV Parser (RFC 4180 compliant)
// =============================================================================

const AUTO_DETECT_DELIMITERS = [',', ';', '\\t', '|'];
const DEFAULT_DELIMITER = ',';
const NON_WHITESPACE_RE = /\\S/;

function stripBom(input) {
  return input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
}

function detectLinebreak(input) {
  const crIndex = input.indexOf('\\r');
  const lfIndex = input.indexOf('\\n');
  if (crIndex === -1 && lfIndex === -1) {
    return '\\n';
  }
  if (crIndex === -1) {
    return '\\n';
  }
  if (lfIndex === -1) {
    return '\\r';
  }
  if (crIndex < lfIndex) {
    return input[crIndex + 1] === '\\n' ? '\\r\\n' : '\\r';
  }
  return '\\n';
}

function countDelimiters(line, delimiter, quote) {
  if (!line || !delimiter) {
    return 0;
  }

  let count = 0;
  let inQuotes = false;
  const delimLen = delimiter.length;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quote && char === quote) {
      if (inQuotes && line[i + 1] === quote) {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (delimLen === 1) {
        if (char === delimiter) {
          count++;
        }
      } else if (line.slice(i, i + delimLen) === delimiter) {
        count++;
        i += delimLen - 1;
      }
    }
  }

  return count;
}

function getSampleLines(input, maxLines, quote, comment, shouldSkipEmpty) {
  const lines = [];
  let start = 0;
  let inQuotes = false;
  const len = input.length;

  for (let i = 0; i < len && lines.length < maxLines; i++) {
    const char = input[i];

    if (quote && char === quote) {
      if (inQuotes && input[i + 1] === quote) {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (char === '\\n' || char === '\\r')) {
      const line = input.slice(start, i);

      if (!(comment && line.startsWith(comment))) {
        const trimmed = line.trim();
        const shouldDrop = line.length === 0 || (shouldSkipEmpty && trimmed === '');
        if (!shouldDrop && trimmed !== '') {
          lines.push(line);
        }
      }

      if (char === '\\r' && input[i + 1] === '\\n') {
        i++;
      }
      start = i + 1;
    }
  }

  if (start < len && lines.length < maxLines) {
    const line = input.slice(start);
    if (!(comment && line.startsWith(comment))) {
      const trimmed = line.trim();
      const shouldDrop = line.length === 0 || (shouldSkipEmpty && trimmed === '');
      if (!shouldDrop && trimmed !== '') {
        lines.push(line);
      }
    }
  }

  return lines;
}

function scoreDelimiter(lines, delimiter, quote) {
  if (lines.length === 0) {
    return { avgFieldCount: 0, delta: Number.POSITIVE_INFINITY };
  }

  let delta = 0;
  let avgFieldCount = 0;
  let prevFieldCount;

  for (const line of lines) {
    const fieldCount = countDelimiters(line, delimiter, quote) + 1;
    avgFieldCount += fieldCount;
    if (prevFieldCount === undefined) {
      prevFieldCount = fieldCount;
      continue;
    }
    delta += Math.abs(fieldCount - prevFieldCount);
    prevFieldCount = fieldCount;
  }

  avgFieldCount /= lines.length;
  return { avgFieldCount, delta };
}

function detectDelimiter(input, quote, delimitersToGuess, comment, shouldSkipEmpty) {
  const delimiters = delimitersToGuess || AUTO_DETECT_DELIMITERS;
  const defaultDelimiter = delimiters[0] || DEFAULT_DELIMITER;

  const lines = getSampleLines(input, 10, quote || '"', comment, shouldSkipEmpty);
  if (lines.length === 0) {
    return defaultDelimiter;
  }

  let bestDelimiter = defaultDelimiter;
  let bestDelta;
  let bestAvgFieldCount;

  for (const delimiter of delimiters) {
    const score = scoreDelimiter(lines, delimiter, quote || '"');
    if (score.avgFieldCount <= 1.99) {
      continue;
    }

    if (
      bestDelta === undefined ||
      score.delta < bestDelta ||
      (score.delta === bestDelta &&
        (bestAvgFieldCount === undefined || score.avgFieldCount > bestAvgFieldCount))
    ) {
      bestDelta = score.delta;
      bestAvgFieldCount = score.avgFieldCount;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function convertValue(value) {
  if (value === '') {
    return '';
  }

  const lowerValue = value.toLowerCase();
  if (lowerValue === 'true') {
    return true;
  }
  if (lowerValue === 'false') {
    return false;
  }
  if (lowerValue === 'null') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed !== '' && trimmed === value) {
    if (trimmed === 'Infinity') {
      return Infinity;
    }
    if (trimmed === '-Infinity') {
      return -Infinity;
    }
    if (trimmed === 'NaN') {
      return NaN;
    }

    if (/^-?0[0-9]/.test(trimmed)) {
      return value;
    }

    if (/^-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return num;
      }
    }
  }

  return value;
}

function assertNoFunctionOptions(options) {
  if (!options) return;
  if (typeof options.headers === 'function') {
    throw new Error('Csv worker: headers function is not supported');
  }
  if (typeof options.transform === 'function' || typeof options.validate === 'function') {
    throw new Error('Csv worker: transform/validate functions are not supported');
  }
  if (typeof options.chunk === 'function' || typeof options.beforeFirstChunk === 'function') {
    throw new Error('Csv worker: chunk/beforeFirstChunk functions are not supported');
  }

  const dt = options.dynamicTyping;
  if (dt && typeof dt === 'object') {
    for (const key of Object.keys(dt)) {
      if (typeof dt[key] === 'function') {
        throw new Error('Csv worker: dynamicTyping custom converters are not supported');
      }
    }
  }
}

function applyDynamicTypingToRow(row, dynamicTyping) {
  const result = {};

  if (dynamicTyping === true) {
    for (const key of Object.keys(row)) {
      result[key] = convertValue(row[key]);
    }
    return result;
  }

  if (dynamicTyping === false) {
    return row;
  }

  for (const key of Object.keys(row)) {
    const config = dynamicTyping[key];
    if (config === undefined || config === false) {
      result[key] = row[key];
    } else {
      result[key] = convertValue(row[key]);
    }
  }

  return result;
}

function applyDynamicTypingToArrayRow(row, headers, dynamicTyping) {
  if (dynamicTyping === true) {
    return row.map(convertValue);
  }
  if (dynamicTyping === false) {
    return row;
  }
  if (!headers) {
    return row;
  }

  return row.map((value, index) => {
    const header = headers[index];
    const config = header ? dynamicTyping[header] : undefined;
    if (config === undefined || config === false) {
      return value;
    }
    return convertValue(value);
  });
}

function isEmptyRowGreedy(row, shouldSkipEmpty) {
  if (!shouldSkipEmpty) {
    return false;
  }
  for (const field of row) {
    if (NON_WHITESPACE_RE.test(field)) {
      return false;
    }
  }
  return true;
}

function parseCsv(input, options) {
  options = options || {};
  assertNoFunctionOptions(options);

  // Strip BOM (Byte Order Mark) if present
  input = stripBom(input);

  const {
    delimiter: delimiterOption = ',',
    delimitersToGuess,
    newline: newlineOption = '',
    quote: quoteOption = '"',
    escape: escapeOption = '"',
    skipEmptyLines = false,
    ignoreEmpty = false,
    trim = false,
    ltrim = false,
    rtrim = false,
    headers = false,
    renameHeaders = false,
    comment,
    maxRows,
    skipLines = 0,
    skipRows = 0,
    strictColumnHandling = false,
    discardUnmappedColumns = false,
    fastMode = false,
    dynamicTyping = false
  } = options;

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

  const quoteEnabled = quoteOption !== null && quoteOption !== false;
  const quote = quoteEnabled ? String(quoteOption) : '';
  const escape =
    escapeOption !== null && escapeOption !== false ? String(escapeOption) : '';

  const delimiter =
    delimiterOption === ''
      ? detectDelimiter(input, quote || '"', delimitersToGuess, comment, shouldSkipEmpty)
      : delimiterOption;

  const linebreak = newlineOption || detectLinebreak(input);

  const rows = [];
  const invalidRows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  let lineNumber = 0;
  let dataRowCount = 0;
  let skippedDataRows = 0;
  let truncated = false;

  let headerRow = null;
  let headersLength = 0;
  let useHeaders = false;
  let headerRowProcessed = false;
  let renamedHeadersForMeta = null;

  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    const deduped = deduplicateHeadersWithRenames(headers);
    headerRow = deduped.headers;
    renamedHeadersForMeta = deduped.renamedHeaders;
    headersLength = headerRow.filter(h => h !== null && h !== undefined).length;
    useHeaders = true;
    if (!renameHeaders) {
      headerRowProcessed = true;
    }
  } else if (headers) {
    // Anything else (e.g. object) is treated as enabled but unsupported in worker
    throw new Error('Csv worker: unsupported headers option');
  }

  const trimField =
    trim || (ltrim && rtrim)
      ? s => String(s).trim()
      : ltrim
        ? s => String(s).trimStart()
        : rtrim
          ? s => String(s).trimEnd()
          : s => String(s);

  function processRow(row) {
    if (useHeaders && !headerRowProcessed) {
      // First row is headers
      const deduped = deduplicateHeadersWithRenames(row);
      headerRow = deduped.headers;
      renamedHeadersForMeta = deduped.renamedHeaders;
      headersLength = headerRow.filter(h => h !== null && h !== undefined).length;
      headerRowProcessed = true;
      return false;
    }

    if (skippedDataRows < skipRows) {
      skippedDataRows++;
      return false;
    }

    if (headerRow && headerRow.length > 0) {
      const expectedCols = headersLength;
      const actualCols = row.length;

      if (actualCols > expectedCols) {
        if (strictColumnHandling && !discardUnmappedColumns) {
          invalidRows.push({
            row,
            reason: 'Column header mismatch expected: ' + expectedCols + ' columns got: ' + actualCols
          });
          return false;
        }
        row.length = headerRow.length;
      } else if (actualCols < expectedCols) {
        if (strictColumnHandling) {
          invalidRows.push({
            row,
            reason: 'Column header mismatch expected: ' + expectedCols + ' columns got: ' + actualCols
          });
          return false;
        }
        while (row.length < headerRow.length) {
          row.push('');
        }
      }
    }

    return true;
  }

  function buildResult() {
    const meta = {
      delimiter,
      linebreak,
      aborted: false,
      truncated,
      cursor: dataRowCount,
      renamedHeaders: renamedHeadersForMeta
    };

    if (useHeaders && headerRow) {
      const filteredHeaders = headerRow.filter(h => h !== null && h !== undefined);
      meta.fields = filteredHeaders;

      const rowToObject = (row) => {
        const obj = {};
        for (let idx = 0; idx < headerRow.length; idx++) {
          const header = headerRow[idx];
          if (header !== null && header !== undefined) {
            obj[header] = row[idx] ?? '';
          }
        }
        return obj;
      };

      let dataRows = rows.map(rowToObject);

      if (dynamicTyping) {
        dataRows = dataRows.map(r => applyDynamicTypingToRow(r, dynamicTyping));
      }

      const result = {
        headers: filteredHeaders,
        rows: dataRows,
        meta
      };

      if (invalidRows.length > 0) {
        result.invalidRows = invalidRows;
      }

      return result;
    }

    let resultRows = rows;
    if (dynamicTyping) {
      const effectiveHeaders = headerRow ? headerRow.filter(h => h != null) : null;
      resultRows = resultRows.map(r => applyDynamicTypingToArrayRow(r, effectiveHeaders, dynamicTyping));
    }

    return resultRows;
  }

  if (fastMode) {
    const lines = newlineOption ? input.split(newlineOption) : input.split(/\\r\\n|\\r|\\n/);
    let lineIdx = 0;

    for (const line of lines) {
      lineIdx++;
      if (lineIdx <= skipLines) {
        continue;
      }
      if (comment && line.startsWith(comment)) {
        continue;
      }
      if (line === '') {
        continue;
      }

      const row = line.split(delimiter).map(trimField);
      if (isEmptyRowGreedy(row, shouldSkipEmpty)) {
        continue;
      }

      if (processRow(row)) {
        rows.push(row);
        dataRowCount++;
      }

      if (maxRows !== undefined && dataRowCount >= maxRows) {
        truncated = true;
        break;
      }
    }

    return buildResult();
  }

  const len = input.length;
  while (i < len) {
    const char = input[i];

    if (inQuotes && quoteEnabled) {
      if (escape && char === escape && input[i + 1] === quote) {
        currentField += quote;
        i += 2;
      } else if (char === quote) {
        inQuotes = false;
        i++;
      } else if (char === '\\r') {
        if (input[i + 1] === '\\n') {
          i++;
        } else {
          currentField += '\\n';
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (quoteEnabled && char === quote && currentField === '') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(trimField(currentField));
        currentField = '';
        i++;
      } else if (char === '\\n' || char === '\\r') {
        if (char === '\\r' && input[i + 1] === '\\n') {
          i++;
        }

        currentRow.push(trimField(currentField));
        currentField = '';
        lineNumber++;

        if (lineNumber <= skipLines) {
          currentRow = [];
          i++;
          continue;
        }

        if (comment && (currentRow[0] || '').startsWith(comment)) {
          currentRow = [];
          i++;
          continue;
        }

        if (isEmptyRowGreedy(currentRow, shouldSkipEmpty)) {
          currentRow = [];
          i++;
          continue;
        }

        if (processRow(currentRow)) {
          rows.push(currentRow);
          dataRowCount++;
        }

        currentRow = [];
        i++;

        if (maxRows !== undefined && dataRowCount >= maxRows) {
          truncated = true;
          break;
        }
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(trimField(currentField));

    const shouldProcessLastRow =
      lineNumber >= skipLines &&
      !(comment && (currentRow[0] || '').startsWith(comment)) &&
      !isEmptyRowGreedy(currentRow, shouldSkipEmpty) &&
      !(maxRows !== undefined && dataRowCount >= maxRows);

    if (shouldProcessLastRow && processRow(currentRow)) {
      rows.push(currentRow);
      dataRowCount++;
    }
  }

  return buildResult();
}

/**
 * Deduplicate headers by appending suffix to duplicates.
 * Example: ["A", "B", "A", "A"] → ["A", "B", "A_1", "A_2"]
 */
function deduplicateHeadersWithRenames(headers) {
  const headerCount = new Map();
  const usedHeaders = new Set();
  // Reserve all original header names so we don't generate a rename that
  // collides with a header that appears later in the row.
  const reservedHeaders = new Set();
  const result = [];
  const renamedHeaders = {};

  let hasRenames = false;

  for (const header of headers) {
    if (header !== null && header !== undefined) {
      reservedHeaders.add(header);
    }
  }

  for (const header of headers) {
    if (header === null || header === undefined) {
      result.push(header);
      continue;
    }

    if (!usedHeaders.has(header)) {
      usedHeaders.add(header);
      headerCount.set(header, 1);
      result.push(header);
      continue;
    }

    let suffix = headerCount.get(header) ?? 1;
    let candidate = header + '_' + suffix;
    while (usedHeaders.has(candidate) || reservedHeaders.has(candidate)) {
      suffix++;
      candidate = header + '_' + suffix;
    }

    headerCount.set(header, suffix + 1);
    usedHeaders.add(candidate);
    result.push(candidate);
    renamedHeaders[candidate] = header;
    hasRenames = true;
  }

  return { headers: result, renamedHeaders: hasRenames ? renamedHeaders : null };
}

// =============================================================================
// CSV Formatter
// =============================================================================

function formatCsv(data, options) {
  options = options || {};
  const {
    delimiter = ',',
    quote = '"',
    rowDelimiter = '\\n',
    alwaysQuote = false,
    escapeFormulae = false
  } = options;

  if (!data || data.length === 0) return '';

  const quoteStr = String(quote);
  const needsQuoteRegex = new RegExp('[' + delimiter + quoteStr + '\\\\r\\\\n]');
  const formulaChars = ['=', '+', '-', '@', '\\t'];

  const formatField = (value) => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    let forceQuote = false;
    
    if (escapeFormulae && str.length > 0 && formulaChars.some(c => str.startsWith(c))) {
      str = '\\t' + str;
      forceQuote = true;
    }
    
    if (alwaysQuote || forceQuote || needsQuoteRegex.test(str)) {
      return quoteStr + str.replace(new RegExp(quoteStr, 'g'), quoteStr + quoteStr) + quoteStr;
    }
    return str;
  };

  return data.map(row => row.map(formatField).join(delimiter)).join(rowDelimiter);
}

// =============================================================================
// Data Operations
// =============================================================================

function sortData(data, configs) {
  if (!Array.isArray(configs)) configs = [configs];
  
  data.sort((a, b) => {
    for (const config of configs) {
      const { column, order = 'asc', comparator = 'auto' } = config;
      const aVal = a[column];
      const bVal = b[column];
      
      let result = 0;
      if (comparator === 'number' || (comparator === 'auto' && !isNaN(Number(aVal)))) {
        result = Number(aVal || 0) - Number(bVal || 0);
      } else if (comparator === 'date') {
        result = new Date(aVal || 0).getTime() - new Date(bVal || 0).getTime();
      } else {
        result = String(aVal || '').localeCompare(String(bVal || ''));
      }
      
      if (result !== 0) return order === 'desc' ? -result : result;
    }
    return 0;
  });
}

function filterData(data, config) {
  const { conditions, logic = 'and' } = config;
  return data.filter(row => {
    const results = conditions.map(cond => evaluateCondition(row, cond));
    return logic === 'and' ? results.every(Boolean) : results.some(Boolean);
  });
}

function evaluateCondition(row, condition) {
  const { column, operator, value, ignoreCase = false } = condition;
  let fieldValue = row[column];
  let compareValue = value;
  
  if (ignoreCase && typeof fieldValue === 'string') {
    fieldValue = fieldValue.toLowerCase();
    if (typeof compareValue === 'string') compareValue = compareValue.toLowerCase();
  }
  
  switch (operator) {
    case 'eq': return fieldValue === compareValue;
    case 'neq': return fieldValue !== compareValue;
    case 'gt': return Number(fieldValue) > Number(compareValue);
    case 'gte': return Number(fieldValue) >= Number(compareValue);
    case 'lt': return Number(fieldValue) < Number(compareValue);
    case 'lte': return Number(fieldValue) <= Number(compareValue);
    case 'contains': return String(fieldValue).includes(String(compareValue));
    case 'startsWith': return String(fieldValue).startsWith(String(compareValue));
    case 'endsWith': return String(fieldValue).endsWith(String(compareValue));
    case 'regex': return new RegExp(compareValue, ignoreCase ? 'i' : '').test(String(fieldValue));
    case 'in': return Array.isArray(compareValue) && compareValue.includes(fieldValue);
    case 'notIn': return Array.isArray(compareValue) && !compareValue.includes(fieldValue);
    case 'isNull': return fieldValue === null || fieldValue === undefined || fieldValue === '';
    case 'notNull': return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    default: return true;
  }
}

function searchData(data, config) {
  const { query, columns, ignoreCase = true } = config;
  const searchQuery = ignoreCase ? query.toLowerCase() : query;
  
  return data.filter(row => {
    const columnsToSearch = columns || Object.keys(row);
    return columnsToSearch.some(col => {
      let value = String(row[col] || '');
      if (ignoreCase) value = value.toLowerCase();
      return value.includes(searchQuery);
    });
  });
}

function groupByData(data, config) {
  const { columns, aggregates } = config;
  const groups = new Map();
  
  for (const row of data) {
    const keyValues = columns.map(col => row[col]);
    const key = keyValues.join('\\0');
    let group = groups.get(key);
    if (!group) {
      group = { keyValues, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  
  const result = [];
  for (const group of groups.values()) {
    const obj = {};
    columns.forEach((col, idx) => obj[col] = group.keyValues[idx]);
    for (const { column, fn, alias } of aggregates) {
      obj[alias || column + '_' + fn] = computeAggregate(group.rows, column, fn);
    }
    result.push(obj);
  }
  
  return result;
}

function computeAggregate(rows, column, fn) {
  if (fn === 'count') return rows.length;
  if (fn === 'first') return rows.length > 0 ? rows[0][column] : null;
  if (fn === 'last') return rows.length > 0 ? rows[rows.length - 1][column] : null;
  
  const values = rows.map(r => r[column]).filter(v => v != null && v !== '');
  if (values.length === 0) return fn === 'avg' ? 0 : null;
  
  if (fn === 'sum' || fn === 'avg') {
    const sum = values.reduce((a, b) => a + Number(b), 0);
    return fn === 'avg' ? sum / values.length : sum;
  }
  if (fn === 'min' || fn === 'max') {
    const nums = values.map(Number);
    return fn === 'min' ? Math.min.apply(null, nums) : Math.max.apply(null, nums);
  }
  return null;
}

function aggregateData(data, configs) {
  const result = {};
  for (const config of configs) {
    const { column, fn, alias } = config;
    result[alias || column + '_' + fn] = computeAggregate(data, column, fn);
  }
  return result;
}

function getPageData(data, config) {
  const { page, pageSize } = config;
  const start = (page - 1) * pageSize;
  return {
    data: data.slice(start, start + pageSize),
    page,
    pageSize,
    totalRows: data.length,
    totalPages: Math.ceil(data.length / pageSize)
  };
}

// =============================================================================
// Batch Query - Execute multiple operations in one round-trip
// =============================================================================

function executeQuery(session, config) {
  let data = [...session.originalData];
  const result = { data: [] };
  
  // 1. Sort (modifies original order for subsequent operations)
  if (config.sort) {
    sortData(data, config.sort);
  }
  
  // 2. Filter
  if (config.filter) {
    data = filterData(data, config.filter);
    result.matchCount = data.length;
  }
  
  // 3. Search
  if (config.search) {
    data = searchData(data, config.search);
    result.matchCount = data.length;
  }
  
  // 4. GroupBy or Aggregate (mutually exclusive in practice)
  if (config.groupBy) {
    data = groupByData(data, config.groupBy);
    result.groupCount = data.length;
  } else if (config.aggregate) {
    result.aggregates = aggregateData(data, config.aggregate);
  }
  
  // 5. Pagination (applied last)
  if (config.page) {
    const pageResult = getPageData(data, config.page);
    result.data = pageResult.data;
    result.page = pageResult.page;
    result.pageSize = pageResult.pageSize;
    result.totalRows = pageResult.totalRows;
    result.totalPages = pageResult.totalPages;
  } else {
    result.data = data;
  }
  
  return result;
}

// =============================================================================
// Unified Response Helper
// =============================================================================

function reply(taskId, start, data) {
  self.postMessage({ type: 'result', taskId, data, duration: performance.now() - start });
}

function replyError(taskId, start, error) {
  self.postMessage({ type: 'error', taskId, error, duration: performance.now() - start });
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = function(event) {
  const msg = event.data;
  const taskId = msg.taskId;
  const start = performance.now();
  
  try {
    switch (msg.type) {
      case 'parse': {
        const result = parseCsv(msg.data, msg.options);
        
        if (msg.sessionId) {
          const isObj = result && result.headers;
          sessions.set(msg.sessionId, {
            data: isObj ? result.rows : result,
            headers: isObj ? result.headers : null,
            originalData: isObj ? [...result.rows] : [...result]
          });
        }
        
        reply(taskId, start, result);
        break;
      }
      
      case 'format': {
        reply(taskId, start, formatCsv(msg.data, msg.options));
        break;
      }
      
      case 'load': {
        let data = msg.data;
        let headers = msg.headers;
        
        if (Array.isArray(data[0]) && headers) {
          data = data.map(row => {
            const obj = {};
            headers.forEach((key, idx) => obj[key] = row[idx]);
            return obj;
          });
        } else if (Array.isArray(data[0])) {
          headers = data[0];
          data = data.slice(1).map(row => {
            const obj = {};
            headers.forEach((key, idx) => obj[key] = row[idx]);
            return obj;
          });
        } else if (data.length > 0) {
          headers = Object.keys(data[0]);
        }
        
        sessions.set(msg.sessionId, { data, headers, originalData: [...data] });
        reply(taskId, start, { rowCount: data.length, headers: headers || [] });
        break;
      }
      
      case 'getData': {
        const session = getSession(msg.sessionId);
        reply(taskId, start, { data: session.data, headers: session.headers || [], rowCount: session.data.length });
        break;
      }
      
      case 'clear': {
        msg.sessionId ? sessions.delete(msg.sessionId) : sessions.clear();
        reply(taskId, start, undefined);
        break;
      }
      
      case 'sort': {
        const session = getSession(msg.sessionId);
        sortData(session.data, msg.config);
        reply(taskId, start, { rowCount: session.data.length });
        break;
      }
      
      case 'filter': {
        const session = getSession(msg.sessionId);
        const totalCount = session.originalData.length;
        session.data = filterData(session.originalData, msg.config);
        reply(taskId, start, { data: session.data, matchCount: session.data.length, totalCount });
        break;
      }
      
      case 'search': {
        const session = getSession(msg.sessionId);
        const totalCount = session.originalData.length;
        session.data = searchData(session.originalData, msg.config);
        reply(taskId, start, { data: session.data, matchCount: session.data.length, totalCount });
        break;
      }
      
      case 'groupBy': {
        const session = getSession(msg.sessionId);
        const groups = groupByData(session.data, msg.config);
        reply(taskId, start, { data: groups, groupCount: groups.length });
        break;
      }
      
      case 'aggregate': {
        const session = getSession(msg.sessionId);
        reply(taskId, start, { data: aggregateData(session.data, msg.config) });
        break;
      }
      
      case 'getPage': {
        const session = getSession(msg.sessionId);
        reply(taskId, start, getPageData(session.data, msg.config));
        break;
      }
      
      case 'query': {
        const session = getSession(msg.sessionId);
        reply(taskId, start, executeQuery(session, msg.config));
        break;
      }
      
      case 'terminate': {
        sessions.clear();
        self.close();
        break;
      }
      
      default:
        throw new Error('Unknown message type: ' + msg.type);
    }
  } catch (error) {
    replyError(taskId, start, error.message || String(error));
  }
};

// Signal ready
self.postMessage({ type: 'ready' });
`;
}
