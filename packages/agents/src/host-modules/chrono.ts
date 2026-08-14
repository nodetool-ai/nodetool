/**
 * `@nodetool-ai/sandbox-chrono` — chrono-node, on the host.
 *
 * chrono-node pulls locale tables and Date internals the guest probe refuses.
 * The guest sends text; this module returns ISO strings.
 */

import { requireText, unwrapLibrary } from "./limits.js";

interface ChronoHit {
  text: string;
  start: string;
  end: string | null;
}

interface ChronoLike {
  parseDate: (text: string, ref?: Date) => Date | null;
  parse: (
    text: string,
    ref?: Date
  ) => Array<{
    text: string;
    start: { date: () => Date };
    end?: { date: () => Date };
  }>;
}

async function loadChrono(where: string): Promise<ChronoLike> {
  const mod: unknown = await import("chrono-node");
  return unwrapLibrary<ChronoLike>(
    mod,
    where,
    "chrono-node",
    (v) => typeof (v as ChronoLike | undefined)?.parseDate === "function"
  );
}

function refDate(value: unknown): Date | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export async function parseDate(text: unknown, now?: unknown): Promise<string | null> {
  const where = "chrono.parseDate";
  const chrono = await loadChrono(where);
  const when = chrono.parseDate(requireText(where, text), refDate(now));
  return when ? when.toISOString() : null;
}

export async function parse(text: unknown, now?: unknown): Promise<ChronoHit[]> {
  const where = "chrono.parse";
  const chrono = await loadChrono(where);
  return chrono.parse(requireText(where, text), refDate(now)).map((hit) => ({
    text: hit.text,
    start: hit.start.date().toISOString(),
    end: hit.end ? hit.end.date().toISOString() : null
  }));
}
