/**
 * Event Emitter
 *
 * Browser-compatible EventEmitter with a Node.js-like API surface.
 * Kept lightweight and allocation-lean for hot paths.
 */

export type EventListener = (...args: any[]) => void;

type ListenerList = EventListener[];
type ListenerValue = EventListener | ListenerList;

const isListenerList = (value: ListenerValue): value is ListenerList => Array.isArray(value);

export class EventEmitter {
  // Brand for ExcelTS browser stream objects.
  // Use a string key (not a Symbol) so it still works if the bundle ends up
  // containing multiple copies of this module.
  readonly __excelts_stream: true = true;

  private _listeners: Map<string | symbol, ListenerValue> = new Map();
  private _maxListeners: number = EventEmitter.defaultMaxListeners;

  static defaultMaxListeners: number = 10;

  addListener(event: string | symbol, listener: EventListener): this {
    return this.on(event, listener);
  }

  private _listenerCount(value: ListenerValue | undefined): number {
    if (!value) {
      return 0;
    }
    return isListenerList(value) ? value.length : 1;
  }

  private _hasListeners(event: string | symbol): boolean {
    return this._listenerCount(this._listeners.get(event)) > 0;
  }

  on(event: string | symbol, listener: EventListener): this {
    const existing = this._listeners.get(event);

    // Warn if exceeding max listeners (skip check if maxListeners is 0 = unlimited)
    if (this._maxListeners > 0) {
      const count = this._listenerCount(existing);
      if (count >= this._maxListeners) {
        // Avoid hard dependency on console for bundle/minified builds
        console?.warn?.(
          `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ` +
            `${count + 1} ${String(event)} listeners added. ` +
            `Use emitter.setMaxListeners() to increase limit`
        );
      }
    }

    if (!existing) {
      this._listeners.set(event, listener);
    } else if (isListenerList(existing)) {
      existing.push(listener);
    } else {
      this._listeners.set(event, [existing, listener]);
    }

    // Node emits 'newListener' only if someone is listening to it.
    if (event !== "newListener" && this._hasListeners("newListener")) {
      this.emit("newListener", event, listener);
    }
    return this;
  }

  prependListener(event: string | symbol, listener: EventListener): this {
    const existing = this._listeners.get(event);
    if (!existing) {
      this._listeners.set(event, listener);
    } else if (isListenerList(existing)) {
      existing.unshift(listener);
    } else {
      this._listeners.set(event, [listener, existing]);
    }

    if (event !== "newListener" && this._hasListeners("newListener")) {
      this.emit("newListener", event, listener);
    }
    return this;
  }

  once(event: string | symbol, listener: EventListener): this {
    const onceWrapper = (...args: any[]): void => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    (onceWrapper as any).listener = listener;
    return this.on(event, onceWrapper);
  }

  prependOnceListener(event: string | symbol, listener: EventListener): this {
    const onceWrapper = (...args: any[]): void => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    (onceWrapper as any).listener = listener;
    return this.prependListener(event, onceWrapper);
  }

  removeListener(event: string | symbol, listener: EventListener): this {
    return this.off(event, listener);
  }

  off(event: string | symbol, listener: EventListener): this {
    const existing = this._listeners.get(event);
    if (!existing) {
      return this;
    }

    if (!isListenerList(existing)) {
      if (existing === listener || (existing as any).listener === listener) {
        this._listeners.delete(event);
        if (event !== "removeListener" && this._hasListeners("removeListener")) {
          this.emit("removeListener", event, listener);
        }
      }
      return this;
    }

    const listeners = existing;
    if (listeners.length === 0) {
      this._listeners.delete(event);
      return this;
    }

    // Fast path: direct match
    const directIdx = listeners.indexOf(listener);
    if (directIdx !== -1) {
      listeners.splice(directIdx, 1);
    } else {
      // Slow path: check for once wrapper
      for (let i = 0, len = listeners.length; i < len; i++) {
        if ((listeners[i] as any).listener === listener) {
          listeners.splice(i, 1);
          break;
        }
      }
    }

    if (listeners.length === 0) {
      this._listeners.delete(event);
    } else if (listeners.length === 1) {
      this._listeners.set(event, listeners[0]);
    }

    if (event !== "removeListener" && this._hasListeners("removeListener")) {
      this.emit("removeListener", event, listener);
    }

    return this;
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const existing = this._listeners.get(event);
    if (!existing) {
      return false;
    }

    if (!isListenerList(existing)) {
      try {
        existing.apply(this, args);
      } catch (err) {
        if (event !== "error") {
          this.emit("error", err);
        }
      }
      return true;
    }

    const listeners = existing;
    const len = listeners.length;
    if (len === 0) {
      return false;
    }

    if (len === 1) {
      try {
        listeners[0].apply(this, args);
      } catch (err) {
        if (event !== "error") {
          this.emit("error", err);
        }
      }
      return true;
    }

    if (len === 2) {
      const l0 = listeners[0];
      const l1 = listeners[1];
      try {
        l0.apply(this, args);
      } catch (err) {
        if (event !== "error") {
          this.emit("error", err);
        }
      }
      try {
        l1.apply(this, args);
      } catch (err) {
        if (event !== "error") {
          this.emit("error", err);
        }
      }
      return true;
    }

    // Snapshot to allow removal during emit
    const snapshot = listeners.slice();
    for (let i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i].apply(this, args);
      } catch (err) {
        if (event !== "error") {
          this.emit("error", err);
        }
      }
    }
    return true;
  }

  removeAllListeners(event?: string | symbol): this {
    if (event !== undefined) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  listenerCount(event: string | symbol): number {
    return this._listenerCount(this._listeners.get(event));
  }

  listeners(event: string | symbol): EventListener[] {
    const value = this._listeners.get(event);
    if (!value) {
      return [];
    }
    return isListenerList(value) ? value.slice() : [value];
  }

  rawListeners(event: string | symbol): EventListener[] {
    const value = this._listeners.get(event);
    if (!value) {
      return [];
    }
    return isListenerList(value) ? value.slice() : [value];
  }

  eventNames(): (string | symbol)[] {
    return [...this._listeners.keys()];
  }

  setMaxListeners(n: number): this {
    this._maxListeners = n;
    return this;
  }

  getMaxListeners(): number {
    return this._maxListeners;
  }
}
