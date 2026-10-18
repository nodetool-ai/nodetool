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

/**
 * Which project a run reads library rows from. The web app claims every loose
 * row for the user's Personal project (`Project.migrateToPersonal`), so a run
 * with no project that read `default` literally found nothing it had saved
 * once the app had refreshed. The loose scope reads Personal, the way the
 * resources router resolves it.
 */
export async function resolveReadProjectId(
  run: CapabilityRun,
  params: Record<string, unknown>
): Promise<string> {
  const projectId = resolveProjectId(run, params);
  const userId = run.context.userId;
  if (projectId !== DEFAULT_PROJECT_ID || !isNonBlankString(userId)) {
    return projectId;
  }
  const { Project } = await import("@nodetool-ai/models");
  return (await Project.migrateToPersonal(userId)).project.id;
}
