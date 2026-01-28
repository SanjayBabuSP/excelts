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

function parseCsv(input, options) {
  options = options || {};
  const {
    delimiter = ',',
    quote: quoteOption = '"',
    skipEmptyLines = false,
    trim = false,
    headers = false,
    comment,
    maxRows,
    fastMode = false
  } = options;

  const quoteEnabled = quoteOption !== null && quoteOption !== false;
  const quote = quoteEnabled ? String(quoteOption) : '';
  const rows = [];
  let headerRow = null;
  let useHeaders = headers === true || Array.isArray(headers);
  const trimField = trim ? s => s.trim() : s => s;

  // Fast mode: no quote handling
  if (fastMode) {
    const lines = input.split(/\\r\\n|\\r|\\n/);
    let dataRowCount = 0;
    for (const line of lines) {
      if (comment && line.startsWith(comment)) continue;
      if (skipEmptyLines && line === '') continue;
      
      const row = line.split(delimiter).map(trimField);
      
      if (useHeaders && !headerRow) {
        headerRow = Array.isArray(headers) ? headers : row;
        if (!Array.isArray(headers)) continue;
      }
      
      rows.push(row);
      dataRowCount++;
      if (maxRows !== undefined && dataRowCount >= maxRows) break;
    }
    return buildResult(rows, headerRow, useHeaders);
  }

  // Standard mode with quote handling
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  let dataRowCount = 0;

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === quote) {
        if (input[i + 1] === quote) {
          currentField += quote;
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (quoteEnabled && char === quote) {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(trimField(currentField));
        currentField = '';
        i++;
      } else if (char === '\\r' || char === '\\n') {
        if (char === '\\r' && input[i + 1] === '\\n') i++;
        i++;
        
        currentRow.push(trimField(currentField));
        currentField = '';
        
        const isCommentLine = comment && currentRow.length === 1 && currentRow[0].startsWith(comment);
        const isEmpty = currentRow.length === 1 && currentRow[0] === '';
        
        if (!isCommentLine && !(skipEmptyLines && isEmpty)) {
          if (useHeaders && !headerRow) {
            headerRow = Array.isArray(headers) ? headers : currentRow;
            if (!Array.isArray(headers)) {
              currentRow = [];
              continue;
            }
          }
          rows.push(currentRow);
          dataRowCount++;
          if (maxRows !== undefined && dataRowCount >= maxRows) break;
        }
        currentRow = [];
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Handle last field
  if (currentField || currentRow.length > 0) {
    currentRow.push(trimField(currentField));
    const isCommentLine = comment && currentRow.length === 1 && currentRow[0].startsWith(comment);
    const isEmpty = currentRow.length === 1 && currentRow[0] === '';
    
    if (!isCommentLine && !(skipEmptyLines && isEmpty)) {
      if (useHeaders && !headerRow) {
        headerRow = Array.isArray(headers) ? headers : currentRow;
      } else if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
        rows.push(currentRow);
      }
    }
  }

  return buildResult(rows, headerRow, useHeaders);
}

function buildResult(rows, headerRow, useHeaders) {
  if (useHeaders && headerRow) {
    const dataRows = rows.map(row => {
      const obj = {};
      headerRow.forEach((header, idx) => {
        if (header !== null && header !== undefined) {
          obj[header] = row[idx] ?? '';
        }
      });
      return obj;
    });
    return { headers: headerRow, rows: dataRows };
  }
  return rows;
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
