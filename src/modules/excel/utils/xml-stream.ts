import { xmlEncode } from "./utils";

// constants
const OPEN_ANGLE = "<";
const CLOSE_ANGLE = ">";
const OPEN_ANGLE_SLASH = "</";
const CLOSE_SLASH_ANGLE = "/>";

// Chunk size for periodic consolidation (reduces final join overhead)
const CHUNK_SIZE = 10000;

interface Attributes {
  [key: string]: any;
}

interface Rollback {
  xml: number;
  stack: number;
  leaf: boolean;
  open: boolean;
  chunksLength: number;
}

function pushAttribute(xml: string[], name: string, value: any): void {
  xml.push(` ${name}="${xmlEncode(value.toString())}"`);
}

function pushAttributes(xml: string[], attributes?: Attributes): void {
  if (attributes) {
    const tmp: string[] = [];
    Object.entries(attributes).forEach(([name, value]) => {
      if (value !== undefined) {
        pushAttribute(tmp, name as string, value);
      }
    });
    xml.push(tmp.join(""));
  }
}

class XmlStream {
  declare private _xml: string[];
  declare private _chunks: string[];
  declare private _stack: string[];
  declare private _rollbacks: Rollback[];
  leaf?: boolean;
  open?: boolean;

  constructor() {
    this._xml = [];
    this._chunks = [];
    this._stack = [];
    this._rollbacks = [];
  }

  private _consolidate(): void {
    // Periodically join small strings into larger chunks to reduce final join overhead
    if (this._xml.length >= CHUNK_SIZE) {
      this._chunks.push(this._xml.join(""));
      this._xml = [];
    }
  }

  get tos(): string | undefined {
    return this._stack.length ? this._stack[this._stack.length - 1] : undefined;
  }

  get cursor(): number {
    // handy way to track whether anything has been added
    return this._chunks.length * CHUNK_SIZE + this._xml.length;
  }

  openXml(docAttributes?: Attributes): void {
    const xml = this._xml;
    // <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    xml.push("<?xml");
    pushAttributes(xml, docAttributes);
    xml.push("?>\n");
  }

  openNode(name: string, attributes?: Attributes): void {
    const parent = this.tos;
    const xml = this._xml;
    if (parent && this.open) {
      xml.push(CLOSE_ANGLE);
    }

    this._stack.push(name);

    // start streaming node
    xml.push(OPEN_ANGLE);
    xml.push(name);
    pushAttributes(xml, attributes);
    this.leaf = true;
    this.open = true;
  }

  addAttribute(name: string, value: any): void {
    if (!this.open) {
      throw new Error("Cannot write attributes to node if it is not open");
    }
    if (value !== undefined) {
      pushAttribute(this._xml, name, value);
    }
  }

  addAttributes(attrs: Attributes): void {
    if (!this.open) {
      throw new Error("Cannot write attributes to node if it is not open");
    }
    pushAttributes(this._xml, attrs);
  }

  writeText(text: any): void {
    const xml = this._xml;
    if (this.open) {
      xml.push(CLOSE_ANGLE);
      this.open = false;
    }
    this.leaf = false;
    xml.push(xmlEncode(text.toString()));
  }

  writeXml(xml: string): void {
    if (this.open) {
      this._xml.push(CLOSE_ANGLE);
      this.open = false;
    }
    this.leaf = false;
    this._xml.push(xml);
  }

  closeNode(): void {
    const node = this._stack.pop();
    const xml = this._xml;
    if (this.leaf) {
      xml.push(CLOSE_SLASH_ANGLE);
    } else {
      xml.push(OPEN_ANGLE_SLASH);
      xml.push(node!);
      xml.push(CLOSE_ANGLE);
    }
    this.open = false;
    this.leaf = false;
    this._consolidate();
  }

  leafNode(name: string, attributes?: Attributes, text?: any): void {
    this.openNode(name, attributes);
    if (text !== undefined) {
      // zeros need to be written
      this.writeText(text);
    }
    this.closeNode();
  }

  closeAll(): void {
    while (this._stack.length) {
      this.closeNode();
    }
  }

  addRollback(): number {
    this._rollbacks.push({
      xml: this._xml.length,
      stack: this._stack.length,
      leaf: this.leaf!,
      open: this.open!,
      chunksLength: this._chunks.length
    });
    return this.cursor;
  }

  commit(): void {
    this._rollbacks.pop();
  }

  rollback(): void {
    const r = this._rollbacks.pop()!;
    if (this._xml.length > r.xml) {
      this._xml.splice(r.xml, this._xml.length - r.xml);
    }
    if (this._stack.length > r.stack) {
      this._stack.splice(r.stack, this._stack.length - r.stack);
    }
    if (this._chunks.length > r.chunksLength) {
      this._chunks.splice(r.chunksLength, this._chunks.length - r.chunksLength);
    }
    this.leaf = r.leaf;
    this.open = r.open;
  }

  get xml(): string {
    this.closeAll();
    // Join chunks first, then remaining xml array
    if (this._chunks.length === 0) {
      return this._xml.join("");
    }
    if (this._xml.length > 0) {
      this._chunks.push(this._xml.join(""));
    }
    return this._chunks.join("");
  }

  static StdDocAttributes = {
    version: "1.0",
    encoding: "UTF-8",
    standalone: "yes"
  };
}

export { XmlStream };
