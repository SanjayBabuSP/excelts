import { XmlStream } from "@excel/utils/xml-stream";
import { BaseXform } from "@excel/xlsx/xform/base-xform";
import type { FormCheckboxModel } from "@excel/form-control";

/**
 * Control Properties Xform - Generates ctrlProp*.xml for form controls
 *
 * Each form control (checkbox, button, etc.) has an associated ctrlProp file
 * that stores its properties like objectType, checked state, and linked cell.
 */

class CtrlPropXform extends BaseXform {
  declare public model: FormCheckboxModel;

  get tag(): string {
    return "formControlPr";
  }

  render(xmlStream: any, model?: FormCheckboxModel): void {
    const renderModel = model || this.model;

    const attrs: Record<string, string> = {
      xmlns: "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main",
      objectType: "CheckBox",
      checked: renderModel.checked,
      lockText: "1"
    };

    // Add linked cell reference
    if (renderModel.link) {
      attrs.fmlaLink = renderModel.link;
    }

    // Add noThreeD for flat appearance
    if (renderModel.noThreeD) {
      attrs.noThreeD = "1";
    }

    xmlStream.openXml({ version: "1.0", encoding: "UTF-8", standalone: "yes" });
    xmlStream.leafNode(this.tag, attrs);
  }

  /**
   * Generate XML string directly (convenience method)
   * Uses render() internally to ensure consistency
   */
  toXml(model: FormCheckboxModel): string {
    const xmlStream = new XmlStream();
    this.render(xmlStream, model);
    return xmlStream.xml;
  }

  // Parsing not implemented - form controls are write-only for now
  parseOpen(): boolean {
    return true;
  }

  parseText(): void {
    // Not implemented
  }

  parseClose(): boolean {
    return false;
  }
}

export { CtrlPropXform };
