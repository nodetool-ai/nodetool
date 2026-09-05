import type { GodotBlock, TscnDocument } from "./types.js";

const HEADER =
  /^\[([A-Za-z_]+)((?:\s+[A-Za-z_][A-Za-z0-9_]*=(?:"(?:[^"\\]|\\.)*"|[^\s\]]+))*)\s*\]$/;
const ATTRIBUTE = /([A-Za-z_][A-Za-z0-9_]*)=("(?:[^"\\]|\\.)*"|[^\s\]]+)/g;
const PROPERTY = /^([A-Za-z0-9_./:-]+) = (.*)$/;

function unquote(raw: string): string {
  return raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/\\(.)/g, "$1")
    : raw;
}

/**
 * Read a `.tscn` or `.tres`. Both share one grammar: a `[gd_scene ...]` or
 * `[gd_resource ...]` header, then `[ext_resource ...]`, `[sub_resource ...]`,
 * `[node ...]`, `[resource]`, `[connection ...]` blocks, each followed by
 * `key = value` lines. A value that spans several lines (a dictionary, an
 * array) is kept as the raw text of those lines joined with newlines.
 */
export function readTscn(text: string): TscnDocument {
  const blocks: GodotBlock[] = [];
  let current: GodotBlock | null = null;
  let lastKey: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const header = HEADER.exec(line);
    if (header) {
      current = { kind: header[1], attributes: {}, properties: {} };
      for (const m of header[2].matchAll(ATTRIBUTE)) {
        current.attributes[m[1]] = unquote(m[2]);
      }
      blocks.push(current);
      lastKey = null;
      continue;
    }
    if (line === "" || line.startsWith(";")) {
      continue;
    }
    if (!current) {
      throw new Error(`text before the first block: ${line}`);
    }
    const property = PROPERTY.exec(line);
    if (property) {
      lastKey = property[1];
      current.properties[lastKey] = property[2];
    } else if (lastKey !== null) {
      current.properties[lastKey] += `\n${line}`;
    } else {
      throw new Error(`unparseable line in [${current.kind}]: ${line}`);
    }
  }
  const [header, ...rest] = blocks;
  if (!header || (header.kind !== "gd_scene" && header.kind !== "gd_resource")) {
    throw new Error("missing [gd_scene] or [gd_resource] header");
  }
  return { header, blocks: rest };
}

/** Same grammar as {@link readTscn}. */
export const readTres = readTscn;

const EXT_REF = /ExtResource\("((?:[^"\\]|\\.)*)"\)/g;
const SUB_REF = /SubResource\("((?:[^"\\]|\\.)*)"\)/g;

/** Every `ExtResource("id")` / `SubResource("id")` a block's properties mention. */
export function referencedIds(block: GodotBlock): { ext: string[]; sub: string[] } {
  const ext: string[] = [];
  const sub: string[] = [];
  for (const value of Object.values(block.properties)) {
    for (const m of value.matchAll(EXT_REF)) {
      ext.push(m[1]);
    }
    for (const m of value.matchAll(SUB_REF)) {
      sub.push(m[1]);
    }
  }
  return { ext, sub };
}
