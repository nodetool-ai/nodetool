// Comparison helpers of plan-conformance.mjs, tested by plan-compare.test.mjs.

import fs from "node:fs";
import path from "node:path";

export const TOLERANCE = 1e-6;

/** Both finite numbers, within the tolerance. A null, NaN or string fails. */
export const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOLERANCE;

/**
 * A difference between two optional numbers, or null when they match. Only
 * `undefined` on both sides counts as absent. A null, NaN or string is a
 * mismatch, never a 0.
 */
export function diffNumber(name, web, native) {
  if (web === undefined && native === undefined) return null;
  return near(web, native) ? null : `${name} web ${web} native ${native}`;
}

/** An optional number that defaults to 0 when absent. A null stays null and fails. */
export const orZero = (v) => (v === undefined ? 0 : v);

const validReason = (r) => Array.isArray(r) && r.length > 0 && r.every((s) => typeof s === "string" && s.length > 0);

/**
 * The excluded clip ids: the clips in planUnsupportedFields with a non-empty
 * list of non-empty reasons. planUnsupported must list the same ids, and each
 * difference or bad reason is an error.
 */
export function exclusionsFrom(native) {
  const errors = [];
  const fields = native.planUnsupportedFields ?? {};
  const listed = native.planUnsupported ?? [];
  if (typeof fields !== "object" || Array.isArray(fields) || fields === null) {
    return { excluded: new Set(), errors: ["planUnsupportedFields is not an object"] };
  }
  if (!Array.isArray(listed)) return { excluded: new Set(), errors: ["planUnsupported is not an array"] };
  const excluded = new Set();
  for (const [id, reasons] of Object.entries(fields)) {
    if (validReason(reasons)) excluded.add(id);
    else errors.push(`clip ${id}: planUnsupportedFields has no valid reason (${JSON.stringify(reasons)})`);
  }
  const listedSet = new Set(listed);
  for (const id of listedSet) {
    if (!(id in fields)) errors.push(`clip ${id}: in planUnsupported but not in planUnsupportedFields`);
  }
  for (const id of Object.keys(fields)) {
    if (!listedSet.has(id)) errors.push(`clip ${id}: in planUnsupportedFields but not in planUnsupported`);
  }
  return { excluded, errors };
}

/** Flex is ported: no clip may be excluded for a flex reason. */
export function checkFlexReasons(fields) {
  const out = [];
  for (const [id, reasons] of Object.entries(fields)) {
    for (const r of reasons) {
      if (r === "flexLayout" || r === "flexAnimatedText") out.push(`flex exclusion: ${id} is still excluded with ${r} (flex is ported)`);
    }
  }
  return out.slice(0, 10);
}

/**
 * Audits every excluded id. A clip's evidence is the tally (`compared`,
 * `mismatched` layers and surfaces, by base clip id) of itself and of every
 * descendant (`parentId`), so a group with no layer of its own is judged by
 * what it places. An id whose evidence all matches is a stale exclusion; an
 * id with no evidence is uncovered. `checked(reason)` false waives the clip.
 */
export function auditExclusions(clips, ids, tally, fields, checked) {
  const children = new Map();
  for (const c of clips) {
    if (!c.parentId) continue;
    if (!children.has(c.parentId)) children.set(c.parentId, []);
    children.get(c.parentId).push(c.id);
  }
  const evidence = (id) => {
    const total = { compared: 0, mismatched: 0 };
    const seen = new Set();
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const t = tally.get(cur);
      if (t) {
        total.compared += t.compared;
        total.mismatched += t.mismatched;
      }
      stack.push(...(children.get(cur) ?? []));
    }
    return total;
  };
  const stale = [];
  const uncovered = [];
  let audited = 0;
  for (const id of ids) {
    const reasons = fields[id] ?? [];
    if (!reasons.every((r) => checked(r))) continue;
    audited++;
    const e = evidence(id);
    if (e.compared + e.mismatched === 0) uncovered.push(id);
    else if (e.mismatched === 0) stale.push(`stale exclusion: ${id} (${reasons.join(", ")}) matches the web in all ${e.compared} layers and surfaces`);
  }
  return { audited, stale, uncovered };
}

/** The most recently built nodetool-timeline in a `build...` folder of `root`, or null. */
export function newestBinary(root) {
  let best = null;
  let bestMtime = -Infinity;
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dirs) {
    if (!d.isDirectory() || !d.name.startsWith("build")) continue;
    const bin = path.join(root, d.name, "nodetool-timeline");
    let st;
    try {
      st = fs.statSync(bin);
    } catch {
      continue;
    }
    if (st.isFile() && st.mtimeMs > bestMtime) {
      best = bin;
      bestMtime = st.mtimeMs;
    }
  }
  return best;
}

// What `--dump-plan` is built from: a binary older than any of these does
// not show the current code.
const PLAN_SOURCES = ["src/scene", "src/preview", "src/model", "src/server", "src/main.cpp", "third_party/yoga"];

/** The plan sources under `root` newer than the binary `bin`, newest first. */
export function staleSources(root, bin) {
  const built = fs.statSync(bin).mtimeMs;
  const out = [];
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    } else if (/\.(cpp|h|c)$/.test(p) && st.mtimeMs > built) {
      out.push({ p, mtime: st.mtimeMs });
    }
  };
  for (const rel of PLAN_SOURCES) walk(path.join(root, rel));
  return out.sort((a, b) => b.mtime - a.mtime).map((e) => e.p);
}
