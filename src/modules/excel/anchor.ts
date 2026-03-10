import { colCache } from "@excel/utils/col-cache";
import type { Worksheet } from "@excel/worksheet";

interface AnchorModel {
  nativeCol: number;
  nativeRow: number;
  nativeColOff: number;
  nativeRowOff: number;
}

interface SimpleAddress {
  col: number;
  row: number;
}

type AddressInput = string | AnchorModel | SimpleAddress;

function isAnchorModel(value: AddressInput): value is AnchorModel {
  return (
    typeof value === "object" &&
    "nativeCol" in value &&
    "nativeRow" in value &&
    "nativeColOff" in value &&
    "nativeRowOff" in value
  );
}

function isSimpleAddress(value: AddressInput): value is SimpleAddress {
  return typeof value === "object" && "col" in value && "row" in value;
}

class Anchor {
  declare public nativeCol: number;
  declare public nativeRow: number;
  declare public nativeColOff: number;
  declare public nativeRowOff: number;
  declare public worksheet?: Worksheet;

  constructor(worksheet?: Worksheet, address?: AddressInput | null, offset: number = 0) {
    this.worksheet = worksheet;

    if (!address) {
      this.nativeCol = 0;
      this.nativeColOff = 0;
      this.nativeRow = 0;
      this.nativeRowOff = 0;
    } else if (typeof address === "string") {
      const decoded = colCache.decodeAddress(address);
      this.nativeCol = decoded.col + offset;
      this.nativeColOff = 0;
      this.nativeRow = decoded.row + offset;
      this.nativeRowOff = 0;
    } else if (isAnchorModel(address)) {
      this.nativeCol = address.nativeCol ?? 0;
      this.nativeColOff = address.nativeColOff ?? 0;
      this.nativeRow = address.nativeRow ?? 0;
      this.nativeRowOff = address.nativeRowOff ?? 0;
    } else if (isSimpleAddress(address)) {
      this.col = address.col + offset;
      this.row = address.row + offset;
    } else {
      this.nativeCol = 0;
      this.nativeColOff = 0;
      this.nativeRow = 0;
      this.nativeRowOff = 0;
    }
  }

  static asInstance(model: AddressInput | Anchor | null | undefined): Anchor | null {
    if (model == null) {
      return null;
    }
    if (model instanceof Anchor) {
      return model;
    }
    return new Anchor(undefined, model);
  }

  get col(): number {
    return this.nativeCol + Math.min(this.colWidth - 1, this.nativeColOff) / this.colWidth;
  }

  set col(v: number) {
    this.nativeCol = Math.floor(v);
    this.nativeColOff = Math.floor((v - this.nativeCol) * this.colWidth);
  }

  get row(): number {
    return this.nativeRow + Math.min(this.rowHeight - 1, this.nativeRowOff) / this.rowHeight;
  }

  set row(v: number) {
    this.nativeRow = Math.floor(v);
    this.nativeRowOff = Math.floor((v - this.nativeRow) * this.rowHeight);
  }

  get colWidth(): number {
    return this.worksheet &&
      this.worksheet.getColumn(this.nativeCol + 1) &&
      this.worksheet.getColumn(this.nativeCol + 1).isCustomWidth
      ? Math.floor(this.worksheet.getColumn(this.nativeCol + 1).width! * 10000)
      : 640000;
  }

  get rowHeight(): number {
    const height = this.worksheet?.getRow(this.nativeRow + 1)?.height;
    return height ? Math.floor(height * 10000) : 180000;
  }

  get model(): AnchorModel {
    return {
      nativeCol: this.nativeCol,
      nativeColOff: this.nativeColOff,
      nativeRow: this.nativeRow,
      nativeRowOff: this.nativeRowOff
    };
  }

  set model(value: AnchorModel) {
    this.nativeCol = value.nativeCol;
    this.nativeColOff = value.nativeColOff;
    this.nativeRow = value.nativeRow;
    this.nativeRowOff = value.nativeRowOff;
  }

  clone(worksheet?: Worksheet): Anchor {
    return new Anchor(worksheet ?? this.worksheet, this.model);
  }
}

export { Anchor };
export type { AnchorModel };

type IAnchor = Pick<
  InstanceType<typeof Anchor>,
  "col" | "row" | "nativeCol" | "nativeRow" | "nativeColOff" | "nativeRowOff"
>;
export type { IAnchor };
