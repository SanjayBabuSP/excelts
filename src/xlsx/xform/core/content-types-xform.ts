import { XmlStream } from "../../../utils/xml-stream";
import { BaseXform } from "../base-xform";

// used for rendering the [Content_Types].xml file
// not used for parsing
class ContentTypesXform extends BaseXform {
  render(xmlStream: any, model: any): void {
    xmlStream.openXml(XmlStream.StdDocAttributes);

    xmlStream.openNode("Types", ContentTypesXform.PROPERTY_ATTRIBUTES);

    const mediaHash: { [key: string]: boolean } = {};
    (model.media || []).forEach((medium: any) => {
      if (medium.type === "image") {
        const imageType = medium.extension;
        if (!mediaHash[imageType]) {
          mediaHash[imageType] = true;
          xmlStream.leafNode("Default", {
            Extension: imageType,
            ContentType: `image/${imageType}`
          });
        }
      }
    });

    xmlStream.leafNode("Default", {
      Extension: "rels",
      ContentType: "application/vnd.openxmlformats-package.relationships+xml"
    });
    xmlStream.leafNode("Default", { Extension: "xml", ContentType: "application/xml" });

    xmlStream.leafNode("Override", {
      PartName: "/xl/workbook.xml",
      ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
    });

    model.worksheets.forEach((worksheet: any, index: number) => {
      // Use fileIndex if set, otherwise use sequential index (1-based)
      const fileIndex = worksheet.fileIndex || index + 1;
      const name = `/xl/worksheets/sheet${fileIndex}.xml`;
      xmlStream.leafNode("Override", {
        PartName: name,
        ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
      });
    });

    if ((model.pivotTables || []).length) {
      // Add content types for pivot cache (definition and records)
      (model.pivotTables || []).forEach((pivotTable: any) => {
        const n = pivotTable.tableNumber;
        xmlStream.leafNode("Override", {
          PartName: `/xl/pivotCache/pivotCacheDefinition${n}.xml`,
          ContentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"
        });
        xmlStream.leafNode("Override", {
          PartName: `/xl/pivotCache/pivotCacheRecords${n}.xml`,
          ContentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"
        });
      });
    }

    xmlStream.leafNode("Override", {
      PartName: "/xl/theme/theme1.xml",
      ContentType: "application/vnd.openxmlformats-officedocument.theme+xml"
    });
    xmlStream.leafNode("Override", {
      PartName: "/xl/styles.xml",
      ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"
    });

    const hasSharedStrings = model.sharedStrings && model.sharedStrings.count;
    if (hasSharedStrings) {
      xmlStream.leafNode("Override", {
        PartName: "/xl/sharedStrings.xml",
        ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"
      });
    }

    if (model.tables) {
      model.tables.forEach((table: any) => {
        xmlStream.leafNode("Override", {
          PartName: `/xl/tables/${table.target}`,
          ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"
        });
      });
    }

    // Add pivot table overrides after tables (matches Excel order)
    if ((model.pivotTables || []).length) {
      (model.pivotTables || []).forEach((pivotTable: any) => {
        const n = pivotTable.tableNumber;
        xmlStream.leafNode("Override", {
          PartName: `/xl/pivotTables/pivotTable${n}.xml`,
          ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"
        });
      });
    }

    if (model.drawings) {
      model.drawings.forEach((drawing: any) => {
        xmlStream.leafNode("Override", {
          PartName: `/xl/drawings/${drawing.name}.xml`,
          ContentType: "application/vnd.openxmlformats-officedocument.drawing+xml"
        });
      });
    }

    if (model.commentRefs && model.commentRefs.length) {
      xmlStream.leafNode("Default", {
        Extension: "vml",
        ContentType: "application/vnd.openxmlformats-officedocument.vmlDrawing"
      });

      model.commentRefs.forEach(({ commentName }: { commentName: string }) => {
        xmlStream.leafNode("Override", {
          PartName: `/xl/${commentName}.xml`,
          ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"
        });
      });
    }

    xmlStream.leafNode("Override", {
      PartName: "/docProps/core.xml",
      ContentType: "application/vnd.openxmlformats-package.core-properties+xml"
    });
    xmlStream.leafNode("Override", {
      PartName: "/docProps/app.xml",
      ContentType: "application/vnd.openxmlformats-officedocument.extended-properties+xml"
    });

    xmlStream.closeNode();
  }

  parseOpen(): boolean {
    return false;
  }

  parseText(): void {}

  parseClose(): boolean {
    return false;
  }

  static PROPERTY_ATTRIBUTES = {
    xmlns: "http://schemas.openxmlformats.org/package/2006/content-types"
  };
}

export { ContentTypesXform };
