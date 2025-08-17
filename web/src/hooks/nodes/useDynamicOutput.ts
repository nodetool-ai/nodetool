import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { TypeMetadata } from "../../stores/ApiTypes";

export const useDynamicOutput = (
  nodeId: string,
  dynamicOutputs: Record<string, TypeMetadata> = {}
) => {
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
  }));

  const handleDeleteOutput = useCallback(
    (outputName: string) => {
      const updated = { ...dynamicOutputs };
      delete updated[outputName];
      updateNodeData(nodeId, { dynamic_outputs: updated });
    },
    [dynamicOutputs, nodeId, updateNodeData]
  );

  const handleAddOutput = useCallback(
    (outputName: string, typeMetadata: TypeMetadata) => {
      const updated = { ...dynamicOutputs };
      updated[outputName] = typeMetadata;
      updateNodeData(nodeId, { dynamic_outputs: updated });
    },
    [dynamicOutputs, nodeId, updateNodeData]
  );

  const handleRenameOutput = useCallback(
    (oldName: string, newName: string) => {
      const updated = { ...dynamicOutputs };
      updated[newName] = updated[oldName];
      delete updated[oldName];
      updateNodeData(nodeId, { dynamic_outputs: updated });
    },
    [dynamicOutputs, nodeId, updateNodeData]
  );

  return {
    handleDeleteOutput,
    handleAddOutput,
    handleRenameOutput
  };
};

export default useDynamicOutput;
