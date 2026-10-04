/**
 * openResource — navigate to the target of a resource URI (`timeline://…`).
 *
 * Document kinds open a workspace tab. An asset opens in the tab its content
 * type maps to (image, SVG, audio, 3D, text), and any other file — a PDF, a
 * video, an archive — opens its stored file in a new browser tab. Kinds
 * without a surface (collection, thread) are not navigable yet and report
 * `false` so the caller can stay inert. Sub-targets are Phase 2 and ignored
 * here.
 */

import type { ResourceKind, ResourceUri } from "@nodetool-ai/protocol";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore,
} from "../../stores/WorkspaceTabsStore";
import { resolveDocumentProject, type DocumentTabType } from "../resolveDocumentProject";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { assetTabType } from "../../components/workspace/assetTabType";
import { assetIdFromLocator } from "../../utils/mediaRef";

const TAB_TYPE_BY_KIND: Partial<Record<ResourceKind, DocumentTabType>> = {
  workflow: "workflow",
  timeline: "timeline",
  storyboard: "storyboard",
  sketch: "sketch",
  script: "script",
  jsscript: "jsscript",
  app: "application",
  game: "game",
  model3d: "model3d"
};

export const canOpenResource = (kind: ResourceKind): boolean =>
  kind === "asset" || TAB_TYPE_BY_KIND[kind] !== undefined;

/** `asset://<id>.<ext>` carries the extension in the id; the row has none. */
const openAsset = async (locatorId: string): Promise<void> => {
  const id = assetIdFromLocator(`asset://${locatorId}`) ?? locatorId;
  const asset = await trpcClient.assets.get.query({ id });
  const type = assetTabType(asset);
  if (type) {
    const tabs = useWorkspaceTabsStore.getState();
    tabs.setActiveProjectId(asset.project_id ?? null);
    tabs.openTab({
      type,
      ref: asset.id,
      mode: "edit",
      title: asset.name || "Asset",
      projectId: asset.project_id ?? LOOSE_PROJECT_ID
    });
    return;
  }
  if (!asset.get_url) {
    throw new Error("the file has no download URL");
  }
  window.open(asset.get_url, "_blank", "noopener,noreferrer");
};

const openDocument = async (
  type: DocumentTabType,
  id: string
): Promise<void> => {
  const document = await resolveDocumentProject(type, id);
  const tabs = useWorkspaceTabsStore.getState();
  tabs.setActiveProjectId(document.projectId ?? null);
  tabs.openTab({
    type,
    ref: document.id,
    mode: "edit",
    projectId: document.projectId ?? LOOSE_PROJECT_ID
  });
};

export const openResource = async (ref: ResourceUri): Promise<boolean> => {
  const type = TAB_TYPE_BY_KIND[ref.kind];
  if (ref.kind !== "asset" && !type) {
    return false;
  }
  try {
    if (type) {
      await openDocument(type, ref.id);
    } else {
      await openAsset(ref.id);
    }
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
