/**
 * API tests for the SAX XML parser (parse-sax.ts)
 */

import { describe, it, expect } from "vitest";
import type { SaxesTagPlain } from "@excel/utils/parse-sax";
import { SaxesParser } from "@excel/utils/parse-sax";

describe("SaxesParser", () => {
  describe("API", () => {
    it("should support write().close() chaining", () => {
      const parser = new SaxesParser();
      const events: string[] = [];
      parser.on("opentag", tag => events.push(tag.name));
      parser.write("<root/>").close();
      expect(events).toEqual(["root"]);
    });

    it("should support off() to remove handlers", () => {
      const parser = new SaxesParser();
      const events: string[] = [];
      const handler = (tag: SaxesTagPlain) => events.push(tag.name);
      parser.on("opentag", handler);
      parser.write("<a/>");
      parser.off("opentag");
      parser.write("<b/>").close();
      expect(events).toEqual(["a"]);
    });

    it("should track position", () => {
      const parser = new SaxesParser({ position: true });
      parser.write("<root>\n  <child/>\n</root>");
      expect(parser.line).toBe(3);
    });

    it("should process close() without errors", () => {
      const parser = new SaxesParser();
      const events: string[] = [];
      parser.on("opentag", tag => events.push(tag.name));
      parser.write("<root/>").close();
      expect(events).toEqual(["root"]);
    });
  });
});
