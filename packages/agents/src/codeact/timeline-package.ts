import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

export const TIMELINE_PACKAGE = "@nodetool-ai/sandbox-timeline";

/** Allow timeline authoring when the session catalog serves the builder pack. */
export function withTimelinePackage(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  if (
    allowed.includes(TIMELINE_PACKAGE) ||
    !(catalog?.summaries() ?? []).some(
      (summary) => summary.specifier === TIMELINE_PACKAGE
    )
  ) {
    return [...allowed];
  }
  return [...allowed, TIMELINE_PACKAGE];
}
