import type { GodotBlock, TscnDocument } from "./types.js";

const PROPERTY = /^([A-Za-z0-9_./:-]+) = (.*)$/;

const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isIdent = (c: string): boolean => /[A-Za-z0-9_]/.test(c);
const isSpace = (c: string): boolean => c === " " || c === "\t";

/**
 * Parse a `[kind key="value" key=value ...]` header, or null when the line is
 * not one. A single left-to-right scan: a quoted value runs to its closing
 * quote (backslash escapes one character), a bare one to the next space or
 * `]`. The regex this replaced nested a quantifier over overlapping
 * alternatives and backtracked exponentially on a crafted header.
 */
function parseHeader(
  line: string
): { kind: string; attributes: Record<string, string> } | null {
  if (!line.startsWith("[") || !line.endsWith("]")) return null;
  const body = line.slice(1, -1);
  let i = 0;
  const readIdent = (): string | null => {
    if (i >= body.length || !isIdentStart(body[i])) return null;
    const start = i;
    while (i < body.length && isIdent(body[i])) i++;
    return body.slice(start, i);
  };
  const kind = readIdent();
  if (kind === null) return null;
  const attributes: Record<string, string> = {};
  while (i < body.length) {
    if (!isSpace(body[i])) return null;
    while (i < body.length && isSpace(body[i])) i++;
    if (i >= body.length) break;
    const key = readIdent();
    if (key === null || body[i] !== "=") return null;
    i++;
    if (body[i] === '"') {
      i++;
      let value = "";
      let closed = false;
      while (i < body.length) {
        const c = body[i++];
        if (c === "\\" && i < body.length) {
          value += body[i++];
        } else if (c === '"') {
          closed = true;
          break;
        } else {
          value += c;
        }
      }
      if (!closed) return null;
      attributes[key] = value;
    } else {
      const start = i;
      while (i < body.length && !isSpace(body[i]) && body[i] !== "]") i++;
      if (i === start) return null;
      attributes[key] = body.slice(start, i);
    }
  }
  return { kind, attributes };
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
    const header = parseHeader(line);
    if (header) {
      current = { kind: header.kind, attributes: header.attributes, properties: {} };
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
