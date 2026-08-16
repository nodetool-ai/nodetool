/**
 * `@nodetool-ai/sandbox-subtitle` — subtitle, on the host.
 *
 * The published bundle uses stream internals the guest probe refuses.
 * The guest sends caption text; this module returns plain cue objects.
 */

import { optionsOf, requireText, unwrapLibrary } from "./limits.js";
import { isFunction, isString } from "../utils/type-guards.js";

interface Cue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleNode {
  type: string;
  data?: { start?: number; end?: number; text?: string };
}

interface SubtitleLike {
  parseSync: (text: string) => SubtitleNode[];
  stringifySync: (
    nodes: SubtitleNode[],
    opts?: { format?: string }
  ) => string;
}

async function loadSubtitle(where: string): Promise<SubtitleLike> {
  const mod: unknown = await import("subtitle");
  return unwrapLibrary<SubtitleLike>(
    mod,
    where,
    "subtitle",
    (v) => isFunction((v as SubtitleLike | undefined)?.parseSync)
  );
}

export async function parse(text: unknown): Promise<Cue[]> {
  const where = "subtitle.parse";
  const lib = await loadSubtitle(where);
  return lib
    .parseSync(requireText(where, text, "captions"))
    .filter((node) => node.type === "cue" && node.data)
    .map((node) => ({
      start: Number(node.data?.start ?? 0),
      end: Number(node.data?.end ?? 0),
      text: String(node.data?.text ?? "")
    }));
}

export async function stringify(cues: unknown, options?: unknown): Promise<string> {
  const where = "subtitle.stringify";
  if (!Array.isArray(cues)) {
    throw new Error(`${where}: cues must be an array`);
  }
  const lib = await loadSubtitle(where);
  const opts = optionsOf(options);
  const format = isString(opts.format) ? opts.format : "SRT";
  return lib.stringifySync(
    cues.map((item) => {
      const cue = optionsOf(item);
      return {
        type: "cue",
        data: {
          start: Number(cue.start ?? 0),
          end: Number(cue.end ?? 0),
          text: String(cue.text ?? "")
        }
      };
    }),
    { format }
  );
}
