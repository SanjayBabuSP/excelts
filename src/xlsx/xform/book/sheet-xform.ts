import { xmlDecode } from "../../../utils/utils";
import { BaseXform } from "../base-xform";

interface SheetModel {
  id: number;
  name: string;
  state?: string;
  rId: string;
}

class WorksheetXform extends BaseXform {
  render(xmlStream: any, model: SheetModel): void {
    xmlStream.leafNode("sheet", {
      name: model.name,
      sheetId: model.id,
      // Excel doesn't output state when it's 'visible' (default)
      state: model.state === "visible" ? undefined : model.state,
      "r:id": model.rId
    });
  }

  parseOpen(node: any): boolean {
    if (node.name === "sheet") {
      this.model = {
        name: xmlDecode(node.attributes.name),
        id: parseInt(node.attributes.sheetId, 10),
        state: node.attributes.state,
        rId: node.attributes["r:id"]
      };
      return true;
    }
    return false;
  }

  parseText(): void {}

  parseClose(): boolean {
    return false;
  }
}

export { WorksheetXform };
