/**
 * The sandbox packs a prompt may advertise.
 *
 * NodeTool ships twenty packs, but a pack becomes importable only once it is
 * installed, like any third-party pack. A prompt that lists all twenty on a
 * fresh machine makes the planner declare a specifier `submit_graph` then
 * rejects with "Sandbox module ... is not installed." So the list comes from
 * the live catalog, and each summary comes from the pack's own metadata —
 * never from a table written here.
 */

import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

/** One line is all the prompt gets, so cut a long description off here. */
const MAX_SUMMARY_LENGTH = 120;

export interface InstalledSandboxPack {
  /** Import specifier, e.g. "@nodetool-ai/sandbox-csv". */
  specifier: string;
  /** One line on what the pack is for, from the pack's own metadata. */
  summary: string;
}

/**
 * Installed sandbox packs, alphabetically by specifier. Empty when nothing is
 * installed or no catalog is available.
 */
export function installedSandboxPacks(
  catalog?: SandboxModuleCatalog | undefined
): InstalledSandboxPack[] {
  if (catalog === undefined) return [];
  const bySpecifier = new Map<string, InstalledSandboxPack>();
  for (const summary of catalog.summaries()) {
    if (bySpecifier.has(summary.specifier)) continue;
    bySpecifier.set(summary.specifier, {
      specifier: summary.specifier,
      summary: oneLine(summary.description)
    });
  }
  return [...bySpecifier.values()].sort((left, right) =>
    left.specifier.localeCompare(right.specifier)
  );
}

/** Flatten a description to one capped line. A pack without one gets "". */
function oneLine(description: string | undefined): string {
  if (description === undefined) return "";
  const flat = description.replace(/\s+/g, " ").trim();
  return flat.length > MAX_SUMMARY_LENGTH
    ? `${flat.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`
    : flat;
}
