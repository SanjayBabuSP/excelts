import { describe, it, expect } from "vitest";
import { decodeOoxmlEscape, encodeOoxmlEscape } from "@utils/utils";

describe("decodeOoxmlEscape", () => {
  it("decodes uppercase hex digits", () => {
    expect(decodeOoxmlEscape("_x000D_")).toBe("\r");
    expect(decodeOoxmlEscape("_x000A_")).toBe("\n");
    expect(decodeOoxmlEscape("_x0041_")).toBe("A");
  });

  it("decodes lowercase hex digits", () => {
    expect(decodeOoxmlEscape("_x000d_")).toBe("\r");
    expect(decodeOoxmlEscape("_x000a_")).toBe("\n");
    expect(decodeOoxmlEscape("_x0041_")).toBe("A");
  });

  it("decodes mixed-case hex digits", () => {
    expect(decodeOoxmlEscape("_x00aB_")).toBe("\u00AB");
    expect(decodeOoxmlEscape("_x00Ab_")).toBe("\u00AB");
  });

  it("decodes escape sequences within surrounding text", () => {
    expect(decodeOoxmlEscape("Col3_x000a_new line")).toBe("Col3\nnew line");
    expect(decodeOoxmlEscape("Hello_x000D_World")).toBe("Hello\rWorld");
  });

  it("decodes multiple escape sequences", () => {
    expect(decodeOoxmlEscape("A_x000a_B_x000d_C")).toBe("A\nB\rC");
  });

  it("handles _x005F_ escaped underscore correctly", () => {
    // _x005F_ decodes to _ and prevents the following x000D_ from forming a pattern
    expect(decodeOoxmlEscape("_x005F_x000D_")).toBe("_x000D_");
    expect(decodeOoxmlEscape("_x005f_x000d_")).toBe("_x000d_");
  });

  it("passes through text without escape sequences unchanged", () => {
    expect(decodeOoxmlEscape("Hello World")).toBe("Hello World");
    expect(decodeOoxmlEscape("")).toBe("");
    expect(decodeOoxmlEscape("_test_")).toBe("_test_");
    expect(decodeOoxmlEscape("_xZZZZ_")).toBe("_xZZZZ_");
  });
});

describe("encodeOoxmlEscape", () => {
  it("escapes literal _xHHHH_ patterns", () => {
    expect(encodeOoxmlEscape("_x000D_")).toBe("_x005F_x000D_");
    expect(encodeOoxmlEscape("_x000a_")).toBe("_x005F_x000a_");
  });

  it("passes through normal text unchanged", () => {
    expect(encodeOoxmlEscape("Hello World")).toBe("Hello World");
    expect(encodeOoxmlEscape("")).toBe("");
    expect(encodeOoxmlEscape("_test_")).toBe("_test_");
  });

  it("does not escape non-hex patterns", () => {
    expect(encodeOoxmlEscape("_xZZZZ_")).toBe("_xZZZZ_");
  });

  it("roundtrips correctly with decodeOoxmlEscape", () => {
    const testCases = ["_x000D_", "_x000a_", "Col3_x000A_new line", "Hello World", ""];
    for (const input of testCases) {
      expect(decodeOoxmlEscape(encodeOoxmlEscape(input))).toBe(input);
    }
  });
});
