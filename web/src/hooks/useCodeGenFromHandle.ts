/**
 * The two handle-launched AI authoring entry points.
 *
 * Both create an ordinary Code node, seed one typed slot from the handle the
 * user came from, wire it up, and open the generation dialog against it. The
 * edge is only created once `validateConnection` accepts it — the same check
 * dragging a connection goes through — and if it doesn't, nothing is added to
 * the graph at all.
 *
 * Everything the flow creates is recorded in the dialog request's discard
 * plan, so cancelling puts the graph back exactly as it was.
 */
import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { shallow } from "zustand/shallow";

import { CODE_NODE_TYPE } from "../constants/nodeTypes";
import { useNodes } from "../contexts/NodeContext";
import type { TypeMetadata } from "../stores/ApiTypes";
import useCodeGenDialogStore from "../stores/CodeGenDialogStore";
import useMetadataStore from "../stores/MetadataStore";
import {
  seedInputPortName,
  seedOutputPortName,
  toCodeGenType
} from "../utils/codeGenEntryPoints";
import { defaultValueForType, normalizeTypeMetadata } from "../utils/dynamicSlots";
import { isCollectType, Slugify } from "../utils/TypeHandler";

interface TransformOutputArgs {
  /** The node whose output the new Code node will read. */
  sourceNodeId: string;
  sourceHandle: string;
  sourceType: TypeMetadata;
  /** Where the new node goes, in flow space. */
  position: XYPosition;
}

interface CreateValueArgs {
  /** The node whose input the new Code node will feed. */
  targetNodeId: string;
  targetHandle: string;
  targetType: TypeMetadata;
  /** Where the new node goes, in flow space. */
  position: XYPosition;
}

interface CodeGenFromHandle {
  /** "Transform this output…" — seeds an input slot from a source handle. */
  transformOutput: (args: TransformOutputArgs) => boolean;
  /** "Create value with AI…" — seeds the expected output from a destination handle. */
  createValue: (args: CreateValueArgs) => boolean;
}

export const useCodeGenFromHandle = (): CodeGenFromHandle => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const openCodeGenDialog = useCodeGenDialogStore(
    (state) => state.openCodeGenDialog
  );
  const {
    createNode,
    addNode,
    addEdge,
    deleteEdges,
    generateEdgeId,
    findNode,
    validateConnection,
    edges
  } = useNodes(
    (state) => ({
      createNode: state.createNode,
      addNode: state.addNode,
      addEdge: state.addEdge,
      deleteEdges: state.deleteEdges,
      generateEdgeId: state.generateEdgeId,
      findNode: state.findNode,
      validateConnection: state.validateConnection,
      edges: state.edges
    }),
    shallow
  );

  const transformOutput = useCallback(
    ({
      sourceNodeId,
      sourceHandle,
      sourceType,
      position
    }: TransformOutputArgs): boolean => {
      const codeMetadata = getMetadata(CODE_NODE_TYPE);
      const sourceNode = findNode(sourceNodeId);
      if (!codeMetadata || !sourceNode) {
        return false;
      }

      const newNode = createNode(codeMetadata, position);
      const slotName = seedInputPortName(sourceHandle, codeMetadata, newNode);
      const slotType = normalizeTypeMetadata(sourceType);
      newNode.data.dynamic_inputs = { [slotName]: { type: slotType } };
      newNode.data.dynamic_properties = {
        ...newNode.data.dynamic_properties,
        [slotName]: defaultValueForType(slotType)
      };

      const connection = {
        source: sourceNodeId,
        sourceHandle,
        target: newNode.id,
        targetHandle: slotName
      };
      if (!validateConnection(connection, sourceNode, newNode)) {
        return false;
      }

      addNode(newNode);
      const edgeId = generateEdgeId();
      addEdge({
        id: edgeId,
        ...connection,
        type: "default",
        className: Slugify(slotType.type)
      });

      openCodeGenDialog({
        nodeId: newNode.id,
        inputs: [{ name: slotName, type: toCodeGenType(slotType) }],
        discard: {
          nodeIds: [newNode.id],
          edgeIds: [edgeId],
          restoreEdges: []
        }
      });
      return true;
    },
    [
      addEdge,
      addNode,
      createNode,
      findNode,
      generateEdgeId,
      getMetadata,
      openCodeGenDialog,
      validateConnection
    ]
  );

  const createValue = useCallback(
    ({
      targetNodeId,
      targetHandle,
      targetType,
      position
    }: CreateValueArgs): boolean => {
      const codeMetadata = getMetadata(CODE_NODE_TYPE);
      const targetNode = findNode(targetNodeId);
      if (!codeMetadata || !targetNode) {
        return false;
      }

      const newNode = createNode(codeMetadata, position);
      const outputName = seedOutputPortName(
        targetHandle,
        codeMetadata,
        newNode
      );
      const outputType = normalizeTypeMetadata(targetType);
      newNode.data.dynamic_outputs = { [outputName]: outputType };

      const connection = {
        source: newNode.id,
        sourceHandle: outputName,
        target: targetNodeId,
        targetHandle
      };
      if (!validateConnection(connection, newNode, targetNode)) {
        return false;
      }

      // A collect handle takes many sources; every other input handle takes
      // one, so whatever feeds it now steps aside — and comes back on cancel.
      const replaced = isCollectType(targetType)
        ? []
        : edges.filter(
            (edge) =>
              edge.target === targetNodeId && edge.targetHandle === targetHandle
          );
      if (replaced.length > 0) {
        deleteEdges(replaced.map((edge) => edge.id));
      }

      addNode(newNode);
      const edgeId = generateEdgeId();
      addEdge({
        id: edgeId,
        ...connection,
        type: "default",
        className: Slugify(outputType.type)
      });

      openCodeGenDialog({
        nodeId: newNode.id,
        expectedOutput: {
          name: outputName,
          type: toCodeGenType(outputType)
        },
        discard: {
          nodeIds: [newNode.id],
          edgeIds: [edgeId],
          restoreEdges: replaced
        }
      });
      return true;
    },
    [
      addEdge,
      addNode,
      createNode,
      deleteEdges,
      edges,
      findNode,
      generateEdgeId,
      getMetadata,
      openCodeGenDialog,
      validateConnection
    ]
  );

  return { transformOutput, createValue };
};

export default useCodeGenFromHandle;
