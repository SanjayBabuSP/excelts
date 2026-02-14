/**
 * Stream Utilities (browser)
 *
 * Browser counterpart of `utils.ts`, selected automatically
 * by the `preferBrowserFilesPlugin()` mechanism.
 */

import { createReadableFromArray, createTransform } from "@stream/browser/factories";
import { consumers } from "@stream/browser/utils";
import type { UtilsDeps } from "./utils.base";

import {
  collect,
  createText,
  createJson,
  createBytes,
  createFromString,
  createFromJSON,
  createFromBytes,
  createTransformHelper,
  createFilter,
  isReadableStreamLike,
  readableStreamToAsyncIterable
} from "./utils.base";

const deps: UtilsDeps = { createReadableFromArray, createTransform, consumers };

export { collect, isReadableStreamLike, readableStreamToAsyncIterable };

export const text = createText(deps);
export const json = createJson(deps);
export const bytes = createBytes(deps);
export const fromString = createFromString(deps);
export const fromJSON = createFromJSON(deps);
export const fromBytes = createFromBytes(deps);
export const transform = createTransformHelper(deps);
export const filter = createFilter(deps);
