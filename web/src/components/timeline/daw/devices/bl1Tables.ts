/**
 * BL-1's wavetables, generated once per page. Every BL-1 device hands them to
 * its processor through `processorOptions`, so an offline render has them
 * before its first quantum and no `tables` message can arrive late.
 */

import { generateTables, type GeneratedTable } from "../fablesynth/engine/wavetables";

let tables: GeneratedTable[] | null = null;

export function bl1Tables(): GeneratedTable[] {
  if (!tables) tables = generateTables();
  return tables;
}

/** The processorOptions form: one Float32Array per table, copied by structured clone. */
export function bl1ProcessorTables(): Array<{
  frames: number;
  mips: number;
  size: number;
  data: Float32Array;
}> {
  return bl1Tables().map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, data: t.data }));
}
