/**
 * Which project a newly created document belongs to.
 *
 * A create call may name one, and a run may be bound to one — a chat in a
 * project's own agent panel is. Without either, the document lands in the
 * loose `default` bucket. The run's project is a fallback, never an override:
 * a call that names a project means it.
 */

import { isNonBlankString } from "../utils/type-guards.js";
import type { CapabilityRun } from "./types.js";

export const DEFAULT_PROJECT_ID = "default";

export function resolveProjectId(
  run: CapabilityRun,
  params: Record<string, unknown>
): string {
  const named = params["project_id"];
  if (isNonBlankString(named)) return named.trim();
  if (isNonBlankString(run.projectId)) return run.projectId.trim();
  return DEFAULT_PROJECT_ID;
}
