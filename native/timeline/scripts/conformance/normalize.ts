/**
 * Comparing edit results that allocate ids. Every id the input had (any
 * string under an `id`, `linkId` or `parentId` key, or in an array under a
 * `...Ids` key, at any depth) must come
 * back unchanged; only a fresh id (not in the input, and 32 lowercase hex
 * characters, `createTimeOrderedUuid`) is renamed `new0`, `new1`, ... in
 * order of appearance. A changed or invented id therefore shows as a
 * difference. `checkIds` adds the structural checks: clip ids are unique,
 * and every `parentId` names a clip of the input or of the result.
 */
const ID_KEYS = new Set(["id", "linkId", "parentId"]);
// An id field: `id`, `linkId`, `parentId`, and arrays of ids (`...Ids`).
const isIdKey = (key: string | undefined): boolean =>
  key !== undefined && (ID_KEYS.has(key) || key.endsWith("Ids"));
const FRESH = /^[0-9a-f]{32}$/;

export function inputIds(value: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: any, key?: string) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], k);
    else if (typeof v === "string" && isIdKey(key)) out.add(v);
  };
  walk(value);
  return out;
}

export function normalize(value: unknown, known: Set<string>): unknown {
  const names = new Map<string, string>();
  const walk = (v: any, key?: string): any => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") {
      const out: any = {};
      for (const k of Object.keys(v).sort()) {
        if (v[k] === undefined) continue;
        out[k] = walk(v[k], k);
      }
      return out;
    }
    if (typeof v === "string" && isIdKey(key) && !known.has(v) && FRESH.test(v)) {
      if (!names.has(v)) names.set(v, `new${names.size}`);
      return names.get(v);
    }
    return v;
  };
  return walk(value);
}

/** The problems of a result clip array, or [] when it is consistent. */
export function checkIds(clips: unknown, inputClips: any[]): string[] {
  if (!Array.isArray(clips)) return [];
  const problems: string[] = [];
  const ids = clips.map((c: any) => c?.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`duplicate clip id ${id}`);
    seen.add(id);
  }
  const all = new Set<string>([...ids, ...inputClips.map((c) => c.id)]);
  for (const c of clips as any[]) {
    if (c?.parentId !== undefined && !all.has(c.parentId)) problems.push(`${c.id}: parentId ${c.parentId} names no clip`);
  }
  return problems;
}
