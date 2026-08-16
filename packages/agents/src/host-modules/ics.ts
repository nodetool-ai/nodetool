/**
 * `@nodetool-ai/sandbox-ics` — ics, on the host.
 *
 * The published bundle pulls Node-shaped helpers the guest probe refuses.
 * The guest sends event objects; this module returns .ics text.
 */

import { optionsOf, unwrapLibrary } from "./limits.js";
import { isFunction, isString } from "../utils/type-guards.js";

interface IcsResult {
  error?: Error | null;
  value?: string;
}

interface IcsLike {
  createEvent: (event: Record<string, unknown>) => IcsResult;
  createEvents: (events: Record<string, unknown>[]) => IcsResult;
}

async function loadIcs(where: string): Promise<IcsLike> {
  const mod: unknown = await import("ics");
  return unwrapLibrary<IcsLike>(
    mod,
    where,
    "ics",
    (v) => isFunction((v as IcsLike | undefined)?.createEvent)
  );
}

function unwrap(where: string, result: IcsResult): string {
  if (result.error) {
    throw new Error(`${where}: ${result.error.message}`);
  }
  if (!isString(result.value)) {
    throw new Error(`${where}: no calendar text was produced`);
  }
  return result.value;
}

export async function createEvent(spec: unknown): Promise<string> {
  const where = "ics.createEvent";
  const ics = await loadIcs(where);
  return unwrap(where, ics.createEvent(optionsOf(spec)));
}

export async function createEvents(specs: unknown): Promise<string> {
  const where = "ics.createEvents";
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error(`${where}: provide a non-empty array of events`);
  }
  const ics = await loadIcs(where);
  return unwrap(
    where,
    ics.createEvents(specs.map((item) => optionsOf(item)))
  );
}
