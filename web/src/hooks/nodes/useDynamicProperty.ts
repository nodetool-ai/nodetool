import { useCallback } from "react";
import { useNodeStore } from "../../stores/NodeStore";

export const useDynamicProperty = (
  nodeId: string,
  dynamicProperties: Record<string, any>
) => {
  const handleDeleteProperty = useCallback(
    (propertyName: string) => {
      const updatedDynamicProperties = { ...dynamicProperties };
      delete updatedDynamicProperties[propertyName];

      useNodeStore.getState().updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId]
  );

  const handleAddProperty = useCallback(
    (propertyName: string) => {
      const updatedDynamicProperties = {
        ...dynamicProperties,
        [propertyName]: ""
      };

      useNodeStore.getState().updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId]
  );

  const handleUpdatePropertyName = useCallback(
    (oldPropertyName: string, newPropertyName: string) => {
      const updatedDynamicProperties = { ...dynamicProperties };
      updatedDynamicProperties[newPropertyName] =
        dynamicProperties[oldPropertyName];
      delete updatedDynamicProperties[oldPropertyName];

      //   updateEdgeHandle(nodeId, oldPropertyName, newPropertyName);

      useNodeStore.getState().updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId]
  );

  return {
    handleDeleteProperty,
    handleAddProperty,
    handleUpdatePropertyName
  };
};
