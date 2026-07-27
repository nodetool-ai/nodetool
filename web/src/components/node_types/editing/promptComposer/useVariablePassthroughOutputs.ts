/**
 * Mirrors a Prompt node's variables onto `dynamic_inputs` / `dynamic_outputs`.
 *
 * Every `{{ variable }}` also gets an output handle of the same name carrying
 * the raw value, so an image wired into `var_1` can additionally feed a
 * downstream node that wants the real asset (reference images, image-to-video,
 * …) instead of the `asset://` token the rendered text carries.
 *
 * The handles adopt the type of whatever is wired into the variable, so edge
 * colors and connection validation match the value that actually flows. An
 * unconnected variable stays `any` — it holds a literal typed into the node.
 *
 * Both maps are written: `dynamic_inputs` is what keeps the name resolving as
 * an input handle now that it also appears in `dynamic_outputs` (see
 * `findInputHandle` / `getAllInputHandles`), which otherwise treat a name in
 * `dynamic_outputs` as output-only.
 */
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import type { TypeMetadata } from "../../../../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../../../../stores/NodeData";
import { useNodes } from "../../../../contexts/NodeContext";
import useMetadataStore from "../../../../stores/MetadataStore";
import { findOutputHandle } from "../../../../utils/handleUtils";
import isEqual from "../../../../utils/isEqual";

const ANY_TYPE: TypeMetadata = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

export const useVariablePassthroughOutputs = (
  nodeId: string,
  variableNames: string[],
  dynamicInputs: Record<string, DynamicSlotDeclaration>,
  dynamicOutputs: Record<string, TypeMetadata>
): void => {
  const { edges, findNode, updateNodeData } = useNodes(
    (state) => ({
      edges: state.edges,
      findNode: state.findNode,
      updateNodeData: state.updateNodeData
    }),
    shallow
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  useEffect(() => {
    const incomingByHandle = new Map<string, (typeof edges)[number]>();
    for (const edge of edges) {
      if (edge.target === nodeId && edge.targetHandle) {
        incomingByHandle.set(edge.targetHandle, edge);
      }
    }

    const next: Record<string, TypeMetadata> = {};
    for (const name of variableNames) {
      // A variable named "output" would supersede the node's own string
      // output handle in NodeOutputs — leave that one alone.
      if (name === "output") continue;

      const incoming = incomingByHandle.get(name);
      const sourceNode = incoming ? findNode(incoming.source) : undefined;
      const sourceMetadata = sourceNode
        ? getMetadata(sourceNode.type || "")
        : undefined;
      const sourceHandle =
        sourceNode && sourceMetadata
          ? findOutputHandle(
              sourceNode,
              incoming?.sourceHandle || "",
              sourceMetadata
            )
          : undefined;
      next[name] = sourceHandle?.type ?? ANY_TYPE;
    }

    const nextSlots: Record<string, DynamicSlotDeclaration> = {};
    for (const [name, type] of Object.entries(next)) {
      nextSlots[name] = { type };
    }

    if (isEqual(dynamicInputs, nextSlots) && isEqual(dynamicOutputs, next)) {
      return;
    }
    updateNodeData(nodeId, {
      dynamic_inputs: nextSlots,
      dynamic_outputs: next
    });
  }, [
    nodeId,
    variableNames,
    dynamicInputs,
    dynamicOutputs,
    edges,
    findNode,
    getMetadata,
    updateNodeData
  ]);
};

export default useVariablePassthroughOutputs;
