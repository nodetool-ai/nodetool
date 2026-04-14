import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";

export const useDynamicProperty = (
  nodeId: string,
  dynamicProperties: Record<string, any>
) => {
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData
  }), shallow);

  const handleDeleteProperty = useCallback(
    (propertyName: string) => {
      const updatedDynamicProperties = { ...dynamicProperties };
      delete updatedDynamicProperties[propertyName];

      updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId, updateNodeData]
  );

  const handleAddProperty = useCallback(
    (propertyName: string) => {
      const updatedDynamicProperties = {
        ...dynamicProperties,
        [propertyName]: ""
      };

      updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId, updateNodeData]
  );

  const handleUpdatePropertyName = useCallback(
    (oldPropertyName: string, newPropertyName: string) => {
      const updatedDynamicProperties = { ...dynamicProperties };
      updatedDynamicProperties[newPropertyName] =
        dynamicProperties[oldPropertyName];
      delete updatedDynamicProperties[oldPropertyName];

      updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId, updateNodeData]
  );

  return {
    handleDeleteProperty,
    handleAddProperty,
    handleUpdatePropertyName
  };
};
