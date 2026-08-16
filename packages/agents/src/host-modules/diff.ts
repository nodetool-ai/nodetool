/**
 * `@nodetool-ai/sandbox-diff` — the `diff` library, on the host.
 *
 * It schedules with `setTimeout`, which the guest does not have, so the
 * compiler refuses it as a guest module. It runs here instead.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";
import { isFunction } from "../utils/type-guards.js";

interface DiffLike {
  createTwoFilesPatch: (
    oldName: string,
    newName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number }
  ) => string;
}

async function loadDiff(where: string): Promise<DiffLike> {
  const mod: unknown = await import("diff");
  return unwrapLibrary<DiffLike>(
    mod,
    where,
    "diff",
    (v) => isFunction((v as DiffLike | undefined)?.createTwoFilesPatch)
  );
}

/** Unified diff of two texts — empty hunks mean identical. */
export async function unified(
  a: unknown,
  b: unknown,
  options?: unknown
): Promise<string> {
  const where = "diff.unified";
  const left = requireText(where, a, "a");
  const right = requireText(where, b, "b");
  const opts = optionsOf(options);
  const rawContext = Number(opts.context ?? 3);
  const context = Number.isFinite(rawContext)
    ? Math.min(Math.max(Math.floor(rawContext), 0), 100)
    : 3;
  const diffLib = await loadDiff(where);
  return diffLib.createTwoFilesPatch(
    String(opts.oldName ?? "a"),
    String(opts.newName ?? "b"),
    left,
    right,
    undefined,
    undefined,
    { context }
  );
}
