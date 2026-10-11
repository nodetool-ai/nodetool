import { useCallback } from "react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import type { TypeMetadata } from "../../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../../stores/NodeData";
import {
  defaultValueForType,
  normalizeDynamicSlots,
  valueFitsType
} from "../../utils/dynamicSlots";
import { runAsOneUndoEntry } from "../../utils/runAsOneUndoEntry";

interface UseDynamicPropertyResult {
  handleDeleteProperty: (propertyName: string) => void;
  /**
   * Create a slot. With a `type` the slot is declared in `dynamic_inputs` and
   * its value seeded from the type; without one it stays an untyped legacy
   * slot (`""` value, no declaration, `any` handle) exactly as before.
   */
  handleAddProperty: (propertyName: string, type?: TypeMetadata) => void;
  handleUpdatePropertyName: (oldName: string, newName: string) => void;
  handleUpdatePropertyType: (propertyName: string, type: TypeMetadata) => void;
}

/**
 * Create/rename/delete/retype the dynamic slots of a node.
 *
 * Every mutation writes the value map (`dynamic_properties`) and the
 * declaration map (`dynamic_inputs`) in a single `updateNodeData` call, so
 * undo/redo can never strand a type under a dead name. Delete also removes
 * the edges into the slot, and rename moves them onto the new handle, in the
 * same undo step. Rename onto a name the node already has is ignored.
 */
export const useDynamicProperty = (
  nodeId: string,
  dynamicProperties: Record<string, unknown>
): UseDynamicPropertyResult => {
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const updateEdgeHandle = useNodes((state) => state.updateEdgeHandle);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const findNode = useNodes((state) => state.findNode);
  const nodeStore = useNodeStoreRef();

  const currentSlots = useCallback(
    (): Record<string, DynamicSlotDeclaration> =>
      normalizeDynamicSlots(findNode(nodeId)?.data?.dynamic_inputs),
    [findNode, nodeId]
  );

  const handleDeleteProperty = useCallback(
    (propertyName: string) => {
      const updatedDynamicProperties = { ...dynamicProperties };
      delete updatedDynamicProperties[propertyName];

      const updatedSlots = currentSlots();
      delete updatedSlots[propertyName];

      // An edge left on the removed handle is saved with the workflow and
      // recreates the input on the next load.
      const connectedEdgeIds = nodeStore
        .getState()
        .edges.filter(
          (edge) => edge.target === nodeId && edge.targetHandle === propertyName
        )
        .map((edge) => edge.id);

      runAsOneUndoEntry(nodeStore, () => {
        updateNodeData(nodeId, {
          dynamic_properties: updatedDynamicProperties,
          dynamic_inputs: updatedSlots
        });
        deleteEdges(connectedEdgeIds);
      });
    },
    [
      currentSlots,
      deleteEdges,
      dynamicProperties,
      nodeId,
      nodeStore,
      updateNodeData
    ]
  );

  const handleAddProperty = useCallback(
    (propertyName: string, type?: TypeMetadata) => {
      const updatedDynamicProperties = {
        ...dynamicProperties,
        [propertyName]: type ? defaultValueForType(type) : ""
      };

      const updatedSlots = currentSlots();
      if (type) {
        updatedSlots[propertyName] = { type };
      }

      updateNodeData(nodeId, {
        dynamic_properties: updatedDynamicProperties,
        dynamic_inputs: updatedSlots
      });
    },
    [currentSlots, dynamicProperties, nodeId, updateNodeData]
  );

  const handleUpdatePropertyName = useCallback(
    (oldPropertyName: string, newPropertyName: string) => {
      if (
        oldPropertyName === newPropertyName ||
        Object.hasOwn(dynamicProperties, newPropertyName)
      ) {
        return;
      }
      const updatedDynamicProperties = { ...dynamicProperties };
      updatedDynamicProperties[newPropertyName] =
        dynamicProperties[oldPropertyName];
      delete updatedDynamicProperties[oldPropertyName];

      const updatedSlots = currentSlots();
      const declaration = updatedSlots[oldPropertyName];
      if (declaration) {
        updatedSlots[newPropertyName] = declaration;
        delete updatedSlots[oldPropertyName];
      }

      runAsOneUndoEntry(nodeStore, () => {
        updateNodeData(nodeId, {
          dynamic_properties: updatedDynamicProperties,
          dynamic_inputs: updatedSlots
        });
        updateEdgeHandle(nodeId, oldPropertyName, newPropertyName);
      });
    },
    [
      currentSlots,
      dynamicProperties,
      nodeId,
      nodeStore,
      updateEdgeHandle,
      updateNodeData
    ]
  );

  const handleUpdatePropertyType = useCallback(
    (propertyName: string, type: TypeMetadata) => {
      const updatedSlots = currentSlots();
      updatedSlots[propertyName] = {
        ...updatedSlots[propertyName],
        type
      };

      // Reseed the inline value when the old one can't be a value of the new
      // type (a `str` left in an `image` slot renders as a broken editor, an
      // image ref left in an `audio` slot makes the runner throw). The check
      // is the runner's own, so what the editor keeps is what the run accepts.
      const previous = dynamicProperties[propertyName];
      const keepValue = previous !== undefined && valueFitsType(previous, type);

      updateNodeData(nodeId, {
        dynamic_properties: {
          ...dynamicProperties,
          [propertyName]: keepValue ? previous : defaultValueForType(type)
        },
        dynamic_inputs: updatedSlots
      });
    },
    [currentSlots, dynamicProperties, nodeId, updateNodeData]
  );

  return {
    handleDeleteProperty,
    handleAddProperty,
    handleUpdatePropertyName,
    handleUpdatePropertyType
  };
};
