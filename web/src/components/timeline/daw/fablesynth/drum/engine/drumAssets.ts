/**
 * DR-1's wavetables and one-shot samples, built and decoded once per page.
 * Every DR-1 node (live or offline) receives them through
 * `processorOptions`, so a render never starts before its tables are there.
 */

import { generateTables, type GeneratedTable } from '../../engine/wavetables';
import { generateDrumTables } from './drumtables';
import { generateSampledDrumTables } from './sampledtables.gen';

export interface DrumOneShot {
  name: string;
  sampleRate: number;
  data: Float32Array;
}

export interface DrumAssets {
  /** In DRUM_TABLE_NAMES order. */
  tables: GeneratedTable[];
  /** In DRUM_SAMPLE_NAMES order. */
  samples: DrumOneShot[];
}

export function decodeWavPcm16(buf: ArrayBuffer): { sampleRate: number; data: Float32Array } {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const tag = (at: number) => String.fromCharCode(u8[at], u8[at + 1], u8[at + 2], u8[at + 3]);
  let sampleRate = 0;
  let dataAt = -1;
  let dataBytes = 0;
  for (let at = 12; at + 8 <= u8.length;) {
    const size = dv.getUint32(at + 4, true);
    const body = at + 8;
    if (tag(at) === 'fmt ') sampleRate = dv.getUint32(body + 4, true);
    if (tag(at) === 'data') {
      dataAt = body;
      dataBytes = Math.min(size, u8.length - body);
    }
    at = body + size + (size & 1);
  }
  if (!sampleRate || dataAt < 0) throw new Error('invalid drum sample WAV');
  const data = new Float32Array(Math.floor(dataBytes / 2));
  for (let i = 0; i < data.length; i++) data[i] = dv.getInt16(dataAt + i * 2, true) / 32768;
  return { sampleRate, data };
}

let tables: GeneratedTable[] | null = null;
let assets: Promise<DrumAssets> | null = null;

/** The built-in tables, generated on first use. */
export function drumTables(): GeneratedTable[] {
  tables ??= [...generateDrumTables(), ...generateTables(), ...generateSampledDrumTables()];
  return tables;
}

async function loadSamples(): Promise<DrumOneShot[]> {
  const { DRUM_ONESHOT_URLS } = await import('./oneshotUrls');
  return Promise.all(DRUM_ONESHOT_URLS.map(async ({ name, url }) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`drum sample ${name}: HTTP ${response.status}`);
    return { name, ...decodeWavPcm16(await response.arrayBuffer()) };
  }));
}

export function loadDrumAssets(): Promise<DrumAssets> {
  assets ??= loadSamples().then(
    (samples) => ({ tables: drumTables(), samples }),
    (error: unknown) => {
      assets = null;
      throw error;
    },
  );
  return assets;
}

/** The assets in the shape the worklet's `tables` and `samples` lists take. */
export function workletAssetLists(a: DrumAssets): {
  tables: Array<{ frames: number; mips: number; size: number; buf: ArrayBuffer }>;
  samples: Array<{ sampleRate: number; buf: ArrayBuffer }>;
} {
  return {
    tables: a.tables.map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, buf: t.data.buffer as ArrayBuffer })),
    samples: a.samples.map((s) => ({ sampleRate: s.sampleRate, buf: s.data.buffer as ArrayBuffer })),
  };
}
