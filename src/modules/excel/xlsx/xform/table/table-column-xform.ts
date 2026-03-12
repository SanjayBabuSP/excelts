import { BaseXform } from "@excel/xlsx/xform/base-xform";
import { decodeOoxmlEscape, encodeOoxmlAttr } from "@utils/utils";

interface TableColumnModel {
  id?: number;
  name: string;
  totalsRowLabel?: string;
  totalsRowFunction?: string;
  totalsRowFormula?: string;
  calculatedColumnFormula?: string;
  dxfId?: string;
}

// Child elements of <tableColumn> whose text content we capture
type ChildTextTag = "calculatedColumnFormula" | "totalsRowFormula";

class TableColumnXform extends BaseXform<TableColumnModel> {
  private _childTag: ChildTextTag | undefined;
  private _childText = "";

  constructor() {
    super();
    this.model = { name: "" };
  }

  get tag(): string {
    return "tableColumn";
  }

  prepare(model: TableColumnModel, options: { index: number }): void {
    model.id = options.index + 1;
  }

  private _renderAttributes(model: TableColumnModel) {
    return {
      id: model.id!.toString(),
      name: encodeOoxmlAttr(model.name),
      totalsRowLabel: model.totalsRowLabel ? encodeOoxmlAttr(model.totalsRowLabel) : undefined,
      // Excel doesn't output totalsRowFunction when value is 'none'
      totalsRowFunction: model.totalsRowFunction === "none" ? undefined : model.totalsRowFunction,
      dxfId: model.dxfId
    };
  }

  render(xmlStream: any, model: TableColumnModel): void {
    if (model.calculatedColumnFormula || model.totalsRowFormula) {
      xmlStream.openNode(this.tag, this._renderAttributes(model));
      if (model.calculatedColumnFormula) {
        xmlStream.leafNode("calculatedColumnFormula", undefined, model.calculatedColumnFormula);
      }
      if (model.totalsRowFormula) {
        xmlStream.leafNode("totalsRowFormula", undefined, model.totalsRowFormula);
      }
      xmlStream.closeNode();
    } else {
      xmlStream.leafNode(this.tag, this._renderAttributes(model));
    }
  }

  parseOpen(node: any): boolean {
    if (node.name === this.tag) {
      const { attributes } = node;
      this.model = {
        name: decodeOoxmlEscape(attributes.name),
        totalsRowLabel: attributes.totalsRowLabel
          ? decodeOoxmlEscape(attributes.totalsRowLabel)
          : undefined,
        totalsRowFunction: attributes.totalsRowFunction,
        dxfId: attributes.dxfId
      };
      return true;
    }
    // Recognise child elements whose text content we want to capture
    if (node.name === "calculatedColumnFormula" || node.name === "totalsRowFormula") {
      this._childTag = node.name;
      this._childText = "";
    }
    return true;
  }

  parseText(text: string): void {
    if (this._childTag) {
      this._childText += text;
    }
  }

  parseClose(name: string): boolean {
    if (name === this.tag) {
      return false;
    }
    // Closing a recognised child element — store captured text
    if (this._childTag && name === this._childTag) {
      this.model![this._childTag] = this._childText;
      this._childTag = undefined;
    }
    return true;
  }
}

export { TableColumnXform };
