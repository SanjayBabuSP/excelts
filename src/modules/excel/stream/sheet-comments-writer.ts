import { XmlStream } from "../utils/xml-stream";
import { RelType } from "../xlsx/rel-type";
import { colCache } from "../utils/col-cache";
import { CommentXform } from "../xlsx/xform/comment/comment-xform";
import { VmlShapeXform } from "../xlsx/xform/comment/vml-shape-xform";
import {
  commentsPath,
  commentsRelTargetFromWorksheet,
  vmlDrawingPath,
  vmlDrawingRelTargetFromWorksheet
} from "../utils/ooxml-paths";

interface SheetCommentsWriterOptions {
  id: number;
  workbook: any;
}

class SheetCommentsWriter {
  id: number;
  count: number;
  _worksheet: any;
  _workbook: any;
  _sheetRelsWriter: any;
  _commentsStream?: any;
  _vmlStream?: any;
  vmlRelId?: string;
  startedData?: boolean;

  constructor(worksheet: any, sheetRelsWriter: any, options: SheetCommentsWriterOptions) {
    // in a workbook, each sheet will have a number
    this.id = options.id;
    this.count = 0;
    this._worksheet = worksheet;
    this._workbook = options.workbook;
    this._sheetRelsWriter = sheetRelsWriter;
  }

  get commentsStream(): any {
    if (!this._commentsStream) {
      this._commentsStream = this._workbook._openStream(commentsPath(this.id));
    }
    return this._commentsStream;
  }

  get vmlStream(): any {
    if (!this._vmlStream) {
      this._vmlStream = this._workbook._openStream(vmlDrawingPath(this.id));
    }
    return this._vmlStream;
  }

  _addRelationships(): void {
    const commentRel = {
      Type: RelType.Comments,
      Target: commentsRelTargetFromWorksheet(this.id)
    };
    this._sheetRelsWriter.addRelationship(commentRel);

    const vmlDrawingRel = {
      Type: RelType.VmlDrawing,
      Target: vmlDrawingRelTargetFromWorksheet(this.id)
    };
    this.vmlRelId = this._sheetRelsWriter.addRelationship(vmlDrawingRel);
  }

  _addCommentRefs(): void {
    this._workbook.commentRefs.push({
      commentName: `comments${this.id}`,
      vmlDrawing: `vmlDrawing${this.id}`
    });
  }

  _writeOpen(): void {
    this.commentsStream.write(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        "<authors><author>Author</author></authors>" +
        "<commentList>"
    );
    this.vmlStream.write(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<xml xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
        '<o:shapelayout v:ext="edit">' +
        '<o:idmap v:ext="edit" data="1" />' +
        "</o:shapelayout>" +
        '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">' +
        '<v:stroke joinstyle="miter" />' +
        '<v:path gradientshapeok="t" o:connecttype="rect" />' +
        "</v:shapetype>"
    );
  }

  _writeComment(comment: any, index: number): void {
    const commentXform = new CommentXform();
    const commentsXmlStream = new XmlStream();
    commentXform.render(commentsXmlStream, comment);
    this.commentsStream.write(commentsXmlStream.xml);

    const vmlShapeXform = new VmlShapeXform();
    const vmlXmlStream = new XmlStream();
    vmlShapeXform.render(vmlXmlStream, comment, index);
    this.vmlStream.write(vmlXmlStream.xml);
  }

  _writeClose(): void {
    this.commentsStream.write("</commentList></comments>");
    this.vmlStream.write("</xml>");
  }

  addComments(comments: any[]): void {
    if (comments && comments.length) {
      if (!this.startedData) {
        this._worksheet.comments = [];
        this._writeOpen();
        this._addRelationships();
        this._addCommentRefs();
        this.startedData = true;
      }

      comments.forEach(item => {
        item.refAddress = colCache.decodeAddress(item.ref);
      });

      comments.forEach(comment => {
        this._writeComment(comment, this.count);
        this.count += 1;
      });
    }
  }

  commit(): void {
    if (this.count) {
      this._writeClose();
      this.commentsStream.end();
      this.vmlStream.end();
    }
  }
}

export { SheetCommentsWriter };
