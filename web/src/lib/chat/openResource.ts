/**
 * openResource — navigate to the target of a resource URI (`timeline://…`).
 *
 * Document kinds open a workspace tab; kinds without a surface (asset,
 * collection, thread) are not navigable yet and report `false` so the caller
 * can stay inert. Sub-targets are Phase 2 and ignored here.
 */

import type { ResourceKind, ResourceUri } from "@nodetool-ai/protocol";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore,
} from "../../stores/WorkspaceTabsStore";
import { resolveDocumentProject, type DocumentTabType } from "../resolveDocumentProject";
import { useNotificationStore } from "../../stores/NotificationStore";

const TAB_TYPE_BY_KIND: Partial<Record<ResourceKind, DocumentTabType>> = {
  workflow: "workflow",
  timeline: "timeline",
  storyboard: "storyboard",
  sketch: "sketch",
  script: "script",
  app: "application",
  model3d: "model3d"
};

export const canOpenResource = (kind: ResourceKind): boolean =>
  TAB_TYPE_BY_KIND[kind] !== undefined;

export const openResource = async (ref: ResourceUri): Promise<boolean> => {
  const type = TAB_TYPE_BY_KIND[ref.kind];
  if (!type) {
    return false;
  }
  try {
    const document = await resolveDocumentProject(type, ref.id);
    const tabs = useWorkspaceTabsStore.getState();
    tabs.setActiveProjectId(document.projectId ?? null);
    tabs.openTab({
      type,
      ref: document.id,
      mode: "edit",
      projectId: document.projectId ?? LOOSE_PROJECT_ID
    });
    return true;
  } catch (error) {
    useNotificationStore.getState().addNotification({
      type: "error",
      alert: true,
      content: `Could not open ${ref.kind}: ${error instanceof Error ? error.message : String(error)}`
    });
    return false;
  }
};

export default openResource;
