import { useCallback, useMemo } from "react";
import useNodePresetsStore, {
  NodePreset,
  NodePresetProperty
} from "../stores/NodePresetsStore";
import useMetadataStore from "../stores/MetadataStore";

interface UseNodePresetsOptions {
  nodeType: string;
  _nodeId: string;
  currentProperties: Record<string, unknown>;
}

interface UseNodePresetsReturn {
  presets: NodePreset[];
  savePreset: (name: string, description?: string) => string;
  applyPreset: (presetId: string) => NodePresetProperty[] | null;
  deletePreset: (presetId: string) => void;
  duplicatePreset: (presetId: string, newName: string) => string;
  getPresetById: (presetId: string) => NodePreset | undefined;
  exportPresets: () => NodePreset[];
  importPresets: (presets: NodePreset[]) => void;
  clearAllPresets: () => void;
  hasPresets: boolean;
}

export function useNodePresets({
  nodeType,
  _nodeId,
  currentProperties
}: UseNodePresetsOptions): UseNodePresetsReturn {
  const metadata = useMetadataStore((state) => state.getMetadata(nodeType));

  const presets = useNodePresetsStore((state) =>
    state.getPresetsForNodeType(nodeType)
  );

  const addPreset = useNodePresetsStore((state) => state.addPreset);
  const applyPresetStore = useNodePresetsStore((state) => state.applyPreset);
  const deletePresetStore = useNodePresetsStore((state) => state.deletePreset);
  const duplicatePresetStore = useNodePresetsStore((state) => state.duplicatePreset);
  const getPresetByIdStore = useNodePresetsStore((state) => state.getPresetById);
  const exportPresetsStore = useNodePresetsStore((state) => state.exportPresets);
  const importPresetsStore = useNodePresetsStore((state) => state.importPresets);
  const clearAllPresetsStore = useNodePresetsStore((state) => state.clearAllPresets);

  const savePreset = useCallback(
    (name: string, description?: string): string => {
      const propertyDefinitions = metadata?.properties || [];
      const presetProperties: NodePresetProperty[] = [];

      for (const propDef of propertyDefinitions) {
        const value = currentProperties[propDef.name];
        if (value !== undefined) {
          presetProperties.push({
            name: propDef.name,
            value: JSON.parse(JSON.stringify(value))
          });
        }
      }

      return addPreset({
        name,
        nodeType,
        properties: presetProperties,
        description
      });
    },
    [nodeType, metadata, currentProperties, addPreset]
  );

  const applyPreset = useCallback(
    (presetId: string): NodePresetProperty[] | null => {
      const preset = applyPresetStore(nodeType, presetId);
      return preset ? preset.properties : null;
    },
    [nodeType, applyPresetStore]
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      deletePresetStore(presetId);
    },
    [deletePresetStore]
  );

  const duplicatePreset = useCallback(
    (presetId: string, newName: string) => {
      return duplicatePresetStore(presetId, newName);
    },
    [duplicatePresetStore]
  );

  const hasPresets = useMemo(() => presets.length > 0, [presets.length]);

  return {
    presets,
    savePreset,
    applyPreset,
    deletePreset,
    duplicatePreset,
    getPresetById: getPresetByIdStore,
    exportPresets: exportPresetsStore,
    importPresets: importPresetsStore,
    clearAllPresets: clearAllPresetsStore,
    hasPresets
  };
}

export default useNodePresets;
