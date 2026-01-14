/**
 * Shared ZIP64 mode type.
 *
 * - "auto": write ZIP64 only when required by ZIP limits.
 * - true: force ZIP64 structures.
 * - false: forbid ZIP64; throw if required.
 */
export type Zip64Mode = boolean | "auto";
