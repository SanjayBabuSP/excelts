import { colCache } from "./utils/col-cache";
import { Anchor, type AnchorModel } from "./anchor";
import type { Worksheet } from "./worksheet";

interface ImageHyperlinks {
  hyperlink?: string;
  tooltip?: string;
}

interface ImageExt {
  width?: number;
  height?: number;
}

interface ImageRange {
  tl: Anchor;
  br?: Anchor;
  ext?: ImageExt;
  editAs?: string;
  hyperlinks?: ImageHyperlinks;
}

interface BackgroundModel {
  type: "background";
  imageId: string;
}

interface ImageRangeModel {
  tl: AnchorModel;
  br?: AnchorModel;
  ext?: ImageExt;
  editAs?: string;
}

interface ImageModel {
  type: "image";
  imageId: string;
  hyperlinks?: ImageHyperlinks;
  range: ImageRangeModel;
}

type Model = BackgroundModel | ImageModel;
type ImageModelInput = ModelInput;

interface RangeInput {
  tl?: AnchorModel | { col: number; row: number } | string;
  br?: AnchorModel | { col: number; row: number } | string;
  ext?: ImageExt;
  editAs?: string;
  hyperlinks?: ImageHyperlinks;
}

interface ModelInput {
  type: string;
  imageId: string;
  range?: string | RangeInput | ImageRangeModel;
  hyperlinks?: ImageHyperlinks;
}

class Image {
  worksheet: Worksheet;
  type?: string;
  imageId?: string;
  range?: ImageRange;

  constructor(worksheet: Worksheet, model?: ModelInput) {
    this.worksheet = worksheet;
    if (model) {
      this.model = model;
    }
  }

  get model(): Model {
    switch (this.type) {
      case "background":
        return {
          type: this.type,
          imageId: this.imageId!
        };
      case "image":
        return {
          type: this.type,
          imageId: this.imageId!,
          hyperlinks: this.range!.hyperlinks,
          range: {
            tl: this.range!.tl.model,
            br: this.range!.br && this.range!.br.model,
            ext: this.range!.ext,
            editAs: this.range!.editAs
          }
        };
      default:
        throw new Error("Invalid Image Type");
    }
  }

  set model({ type, imageId, range, hyperlinks }: ModelInput) {
    this.type = type;
    this.imageId = imageId;

    if (type === "image") {
      if (typeof range === "string") {
        const decoded = colCache.decode(range);
        if ("top" in decoded) {
          // It's a Location (range like "A1:C3")
          this.range = {
            tl: new Anchor(this.worksheet, { col: decoded.left, row: decoded.top }, -1),
            br: new Anchor(this.worksheet, { col: decoded.right, row: decoded.bottom }, 0),
            editAs: "oneCell"
          };
        }
      } else if (range) {
        this.range = {
          tl: new Anchor(this.worksheet, range.tl, 0),
          br: range.br ? new Anchor(this.worksheet, range.br, 0) : undefined,
          ext: range.ext,
          editAs: range.editAs,
          hyperlinks: hyperlinks || ("hyperlinks" in range ? range.hyperlinks : undefined)
        };
      }
    }
  }
}

export { Image, type Model as ImageModel, type ImageModelInput };
