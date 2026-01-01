const escapeHtmlMap: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};
const escapeHtmlRegex = /["&<>]/g;

export function isEqual(a: any, b: any): boolean {
  // Fast path: identical references or primitives
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }

  const aType = typeof a;
  if (aType !== typeof b) {
    return false;
  }

  // Primitives already handled by ===
  if (aType !== "object") {
    return false;
  }

  // Arrays
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) {
    return false;
  }

  if (aIsArray) {
    const len = a.length;
    if (len !== b.length) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // Objects
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i = 0, len = aKeys.length; i < len; i++) {
    const key = aKeys[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!isEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

export function escapeHtml(html: string): string {
  return html.replace(escapeHtmlRegex, char => escapeHtmlMap[char]);
}

export function isUndefined(val: any): val is undefined {
  return val === undefined;
}

export function isObject(val: any): val is Record<string, any> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

export function deepMerge<T = any>(...args: any[]): T {
  const target: any = args[0] || {};
  const len = args.length;

  for (let i = 1; i < len; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (Array.isArray(arg)) {
      for (let j = 0, jLen = arg.length; j < jLen; j++) {
        const val = arg[j];
        if (val === undefined) {
          continue;
        }
        const src = target[j];
        if (Array.isArray(val)) {
          target[j] = deepMerge(Array.isArray(src) ? src : [], val);
        } else if (isObject(val)) {
          target[j] = deepMerge(isObject(src) ? src : {}, val);
        } else {
          target[j] = val;
        }
      }
    } else {
      const keys = Object.keys(arg);
      for (let j = 0, jLen = keys.length; j < jLen; j++) {
        const key = keys[j];
        // Prevent prototype pollution
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        const val = arg[key];
        if (val === undefined) {
          continue;
        }
        const src = target[key];
        if (Array.isArray(val)) {
          target[key] = deepMerge(Array.isArray(src) ? src : [], val);
        } else if (isObject(val)) {
          target[key] = deepMerge(isObject(src) ? src : {}, val);
        } else {
          target[key] = val;
        }
      }
    }
  }
  return target;
}

export function cloneDeep(obj: any, preserveUndefined = true): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const len = obj.length;
    const clone = new Array(len);
    for (let i = 0; i < len; i++) {
      const value = obj[i];
      if (value !== undefined) {
        clone[i] = cloneDeep(value, preserveUndefined);
      } else if (preserveUndefined) {
        clone[i] = undefined;
      }
    }
    return clone;
  }

  const clone: any = {};
  const keys = Object.keys(obj);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const value = obj[key];
    if (value !== undefined) {
      clone[key] = cloneDeep(value, preserveUndefined);
    } else if (preserveUndefined) {
      clone[key] = undefined;
    }
  }
  return clone;
}

export function get<T = any>(obj: any, path: string, defaultValue?: T): T {
  const keys = path.split(".");
  let result = obj;
  for (let i = 0, len = keys.length; i < len; i++) {
    if (result == null) {
      return defaultValue as T;
    }
    result = result[keys[i]];
  }
  return result ?? (defaultValue as T);
}
