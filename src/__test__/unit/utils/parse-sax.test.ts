/**
 * Unit tests for the SAX XML parser (parse-sax.ts)
 *
 * Based on saxes test suite (https://github.com/lddubeau/saxes)
 * Covers parsing features used by this project.
 */

import { describe, it, expect } from "vitest";
import type { SaxesTagPlain } from "../../../modules/excel/utils/parse-sax";
import { SaxesParser, parseSax } from "../../../modules/excel/utils/parse-sax";

// Helper type for test events
type EventTuple = ["opentag" | "closetag" | "text" | "error", any];

/**
 * Helper function to run SAX parser tests
 */
function test(options: {
  name: string;
  xml: string | string[];
  expect: EventTuple[];
  opt?: { xmlns?: boolean; position?: boolean; fileName?: string; fragment?: boolean };
}): void {
  it(options.name, () => {
    const parser = new SaxesParser(options.opt);
    const events: EventTuple[] = [];

    // Register event handlers
    parser.on("opentag", tag => {
      events.push([
        "opentag",
        {
          name: tag.name,
          attributes: tag.attributes,
          isSelfClosing: tag.isSelfClosing
        }
      ]);
    });

    parser.on("closetag", tag => {
      events.push([
        "closetag",
        {
          name: tag.name,
          attributes: tag.attributes,
          isSelfClosing: tag.isSelfClosing
        }
      ]);
    });

    parser.on("text", text => {
      events.push(["text", text]);
    });

    parser.on("error", err => {
      events.push(["error", err.message]);
    });

    // Write XML
    if (Array.isArray(options.xml)) {
      for (const chunk of options.xml) {
        parser.write(chunk);
      }
      parser.close();
    } else {
      parser.write(options.xml).close();
    }

    // Compare events
    expect(events).toEqual(options.expect);
  });
}

// ============================================================================
// Basic Parsing Tests
// ============================================================================

describe("SaxesParser", () => {
  describe("basic parsing", () => {
    test({
      name: "simple element",
      xml: "<root></root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "element with text",
      xml: "<root>hello world</root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["text", "hello world"],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "nested elements",
      xml: "<root><child>text</child></root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["text", "text"],
        ["closetag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "multiple children",
      xml: "<root><a>1</a><b>2</b><c>3</c></root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["text", "1"],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["text", "2"],
        ["closetag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "c", attributes: {}, isSelfClosing: false }],
        ["text", "3"],
        ["closetag", { name: "c", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Self-Closing Tags
  // ============================================================================

  describe("self-closing tags", () => {
    test({
      name: "self-closing tag",
      xml:
        "<root>   " +
        "<haha /> " +
        "<haha/>  " +
        "<monkey> " +
        "=(|)    " +
        "</monkey>" +
        "</root>  ",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["text", "   "],
        ["opentag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["text", " "],
        ["opentag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["text", "  "],
        ["opentag", { name: "monkey", attributes: {}, isSelfClosing: false }],
        ["text", " =(|)    "],
        ["closetag", { name: "monkey", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["text", "  "]
      ]
    });

    test({
      name: "self-closing child",
      xml:
        "<root>" +
        "<child>" +
        "<haha />" +
        "</child>" +
        "<monkey>" +
        "=(|)" +
        "</monkey>" +
        "</root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "haha", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "monkey", attributes: {}, isSelfClosing: false }],
        ["text", "=(|)"],
        ["closetag", { name: "monkey", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "simple self-closing",
      xml: "<br/>",
      expect: [
        ["opentag", { name: "br", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "br", attributes: {}, isSelfClosing: true }]
      ]
    });

    test({
      name: "self-closing with space",
      xml: "<br />",
      expect: [
        ["opentag", { name: "br", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "br", attributes: {}, isSelfClosing: true }]
      ]
    });
  });

  // ============================================================================
  // Attributes
  // ============================================================================

  describe("attributes", () => {
    test({
      name: "single attribute",
      xml: '<root attr="value"></root>',
      expect: [
        ["opentag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "multiple attributes",
      xml: '<root a="1" b="2" c="3"></root>',
      expect: [
        ["opentag", { name: "root", attributes: { a: "1", b: "2", c: "3" }, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: { a: "1", b: "2", c: "3" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "single quotes",
      xml: "<root attr='value'></root>",
      expect: [
        ["opentag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "mixed quotes",
      xml: `<root a="1" b='2' c="3"></root>`,
      expect: [
        ["opentag", { name: "root", attributes: { a: "1", b: "2", c: "3" }, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: { a: "1", b: "2", c: "3" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "attributes separated by a space",
      xml: '<root attr1="first" attr2="second"/>',
      expect: [
        [
          "opentag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ]
      ]
    });

    test({
      name: "attributes separated by a newline",
      xml: '<root attr1="first"\nattr2="second"/>',
      expect: [
        [
          "opentag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ]
      ]
    });

    test({
      name: "attributes separated by multiple spaces",
      xml: '<root attr1="first"   attr2="second"/>',
      expect: [
        [
          "opentag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ]
      ]
    });

    test({
      name: "attribute with empty value",
      xml: '<root attr=""></root>',
      expect: [
        ["opentag", { name: "root", attributes: { attr: "" }, isSelfClosing: false }],
        ["closetag", { name: "root", attributes: { attr: "" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "attributes on self-closing",
      xml: '<item id="123" name="test"/>',
      expect: [
        ["opentag", { name: "item", attributes: { id: "123", name: "test" }, isSelfClosing: true }],
        ["closetag", { name: "item", attributes: { id: "123", name: "test" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "duplicate attribute",
      xml: '<span id="hello" id="there"></span>',
      // Our parser keeps last value for duplicate attributes without error
      expect: [
        ["opentag", { name: "span", attributes: { id: "there" }, isSelfClosing: false }],
        ["closetag", { name: "span", attributes: { id: "there" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "attributes without a space (should error but still parse)",
      xml: '<root attr1="first"attr2="second"/>',
      expect: [
        ["error", "1:20: no whitespace between attributes"],
        [
          "opentag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "root", attributes: { attr1: "first", attr2: "second" }, isSelfClosing: true }
        ]
      ]
    });
  });

  // ============================================================================
  // Entities
  // ============================================================================

  describe("entities", () => {
    test({
      name: "built-in entities",
      xml: "<r>&amp; &lt; &gt; ></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "& < > >"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "numeric decimal entity",
      xml: "<r>&#65;&#66;&#67;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "ABC"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "numeric hex entity",
      xml: "<r>&#x41;&#x42;&#x43;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "ABC"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "numeric hex entity lowercase",
      xml: "<r>&#xa;&#xA;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "\n\n"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "entity in attribute",
      xml: '<r attr="&amp;&lt;&gt;&quot;&apos;"/>',
      expect: [
        ["opentag", { name: "r", attributes: { attr: "&<>\"'" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "&<>\"'" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "single quote in double-quoted attribute",
      xml: '<r attr="it&apos;s"/>',
      expect: [
        ["opentag", { name: "r", attributes: { attr: "it's" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "it's" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "double quote in single-quoted attribute",
      xml: "<r attr='&quot;quoted&quot;'/>",
      expect: [
        ["opentag", { name: "r", attributes: { attr: '"quoted"' }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: '"quoted"' }, isSelfClosing: true }]
      ]
    });

    test({
      name: "emoji via numeric entity",
      xml: "<a>&#x1f525;</a>",
      expect: [
        ["opentag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["text", "\ud83d\udd25"],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Bad Entities
  // ============================================================================

  describe("bad entities", () => {
    test({
      name: "empty entity",
      xml: "<r>&;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["error", "1:5: empty entity"],
        ["text", "&;"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "empty decimal entity",
      xml: "<r>&#;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["error", "1:6: invalid character entity"],
        ["text", "&#;"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "empty hex entity",
      xml: "<r>&#x;</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["error", "1:7: invalid character entity"],
        ["text", "&#x;"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // CDATA
  // ============================================================================

  describe("CDATA", () => {
    test({
      name: "cdata basic",
      xml: "<r><![CDATA[ this is character data  ]]></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", " this is character data  "],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "cdata empty",
      xml: "<r><![CDATA[]]></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "cdata with special chars",
      xml: "<r><![CDATA[<>&\"']]></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "<>&\"'"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "cdata end in attribute",
      xml: "<r foo=']]>'/>",
      expect: [
        ["opentag", { name: "r", attributes: { foo: "]]>" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { foo: "]]>" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "cdata surrounded by whitespace",
      xml: `<content:encoded>
          <![CDATA[spacetime is four dimensional]]>
  </content:encoded>`,
      expect: [
        ["opentag", { name: "content:encoded", attributes: {}, isSelfClosing: false }],
        ["text", "\n          "],
        ["text", "spacetime is four dimensional"],
        ["text", "\n  "],
        ["closetag", { name: "content:encoded", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "cdata chunked",
      xml: ["<r><![CDATA[ this is ", "character data  ", "]]></r>"],
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", " this is character data  "],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Comments
  // ============================================================================

  describe("comments", () => {
    test({
      name: "comment basic",
      xml: "<r><!--foo--></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "comment empty",
      xml: "<r><!----></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "comment with dashes",
      xml: "<r><!-- foo - bar - baz --></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "multiple comments",
      xml: "<r><!--a--><!--b--></r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Processing Instructions
  // ============================================================================

  describe("processing instructions", () => {
    test({
      name: "xml declaration",
      xml: '<?xml version="1.0"?><root/>',
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: true }]
      ]
    });

    test({
      name: "xml declaration with encoding",
      xml: '<?xml version="1.0" encoding="UTF-8"?><root/>',
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: true }]
      ]
    });

    test({
      name: "processing instruction",
      xml: "<?foo bar?><root/>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: true }]
      ]
    });
  });

  // ============================================================================
  // DOCTYPE
  // ============================================================================

  describe("DOCTYPE", () => {
    test({
      name: "simple doctype",
      xml: "<!DOCTYPE root><root/>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: true }]
      ]
    });

    test({
      name: "doctype with internal subset",
      xml: "<!DOCTYPE root [<!ELEMENT root (#PCDATA)>]><root/>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: true }]
      ]
    });
  });

  // ============================================================================
  // Unicode
  // ============================================================================

  describe("unicode", () => {
    test({
      name: "cyrillic",
      xml: "<Р>тест</Р>",
      expect: [
        ["opentag", { name: "Р", attributes: {}, isSelfClosing: false }],
        ["text", "тест"],
        ["closetag", { name: "Р", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "emoji direct",
      xml: "<a>💩</a>",
      expect: [
        ["opentag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["text", "💩"],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "chinese characters",
      xml: "<中文>你好世界</中文>",
      expect: [
        ["opentag", { name: "中文", attributes: {}, isSelfClosing: false }],
        ["text", "你好世界"],
        ["closetag", { name: "中文", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "unicode sliced",
      xml: ["<a>💩", "</a>"],
      expect: [
        ["opentag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["text", "💩"],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // BOM (Byte Order Mark)
  // ============================================================================

  describe("BOM handling", () => {
    // Note: Our minimal parser doesn't special-case BOM handling.
    // BOM is treated as text outside root (error) or normal text inside root.
    // For Excel XML parsing, BOM handling at the stream level is sufficient.
    test({
      name: "BOM at start produces error (not skipped)",
      xml: "\uFEFF<P></P>",
      expect: [
        ["text", "\uFEFF"],
        ["error", "1:2: text data outside of root node."],
        ["opentag", { name: "P", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "P", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "BOM in contents",
      xml: '\uFEFF<P BOM="\uFEFF">\uFEFFStarts and ends with BOM\uFEFF</P>',
      expect: [
        ["text", "\uFEFF"],
        ["error", "1:2: text data outside of root node."],
        ["opentag", { name: "P", attributes: { BOM: "\uFEFF" }, isSelfClosing: false }],
        ["text", "\uFEFFStarts and ends with BOM\uFEFF"],
        ["closetag", { name: "P", attributes: { BOM: "\uFEFF" }, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Error Cases
  // ============================================================================

  describe("errors", () => {
    test({
      name: "unclosed root",
      xml: "<root>",
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["error", "1:6: unclosed tag: root"]
      ]
    });

    test({
      name: "unclosed root without position",
      xml: "<doc>",
      expect: [
        ["opentag", { name: "doc", attributes: {}, isSelfClosing: false }],
        ["error", "unclosed tag: doc"]
      ],
      opt: { position: false }
    });

    test({
      name: "unclosed root with fileName",
      xml: "<doc>",
      expect: [
        ["opentag", { name: "doc", attributes: {}, isSelfClosing: false }],
        ["error", "foobar.xml:1:5: unclosed tag: doc"]
      ],
      opt: { fileName: "foobar.xml" }
    });

    test({
      name: "unclosed nested tag",
      xml: "<root><child></root>",
      // Our parser auto-closes child when seeing mismatched </root>
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "child", attributes: {}, isSelfClosing: false }],
        ["error", "1:20: unclosed tag: child"],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "trailing non-whitespace text",
      xml: "<span>Welcome,</span> to monkey land",
      expect: [
        ["opentag", { name: "span", attributes: {}, isSelfClosing: false }],
        ["text", "Welcome,"],
        ["closetag", { name: "span", attributes: {}, isSelfClosing: false }],
        ["error", "1:36: text data outside of root node."],
        ["text", " to monkey land"]
      ]
    });
  });

  // ============================================================================
  // EOL (End of Line) Handling
  // ============================================================================

  describe("EOL handling", () => {
    test({
      name: "LF normalization",
      xml: "<r>line1\nline2</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "line1\nline2"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "CR normalization",
      xml: "<r>line1\rline2</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "line1\nline2"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "CRLF normalization",
      xml: "<r>line1\r\nline2</r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "line1\nline2"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "attribute CR normalization",
      xml: '<r attr="line1\rline2"/>',
      expect: [
        ["opentag", { name: "r", attributes: { attr: "line1 line2" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "line1 line2" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "attribute LF normalization",
      xml: '<r attr="line1\nline2"/>',
      expect: [
        ["opentag", { name: "r", attributes: { attr: "line1 line2" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "line1 line2" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "attribute TAB normalization",
      xml: '<r attr="a\tb"/>',
      expect: [
        ["opentag", { name: "r", attributes: { attr: "a b" }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "a b" }, isSelfClosing: true }]
      ]
    });
  });

  // ============================================================================
  // Chunked Parsing
  // ============================================================================

  describe("chunked parsing", () => {
    test({
      name: "tag split across chunks",
      xml: ["<roo", "t>text</root>"],
      expect: [
        ["opentag", { name: "root", attributes: {}, isSelfClosing: false }],
        ["text", "text"],
        ["closetag", { name: "root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "attribute split across chunks",
      xml: ["<root att", 'r="value">text</root>'],
      expect: [
        ["opentag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }],
        ["text", "text"],
        ["closetag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "attribute value split across chunks",
      xml: ['<root attr="val', 'ue">text</root>'],
      expect: [
        ["opentag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }],
        ["text", "text"],
        ["closetag", { name: "root", attributes: { attr: "value" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "entity split across chunks",
      xml: ["<r>&am", "p;</r>"],
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "&"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "char-by-char parsing",
      xml: "<r>text</r>".split(""),
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "text"],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Namespace-prefixed Tags (without namespace processing)
  // ============================================================================

  describe("namespace-prefixed tags", () => {
    test({
      name: "prefixed element",
      xml: "<ns:root><ns:child/></ns:root>",
      expect: [
        ["opentag", { name: "ns:root", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "ns:child", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "ns:child", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "ns:root", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "prefixed attribute",
      xml: '<root ns:attr="value"/>',
      expect: [
        ["opentag", { name: "root", attributes: { "ns:attr": "value" }, isSelfClosing: true }],
        ["closetag", { name: "root", attributes: { "ns:attr": "value" }, isSelfClosing: true }]
      ]
    });

    test({
      name: "xmlns declaration (treated as normal attribute)",
      xml: '<root xmlns="http://example.com"/>',
      expect: [
        [
          "opentag",
          { name: "root", attributes: { xmlns: "http://example.com" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "root", attributes: { xmlns: "http://example.com" }, isSelfClosing: true }
        ]
      ]
    });

    test({
      name: "xmlns prefix declaration",
      xml: '<ns:root xmlns:ns="http://example.com"/>',
      expect: [
        [
          "opentag",
          { name: "ns:root", attributes: { "xmlns:ns": "http://example.com" }, isSelfClosing: true }
        ],
        [
          "closetag",
          { name: "ns:root", attributes: { "xmlns:ns": "http://example.com" }, isSelfClosing: true }
        ]
      ]
    });
  });

  // ============================================================================
  // Excel-specific XML Patterns
  // ============================================================================

  describe("Excel XML patterns", () => {
    test({
      name: "worksheet cell",
      xml: '<c r="A1" s="1"><v>42</v></c>',
      expect: [
        ["opentag", { name: "c", attributes: { r: "A1", s: "1" }, isSelfClosing: false }],
        ["opentag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["text", "42"],
        ["closetag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "c", attributes: { r: "A1", s: "1" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "shared string",
      xml: "<si><t>Hello World</t></si>",
      expect: [
        ["opentag", { name: "si", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "t", attributes: {}, isSelfClosing: false }],
        ["text", "Hello World"],
        ["closetag", { name: "t", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "si", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "formula cell",
      xml: '<c r="B1" s="2"><f>A1+1</f><v>43</v></c>',
      expect: [
        ["opentag", { name: "c", attributes: { r: "B1", s: "2" }, isSelfClosing: false }],
        ["opentag", { name: "f", attributes: {}, isSelfClosing: false }],
        ["text", "A1+1"],
        ["closetag", { name: "f", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["text", "43"],
        ["closetag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "c", attributes: { r: "B1", s: "2" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "row with multiple cells",
      xml: '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row>',
      expect: [
        ["opentag", { name: "row", attributes: { r: "1" }, isSelfClosing: false }],
        ["opentag", { name: "c", attributes: { r: "A1" }, isSelfClosing: false }],
        ["opentag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["text", "1"],
        ["closetag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "c", attributes: { r: "A1" }, isSelfClosing: false }],
        ["opentag", { name: "c", attributes: { r: "B1" }, isSelfClosing: false }],
        ["opentag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["text", "2"],
        ["closetag", { name: "v", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "c", attributes: { r: "B1" }, isSelfClosing: false }],
        ["closetag", { name: "row", attributes: { r: "1" }, isSelfClosing: false }]
      ]
    });

    test({
      name: "style element",
      xml: '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>',
      expect: [
        ["opentag", { name: "font", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "sz", attributes: { val: "11" }, isSelfClosing: true }],
        ["closetag", { name: "sz", attributes: { val: "11" }, isSelfClosing: true }],
        ["opentag", { name: "color", attributes: { theme: "1" }, isSelfClosing: true }],
        ["closetag", { name: "color", attributes: { theme: "1" }, isSelfClosing: true }],
        ["opentag", { name: "name", attributes: { val: "Calibri" }, isSelfClosing: true }],
        ["closetag", { name: "name", attributes: { val: "Calibri" }, isSelfClosing: true }],
        ["closetag", { name: "font", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // Fragment Mode
  // ============================================================================

  describe("fragment mode", () => {
    test({
      name: "fragment - text only",
      xml: "just some text",
      expect: [["text", "just some text"]],
      opt: { fragment: true }
    });

    test({
      name: "fragment - multiple roots",
      xml: "<a/><b/><c/>",
      expect: [
        ["opentag", { name: "a", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: true }],
        ["opentag", { name: "b", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "b", attributes: {}, isSelfClosing: true }],
        ["opentag", { name: "c", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "c", attributes: {}, isSelfClosing: true }]
      ],
      opt: { fragment: true }
    });

    test({
      name: "fragment - mixed content",
      xml: "text1<tag>text2</tag>text3",
      expect: [
        ["text", "text1"],
        ["opentag", { name: "tag", attributes: {}, isSelfClosing: false }],
        ["text", "text2"],
        ["closetag", { name: "tag", attributes: {}, isSelfClosing: false }],
        ["text", "text3"]
      ],
      opt: { fragment: true }
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    test({
      name: "empty document (just root)",
      xml: "<r/>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: true }]
      ]
    });

    test({
      name: "very long attribute value",
      xml: `<r attr="${"a".repeat(10000)}"/>`,
      expect: [
        ["opentag", { name: "r", attributes: { attr: "a".repeat(10000) }, isSelfClosing: true }],
        ["closetag", { name: "r", attributes: { attr: "a".repeat(10000) }, isSelfClosing: true }]
      ]
    });

    test({
      name: "very long text content",
      xml: `<r>${"x".repeat(10000)}</r>`,
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "x".repeat(10000)],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "deeply nested elements",
      xml: "<a><b><c><d><e>deep</e></d></c></b></a>",
      expect: [
        ["opentag", { name: "a", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "c", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "d", attributes: {}, isSelfClosing: false }],
        ["opentag", { name: "e", attributes: {}, isSelfClosing: false }],
        ["text", "deep"],
        ["closetag", { name: "e", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "d", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "c", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["closetag", { name: "a", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "mixed content (text and elements)",
      xml: "<p>Hello <b>world</b>!</p>",
      expect: [
        ["opentag", { name: "p", attributes: {}, isSelfClosing: false }],
        ["text", "Hello "],
        ["opentag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["text", "world"],
        ["closetag", { name: "b", attributes: {}, isSelfClosing: false }],
        ["text", "!"],
        ["closetag", { name: "p", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "whitespace-only text",
      xml: "<r>   \n\t  </r>",
      expect: [
        ["opentag", { name: "r", attributes: {}, isSelfClosing: false }],
        ["text", "   \n\t  "],
        ["closetag", { name: "r", attributes: {}, isSelfClosing: false }]
      ]
    });

    test({
      name: "numeric tag name",
      xml: "<_123>test</_123>",
      expect: [
        ["opentag", { name: "_123", attributes: {}, isSelfClosing: false }],
        ["text", "test"],
        ["closetag", { name: "_123", attributes: {}, isSelfClosing: false }]
      ]
    });
  });

  // ============================================================================
  // API Tests
  // ============================================================================

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

  // ============================================================================
  // parseSax async generator function tests
  // ============================================================================

  describe("parseSax async generator", () => {
    // Helper to convert array to async iterable
    async function* toAsyncIterable(chunks: string[]): AsyncGenerator<string> {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should parse simple XML as async generator", async () => {
      const chunks = ["<root>", "hello", "</root>"];
      const allEvents: any[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        allEvents.push(...events);
      }

      expect(allEvents.length).toBe(3);
      expect(allEvents[0].eventType).toBe("opentag");
      expect(allEvents[0].value.name).toBe("root");
      expect(allEvents[1].eventType).toBe("text");
      expect(allEvents[1].value).toBe("hello");
      expect(allEvents[2].eventType).toBe("closetag");
      expect(allEvents[2].value.name).toBe("root");
    });

    it("should handle multiple elements", async () => {
      const chunks = ['<row r="1"><c r="A1"><v>42</v></c></row>'];
      const allEvents: any[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        allEvents.push(...events);
      }

      const eventTypes = allEvents.map(e => e.eventType);
      expect(eventTypes).toEqual([
        "opentag",
        "opentag",
        "opentag",
        "text",
        "closetag",
        "closetag",
        "closetag"
      ]);
    });

    it("should handle empty chunks gracefully", async () => {
      const chunks = ["<root>", "", "text", "", "</root>"];
      const allEvents: any[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        allEvents.push(...events);
      }

      expect(allEvents.some(e => e.eventType === "text" && e.value === "text")).toBe(true);
    });

    it("should yield events in batches per chunk", async () => {
      const chunks = ["<a/>", "<b/>"];
      const batchSizes: number[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        batchSizes.push(events.length);
      }

      // First chunk yields opentag+closetag for <a/>
      // Second chunk yields opentag+closetag for <b/>
      expect(batchSizes[0]).toBe(2);
      expect(batchSizes[1]).toBe(2);
    });

    it("should work with single chunk containing full XML", async () => {
      const chunks = ['<root attr="value">content</root>'];
      const allEvents: any[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        allEvents.push(...events);
      }

      expect(allEvents[0].eventType).toBe("opentag");
      expect(allEvents[0].value.attributes.attr).toBe("value");
      expect(allEvents[1].eventType).toBe("text");
      expect(allEvents[1].value).toBe("content");
    });

    it("should handle Excel-like XML structure", async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
    </row>
  </sheetData>
</worksheet>`;
      const chunks = [xml];
      const allEvents: any[] = [];

      for await (const events of parseSax(toAsyncIterable(chunks))) {
        allEvents.push(...events);
      }

      const tagNames = allEvents.filter(e => e.eventType === "opentag").map(e => e.value.name);

      expect(tagNames).toContain("worksheet");
      expect(tagNames).toContain("sheetData");
      expect(tagNames).toContain("row");
      expect(tagNames).toContain("c");
      expect(tagNames).toContain("v");
    });
  });
});
