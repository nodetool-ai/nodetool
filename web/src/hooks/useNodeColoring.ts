import { useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { useNodeColorPresetsStore } from "../stores/NodeColorPresetsStore";

interface NodeColoringReturn {
  applyColorToSelected: (color: string) => void;
  applyPresetToSelected: (presetId: string) => void;
  saveSelectedColorAsPreset: (name: string) => void;
  hasSelectedNodes: boolean;
  selectedNodesCount: number;
}

export const useNodeColoring = (): NodeColoringReturn => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const presets = useNodeColorPresetsStore((state) => state.presets);
  const addPreset = useNodeColorPresetsStore((state) => state.addPreset);

  const hasSelectedNodes = selectedNodes.length > 0;
  const selectedNodesCount = selectedNodes.length;

  const applyColorToSelected = useCallback(
    (color: string) => {
      if (selectedNodes.length === 0) {
        return;
      }

      selectedNodes.forEach((node) => {
        updateNodeData(node.id, {
          ...node.data,
          properties: {
            ...node.data.properties,
            node_color: color
          }
        });
      });
    },
    [selectedNodes, updateNodeData]
  );

  const applyPresetToSelected = useCallback(
    (presetId: string) => {
      if (selectedNodes.length === 0) {
        return;
      }

      const preset = presets.find((p) => p.id === presetId);
      if (!preset) {
        return;
      }

      applyColorToSelected(preset.color);
    },
    [selectedNodes, presets, applyColorToSelected]
  );

  const saveSelectedColorAsPreset = useCallback(
    (name: string) => {
      if (selectedNodes.length === 0) {
        return;
      }

      const firstNode = selectedNodes[0];
      const currentColor =
        firstNode.data.properties?.node_color || "#A7B1BF";

      addPreset(name, currentColor);
    },
    [selectedNodes, addPreset]
  );

  return {
    applyColorToSelected,
    applyPresetToSelected,
    saveSelectedColorAsPreset,
    hasSelectedNodes,
    selectedNodesCount
  };
};

export default useNodeColoring;
