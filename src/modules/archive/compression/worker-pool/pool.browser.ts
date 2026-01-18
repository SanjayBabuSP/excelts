/**
 * Browser Worker Pool Implementation
 *
 * A worker pool for parallel compression/decompression in the browser.
 * Automatically manages worker lifecycle, task scheduling, and load balancing.
 *
 * Features:
 * - Automatic worker scaling based on workload
 * - Task prioritization (high/normal/low)
 * - Idle worker termination to save resources
 * - Transferable objects for zero-copy data transfer
 * - Task cancellation via AbortSignal
 * - Graceful error handling and recovery
 */

import type {
  WorkerPoolOptions,
  WorkerPoolStats,
  TaskOptions,
  TaskResult,
  WorkerTaskType,
  WorkerRequestMessage,
  WorkerResponseMessage,
  TaskPriority
} from "./types";
import {
  resolvePoolOptions,
  getPriorityValue,
  hasWorkerSupport,
  createAbortError
} from "./pool.base";
import { getWorkerBlobUrl, releaseWorkerBlobUrl } from "./worker-script";

export type { WorkerPoolOptions, WorkerPoolStats, TaskOptions, TaskResult, WorkerTaskType };
export { hasWorkerSupport };

/**
 * Internal task representation
 */
interface PendingTask {
  taskId: number;
  taskType: WorkerTaskType;
  data: Uint8Array;
  level?: number;
  priority: TaskPriority;
  priorityValue: number;
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
  allowTransfer?: boolean;
  startTime: number;
}

/**
 * Internal worker wrapper
 */
interface PoolWorker {
  id: number;
  worker: Worker;
  busy: boolean;
  currentTaskId: number | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Browser Worker Pool
 *
 * Manages a pool of Web Workers for parallel compression/decompression.
 */
export class WorkerPool {
  private readonly _options: ReturnType<typeof resolvePoolOptions>;
  private readonly _workers: Map<number, PoolWorker> = new Map();
  private readonly _taskQueue: PendingTask[] = [];
  private readonly _pendingTasks: Map<number, PendingTask> = new Map();
  private _nextTaskId = 1;
  private _nextWorkerId = 1;
  private _terminated = false;
  private _completedTasks = 0;
  private _failedTasks = 0;
  private readonly _workerUrl: string;
  private readonly _useCustomUrl: boolean;

  constructor(options?: WorkerPoolOptions) {
    this._options = resolvePoolOptions(options);

    // Use custom URL or generate inline worker
    if (this._options.workerUrl) {
      this._workerUrl = this._options.workerUrl;
      this._useCustomUrl = true;
    } else {
      this._workerUrl = getWorkerBlobUrl();
      this._useCustomUrl = false;
    }

    // Pre-warm minimum workers
    for (let i = 0; i < this._options.minWorkers; i++) {
      this._createWorker();
    }
  }

  /**
   * Execute a task in the worker pool
   */
  async execute(
    taskType: WorkerTaskType,
    data: Uint8Array,
    options?: TaskOptions & { level?: number }
  ): Promise<TaskResult> {
    if (this._terminated) {
      throw new Error("Worker pool has been terminated");
    }

    if (!hasWorkerSupport()) {
      throw new Error("Web Workers are not supported in this environment");
    }

    // Check if already aborted
    if (options?.signal?.aborted) {
      throw createAbortError();
    }

    const taskId = this._nextTaskId++;
    const priority = options?.priority ?? "normal";
    const priorityValue = getPriorityValue(priority);

    return new Promise<TaskResult>((resolve, reject) => {
      const task: PendingTask = {
        taskId,
        taskType,
        data,
        level: options?.level,
        priority,
        priorityValue,
        resolve,
        reject,
        signal: options?.signal,
        allowTransfer: options?.allowTransfer,
        startTime: performance.now()
      };

      // Set up abort handler
      if (options?.signal) {
        task.abortHandler = () => {
          this._cancelTask(taskId);
        };
        options.signal.addEventListener("abort", task.abortHandler, { once: true });
      }

      this._pendingTasks.set(taskId, task);
      this._enqueueTask(task);
      this._processQueue();
    });
  }

  /**
   * Get current pool statistics
   */
  getStats(): WorkerPoolStats {
    const totalWorkers = this._workers.size;
    let activeWorkers = 0;
    for (const worker of this._workers.values()) {
      if (worker.busy) {
        activeWorkers++;
      }
    }

    return {
      totalWorkers,
      activeWorkers,
      idleWorkers: totalWorkers - activeWorkers,
      pendingTasks: this._taskQueue.length,
      completedTasks: this._completedTasks,
      failedTasks: this._failedTasks
    };
  }

  /**
   * Terminate all workers and clean up resources
   */
  terminate(): void {
    if (this._terminated) {
      return;
    }
    this._terminated = true;

    // Terminate all workers
    for (const poolWorker of this._workers.values()) {
      this._terminateWorker(poolWorker);
    }
    this._workers.clear();

    // Reject all pending tasks
    const error = new Error("Worker pool terminated");
    for (const task of this._pendingTasks.values()) {
      this._cleanupTask(task);
      task.reject(error);
    }
    this._pendingTasks.clear();
    this._taskQueue.length = 0;

    // Release blob URL if we created it
    if (!this._useCustomUrl) {
      releaseWorkerBlobUrl();
    }
  }

  /**
   * Check if the pool has been terminated
   */
  isTerminated(): boolean {
    return this._terminated;
  }

  /**
   * Create a new worker
   */
  private _createWorker(): PoolWorker | null {
    if (this._terminated || this._workers.size >= this._options.maxWorkers) {
      return null;
    }

    const id = this._nextWorkerId++;
    const worker = new Worker(this._workerUrl);

    const poolWorker: PoolWorker = {
      id,
      worker,
      busy: false,
      currentTaskId: null,
      idleTimer: null
    };

    // Set up message handler
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      this._handleWorkerMessage(poolWorker, event.data);
    };

    // Set up error handler
    worker.onerror = (event: ErrorEvent) => {
      this._handleWorkerError(poolWorker, event);
    };

    this._workers.set(id, poolWorker);
    return poolWorker;
  }

  /**
   * Terminate a single worker
   */
  private _terminateWorker(poolWorker: PoolWorker): void {
    this._clearIdleTimer(poolWorker);

    try {
      poolWorker.worker.postMessage({ type: "terminate" } as WorkerRequestMessage);
    } catch {
      // Worker may already be terminated
    }

    try {
      poolWorker.worker.terminate();
    } catch {
      // Ignore termination errors
    }

    this._workers.delete(poolWorker.id);
  }

  /**
   * Clear a worker's idle timer if set
   */
  private _clearIdleTimer(poolWorker: PoolWorker): void {
    if (poolWorker.idleTimer !== null) {
      clearTimeout(poolWorker.idleTimer);
      poolWorker.idleTimer = null;
    }
  }

  /**
   * Find an idle worker
   */
  private _findIdleWorker(): PoolWorker | undefined {
    for (const worker of this._workers.values()) {
      if (!worker.busy) {
        return worker;
      }
    }
    return undefined;
  }

  /**
   * Enqueue a task with priority ordering using binary search (O(log n))
   */
  private _enqueueTask(task: PendingTask): void {
    const queue = this._taskQueue;
    const priority = task.priorityValue;

    // Binary search for insertion point (higher priority first)
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (queue[mid].priorityValue >= priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    queue.splice(lo, 0, task);
  }

  /**
   * Process the task queue
   */
  private _processQueue(): void {
    if (this._terminated || this._taskQueue.length === 0) {
      return;
    }

    // Find an idle worker or create one
    const idleWorker = this._findIdleWorker() ?? this._createWorker() ?? undefined;

    // If still no worker available, wait for one to become idle
    if (!idleWorker) {
      return;
    }

    // Get the next task
    const task = this._taskQueue.shift();
    if (!task) {
      return;
    }

    // Check if task was cancelled while queued
    if (task.signal?.aborted) {
      this._pendingTasks.delete(task.taskId);
      this._cleanupTask(task);
      task.reject(createAbortError());
      // Continue processing next task (tail call optimization via setTimeout)
      if (this._taskQueue.length > 0) {
        setTimeout(() => this._processQueue(), 0);
      }
      return;
    }

    // Assign task to worker
    this._assignTask(idleWorker, task);
  }

  /**
   * Assign a task to a worker
   */
  private _assignTask(poolWorker: PoolWorker, task: PendingTask): void {
    this._clearIdleTimer(poolWorker);

    poolWorker.busy = true;
    poolWorker.currentTaskId = task.taskId;

    // Use original buffer if allowTransfer is true, otherwise copy
    const data = task.allowTransfer ? task.data : task.data.slice();

    const message: WorkerRequestMessage = {
      type: "task",
      taskId: task.taskId,
      taskType: task.taskType,
      data,
      level: task.level
    };

    // Use transferables for zero-copy
    if (this._options.useTransferables) {
      poolWorker.worker.postMessage(message, [data.buffer]);
    } else {
      poolWorker.worker.postMessage(message);
    }
  }

  /**
   * Handle message from worker
   */
  private _handleWorkerMessage(poolWorker: PoolWorker, message: WorkerResponseMessage): void {
    if (message.type === "ready") {
      // Worker is initialized and ready
      return;
    }

    if (message.type === "result" || message.type === "error") {
      const taskId = message.taskId;
      if (typeof taskId !== "number") {
        return;
      }

      const task = this._pendingTasks.get(taskId);
      if (!task) {
        // Task was cancelled
        this._workerBecameIdle(poolWorker);
        return;
      }

      this._pendingTasks.delete(taskId);
      this._cleanupTask(task);

      if (message.type === "result") {
        this._completedTasks++;
        const duration = message.duration ?? performance.now() - task.startTime;
        task.resolve({
          data: message.data!,
          duration
        });
      } else {
        this._failedTasks++;
        task.reject(new Error(message.error ?? "Unknown worker error"));
      }

      this._workerBecameIdle(poolWorker);
    }
  }

  /**
   * Handle worker error
   */
  private _handleWorkerError(poolWorker: PoolWorker, event: ErrorEvent): void {
    const taskId = poolWorker.currentTaskId;

    // Terminate the failed worker
    this._terminateWorker(poolWorker);

    // Fail the current task if any
    if (taskId !== null) {
      const task = this._pendingTasks.get(taskId);
      if (task) {
        this._pendingTasks.delete(taskId);
        this._cleanupTask(task);
        this._failedTasks++;
        task.reject(new Error(event.message || "Worker error"));
      }
    }

    // Try to process remaining tasks
    this._processQueue();
  }

  /**
   * Called when a worker becomes idle
   */
  private _workerBecameIdle(poolWorker: PoolWorker): void {
    poolWorker.busy = false;
    poolWorker.currentTaskId = null;

    // Process more tasks if available
    if (this._taskQueue.length > 0) {
      this._processQueue();
    } else if (this._workers.size > this._options.minWorkers && this._options.idleTimeout > 0) {
      // Schedule idle timeout
      poolWorker.idleTimer = setTimeout(() => {
        // Double-check conditions before terminating
        if (
          !poolWorker.busy &&
          this._workers.size > this._options.minWorkers &&
          !this._terminated
        ) {
          this._terminateWorker(poolWorker);
        }
      }, this._options.idleTimeout);
    }
  }

  /**
   * Cancel a task
   */
  private _cancelTask(taskId: number): void {
    const task = this._pendingTasks.get(taskId);
    if (!task) {
      return;
    }

    // Remove from pending
    this._pendingTasks.delete(taskId);
    this._cleanupTask(task);

    // Remove from queue if still there
    const queueIndex = this._taskQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex >= 0) {
      this._taskQueue.splice(queueIndex, 1);
    }

    // Note: We can't cancel a task that's already running in a worker.
    // The worker will complete, and we'll ignore the result.

    task.reject(createAbortError());
  }

  /**
   * Clean up task resources
   */
  private _cleanupTask(task: PendingTask): void {
    if (task.abortHandler && task.signal) {
      task.signal.removeEventListener("abort", task.abortHandler);
    }
  }

  /**
   * Execute multiple tasks in parallel
   *
   * @param tasks - Array of task definitions
   * @returns Array of results in the same order as input
   */
  async executeBatch(
    tasks: Array<{
      taskType: WorkerTaskType;
      data: Uint8Array;
      options?: TaskOptions & { level?: number };
    }>
  ): Promise<TaskResult[]> {
    return Promise.all(
      tasks.map(({ taskType, data, options }) => this.execute(taskType, data, options))
    );
  }
}

// Singleton pool instance for convenience
let _defaultPool: WorkerPool | null = null;

/**
 * Get or create the default worker pool
 */
export function getDefaultWorkerPool(options?: WorkerPoolOptions): WorkerPool {
  if (!_defaultPool || _defaultPool.isTerminated()) {
    _defaultPool = new WorkerPool(options);
  }
  return _defaultPool;
}

/**
 * Terminate the default worker pool
 */
export function terminateDefaultWorkerPool(): void {
  if (_defaultPool) {
    _defaultPool.terminate();
    _defaultPool = null;
  }
}

/**
 * Execute a compression task using the default pool
 */
export async function deflateWithPool(
  data: Uint8Array,
  options?: TaskOptions & { level?: number }
): Promise<Uint8Array> {
  const result = await getDefaultWorkerPool().execute("deflate", data, options);
  return result.data;
}

/**
 * Execute a decompression task using the default pool
 */
export async function inflateWithPool(
  data: Uint8Array,
  options?: TaskOptions
): Promise<Uint8Array> {
  const result = await getDefaultWorkerPool().execute("inflate", data, options);
  return result.data;
}

/**
 * Internal helper for batch operations
 */
async function executeBatchByType(
  taskType: WorkerTaskType,
  items: Array<{ data: Uint8Array; options?: TaskOptions & { level?: number } }>
): Promise<Uint8Array[]> {
  const results = await getDefaultWorkerPool().executeBatch(
    items.map(({ data, options }) => ({ taskType, data, options }))
  );
  return results.map(r => r.data);
}

/**
 * Batch compress multiple data chunks in parallel using the default pool
 */
export async function deflateBatchWithPool(
  items: Array<{ data: Uint8Array; options?: TaskOptions & { level?: number } }>
): Promise<Uint8Array[]> {
  return executeBatchByType("deflate", items);
}

/**
 * Batch decompress multiple data chunks in parallel using the default pool
 */
export async function inflateBatchWithPool(
  items: Array<{ data: Uint8Array; options?: TaskOptions }>
): Promise<Uint8Array[]> {
  return executeBatchByType("inflate", items);
}
