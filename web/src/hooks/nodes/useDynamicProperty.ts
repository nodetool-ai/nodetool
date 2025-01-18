import { useCallback } from "react";
import { useNodeStore } from "../../stores/NodeStore";

export const useDynamicProperty = (
  nodeId: string,
  dynamicProperties: Record<string, any>
) => {
  const { updateNodeData, updateEdgeHandle } = useNodeStore((state) => ({
    updateNodeData: state.updateNodeData,
    updateEdgeHandle: state.updateEdgeHandle
  }));

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

      //   updateEdgeHandle(nodeId, oldPropertyName, newPropertyName);

      updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties
      });
    },
    [dynamicProperties, nodeId, updateNodeData, updateEdgeHandle]
  );

  return {
    handleDeleteProperty,
    handleAddProperty,
    handleUpdatePropertyName
  };
};
