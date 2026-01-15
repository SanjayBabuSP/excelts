/**
 * High-performance SAX XML parser
 *
 * Minimal implementation optimized for Excel XML parsing.
 * Supports: opentag, text, closetag, error events.
 * Zero external dependencies.
 *
 * Based on XML 1.0 specification with optimizations for common Excel XML patterns.
 */

import { bufferToString } from "@utils/utils";

// ============================================================================
// Types
// ============================================================================

export interface SaxEvent {
  eventType: "opentag" | "text" | "closetag";
  value: any;
}

export interface SaxesTagPlain {
  name: string;
  attributes: Record<string, string>;
  isSelfClosing: boolean;
}

export interface SaxesOptions {
  xmlns?: boolean;
  position?: boolean;
  fileName?: string;
  fragment?: boolean;
}

type TextHandler = (text: string) => void;
type OpenTagHandler = (tag: SaxesTagPlain) => void;
type CloseTagHandler = (tag: SaxesTagPlain) => void;
type ErrorHandler = (err: Error) => void;

// ============================================================================
// Character codes (for fast comparison)
// ============================================================================

const TAB = 9;
const NL = 0xa;
const CR = 0xd;
const SPACE = 0x20;
const BANG = 0x21; // !
const DQUOTE = 0x22; // "
const AMP = 0x26; // &
const SQUOTE = 0x27; // '
const MINUS = 0x2d; // -
const FORWARD_SLASH = 0x2f; // /
const SEMICOLON = 0x3b; // ;
const LESS = 0x3c; // <
const EQUAL = 0x3d; // =
const GREATER = 0x3e; // >
const QUESTION = 0x3f; // ?
const OPEN_BRACKET = 0x5b; // [
const CLOSE_BRACKET = 0x5d; // ]
const HASH = 0x23; // #

// ============================================================================
// Pre-computed lookup tables for performance
// ============================================================================

// ASCII character lookup (0-127) for String.fromCharCode
const ASCII_CHARS: string[] = new Array(128);
for (let i = 0; i < 128; i++) {
  ASCII_CHARS[i] = String.fromCharCode(i);
}

// Fast charFromCode - use lookup for ASCII, fallback for others
function charFromCode(c: number): string {
  return c < 128 ? ASCII_CHARS[c] : String.fromCodePoint(c);
}

// Bitmap for ASCII name start chars (a-zA-Z_:)
const NAME_START_CHAR_ASCII = new Uint8Array(128);
for (let i = 0x61; i <= 0x7a; i++) {
  NAME_START_CHAR_ASCII[i] = 1;
} // a-z
for (let i = 0x41; i <= 0x5a; i++) {
  NAME_START_CHAR_ASCII[i] = 1;
} // A-Z
NAME_START_CHAR_ASCII[0x5f] = 1; // _
NAME_START_CHAR_ASCII[0x3a] = 1; // :

// Bitmap for ASCII name chars (a-zA-Z0-9_:-.)
const NAME_CHAR_ASCII = new Uint8Array(128);
for (let i = 0x61; i <= 0x7a; i++) {
  NAME_CHAR_ASCII[i] = 1;
} // a-z
for (let i = 0x41; i <= 0x5a; i++) {
  NAME_CHAR_ASCII[i] = 1;
} // A-Z
for (let i = 0x30; i <= 0x39; i++) {
  NAME_CHAR_ASCII[i] = 1;
} // 0-9
NAME_CHAR_ASCII[0x5f] = 1; // _
NAME_CHAR_ASCII[0x3a] = 1; // :
NAME_CHAR_ASCII[0x2d] = 1; // -
NAME_CHAR_ASCII[0x2e] = 1; // .

// ============================================================================
// Character classification (inlined for performance)
// ============================================================================

// isS: space characters (XML whitespace)
function isS(c: number): boolean {
  return c === SPACE || c === NL || c === CR || c === TAB;
}

// isQuote: quote characters
function isQuote(c: number): boolean {
  return c === DQUOTE || c === SQUOTE;
}

// isNameStartChar: valid first character of XML name
// Optimized for common ASCII range first
function isNameStartChar(c: number): boolean {
  // Fast path: ASCII lookup
  if (c < 128) {
    return NAME_START_CHAR_ASCII[c] === 1;
  }
  // Extended ranges (less common in Excel XML)
  return (
    (c >= 0xc0 && c <= 0xd6) ||
    (c >= 0xd8 && c <= 0xf6) ||
    (c >= 0xf8 && c <= 0x2ff) ||
    (c >= 0x370 && c <= 0x37d) ||
    (c >= 0x37f && c <= 0x1fff) ||
    c === 0x200c ||
    c === 0x200d ||
    (c >= 0x2070 && c <= 0x218f) ||
    (c >= 0x2c00 && c <= 0x2fef) ||
    (c >= 0x3001 && c <= 0xd7ff) ||
    (c >= 0xf900 && c <= 0xfdcf) ||
    (c >= 0xfdf0 && c <= 0xfffd) ||
    (c >= 0x10000 && c <= 0xeffff)
  );
}

// isNameChar: valid character in XML name (includes digits, hyphen, period)
function isNameChar(c: number): boolean {
  // Fast path: ASCII lookup
  if (c < 128) {
    return NAME_CHAR_ASCII[c] === 1;
  }
  // Extended ranges
  return (
    c === 0xb7 ||
    (c >= 0xc0 && c <= 0xd6) ||
    (c >= 0xd8 && c <= 0xf6) ||
    (c >= 0xf8 && c <= 0x2ff) ||
    (c >= 0x300 && c <= 0x36f) ||
    (c >= 0x370 && c <= 0x37d) ||
    (c >= 0x37f && c <= 0x1fff) ||
    c === 0x200c ||
    c === 0x200d ||
    (c >= 0x203f && c <= 0x2040) ||
    (c >= 0x2070 && c <= 0x218f) ||
    (c >= 0x2c00 && c <= 0x2fef) ||
    (c >= 0x3001 && c <= 0xd7ff) ||
    (c >= 0xf900 && c <= 0xfdcf) ||
    (c >= 0xfdf0 && c <= 0xfffd) ||
    (c >= 0x10000 && c <= 0xeffff)
  );
}

// isChar10: valid XML 1.0 character
function isChar10(c: number): boolean {
  return (
    (c >= SPACE && c <= 0xd7ff) ||
    c === NL ||
    c === CR ||
    c === TAB ||
    (c >= 0xe000 && c <= 0xfffd) ||
    (c >= 0x10000 && c <= 0x10ffff)
  );
}

// ============================================================================
// Built-in XML entities
// ============================================================================

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  quot: '"',
  apos: "'"
};

// HAN CELL namespace prefix normalization
// HAN CELL uses non-standard namespace prefixes (ep:, cp:, dc:, etc.)
// The x: prefix for spreadsheetml is detected dynamically from xmlns declarations
// See: https://github.com/exceljs/exceljs/issues/3014
const HAN_CELL_PREFIXES = /^(ep|cp|dc|dcterms|dcmitype|vt):/;
const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

// ============================================================================
// Parser States
// ============================================================================

const S_TEXT = 0;
const S_OPEN_WAKA = 1; // <
const S_OPEN_WAKA_BANG = 2; // <!
const S_OPEN_TAG = 3; // <tagname
const S_OPEN_TAG_SLASH = 4; // <tagname /
const S_ATTRIB = 5; // <tagname attr
const S_ATTRIB_NAME = 6; // <tagname attr
const S_ATTRIB_NAME_SAW_WHITE = 7;
const S_ATTRIB_VALUE = 8; // <tagname attr=
const S_ATTRIB_VALUE_QUOTED = 9; // <tagname attr="
const S_ATTRIB_VALUE_CLOSED = 10;
const S_CLOSE_TAG = 11; // </tagname
const S_CLOSE_TAG_SAW_WHITE = 12;
const S_COMMENT = 13; // <!--
const S_COMMENT_ENDING = 14; // <!-- text -
const S_COMMENT_ENDED = 15; // <!-- text --
const S_CDATA = 16; // <![CDATA[
const S_CDATA_ENDING = 17; // <![CDATA[ text ]
const S_CDATA_ENDING_2 = 18; // <![CDATA[ text ]]
const S_PI = 19; // <?
const S_PI_ENDING = 20; // <? text ?
const S_DOCTYPE = 21; // <!DOCTYPE
const S_DOCTYPE_QUOTE = 22;
const S_DOCTYPE_DTD = 23;
const S_DOCTYPE_DTD_QUOTED = 24;
const S_ENTITY = 25; // &entity;

// ============================================================================
// SaxesParser Class - Minimal implementation for Excel XML
// ============================================================================

export class SaxesParser {
  // Configuration
  private trackPosition: boolean;
  private fileName?: string;
  private fragment: boolean;

  // Parser state
  private state: number = S_TEXT;
  private chunk: string = "";
  private i: number = 0;
  private prevI: number = 0;
  private text: string = "";
  private name: string = "";
  private q: number | null = null;
  private tags: SaxesTagPlain[] = [];
  private tag: SaxesTagPlain | null = null;
  private attribList: Array<{ name: string; value: string }> = [];
  private entity: string = "";
  private entityReturnState: number = S_TEXT;
  private openWakaBang: string = "";
  private sawRoot: boolean = false;
  private closedRoot: boolean = false;
  private carriedFromPrevious?: string;
  private _closed: boolean = false;
  private reportedTextBeforeRoot: boolean = false;
  private reportedTextAfterRoot: boolean = false;

  // Position tracking
  line: number = 1;
  column: number = 0;
  private positionAtNewLine: number = 0;
  private chunkPosition: number = 0;

  // Entity storage
  ENTITIES: Record<string, string> = { ...XML_ENTITIES };

  // HAN CELL compatibility: spreadsheetml namespace prefix (e.g., "x")
  private nsPrefix: string | null = null;

  // Event handlers
  private textHandler?: TextHandler;
  private openTagHandler?: OpenTagHandler;
  private closeTagHandler?: CloseTagHandler;
  private errorHandler?: ErrorHandler;

  constructor(opt?: SaxesOptions) {
    this.trackPosition = opt?.position !== false;
    this.fileName = opt?.fileName;
    this.fragment = opt?.fragment ?? false;
    this._init();
  }

  get closed(): boolean {
    return this._closed;
  }

  get position(): number {
    return this.chunkPosition + this.i;
  }

  private _init(): void {
    this.state = this.fragment ? S_TEXT : S_TEXT;
    this.text = "";
    this.name = "";
    this.q = null;
    this.tags = [];
    this.tag = null;
    this.attribList = [];
    this.entity = "";
    this.openWakaBang = "";
    this.sawRoot = this.fragment;
    this.closedRoot = this.fragment;
    this.reportedTextBeforeRoot = this.fragment;
    this.reportedTextAfterRoot = this.fragment;
    this.carriedFromPrevious = undefined;
    this._closed = false;
    this.line = 1;
    this.column = 0;
    this.positionAtNewLine = 0;
    this.chunkPosition = 0;
    this.chunk = "";
    this.i = 0;
    this.prevI = 0;
    this.nsPrefix = null;
  }

  // Strip HAN CELL namespace prefixes from element names
  private stripNsPrefix(name: string): string {
    const n = name.replace(HAN_CELL_PREFIXES, "");
    return this.nsPrefix && n.startsWith(this.nsPrefix + ":")
      ? n.slice(this.nsPrefix.length + 1)
      : n;
  }

  // Event registration
  on(name: "text", handler: TextHandler): void;
  on(name: "opentag", handler: OpenTagHandler): void;
  on(name: "closetag", handler: CloseTagHandler): void;
  on(name: "error", handler: ErrorHandler): void;
  on(name: string, handler: any): void {
    switch (name) {
      case "text":
        this.textHandler = handler;
        break;
      case "opentag":
        this.openTagHandler = handler;
        break;
      case "closetag":
        this.closeTagHandler = handler;
        break;
      case "error":
        this.errorHandler = handler;
        break;
    }
  }

  off(name: string): void {
    switch (name) {
      case "text":
        this.textHandler = undefined;
        break;
      case "opentag":
        this.openTagHandler = undefined;
        break;
      case "closetag":
        this.closeTagHandler = undefined;
        break;
      case "error":
        this.errorHandler = undefined;
        break;
    }
  }

  // Error handling
  private makeError(message: string): Error {
    let msg = this.fileName ?? "";
    if (this.trackPosition) {
      if (msg.length > 0) {
        msg += ":";
      }
      msg += `${this.line}:${this.column}`;
    }
    if (msg.length > 0) {
      msg += ": ";
    }
    return new Error(msg + message);
  }

  fail(message: string): this {
    const err = this.makeError(message);
    if (this.errorHandler) {
      this.errorHandler(err);
    } else {
      throw err;
    }
    return this;
  }

  // Main write method
  write(chunk: string | null): this {
    if (this._closed) {
      return this.fail("cannot write after close");
    }

    let end = false;
    if (chunk === null) {
      end = true;
      chunk = "";
    }

    if (this.carriedFromPrevious !== undefined) {
      chunk = this.carriedFromPrevious + chunk;
      this.carriedFromPrevious = undefined;
    }

    let limit = chunk.length;
    if (!end && limit > 0) {
      const lastCode = chunk.charCodeAt(limit - 1);
      // Carry CR or surrogate to next chunk
      if (lastCode === CR || (lastCode >= 0xd800 && lastCode <= 0xdbff)) {
        this.carriedFromPrevious = chunk[limit - 1];
        limit--;
        chunk = chunk.slice(0, limit);
      }
    }

    this.chunk = chunk;
    this.i = 0;

    while (this.i < limit) {
      this.processState();
    }

    this.chunkPosition += limit;

    return end ? this.end() : this;
  }

  close(): this {
    return this.write(null);
  }

  // Get next character code, handling newlines
  // Optimized: split into fast path (no position) and slow path
  private getCode(): number {
    const { chunk, i } = this;
    this.prevI = i;
    this.i = i + 1;

    if (i >= chunk.length) {
      return -1; // EOC
    }

    const code = chunk.charCodeAt(i);

    // Fast path: common ASCII chars (no surrogates, no CR/LF)
    // 0x0a = LF, 0x0d = CR - both need special handling
    if (code < 0x0a || (code > 0x0d && code < 0xd800)) {
      if (this.trackPosition) {
        this.column++;
      }
      return code;
    }

    // Handle surrogates
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = chunk.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        this.i = i + 2;
        if (this.trackPosition) {
          this.column++;
        }
        return 0x10000 + ((code - 0xd800) * 0x400 + (next - 0xdc00));
      }
    }

    // Handle CR
    if (code === CR) {
      if (chunk.charCodeAt(i + 1) === NL) {
        this.i = i + 2;
      }
      if (this.trackPosition) {
        this.line++;
        this.column = 0;
        this.positionAtNewLine = this.position;
      }
      return NL;
    }

    // Handle LF (code === 0x0a) or other codes between 0x0a-0x0d
    if (code === NL && this.trackPosition) {
      this.line++;
      this.column = 0;
      this.positionAtNewLine = this.position;
    } else if (this.trackPosition) {
      this.column++;
    }
    return code;
  }

  private unget(): void {
    this.i = this.prevI;
    if (this.trackPosition) {
      this.column--;
    }
  }

  // State machine dispatcher
  private processState(): void {
    switch (this.state) {
      case S_TEXT:
        this.sText();
        break;
      case S_OPEN_WAKA:
        this.sOpenWaka();
        break;
      case S_OPEN_WAKA_BANG:
        this.sOpenWakaBang();
        break;
      case S_OPEN_TAG:
        this.sOpenTag();
        break;
      case S_OPEN_TAG_SLASH:
        this.sOpenTagSlash();
        break;
      case S_ATTRIB:
        this.sAttrib();
        break;
      case S_ATTRIB_NAME:
        this.sAttribName();
        break;
      case S_ATTRIB_NAME_SAW_WHITE:
        this.sAttribNameSawWhite();
        break;
      case S_ATTRIB_VALUE:
        this.sAttribValue();
        break;
      case S_ATTRIB_VALUE_QUOTED:
        this.sAttribValueQuoted();
        break;
      case S_ATTRIB_VALUE_CLOSED:
        this.sAttribValueClosed();
        break;
      case S_CLOSE_TAG:
        this.sCloseTag();
        break;
      case S_CLOSE_TAG_SAW_WHITE:
        this.sCloseTagSawWhite();
        break;
      case S_COMMENT:
        this.sComment();
        break;
      case S_COMMENT_ENDING:
        this.sCommentEnding();
        break;
      case S_COMMENT_ENDED:
        this.sCommentEnded();
        break;
      case S_CDATA:
        this.sCData();
        break;
      case S_CDATA_ENDING:
        this.sCDataEnding();
        break;
      case S_CDATA_ENDING_2:
        this.sCDataEnding2();
        break;
      case S_PI:
        this.sPI();
        break;
      case S_PI_ENDING:
        this.sPIEnding();
        break;
      case S_DOCTYPE:
        this.sDoctype();
        break;
      case S_DOCTYPE_QUOTE:
        this.sDoctypeQuote();
        break;
      case S_DOCTYPE_DTD:
        this.sDoctypeDTD();
        break;
      case S_DOCTYPE_DTD_QUOTED:
        this.sDoctypeDTDQuoted();
        break;
      case S_ENTITY:
        this.sEntity();
        break;
    }
  }

  // ============================================================================
  // State handlers
  // ============================================================================

  private sText(): void {
    // Check if we're inside or outside the root element
    if (this.tags.length !== 0) {
      this.handleTextInRoot();
    } else {
      this.handleTextOutsideRoot();
    }
  }

  private handleTextInRoot(): void {
    const { chunk } = this;
    let { i: start } = this;
    const handler = this.textHandler;

    while (true) {
      const c = this.getCode();

      if (c === -1) {
        // End of chunk
        if (handler && start < this.i) {
          this.text += chunk.slice(start, this.i);
        }
        return;
      }

      if (c === LESS) {
        // Start of tag
        if (handler) {
          const slice = chunk.slice(start, this.prevI);
          if (this.text.length > 0) {
            handler(this.text + slice);
            this.text = "";
          } else if (slice.length > 0) {
            handler(slice);
          }
        }
        this.state = S_OPEN_WAKA;
        return;
      }

      if (c === AMP) {
        // Entity reference
        if (handler) {
          this.text += chunk.slice(start, this.prevI);
        }
        this.state = S_ENTITY;
        this.entityReturnState = S_TEXT;
        this.entity = "";
        return;
      }

      if (c === NL) {
        // Handle newline in text
        if (handler) {
          this.text += chunk.slice(start, this.prevI) + "\n";
        }
        start = this.i;
      }
    }
  }

  private handleTextOutsideRoot(): void {
    const { chunk } = this;
    let { i: start } = this;
    const handler = this.textHandler;
    let nonSpace = false;

    while (true) {
      const c = this.getCode();

      if (c === -1) {
        // End of chunk
        if (handler && start < this.i) {
          this.text += chunk.slice(start, this.i);
        }
        break;
      }

      if (c === LESS) {
        // Start of tag
        if (handler) {
          const slice = chunk.slice(start, this.prevI);
          if (this.text.length > 0) {
            handler(this.text + slice);
            this.text = "";
          } else if (slice.length > 0) {
            handler(slice);
          }
        }
        this.state = S_OPEN_WAKA;
        break;
      }

      if (c === AMP) {
        // Entity reference
        if (handler) {
          this.text += chunk.slice(start, this.prevI);
        }
        this.state = S_ENTITY;
        this.entityReturnState = S_TEXT;
        this.entity = "";
        nonSpace = true;
        break;
      }

      if (c === NL) {
        // Handle newline in text
        if (handler) {
          this.text += chunk.slice(start, this.prevI) + "\n";
        }
        start = this.i;
      } else if (!isS(c)) {
        nonSpace = true;
      }
    }

    // Report error for non-whitespace text outside root
    if (nonSpace) {
      if (!this.sawRoot && !this.reportedTextBeforeRoot) {
        this.fail("text data outside of root node.");
        this.reportedTextBeforeRoot = true;
      }
      if (this.closedRoot && !this.reportedTextAfterRoot) {
        this.fail("text data outside of root node.");
        this.reportedTextAfterRoot = true;
      }
    }
  }

  private sOpenWaka(): void {
    const c = this.getCode();

    if (isNameStartChar(c)) {
      this.state = S_OPEN_TAG;
      this.name = charFromCode(c);
      return;
    }

    switch (c) {
      case FORWARD_SLASH:
        this.state = S_CLOSE_TAG;
        this.name = "";
        break;
      case BANG:
        this.state = S_OPEN_WAKA_BANG;
        this.openWakaBang = "";
        break;
      case QUESTION:
        this.state = S_PI;
        this.text = "";
        break;
      default:
        this.fail("unexpected character in tag");
        this.state = S_TEXT;
    }
  }

  private sOpenWakaBang(): void {
    const c = this.getCode();
    this.openWakaBang += charFromCode(c);

    switch (this.openWakaBang) {
      case "[CDATA[":
        this.state = S_CDATA;
        this.text = "";
        this.openWakaBang = "";
        break;
      case "--":
        this.state = S_COMMENT;
        this.text = "";
        this.openWakaBang = "";
        break;
      case "DOCTYPE":
        this.state = S_DOCTYPE;
        this.text = "";
        this.openWakaBang = "";
        break;
      default:
        if (this.openWakaBang.length >= 7) {
          this.fail("incorrect syntax");
          this.state = S_TEXT;
        }
    }
  }

  private sOpenTag(): void {
    const c = this.getCode();

    if (c === -1) {
      return;
    }

    if (isNameChar(c)) {
      this.name += charFromCode(c);
      return;
    }

    this.tag = {
      name: this.stripNsPrefix(this.name),
      attributes: Object.create(null) as Record<string, string>,
      isSelfClosing: false
    };
    this.attribList = [];
    this.sawRoot = true;

    if (c === GREATER) {
      this.openTag();
    } else if (c === FORWARD_SLASH) {
      this.state = S_OPEN_TAG_SLASH;
    } else if (isS(c)) {
      this.state = S_ATTRIB;
    } else {
      this.fail("unexpected character in tag");
      this.state = S_ATTRIB;
    }
  }

  private sOpenTagSlash(): void {
    const c = this.getCode();
    if (c === GREATER) {
      this.openSelfClosingTag();
    } else {
      this.fail("expected >");
      this.state = S_ATTRIB;
    }
  }

  private sAttrib(): void {
    const c = this.skipSpaces();
    if (c === -1) {
      return;
    }

    if (isNameStartChar(c)) {
      this.name = charFromCode(c);
      this.state = S_ATTRIB_NAME;
    } else if (c === GREATER) {
      this.openTag();
    } else if (c === FORWARD_SLASH) {
      this.state = S_OPEN_TAG_SLASH;
    } else {
      this.fail("unexpected character in attribute");
    }
  }

  private sAttribName(): void {
    const c = this.getCode();

    if (c === -1) {
      return;
    }

    if (isNameChar(c)) {
      this.name += charFromCode(c);
      return;
    }

    if (c === EQUAL) {
      this.state = S_ATTRIB_VALUE;
    } else if (isS(c)) {
      this.state = S_ATTRIB_NAME_SAW_WHITE;
    } else if (c === GREATER) {
      this.fail("attribute without value");
      this.attribList.push({ name: this.name, value: this.name });
      this.name = "";
      this.openTag();
    } else {
      this.fail("unexpected character in attribute name");
    }
  }

  private sAttribNameSawWhite(): void {
    const c = this.skipSpaces();
    if (c === -1) {
      return;
    }

    if (c === EQUAL) {
      this.state = S_ATTRIB_VALUE;
    } else {
      this.fail("attribute without value");
      this.name = "";
      this.text = "";
      if (c === GREATER) {
        this.openTag();
      } else if (isNameStartChar(c)) {
        this.name = charFromCode(c);
        this.state = S_ATTRIB_NAME;
      } else {
        this.fail("unexpected character");
        this.state = S_ATTRIB;
      }
    }
  }

  private sAttribValue(): void {
    const c = this.skipSpaces();
    if (c === -1) {
      return;
    }

    if (isQuote(c)) {
      this.q = c;
      this.text = "";
      this.state = S_ATTRIB_VALUE_QUOTED;
    } else {
      this.fail("unquoted attribute value");
      this.state = S_TEXT;
    }
  }

  private sAttribValueQuoted(): void {
    const { q, chunk } = this;
    let { i: start } = this;

    while (true) {
      const c = this.getCode();

      if (c === -1) {
        this.text += chunk.slice(start, this.i);
        return;
      }

      if (c === q) {
        // End of attribute value
        this.attribList.push({
          name: this.name,
          value: this.text + chunk.slice(start, this.prevI)
        });
        this.name = "";
        this.text = "";
        this.q = null;
        this.state = S_ATTRIB_VALUE_CLOSED;
        return;
      }

      if (c === AMP) {
        this.text += chunk.slice(start, this.prevI);
        this.state = S_ENTITY;
        this.entityReturnState = S_ATTRIB_VALUE_QUOTED;
        this.entity = "";
        return;
      }

      if (c === NL || c === TAB) {
        // Normalize whitespace in attributes
        this.text += chunk.slice(start, this.prevI) + " ";
        start = this.i;
      }

      if (c === LESS) {
        this.text += chunk.slice(start, this.prevI);
        this.fail("< not allowed in attribute value");
        return;
      }
    }
  }

  private sAttribValueClosed(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (isS(c)) {
      this.state = S_ATTRIB;
    } else if (c === GREATER) {
      this.openTag();
    } else if (c === FORWARD_SLASH) {
      this.state = S_OPEN_TAG_SLASH;
    } else if (isNameStartChar(c)) {
      this.fail("no whitespace between attributes");
      this.name = charFromCode(c);
      this.state = S_ATTRIB_NAME;
    } else {
      this.fail("unexpected character after attribute");
    }
  }

  private sCloseTag(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (isNameChar(c)) {
      this.name += charFromCode(c);
    } else if (c === GREATER) {
      this.closeTag();
    } else if (isS(c)) {
      this.state = S_CLOSE_TAG_SAW_WHITE;
    } else {
      this.fail("unexpected character in close tag");
    }
  }

  private sCloseTagSawWhite(): void {
    const c = this.skipSpaces();
    if (c === -1) {
      return;
    }

    if (c === GREATER) {
      this.closeTag();
    } else {
      this.fail("unexpected character in close tag");
    }
  }

  private sComment(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === MINUS) {
      this.state = S_COMMENT_ENDING;
    } else {
      this.text += charFromCode(c);
    }
  }

  private sCommentEnding(): void {
    const c = this.getCode();
    if (c === MINUS) {
      this.state = S_COMMENT_ENDED;
    } else {
      this.text += "-" + charFromCode(c);
      this.state = S_COMMENT;
    }
  }

  private sCommentEnded(): void {
    const c = this.getCode();
    if (c === GREATER) {
      // Comment done, emit nothing (we don't have a comment handler)
      this.text = "";
      this.state = S_TEXT;
    } else if (c === MINUS) {
      this.text += "-";
    } else {
      this.fail("malformed comment");
      this.text += "--" + charFromCode(c);
      this.state = S_COMMENT;
    }
  }

  private sCData(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === CLOSE_BRACKET) {
      this.state = S_CDATA_ENDING;
    } else {
      this.text += charFromCode(c);
    }
  }

  private sCDataEnding(): void {
    const c = this.getCode();
    if (c === CLOSE_BRACKET) {
      this.state = S_CDATA_ENDING_2;
    } else {
      this.text += "]" + charFromCode(c);
      this.state = S_CDATA;
    }
  }

  private sCDataEnding2(): void {
    const c = this.getCode();
    if (c === GREATER) {
      // CDATA done - emit as text
      if (this.textHandler && this.text.length > 0) {
        this.textHandler(this.text);
      }
      this.text = "";
      this.state = S_TEXT;
    } else if (c === CLOSE_BRACKET) {
      this.text += "]";
    } else {
      this.text += "]]" + charFromCode(c);
      this.state = S_CDATA;
    }
  }

  private sPI(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === QUESTION) {
      this.state = S_PI_ENDING;
    } else {
      this.text += charFromCode(c);
    }
  }

  private sPIEnding(): void {
    const c = this.getCode();
    if (c === GREATER) {
      // PI done, we don't emit PI events
      this.text = "";
      this.state = S_TEXT;
    } else if (c === QUESTION) {
      this.text += "?";
    } else {
      this.text += "?" + charFromCode(c);
      this.state = S_PI;
    }
  }

  private sDoctype(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === GREATER) {
      // DOCTYPE done
      this.text = "";
      this.state = S_TEXT;
    } else if (isQuote(c)) {
      this.q = c;
      this.state = S_DOCTYPE_QUOTE;
    } else if (c === OPEN_BRACKET) {
      this.state = S_DOCTYPE_DTD;
    } else {
      this.text += charFromCode(c);
    }
  }

  private sDoctypeQuote(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === this.q) {
      this.q = null;
      this.state = S_DOCTYPE;
    } else {
      this.text += charFromCode(c);
    }
  }

  private sDoctypeDTD(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === CLOSE_BRACKET) {
      this.state = S_DOCTYPE;
    } else if (isQuote(c)) {
      this.q = c;
      this.state = S_DOCTYPE_DTD_QUOTED;
    }
  }

  private sDoctypeDTDQuoted(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === this.q) {
      this.q = null;
      this.state = S_DOCTYPE_DTD;
    }
  }

  private sEntity(): void {
    const c = this.getCode();
    if (c === -1) {
      return;
    }

    if (c === SEMICOLON) {
      // Entity complete
      const entity = this.entity;
      let resolved: string;

      if (entity === "") {
        this.fail("empty entity");
        resolved = "&;";
      } else {
        resolved = this.parseEntity(entity);
      }

      this.text += resolved;
      this.state = this.entityReturnState;
      this.entity = "";
    } else if (isNameChar(c) || c === HASH) {
      this.entity += charFromCode(c);
    } else {
      this.fail("invalid entity character");
      this.text += "&" + this.entity + charFromCode(c);
      this.state = this.entityReturnState;
      this.entity = "";
    }
  }

  // Entity resolution
  private parseEntity(entity: string): string {
    if (entity[0] !== "#") {
      // Named entity
      const resolved = this.ENTITIES[entity];
      if (resolved !== undefined) {
        return resolved;
      }
      this.fail("undefined entity: " + entity);
      return "&" + entity + ";";
    }

    // Numeric entity
    let num: number;
    if (entity[1] === "x" || entity[1] === "X") {
      // Hexadecimal
      num = parseInt(entity.slice(2), 16);
    } else {
      // Decimal
      num = parseInt(entity.slice(1), 10);
    }

    if (isNaN(num) || !isChar10(num)) {
      this.fail("invalid character entity");
      return "&" + entity + ";";
    }

    return String.fromCodePoint(num);
  }

  // Helper to skip whitespace
  private skipSpaces(): number {
    while (true) {
      const c = this.getCode();
      if (c === -1 || !isS(c)) {
        return c;
      }
    }
  }

  // Tag handling
  private openTag(): void {
    const tag = this.tag!;
    tag.isSelfClosing = false;

    this.processAttributes(tag);
    this.openTagHandler?.(tag);
    this.tags.push(tag);
    this.name = "";
    this.state = S_TEXT;
  }

  private openSelfClosingTag(): void {
    const tag = this.tag!;
    tag.isSelfClosing = true;
    this.processAttributes(tag);

    this.openTagHandler?.(tag);
    this.closeTagHandler?.(tag);

    if (this.tags.length === 0) {
      this.closedRoot = true;
    }
    this.name = "";
    this.state = S_TEXT;
  }

  // Process attributes and detect spreadsheetml namespace prefix
  private processAttributes(tag: SaxesTagPlain): void {
    for (const { name, value } of this.attribList) {
      tag.attributes[name] = value;
      if (name.startsWith("xmlns:") && value === SPREADSHEETML_NS) {
        this.nsPrefix = name.slice(6);
        tag.name = this.stripNsPrefix(tag.name);
      }
    }
    this.attribList = [];
  }

  private closeTag(): void {
    const { tags } = this;
    const name = this.stripNsPrefix(this.name);
    this.state = S_TEXT;
    this.name = "";

    if (name === "") {
      this.fail("empty close tag");
      this.text += "</>";
      return;
    }

    // Find matching open tag
    let found = false;
    for (let i = tags.length - 1; i >= 0; i--) {
      const tag = tags[i];
      if (tag.name === name) {
        // Pop all tags including the matching one
        while (tags.length > i) {
          const t = tags.pop()!;
          this.closeTagHandler?.(t);
          if (tags.length > i) {
            this.fail("unclosed tag: " + t.name);
          }
        }
        found = true;
        break;
      }
    }

    if (!found) {
      this.fail("unmatched close tag: " + name);
      this.text += "</" + name + ">";
    }

    if (tags.length === 0) {
      this.closedRoot = true;
    }
  }

  // End parsing
  private end(): this {
    if (!this.sawRoot) {
      this.fail("document must contain a root element");
    }

    while (this.tags.length > 0) {
      const tag = this.tags.pop()!;
      this.fail("unclosed tag: " + tag.name);
    }

    if (this.text.length > 0 && this.textHandler) {
      this.textHandler(this.text);
      this.text = "";
    }

    this._closed = true;
    this._init();
    return this;
  }
}

// ============================================================================
// parseSax generator function
// ============================================================================

async function* parseSax(iterable: any): AsyncGenerator<SaxEvent[]> {
  const parser = new SaxesParser({
    xmlns: false,
    position: true // Keep position for error messages
  });

  let error: Error | undefined;
  parser.on("error", (err: Error) => {
    error = err;
  });

  let events: SaxEvent[] = [];
  parser.on("opentag", (value: any) => events.push({ eventType: "opentag", value }));
  parser.on("text", (value: any) => events.push({ eventType: "text", value }));
  parser.on("closetag", (value: any) => events.push({ eventType: "closetag", value }));

  for await (const chunk of iterable) {
    const chunkStr = bufferToString(chunk);

    parser.write(chunkStr);
    if (error) {
      throw error;
    }
    yield events;
    events = [];
  }

  parser.close();
  if (error) {
    throw error;
  }
  if (events.length > 0) {
    yield events;
  }
}

export { parseSax };
