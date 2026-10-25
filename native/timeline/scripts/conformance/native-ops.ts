/**
 * The edit operations of packages/timeline, answered by the native C++ port
 * (`timeline-ops`, src/edit/ClipOps.cpp). vitest.config.mts aliases the
 * package's own modules to this file, so the package tests run unchanged
 * against the native code. Each call is one process: the request on stdin,
 * the answer on stdout.
 */
import { execFileSync } from "node:child_process";

const bin = process.env.NT_TIMELINE_OPS;
if (!bin) throw new Error("NT_TIMELINE_OPS must name the timeline-ops binary");

// Every call appends a line, so the runner can tell that the native code
// answered at all.
import { appendFileSync } from "node:fs";

function arr(set: Iterable<string> | undefined): string[] | undefined {
  return set === undefined ? undefined : [...set];
}

function options(o: any): any {
  if (!o) return {};
  return {
    lockedTrackIds: arr(o.lockedTrackIds),
    lockedClipIds: arr(o.lockedClipIds),
    followLinks: o.followLinks,
    maxSourceDurationMs: o.maxSourceDurationMs
  };
}

function call(fn: string, args: unknown[]): any {
  if (process.env.NT_OPS_COUNT_FILE) appendFileSync(process.env.NT_OPS_COUNT_FILE, "1\n");
  const out = execFileSync(bin!, [], { input: JSON.stringify({ fn, args }), encoding: "utf8" });
  const response = JSON.parse(out);
  if ("error" in response) throw new Error(response.error);
  return response.result;
}

export const trimClip = (clip: any, edge: string, deltaMs: number, max?: number) =>
  call("trimClip", [clip, edge, deltaMs, max ?? null]);
export const splitClip = (clip: any, atMs: number) => call("splitClip", [clip, atMs]);
export const planShift = (clips: any[], fromMs: number, deltaMs: number, exclude?: Set<string>, o?: any) =>
  call("planShift", [clips, fromMs, deltaMs, arr(exclude) ?? [], options(o)]);
export const shiftClipsFrom = (clips: any[], fromMs: number, deltaMs: number, exclude?: Set<string>, o?: any) =>
  call("shiftClipsFrom", [clips, fromMs, deltaMs, arr(exclude) ?? [], options(o)]);
export const rippleTrim = (clips: any[], id: string, edge: string, deltaMs: number, o?: any) =>
  call("rippleTrim", [clips, id, edge, deltaMs, options(o)]);
export const findRollNeighbour = (clips: any[], clip: any, edge: string) =>
  call("findRollNeighbour", [clips, clip, edge]) ?? undefined;
export const rollEdit = (clips: any[], id: string, edge: string, deltaMs: number, o?: any) =>
  call("rollEdit", [clips, id, edge, deltaMs, { followLinks: o?.followLinks }]);
export const rippleDelete = (clips: any[], ids: Set<string>, o?: any) =>
  call("rippleDelete", [clips, arr(ids), options(o)]);
export const findGap = (clips: any[], trackId: string, atMs: number) => call("findGap", [clips, trackId, atMs]);
export const closeGap = (clips: any[], trackId: string, atMs: number, o?: any) =>
  call("closeGap", [clips, trackId, atMs, options(o)]);
export const resolveOverwrite = (clips: any[], ids: Set<string>, o?: any) =>
  call("resolveOverwrite", [clips, arr(ids), options(o)]);
export const resolveInsert = (clips: any[], ids: Set<string>, o?: any) =>
  call("resolveInsert", [clips, arr(ids), options(o)]);
export const resolveDrop = (clips: any[], ids: Set<string>, mode: string, o?: any) =>
  call("resolveDrop", [clips, arr(ids), mode, options(o)]);
export const DROP_MODES = ["overwrite", "insert", "overlap"] as const;
export const snap = (t: number, c: number[], thr: number, mpp: number) => call("snap", [t, c, thr, mpp]);
export const resolveSnap = (t: number, c: number[], thr: number, mpp: number) =>
  call("resolveSnap", [t, c, thr, mpp]);
export const buildSnapPoints = (source: any) =>
  call("buildSnapPoints", [{ ...source, excludeClipIds: arr(source.excludeClipIds) }]);
