/**
 * openResource — navigate to the target of a `nodetool://` resource URI.
 *
 * Document kinds open a workspace tab; kinds without a surface (asset,
 * collection, thread) are not navigable yet and report `false` so the caller
 * can stay inert. Sub-targets are Phase 2 and ignored here.
 */

import type { ResourceKind, ResourceUri } from "@nodetool-ai/protocol";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";

const TAB_TYPE_BY_KIND: Partial<Record<ResourceKind, WorkspaceTabType>> = {
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

export const openResource = (ref: ResourceUri): boolean => {
  const type = TAB_TYPE_BY_KIND[ref.kind];
  if (!type) {
    return false;
  }
  useWorkspaceTabsStore.getState().openTab({
    type,
    ref: ref.id,
    mode: "edit"
  });
  return true;
};

export default openResource;
