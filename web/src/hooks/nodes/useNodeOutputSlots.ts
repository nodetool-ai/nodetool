import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useNodes } from "../../contexts/NodeContext";
import type { OutputSlot } from "../../stores/ApiTypes";
import { inferredCodeOutputNames } from "../../utils/codeNodeHandles";
import { ANY_TYPE } from "../../utils/dynamicSlots";
import { isString } from "../../utils/typePredicates";

/**
 * Every output handle a node renders: its static metadata outputs, then
 * `dynamic_outputs`, then names inferred from a code node's source. A dynamic
 * output supersedes a static one of the same name (a node that re-types its
 * `output` handle via `dynamic_outputs`), so no handle renders twice.
 */
export const useNodeOutputSlots = (
  id: string,
  outputs: OutputSlot[]
): OutputSlot[] => {
  const nodeSlice = useNodes(
    (state) => {
      const node = state.findNode(id);
      return {
        dynamicOutputs: node?.data?.dynamic_outputs,
        code: node?.data?.properties?.code,
        nodeType: node?.type
      };
    },
    shallow
  );

  return useMemo(() => {
    const dyn = Object.entries(nodeSlice.dynamicOutputs || {}).map(
      ([name, type]) => ({ name, type, stream: false }) as OutputSlot
    );
    const dynNames = new Set(dyn.map((d) => d.name));
    const inferred = inferredCodeOutputNames(
      isString(nodeSlice.code) ? nodeSlice.code : "",
      nodeSlice.nodeType
    )
      .filter((name) => !dynNames.has(name))
      .map(
        (name) =>
          ({ name, type: { ...ANY_TYPE }, stream: false }) as OutputSlot
      );
    return [
      ...outputs.filter((o) => !dynNames.has(o.name)),
      ...dyn,
      ...inferred
    ];
  }, [outputs, nodeSlice]);
};
