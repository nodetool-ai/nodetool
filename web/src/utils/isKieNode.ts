import type { NodeMetadata } from "../stores/ApiTypes";

/** True for generated kie nodes (`kie.image.*`) and dynamic kie schema nodes. */
export function isKieNodeMetadata(
  metadata: Pick<NodeMetadata, "namespace"> & { node_type?: string },
): boolean {
  const ns = metadata.namespace ?? "";
  if (ns === "kie" || ns.startsWith("kie.")) {
    return true;
  }
  const nodeType = metadata.node_type ?? "";
  return nodeType.startsWith("kie.");
}
