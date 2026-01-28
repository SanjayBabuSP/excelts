/**
 * CSV Worker Pool - Browser Implementation
 *
 * High-performance worker pool for CSV operations in the browser.
 * Offloads CPU-intensive operations to Web Workers to keep UI responsive.
 *
 * Features:
 * - Parse/Format: Basic CSV operations
 * - Session Management: Keep data in worker memory for repeated operations
 * - Data Operations: sort, filter, search, groupBy, aggregate, pagination
 * - Batch Query: Execute multiple operations in single round-trip
 * - Task prioritization and cancellation
 * - Automatic worker scaling
 *
 * @example
 * ```ts
 * // Simple parsing
 * const result = await parseWithPool(csvString, { headers: true });
 *
 * // Session-based operations for interactive data exploration
 * const session = new CsvWorkerSession();
 * await session.load(csvString, { headers: true });
 *
 * // Batch query - single round-trip for multiple operations
 * const result = await session.query({
 *   sort: { column: 'age', order: 'desc' },
 *   filter: { conditions: [{ column: 'status', operator: 'eq', value: 'active' }] },
 *   page: { page: 1, pageSize: 20 }
 * });
 *
 * session.dispose();
 * ```
 */

import { CsvWorkerError } from "@csv/errors";
import type {
  CsvWorkerPoolOptions,
  CsvWorkerPoolStats,
  CsvTaskOptions,
  CsvTaskResult,
  CsvTaskPriority,
  CsvWorkerRequestMessage,
  CsvWorkerResponseMessage,
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
import { getWorkerBlobUrl, releaseWorkerBlobUrl } from "./worker-script";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPTIONS: Required<Omit<CsvWorkerPoolOptions, "workerUrl">> & { workerUrl?: string } =
  {
    maxWorkers: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4,
    minWorkers: 0,
    idleTimeout: 30_000,
    workerUrl: undefined
  };

const PRIORITY_VALUES: Record<CsvTaskPriority, number> = {
  high: 3,
  normal: 2,
  low: 1
};

/** Check if Web Workers are available */
export function hasWorkerSupport(): boolean {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined";
}

function createAbortError(message = "Operation was aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

// =============================================================================
// Internal Types
// =============================================================================

interface PendingTask<T> {
  taskId: number;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
  startTime: number;
}

interface QueuedTask extends PendingTask<any> {
  message: CsvWorkerRequestMessage;
  priority: CsvTaskPriority;
  priorityValue: number;
}

interface PoolWorker {
  id: number;
  worker: Worker;
  busy: boolean;
  currentTaskId: number | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

// =============================================================================
// CsvWorkerPool Class (Internal)
// =============================================================================

class CsvWorkerPool {
  private readonly _options: typeof DEFAULT_OPTIONS;
  private readonly _workers: Map<number, PoolWorker> = new Map();
  private readonly _taskQueue: QueuedTask[] = [];
  private readonly _pendingTasks: Map<number, PendingTask<any>> = new Map();
  private _nextTaskId = 1;
  private _nextWorkerId = 1;
  private _terminated = false;
  private _completedTasks = 0;
  private _failedTasks = 0;
  private readonly _workerUrl: string;
  private readonly _useCustomUrl: boolean;

  constructor(options?: CsvWorkerPoolOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };

    if (this._options.workerUrl) {
      this._workerUrl = this._options.workerUrl;
      this._useCustomUrl = true;
    } else {
      this._workerUrl = getWorkerBlobUrl();
      this._useCustomUrl = false;
    }

    for (let i = 0; i < this._options.minWorkers; i++) {
      this._createWorker();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async parse(
    data: string,
    options?: CsvParseOptions & { sessionId?: string },
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<string[][] | CsvParseResult<Record<string, string>>>> {
    const message: CsvWorkerRequestMessage = {
      type: "parse",
      taskId: 0,
      data,
      options,
      sessionId: options?.sessionId
    };
    return this._execute(message, taskOptions);
  }

  async format(
    data: any[][],
    options?: CsvFormatOptions,
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<string>> {
    const message: CsvWorkerRequestMessage = {
      type: "format",
      taskId: 0,
      data,
      options
    };
    return this._execute(message, taskOptions);
  }

  async load(
    sessionId: string,
    data: any[] | any[][],
    headers?: string[],
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ rowCount: number; headers: string[] }>> {
    const message: CsvWorkerRequestMessage = {
      type: "load",
      taskId: 0,
      sessionId,
      data,
      headers
    };
    return this._execute(message, taskOptions);
  }

  async getData(
    sessionId: string,
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ data: Record<string, any>[]; headers: string[]; rowCount: number }>> {
    const message: CsvWorkerRequestMessage = {
      type: "getData",
      taskId: 0,
      sessionId
    };
    return this._execute(message, taskOptions);
  }

  async clear(sessionId?: string, taskOptions?: CsvTaskOptions): Promise<CsvTaskResult<void>> {
    const message: CsvWorkerRequestMessage = {
      type: "clear",
      taskId: 0,
      sessionId
    };
    return this._execute(message, taskOptions);
  }

  async sort(
    sessionId: string,
    config: SortConfig | SortConfig[],
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<{ rowCount: number }>> {
    const message: CsvWorkerRequestMessage = {
      type: "sort",
      taskId: 0,
      sessionId,
      config
    };
    return this._execute(message, taskOptions);
  }

  async filter(
    sessionId: string,
    config: FilterConfig,
    taskOptions?: CsvTaskOptions
  ): Promise<FilterResult> {
    return this._unwrap({ type: "filter", taskId: 0, sessionId, config }, taskOptions);
  }

  async search(
    sessionId: string,
    config: SearchConfig,
    taskOptions?: CsvTaskOptions
  ): Promise<FilterResult> {
    return this._unwrap({ type: "search", taskId: 0, sessionId, config }, taskOptions);
  }

  async groupBy(
    sessionId: string,
    config: GroupByConfig,
    taskOptions?: CsvTaskOptions
  ): Promise<GroupResult> {
    return this._unwrap({ type: "groupBy", taskId: 0, sessionId, config }, taskOptions);
  }

  async aggregate(
    sessionId: string,
    config: AggregateConfig[],
    taskOptions?: CsvTaskOptions
  ): Promise<AggregateResult> {
    return this._unwrap({ type: "aggregate", taskId: 0, sessionId, config }, taskOptions);
  }

  async getPage(
    sessionId: string,
    config: PageConfig,
    taskOptions?: CsvTaskOptions
  ): Promise<PageResult> {
    return this._unwrap({ type: "getPage", taskId: 0, sessionId, config }, taskOptions);
  }

  async query(
    sessionId: string,
    config: QueryConfig,
    taskOptions?: CsvTaskOptions
  ): Promise<QueryResult> {
    return this._unwrap({ type: "query", taskId: 0, sessionId, config }, taskOptions);
  }

  getStats(): CsvWorkerPoolStats {
    const busyWorkers = [...this._workers.values()].filter(w => w.busy).length;
    return {
      totalWorkers: this._workers.size,
      busyWorkers,
      pendingTasks: this._taskQueue.length,
      completedTasks: this._completedTasks,
      failedTasks: this._failedTasks
    };
  }

  terminate(): void {
    if (this._terminated) {
      return;
    }
    this._terminated = true;

    // Reject all pending tasks
    for (const task of this._pendingTasks.values()) {
      task.reject(new Error("Worker pool terminated"));
      this._cleanupTask(task);
    }
    this._pendingTasks.clear();

    for (const task of this._taskQueue) {
      task.reject(new Error("Worker pool terminated"));
      this._cleanupTask(task);
    }
    this._taskQueue.length = 0;

    // Terminate all workers
    for (const poolWorker of this._workers.values()) {
      this._terminateWorker(poolWorker);
    }
    this._workers.clear();

    if (!this._useCustomUrl) {
      releaseWorkerBlobUrl();
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /** Execute and unwrap result - for operations that return data with duration */
  private async _unwrap<T extends { duration: number }>(
    message: CsvWorkerRequestMessage,
    taskOptions?: CsvTaskOptions
  ): Promise<T> {
    const result = await this._execute<T>(message, taskOptions);
    return { ...result.data, duration: result.duration } as T;
  }

  private _execute<T>(
    message: CsvWorkerRequestMessage,
    taskOptions?: CsvTaskOptions
  ): Promise<CsvTaskResult<T>> {
    if (this._terminated) {
      return Promise.reject(new Error("Worker pool has been terminated"));
    }

    const { priority = "normal", signal } = taskOptions ?? {};

    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise((resolve, reject) => {
      const taskId = this._nextTaskId++;
      (message as any).taskId = taskId;

      const task: QueuedTask = {
        taskId,
        message,
        priority,
        priorityValue: PRIORITY_VALUES[priority],
        resolve,
        reject,
        signal,
        startTime: performance.now()
      };

      if (signal) {
        task.abortHandler = () => this._cancelTask(taskId);
        signal.addEventListener("abort", task.abortHandler, { once: true });
      }

      this._enqueueTask(task);
      this._processQueue();
    });
  }

  private _cleanupTask(task: PendingTask<any>): void {
    if (task.signal && task.abortHandler) {
      task.signal.removeEventListener("abort", task.abortHandler);
    }
  }

  private _enqueueTask(task: QueuedTask): void {
    let inserted = false;
    for (let i = 0; i < this._taskQueue.length; i++) {
      if (task.priorityValue > this._taskQueue[i].priorityValue) {
        this._taskQueue.splice(i, 0, task);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this._taskQueue.push(task);
    }
  }

  private _processQueue(): void {
    if (this._terminated || this._taskQueue.length === 0) {
      return;
    }

    let idleWorker: PoolWorker | null = null;
    for (const worker of this._workers.values()) {
      if (!worker.busy) {
        idleWorker = worker;
        break;
      }
    }

    if (!idleWorker && this._workers.size < this._options.maxWorkers) {
      idleWorker = this._createWorker();
    }

    if (idleWorker) {
      const task = this._taskQueue.shift()!;
      this._assignTask(idleWorker, task);
    }
  }

  private _createWorker(): PoolWorker {
    const id = this._nextWorkerId++;
    const worker = new Worker(this._workerUrl);

    const poolWorker: PoolWorker = {
      id,
      worker,
      busy: false,
      currentTaskId: null,
      idleTimer: null
    };

    worker.onmessage = (event: MessageEvent<CsvWorkerResponseMessage>) => {
      this._handleWorkerMessage(poolWorker, event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      this._handleWorkerError(poolWorker, event);
    };

    this._workers.set(id, poolWorker);
    return poolWorker;
  }

  private _assignTask(poolWorker: PoolWorker, task: QueuedTask): void {
    if (poolWorker.idleTimer) {
      clearTimeout(poolWorker.idleTimer);
      poolWorker.idleTimer = null;
    }

    poolWorker.busy = true;
    poolWorker.currentTaskId = task.taskId;
    this._pendingTasks.set(task.taskId, task);

    poolWorker.worker.postMessage(task.message);
  }

  private _handleWorkerMessage(poolWorker: PoolWorker, msg: CsvWorkerResponseMessage): void {
    if (msg.type === "ready") {
      this._processQueue();
      return;
    }

    const taskId = (msg as any).taskId;
    if (taskId === undefined) {
      return;
    }

    const task = this._pendingTasks.get(taskId);
    if (!task) {
      this._releaseWorker(poolWorker);
      return;
    }

    this._pendingTasks.delete(taskId);
    this._cleanupTask(task);

    if (msg.type === "error") {
      this._failedTasks++;
      task.reject(new Error(msg.error));
    } else {
      // Unified response: { type: "result", taskId, data, duration }
      this._completedTasks++;
      task.resolve({ data: msg.data, duration: msg.duration });
    }

    this._releaseWorker(poolWorker);
  }

  private _handleWorkerError(poolWorker: PoolWorker, event: ErrorEvent): void {
    const taskId = poolWorker.currentTaskId;
    if (taskId !== null) {
      const task = this._pendingTasks.get(taskId);
      if (task) {
        this._pendingTasks.delete(taskId);
        this._failedTasks++;
        this._cleanupTask(task);
        task.reject(new Error(event.message || "Worker error"));
      }
    }

    this._workers.delete(poolWorker.id);
    poolWorker.worker.terminate();
    this._processQueue();
  }

  private _releaseWorker(poolWorker: PoolWorker): void {
    poolWorker.busy = false;
    poolWorker.currentTaskId = null;

    if (this._workers.size > this._options.minWorkers) {
      poolWorker.idleTimer = setTimeout(() => {
        if (!poolWorker.busy && this._workers.size > this._options.minWorkers) {
          this._workers.delete(poolWorker.id);
          this._terminateWorker(poolWorker);
        }
      }, this._options.idleTimeout);
    }

    this._processQueue();
  }

  private _terminateWorker(poolWorker: PoolWorker): void {
    if (poolWorker.idleTimer) {
      clearTimeout(poolWorker.idleTimer);
    }
    try {
      poolWorker.worker.postMessage({ type: "terminate" });
    } catch {
      // Ignore errors
    }
    poolWorker.worker.terminate();
  }

  private _cancelTask(taskId: number): void {
    const queueIndex = this._taskQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex !== -1) {
      const task = this._taskQueue.splice(queueIndex, 1)[0];
      this._cleanupTask(task);
      queueMicrotask(() => task.reject(createAbortError()));
      return;
    }

    const task = this._pendingTasks.get(taskId);
    if (task) {
      this._pendingTasks.delete(taskId);
      this._cleanupTask(task);
      queueMicrotask(() => task.reject(createAbortError()));
    }
  }
}

// =============================================================================
// CsvWorkerSession - High-level API (Public)
// =============================================================================

let sessionIdCounter = 0;

/**
 * High-level API for interactive CSV data exploration.
 *
 * Keeps data in worker memory for efficient repeated operations.
 *
 * @example
 * ```ts
 * const session = new CsvWorkerSession();
 *
 * // Load data
 * await session.load(csvString, { headers: true });
 *
 * // Batch query - most efficient for multiple operations
 * const result = await session.query({
 *   sort: { column: 'age', order: 'desc' },
 *   filter: { conditions: [{ column: 'status', operator: 'eq', value: 'active' }] },
 *   page: { page: 1, pageSize: 50 }
 * });
 *
 * // Or use individual operations
 * await session.sort({ column: 'name', order: 'asc' });
 * const filtered = await session.filter({
 *   conditions: [{ column: 'age', operator: 'gt', value: 30 }]
 * });
 *
 * // Cleanup
 * session.dispose();
 * ```
 */
export class CsvWorkerSession {
  private readonly _pool: CsvWorkerPool;
  private readonly _sessionId: string;
  private _disposed = false;
  private _headers: string[] = [];
  private _rowCount = 0;

  constructor(pool?: CsvWorkerPool) {
    this._sessionId = `session_${++sessionIdCounter}_${Date.now()}`;
    this._pool = pool ?? getDefaultWorkerPool();
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get headers(): string[] {
    return this._headers;
  }

  get rowCount(): number {
    return this._rowCount;
  }

  /**
   * Load CSV string or data into session
   */
  async load(
    csvOrData: string | any[] | any[][],
    options?: CsvParseOptions & { headers?: string[] | boolean }
  ): Promise<{ rowCount: number; headers: string[] }> {
    if (this._disposed) {
      throw new CsvWorkerError("Session has been disposed");
    }

    if (typeof csvOrData === "string") {
      const parseOptions = { ...options, sessionId: this._sessionId };
      const result = await this._pool.parse(csvOrData, parseOptions);
      const data = result.data as any;
      this._headers = data.headers || [];
      this._rowCount = data.rows?.length ?? (Array.isArray(data) ? data.length : 0);
      return { rowCount: this._rowCount, headers: this._headers };
    } else {
      const result = await this._pool.load(
        this._sessionId,
        csvOrData,
        Array.isArray(options?.headers) ? options.headers : undefined
      );
      this._headers = result.data.headers;
      this._rowCount = result.data.rowCount;
      return result.data;
    }
  }

  /** Get all data */
  getData = this._wrap(() => this._pool.getData(this._sessionId).then(r => r.data));

  /** Sort data in place */
  sort = (config: SortConfig | SortConfig[]) =>
    this._wrap(() => this._pool.sort(this._sessionId, config).then(r => r.data))();

  /** Filter data (resets to original data before filtering) */
  filter = (config: FilterConfig) => this._wrap(() => this._pool.filter(this._sessionId, config))();

  /** Search across columns */
  search = (config: SearchConfig) => this._wrap(() => this._pool.search(this._sessionId, config))();

  /** Group by and aggregate */
  groupBy = (config: GroupByConfig) =>
    this._wrap(() => this._pool.groupBy(this._sessionId, config))();

  /** Aggregate entire dataset */
  aggregate = (config: AggregateConfig[]) =>
    this._wrap(() => this._pool.aggregate(this._sessionId, config))();

  /** Get paginated data */
  getPage = (config: PageConfig) => this._wrap(() => this._pool.getPage(this._sessionId, config))();

  /**
   * Execute batch query - multiple operations in single round-trip
   * Order of operations: sort -> filter -> search -> groupBy/aggregate -> page
   */
  query = (config: QueryConfig) => this._wrap(() => this._pool.query(this._sessionId, config))();

  /** Dispose session and free worker memory */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    await this._pool.clear(this._sessionId).catch(() => {});
  }

  /** Wrap operation with disposed check */
  private _wrap<T>(fn: () => Promise<T>): () => Promise<T> {
    return () => {
      if (this._disposed) {
        return Promise.reject(new Error("Session has been disposed"));
      }
      return fn();
    };
  }
}

// =============================================================================
// Default Pool & Convenience Functions
// =============================================================================

let defaultPool: CsvWorkerPool | null = null;

/** @internal */
export function getDefaultWorkerPool(): CsvWorkerPool {
  if (!defaultPool) {
    defaultPool = new CsvWorkerPool();
  }
  return defaultPool;
}

export function terminateDefaultWorkerPool(): void {
  if (defaultPool) {
    defaultPool.terminate();
    defaultPool = null;
  }
}

/** Parse CSV using worker pool */
export async function parseWithPool(
  data: string,
  options?: CsvParseOptions,
  taskOptions?: CsvTaskOptions
): Promise<CsvTaskResult<string[][] | CsvParseResult<Record<string, string>>>> {
  return getDefaultWorkerPool().parse(data, options, taskOptions);
}

/** Format data to CSV using worker pool */
export async function formatWithPool(
  data: any[][],
  options?: CsvFormatOptions,
  taskOptions?: CsvTaskOptions
): Promise<CsvTaskResult<string>> {
  return getDefaultWorkerPool().format(data, options, taskOptions);
}

// =============================================================================
// Re-exports
// =============================================================================

// Export Pool class for tests and advanced usage
export { CsvWorkerPool };

export type {
  // Config types
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
  // Result types
  FilterResult,
  PageResult,
  GroupResult,
  AggregateResult,
  QueryResult
} from "./types";
