/**
 * CSV Worker Pool - Node.js Stub
 *
 * Provides noop/error implementations for Node.js.
 * Web Workers are browser-only.
 */

import type {
  CsvWorkerPoolOptions,
  CsvWorkerPoolStats,
  CsvTaskOptions,
  CsvTaskResult,
  SortConfig,
  FilterConfig,
  SearchConfig,
  GroupByConfig,
  AggregateConfig,
  PageConfig,
  QueryConfig,
  FilterResult,
  PageResult,
  GroupResult,
  AggregateResult,
  QueryResult,
  CsvParseOptions,
  CsvFormatOptions,
  CsvParseResult
} from "./types";

const ERROR_MSG = "CsvWorkerPool is only available in browser environments";

function throwNotSupported(): never {
  throw new Error(ERROR_MSG);
}

export function hasWorkerSupport(): boolean {
  return false;
}

export class CsvWorkerPool {
  constructor(_options?: CsvWorkerPoolOptions) {
    throwNotSupported();
  }

  parse(
    _data: string,
    _options?: CsvParseOptions,
    _taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<string[][] | CsvParseResult<Record<string, string>>>> {
    throwNotSupported();
  }

  format(
    _data: any[][],
    _options?: CsvFormatOptions,
    _taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<string>> {
    throwNotSupported();
  }

  load(
    _sessionId: string,
    _data: any[],
    _headers?: string[],
    _taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ rowCount: number; headers: string[] }>> {
    throwNotSupported();
  }

  getData(
    _sessionId: string,
    _taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ data: Record<string, any>[]; headers: string[]; rowCount: number }>> {
    throwNotSupported();
  }

  clear(_sessionId?: string, _taskOptions?: CsvTaskOptions): Promise<CsvTaskResult<void>> {
    throwNotSupported();
  }

  sort(
    _sessionId: string,
    _config: SortConfig | SortConfig[],
    _taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ rowCount: number }>> {
    throwNotSupported();
  }

  filter(
    _sessionId: string,
    _config: FilterConfig,
    _taskOptions?: CsvTaskOptions
  ): Promise<FilterResult> {
    throwNotSupported();
  }

  search(
    _sessionId: string,
    _config: SearchConfig,
    _taskOptions?: CsvTaskOptions
  ): Promise<FilterResult> {
    throwNotSupported();
  }

  groupBy(
    _sessionId: string,
    _config: GroupByConfig,
    _taskOptions?: CsvTaskOptions
  ): Promise<GroupResult> {
    throwNotSupported();
  }

  aggregate(
    _sessionId: string,
    _config: AggregateConfig[],
    _taskOptions?: CsvTaskOptions
  ): Promise<AggregateResult> {
    throwNotSupported();
  }

  getPage(
    _sessionId: string,
    _config: PageConfig,
    _taskOptions?: CsvTaskOptions
  ): Promise<PageResult> {
    throwNotSupported();
  }

  query(
    _sessionId: string,
    _config: QueryConfig,
    _taskOptions?: CsvTaskOptions
  ): Promise<QueryResult> {
    throwNotSupported();
  }

  getStats(): CsvWorkerPoolStats {
    throwNotSupported();
  }

  terminate(): void {}
}

export class CsvWorkerSession {
  constructor(_pool?: CsvWorkerPool) {
    throwNotSupported();
  }

  get sessionId(): string {
    return throwNotSupported();
  }
  get headers(): string[] {
    return throwNotSupported();
  }
  get rowCount(): number {
    return throwNotSupported();
  }

  load(
    _csvOrData: string | any[],
    _options?: CsvParseOptions
  ): Promise<{ rowCount: number; headers: string[] }> {
    throwNotSupported();
  }

  getData(): Promise<{ data: Record<string, any>[]; headers: string[]; rowCount: number }> {
    throwNotSupported();
  }

  sort(_config: SortConfig | SortConfig[]): Promise<{ rowCount: number }> {
    throwNotSupported();
  }

  filter(_config: FilterConfig): Promise<FilterResult> {
    throwNotSupported();
  }

  search(_config: SearchConfig): Promise<FilterResult> {
    throwNotSupported();
  }

  groupBy(_config: GroupByConfig): Promise<GroupResult> {
    throwNotSupported();
  }

  aggregate(_config: AggregateConfig[]): Promise<AggregateResult> {
    throwNotSupported();
  }

  getPage(_config: PageConfig): Promise<PageResult> {
    throwNotSupported();
  }

  query(_config: QueryConfig): Promise<QueryResult> {
    throwNotSupported();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

export function getDefaultWorkerPool(): CsvWorkerPool {
  throwNotSupported();
}

export function terminateDefaultWorkerPool(): void {}

export async function parseWithPool(
  _data: string,
  _options?: CsvParseOptions,
  _taskOptions?: CsvTaskOptions
): Promise<CsvTaskResult<string[][] | CsvParseResult<Record<string, string>>>> {
  throwNotSupported();
}

export async function formatWithPool(
  _data: any[][],
  _options?: CsvFormatOptions,
  _taskOptions?: CsvTaskOptions
): Promise<CsvTaskResult<string>> {
  throwNotSupported();
}

export type {
  CsvWorkerPoolOptions,
  CsvWorkerPoolStats,
  CsvTaskOptions,
  CsvTaskResult,
  CsvTaskPriority,
  SortConfig,
  SortOrder,
  FilterConfig,
  FilterCondition,
  FilterOperator,
  SearchConfig,
  GroupByConfig,
  AggregateConfig,
  AggregateFunction,
  PageConfig,
  QueryConfig,
  FilterResult,
  PageResult,
  GroupResult,
  AggregateResult,
  QueryResult
} from "./types";
