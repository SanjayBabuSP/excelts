import { BaseXform } from "@excel/xlsx/xform/base-xform";
import { decodeOoxmlEscape, encodeOoxmlEscape } from "@utils/utils";

//   <t xml:space="preserve"> is </t>

class TextXform extends BaseXform {
  declare private _text: string[];

  get tag(): string {
    return "t";
  }

  render(xmlStream: any, model: string): void {
    xmlStream.openNode("t");
    if (/^\s|\n|\s$/.test(model)) {
      xmlStream.addAttribute("xml:space", "preserve");
    }
    xmlStream.writeText(encodeOoxmlEscape(model));
    xmlStream.closeNode();
  }

  parseOpen(node: any): boolean {
    if (node.name === "t") {
      this._text = [];
      this.model = "";
      return true;
    }
    return false;
  }

  parseText(text: string): void {
    this._text.push(text);
    // Update model immediately after receiving text
    this.model = decodeOoxmlEscape(this._text.join(""));
  }

  parseClose(): boolean {
    return false;
  }
}

export { TextXform };
