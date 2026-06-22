import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";

export const useDynamicProperty = (
  nodeId: string,
  dynamicProperties: Record<string, unknown>
) => {
  const { updateNodeData, updateEdgeHandle } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
    updateEdgeHandle: state.updateEdgeHandle
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

      // Dynamic properties are rendered as input handles, so keep any
      // connected edges pointing at the renamed handle instead of dropping it.
      updateEdgeHandle(nodeId, oldPropertyName, newPropertyName);
    },
    [dynamicProperties, nodeId, updateNodeData, updateEdgeHandle]
  );

  return {
    handleDeleteProperty,
    handleAddProperty,
    handleUpdatePropertyName
  };
};
