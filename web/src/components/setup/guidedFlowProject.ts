/**
 * Where a guided flow creates its document: the project that is already open,
 * or a project row made for it.
 *
 * The `+ New` menu used to file every guided flow into the open project, and
 * the New Project surface used to make a project row for every entry card.
 * Both now ask first, through {@link GuidedFlowProjectDialog}, so the creator
 * picks the destination instead of the entry point deciding it.
 */

import { useAuth } from "../../stores/useAuth";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useProjects } from "../../hooks/useProjects";
import type { EntryFlowId } from "./entryCards";

/** The destination a guided flow was started with. */
export type GuidedFlowDestination = "current" | "new";

/**
 * The project row a "new project" start files under. The kind is what the
 * project's spend history reads back by, so it matches the kinds the New
 * Project surface already writes — including the video flow's `timeline`.
 */
export const GUIDED_FLOW_PROJECT_KIND: Record<EntryFlowId, string> = {
  entity: "entity",
  storyboard: "storyboard",
  video: "timeline",
  script: "script",
  image: "image",
  workflow: "workflow",
  game: "game"
};

/**
 * The project name a "new project" start uses when it has no prompt to name
 * it from. The `+ New` menu starts flows with an empty brief, so it always
 * lands here; the New Project surface only lands here when its prompt is
 * empty, and both say the same thing for the same flow.
 */
export const GUIDED_FLOW_NEW_PROJECT_NAME: Record<EntryFlowId, string> = {
  entity: "New entity",
  storyboard: "New storyboard",
  video: "New video",
  script: "New script",
  image: "New image",
  workflow: "New workflow",
  game: "New game"
};

export interface CurrentProjectDisplay {
  /** The id a "current project" start files into — never the loose bucket. */
  id: string;
  /** The name the destination dialog shows for it. */
  name: string;
}

/**
 * The project a "current project" start files into, as the dialog names it.
 * Reads the open project, falling back to Personal the way creation does —
 * a start from the menu or the surface never lands in the loose bucket.
 */
export const useCurrentProjectDisplay = (): CurrentProjectDisplay => {
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const authUserId = useAuth((state) => state.user?.id);
  const { data: projects } = useProjects();

  const activeProject = (projects ?? []).find(
    (project) => project.id === activeProjectId
  );
  if (activeProject) {
    return { id: activeProject.id, name: activeProject.name };
  }
  if (
    activeProjectId !== null &&
    activeProjectId !== undefined &&
    activeProjectId !== LOOSE_PROJECT_ID
  ) {
    return { id: activeProjectId, name: "Project" };
  }
  const personalId =
    personalProjectId ?? (authUserId ? `personal:${authUserId}` : null);
  const personalProject = (projects ?? []).find(
    (project) => project.isPersonal
  );
  if (personalProject) {
    return { id: personalProject.id, name: personalProject.name };
  }
  return { id: personalId ?? LOOSE_PROJECT_ID, name: "Personal" };
};
