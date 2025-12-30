export type DecimalSeparator = "." | ",";

export function formatNumberForCsv(value: number, decimalSeparator: DecimalSeparator): string {
  if (decimalSeparator !== ",") {
    return String(value);
  }
  // Keep JS numeric string form but replace the decimal point.
  // Use split/join for broad runtime compatibility.
  return String(value).split(".").join(",");
}

export function parseNumberFromCsv(value: string, decimalSeparator: DecimalSeparator): number {
  if (decimalSeparator !== ",") {
    return Number(value);
  }

  const trimmed = value.trim();

  // Minimal locale support: treat a single comma as the decimal separator.
  // Common EU CSV uses delimiter ';' and decimal ',' (e.g. 12,34).
  if (/^-?\d+(,\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed.replace(",", "."));
  }

  return Number(value);
}
