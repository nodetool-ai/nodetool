import { formatResourceUri, type ResourceKind } from "@nodetool-ai/protocol";

/**
 * The `url` a mutating `ui_*` tool hands back so the agent can link what it
 * just changed without composing the URI itself.
 */
export const docUrl = (
  kind: ResourceKind,
  id: string,
  subTarget?: { key: string; value: string }
): string => formatResourceUri({ kind, id, subTarget });
