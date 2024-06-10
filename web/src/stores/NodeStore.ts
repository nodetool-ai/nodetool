import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { create, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { NodeMetadata, OutputSlot, Property, Workflow } from "./ApiTypes";
import { NodeData } from "./NodeData";
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  XYPosition,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  updateEdge,
  Position
} from "reactflow";
import { customEquality } from "./customEquality";

import { Node as GraphNode, Edge as GraphEdge } from "./ApiTypes";
import { useWorkflowStore } from "./WorkflowStore";
import { useNotificationStore } from "./NotificationStore";
import { uuidv4 } from "./uuidv4";
import { devError, devLog } from "../utils/DevLog";
import { autoLayout, subgraph } from "../core/graph";
import { Slugify, isConnectable } from "../utils/TypeHandler";
import { WorkflowAttributes } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";

type NodeUIProperties = {
  selected: boolean | undefined;
  selectable: boolean | undefined;
  position: XYPosition;
  width: number | undefined;
  height: number | undefined;
  zIndex: number | undefined;
};

type NodeSelection = {
  nodes: Node<NodeData>[];
  edges: Edge[];
};

export function graphNodeToReactFlowNode(
  workflow: Workflow,
  node: GraphNode
): Node<NodeData> {
  const ui_properties = node.ui_properties as NodeUIProperties;
  return {
    type: node.type,
    id: node.id,
    parentId: node.parent_id || undefined,
    dragHandle: ".node-header",
    selectable: ui_properties?.selectable,
    data: {
      properties: node.data || {},
      selectable: ui_properties?.selectable,
      dirty: true,
      collapsed: false,
      workflow_id: workflow.id
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    style: {
      width: ui_properties?.width,
      height: ui_properties?.height
    },
    zIndex: node.type == "nodetool.group.Loop" ? -10 : ui_properties?.zIndex
  };
}

export function reactFlowNodeToGraphNode(node: Node<NodeData>): GraphNode {
  const ui_properties: NodeUIProperties = {
    selected: node.selected,
    position: node.position,
    zIndex: node.zIndex || 0,
    width: undefined,
    height: undefined,
    selectable: true
  };

  if (
    node.type === "nodetool.group.Loop" ||
    node.type === "nodetool.workflows.base_node.Comment" ||
    node.type === "nodetool.workflows.base_node.Preview"
  ) {
    ui_properties.width = node.width || 200;
    ui_properties.height = node.height || 200;
  }

  if (node.type === "nodetool.group.Loop") {
    ui_properties.selectable = false;
  }

  return {
    id: node.id,
    type: node.type,
    data: node.data?.properties,
    parent_id: node.parentId,
    ui_properties: ui_properties
  };
}

export function reactFlowEdgeToGraphEdge(edge: Edge): GraphEdge {
  const ui_properties = edge.className
    ? { className: edge.className }
    : undefined;
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle || "",
    target: edge.target,
    targetHandle: edge.targetHandle || "",
    ui_properties: ui_properties
  };
}

const undo_limit = 1000;
export interface NodeStore {
  explicitSave: boolean;
  shouldAutoLayout: boolean;
  setExplicitSave: (value: boolean) => void;
  setShouldAutoLayout: (value: boolean) => void;
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
  hoveredNodes: string[];
  setHoveredNodes: (ids: string[]) => void;
  edges: Edge[];
  edgeUpdateSuccessful: boolean;
  generateNodeId: () => string;
  generateEdgeId: () => string;
  invalidateResults: (nodeId: string) => void;
  getInputEdges: (nodeId: string) => Edge[];
  getOutputEdges: (nodeId: string) => Edge[];
  getSelection: () => NodeSelection;
  setEdgeUpdateSuccessful: (value: boolean) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onEdgeUpdate: (oldEdge: Edge, newConnection: Connection) => void;
  onConnect: OnConnect;
  connectionAttempted: boolean;
  setConnectionAttempted: (value: boolean) => void;
  addNode: (node: Node<NodeData>) => void;
  findNode: (id: string) => Node<NodeData> | undefined;
  updateNode: (id: string, node: Partial<Node<NodeData>>) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeProperties: (id: string, properties: any) => void;
  deleteNode: (id: string) => void;
  findEdge: (id: string) => Edge | undefined;
  deleteEdge: (id: string) => void;
  addEdge: (edge: Edge) => void;
  updateEdge: (edge: Edge) => void;
  setNodes: (nodes: Node<NodeData>[], setDirty?: boolean) => void;
  setEdges: (edges: Edge[]) => void;
  setWorkflow: (workflow: Workflow) => void;
  setWorkflowAttributes: (attributes: WorkflowAttributes) => void;
  getWorkflow: () => Workflow;
  newWorkflow: () => string;
  saveWorkflow: () => Promise<Workflow>;
  syncWorkflow: () => void;
  updateFromWorkflowStore: () => Promise<void>;
  validateConnection: (
    connection: Connection,
    srcMetadata: NodeMetadata,
    targetMetadata: NodeMetadata
  ) => boolean;
  exportWorkflow: () => Record<string, any>;
  workflowJSON: () => string;
  loadJSON: (json: string) => void;
  createNode: (metadata: NodeMetadata, position: XYPosition) => Node<NodeData>;
  autoLayout: () => void;
  workflowIsDirty: boolean;
}

export const useTemporalStore = <T>(
  selector: (state: TemporalState<NodeStore>) => T,
  equality?: (a: T, b: T) => boolean
) => useStore(useNodeStore.temporal, selector, equality);

export const useNodeStore = create<NodeStore>()(
  temporal(
    persist(
      (set, get) => ({
        explicitSave: false as boolean,
        shouldAutoLayout: false as boolean,
        workflow: {
          id: "",
          name: "",
          access: "private",
          description: "",
          thumbnail: "",
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        workflowIsDirty: false,
        nodes: [] as Node<NodeData>[],
        edges: [] as Edge[],
        edgeUpdateSuccessful: false as boolean,
        hoveredNodes: [],

        /**
         * Set the hovered nodes.
         */
        setHoveredNodes: (ids: string[]) => {
          set({ hoveredNodes: ids });
        },

        /**
         * Generate a new node ID, which is only unique within the current workflow.
         * If the highest number is N, the new ID will be N + 1.
         */
        generateNodeId: () => {
          const highestId = get().nodes.reduce((acc, node) => {
            const id = parseInt(node.id, 10);
            return id > acc ? id : acc;
          }, 0);
          return (highestId + 1).toString();
        },

        /**
         * Generate a new edge ID, which is only unique within the current workflow.
         * If the highest number is N, the new ID will be N + 1.
         */
        generateEdgeId: () => {
          const highestId = get().edges.reduce((acc, edge) => {
            const id = parseInt(edge.id, 10);
            return id > acc ? id : acc;
          }, 0);
          return (highestId + 1).toString();
        },

        /**
         * Set the auto layout flag.
         */
        setShouldAutoLayout: (value: boolean) => {
          set({ shouldAutoLayout: value });
        },

        /**
         * Automatically layout the workflow or selected nodes if any.
         */
        autoLayout: () => {
          const allNodes = get().nodes;
          let selectedNodes = allNodes.filter((node) => node.selected);
          const edges = get().edges;
          if (selectedNodes.length === 0) {
            selectedNodes = allNodes;
          }
          const layoutedNodes = autoLayout(edges, selectedNodes);
          const updatedNodes = allNodes.map((node) => {
            const layoutedNode = layoutedNodes.find((n) => n.id === node.id);
            return layoutedNode ? layoutedNode : node;
          });

          set({ nodes: updatedNodes });
        },

        /**
         * Create a new node. The nodes is not added to the workflow.
         *
         * @param metadata The metadata of the node to create.
         * @param position The position of the node.
         * @returns The new node.
         */
        createNode: (
          metadata: NodeMetadata,
          position: XYPosition
        ): Node<NodeData> => {
          const properties = metadata.properties.reduce<Record<string, any>>(
            (acc, property) => ({
              ...acc,
              [property.name]: property.default
            }),
            {}
          );
          return {
            id: get().generateNodeId(),
            type: metadata.node_type,
            data: {
              properties: properties,
              collapsed: false,
              dirty: true,
              selectable: true,
              workflow_id: get().workflow.id
            },
            targetPosition: Position.Left,
            position: position
          };
        },
        /**
         * Delete a node by id.
         *
         * @param id The id of the node to delete.
         */
        deleteNode: (id: string) => {
          const nodes: Node<NodeData>[] = get()
            .nodes.filter((node) => node.id !== id)
            .map((node) => {
              return {
                ...node,
                parentId: node.parentId === id ? undefined : node.parentId
              };
            });

          set({
            nodes: nodes,
            edges: get().edges.filter((edge) => edge.source !== id)
          });
        },
        /**
         * Get the workflow as a JSON string.
         */
        workflowJSON: () => {
          const workflow = get().getWorkflow();
          workflow.id = "";
          return JSON.stringify(workflow, null, 2);
        },

        /**
         * Load a workflow from a JSON string.
         */
        loadJSON: (json: string) => {
          const workflow = JSON.parse(json) as Workflow;
          get().setWorkflow(workflow);
        },

        /**
         * Set the explicit save flag.
         */
        setExplicitSave: (value: boolean) => {
          set({ explicitSave: value });
        },

        exportWorkflow: () => {
          const json: Record<string, any> = {};
          const nodes = get().nodes;
          const edges = get().edges;

          for (const node of nodes) {
            json[node.id] = {
              type: node.type,
              inputs: node.data.properties,
              parent_id: node.parentId,
              position: node.position,
              width: node.style?.width,
              height: node.style?.height
            };
          }

          const findNode = (id: string) => {
            const node = nodes.find((node) => node.id === id);
            if (!node) {
              throw new Error(`Could not find node with id ${id}`);
            }
            return node;
          };

          for (const edge of edges) {
            const sourceNode = findNode(edge.source);
            json[edge.target].inputs[edge.targetHandle || ""] = [
              edge.source,
              edge.sourceHandle || ""
            ];
          }

          return json;
        },

        /**
         * Set the current workflow.
         */
        setWorkflow: (workflow: Workflow) => {
          const generateEdgeId = get().generateEdgeId;
          const shouldAutoLayout = get().shouldAutoLayout;
          const graphEdgeToReactFlowEdge = (edge: GraphEdge): Edge => {
            return {
              id: edge.id || generateEdgeId(),
              source: edge.source,
              sourceHandle: edge.sourceHandle,
              target: edge.target,
              targetHandle: edge.targetHandle,
              className: edge.ui_properties?.className
            };
          };

          set({
            workflow: workflow,
            shouldAutoLayout: false,
            edges: (workflow.graph?.edges || []).map(graphEdgeToReactFlowEdge),
            nodes: (workflow.graph?.nodes || []).map((n: GraphNode) =>
              graphNodeToReactFlowNode(workflow, n)
            )
          });

          if (shouldAutoLayout) {
            setTimeout(() => {
              get().autoLayout();
            }, 100);
          }
        },

        /**
         * Set workflow attributes.
         */
        setWorkflowAttributes: (attributes: WorkflowAttributes) => {
          set({ workflow: { ...get().workflow, ...attributes } });
        },

        /**
         * Create a new workflow.
         */
        newWorkflow: () => {
          const newWorkflow = useWorkflowStore.getState().newWorkflow();
          get().setWorkflow(newWorkflow);
          get().syncWorkflow();
          get().saveWorkflow();
          set({ workflowIsDirty: false });
          return newWorkflow.id;
        },

        /**
         * Sync with workflow store.
         */
        syncWorkflow: () => {
          useWorkflowStore.getState().add(get().getWorkflow());
        },

        /**
         * Update from workflow store.
         */
        updateFromWorkflowStore: async () => {
          devLog("update from workflow store");
          const workflow = await useWorkflowStore
            .getState()
            .get(get().workflow.id);
          if (workflow) {
            get().setWorkflow(workflow);
          }
        },

        /**
         * Save the current workflow.
         *
         * TODO: This should only save when dirty, requires dirty flag.
         */
        saveWorkflow: async () => {
          const updateWorkflow = useWorkflowStore.getState().update;
          const workflow = get().getWorkflow();
          set({ workflowIsDirty: false });
          return updateWorkflow(workflow);
        },

        /**
         * Get the current workflow.
         */
        getWorkflow: (): Workflow => {
          const workflow = get().workflow;
          const edges = get().edges;
          const nodes = get().nodes;
          return {
            ...workflow,
            graph: {
              edges: edges.map(reactFlowEdgeToGraphEdge),
              nodes: nodes.map(reactFlowNodeToGraphNode)
            }
          };
        },

        /**
         * Deletes an edge from the workflow.
         *
         * @param id The id of the edge to remove.
         */
        deleteEdge: (id: string) => {
          set({ edges: get().edges.filter((e) => e.id !== id) });
        },

        /**
         * Set the edge update successful flag.
         *
         * @param value The value of the flag.
         */
        setEdgeUpdateSuccessful: (value: boolean) => {
          set({ edgeUpdateSuccessful: value });
        },

        /**
         * Add a node to the workflow.
         *
         * @param node The node to add.
         */
        addNode: (node: Node) => {
          if (get().findNode(node.id)) {
            throw Error("node already exists");
          }
          node.data.dirty = true;
          node.data.workflow_id = get().workflow.id;

          set({ nodes: [...get().nodes, node] });
          useNotificationStore.getState().addNotification({
            type: "node",
            content: "NODE: " + node.type?.replaceAll("_", " "),
            alert: true,
            dismissable: false
          });
        },

        /**
         * Find a node by id.
         *
         * @param id The id of the node to find.
         * @returns The node with the given id.
         */
        findNode: (id: string) => {
          return get().nodes.find((n) => n.id === id);
        },

        /**
         * Find an edge by id.
         *
         * @param id The id of the edge to find.
         * @returns The edge with the given id.
         */
        findEdge: (id: string) => {
          return get().edges.find((e) => e.id === id);
        },

        /**
         * Update the data of an edge.
         *
         * @param edge The edge to update.
         */
        updateEdge: (edge: Edge) => {
          set({
            edges: [...get().edges.filter((e) => e.id !== edge.id), edge]
          });
        },

        /**
         * Add an edge to the workflow.
         */
        addEdge: (edge: Edge) => {
          if (get().findEdge(edge.id)) {
            throw Error("edge already exists");
          }
          set({ edges: [...get().edges, edge] });
        },

        /**
         * Update a node in the workflow.
         *
         * @param id The id of the node to update.
         * @param node The updated node.
         */
        updateNode: (id: string, node: Partial<Node<NodeData>>) => {
          get().invalidateResults(id);
          set({
            nodes: get().nodes.map(
              (n) => (n.id === id ? { ...n, ...node } : n) as Node
            )
          });
        },

        /**
         * Update the data of a node.
         *
         * @param id The id of the node to update.
         * @param data The new data of the node.
         */
        updateNodeData: (id: string, data: Partial<NodeData>) => {
          const workflow_id = get().workflow.id;
          set({
            nodes: get().nodes.map(
              (node) =>
                (node.id === id
                  ? { ...node, data: { ...node.data, ...data, workflow_id } }
                  : node) as Node
            )
          });
        },

        /**
         * Update the data of a node.
         *
         * @param id The id of the node to update.
         * @param properties The new properties of the node.
         */
        updateNodeProperties: (id: string, properties: any) => {
          const workflow_id = get().workflow.id;
          set({
            nodes: get().nodes.map(
              (node) =>
                (node.id === id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        workflow_id,
                        properties: { ...node.data.properties, ...properties }
                      }
                    }
                  : node) as Node
            ),
            workflowIsDirty: true
          });
        },

        /**
         * Invalidate the results of a node and all nodes that depend on it.
         *
         * @param nodeId The id of the node to invalidate.
         */
        invalidateResults: (nodeId: string) => {
          const node = get().findNode(nodeId);
          if (!node) {
            return devError("node not found", nodeId);
          }
          if (!node.data.dirty) {
            devLog("invalidate results", nodeId);
            node.data.dirty = true;
            const { nodes, edges } = subgraph(get().edges, get().nodes, node);

            for (const n of nodes) {
              n.data.dirty = true;
            }

            // clear all properties that have an input edge
            for (const e of edges) {
              const targetNode = get().findNode(e.target);
              if (targetNode && e.targetHandle) {
                delete targetNode.data.properties[e.targetHandle];
              }
            }

            // Replace the nodes in the workflow with the updated nodes.
            set({
              nodes: get().nodes.map((n) => {
                const node = nodes.find((node) => node.id === n.id);
                if (node) {
                  return node;
                } else {
                  return n;
                }
              })
            });
          }
        },

        /**
         * Get the input edges of a node.
         *
         * @param nodeId The id of the node to get the input edges of.
         * @returns The input edges of the node.
         */
        getInputEdges: (nodeId: string) => {
          return get().edges.filter((e) => e.target === nodeId);
        },

        /**
         * Get the output edges of a node.
         *
         * @param nodeId The id of the node to get the output edges of.
         * @returns The output edges of the node.
         */
        getOutputEdges: (nodeId: string) => {
          return get().edges.filter((e) => e.source === nodeId);
        },

        /**
         * Get the selection of nodes and edges.
         *
         * @returns The selection of nodes and edges.
         */
        getSelection: (): NodeSelection => {
          const nodes = get().nodes.filter((node) => node.selected);
          const nodeIds = nodes.reduce((acc, node) => {
            acc[node.id] = true;
            return acc;
          }, {} as Record<string, boolean>);
          const edges = get().edges.filter(
            (edge) => edge.source in nodeIds && edge.target in nodeIds
          );
          return {
            nodes: nodes,
            edges: edges
          };
        },

        /**
         * Set the nodes of the workflow.
         *
         * @param nodes The nodes of the workflow.
         */
        setNodes: (nodes: Node[], setDirty: boolean = true) => {
          if (setDirty) {
            nodes.forEach((node) => {
              node.data.dirty = true;
              node.data.workflow_id = get().workflow.id;
            });
          }
          set({ workflowIsDirty: true });
          set({ nodes });
        },

        /**
         * Set the edges of the workflow.
         *
         * @param edges The edges of the workflow.
         */
        setEdges: (edges: Edge[]) => {
          set({ workflowIsDirty: true });
          set({ edges });
        },

        /**
         * Handle changes to the nodes.
         *
         * @param changes The changes to the nodes.
         */
        onNodesChange: (changes: NodeChange[]) => {
          const nodes = applyNodeChanges(changes, get().nodes);
          set({ nodes });
          set({ workflowIsDirty: true });
        },

        /**
         * Handle changes to the edges.
         *
         * @param changes The changes to the edges.
         */
        onEdgesChange: (changes: EdgeChange[]) => {
          set({
            edges: applyEdgeChanges(changes, get().edges)
          });
        },

        /**
         * Handle an update to an edge.
         * This is used to update the edge when an existing edge is changed
         *
         * @param oldEdge The old edge.
         * @param connection The new connection.
         * @returns The updated edges.
         */
        onEdgeUpdate: (oldEdge: Edge, connection: Connection) => {
          const edges = get().edges;
          const findNode = get().findNode;
          const getMetadata = useMetadataStore.getState().getMetadata;
          if (!connection.source || !connection.target) {
            return false;
          }
          const srcNode = findNode(connection.source);
          const targetNode = findNode(connection.target);
          if (!srcNode?.type || !targetNode?.type) {
            return false;
          }
          const srcMetadata = getMetadata(srcNode.type);
          const targetMetadata = getMetadata(targetNode.type);
          if (
            oldEdge &&
            srcMetadata &&
            targetMetadata &&
            get().validateConnection(connection, srcMetadata, targetMetadata)
          ) {
            set({ edgeUpdateSuccessful: true });
            const filteredEdges = edges.filter(
              (edge) =>
                !(
                  edge.target === connection.target &&
                  edge.targetHandle === connection.targetHandle
                ) || // keep all edges where target is different (no conflict)
                (edge.source === connection.source &&
                  edge.sourceHandle === connection.sourceHandle) || // keep the new connection (new connections should always win over existing)
                (oldEdge.target === connection.target &&
                  oldEdge.targetHandle === connection.targetHandle) // keep all edges if just changing the source
            );
            get().setEdges(updateEdge(oldEdge, connection, filteredEdges));
          } else {
            set({ edgeUpdateSuccessful: false });
          }
        },

        validateConnection: (
          connection: Connection,
          srcMetadata: NodeMetadata,
          targetMetadata: NodeMetadata
        ) => {
          if (!srcMetadata || !targetMetadata) {
            return false;
          }
          const edges = get().edges;
          const existingConnection = edges.find(
            (edge) =>
              edge.source === connection.source &&
              edge.sourceHandle === connection.sourceHandle &&
              edge.target === connection.target &&
              edge.targetHandle === connection.targetHandle
          );
          // Return false if the exact connection already exists.
          if (existingConnection) {
            return false;
          }
          const srcHandle = connection.sourceHandle;
          const srcOutput = srcMetadata?.outputs.find(
            (output: OutputSlot) => output.name === srcHandle
          );
          const srcType = srcOutput?.type;
          const targetHandle = connection.targetHandle;
          const targetProperty = targetMetadata?.properties.find(
            (property: Property) => property.name === targetHandle
          );
          const targetType = targetProperty?.type;
          return (
            srcType !== undefined &&
            targetType !== undefined &&
            isConnectable(srcType, targetType)
          );
        },
        /* Keep track of whether a connection was successful or not, used to open NodeMenu */
        connectionAttempted: false,
        setConnectionAttempted: (value: boolean) => {
          set({ connectionAttempted: value });
        },
        /**
         * Handle a connection between two nodes.
         *
         * @param connection The connection between two nodes.
         */
        onConnect: (connection: Connection) => {
          get().setConnectionAttempted(true);

          const findNode = get().findNode;
          const edges = get().edges;
          const invalidateResults = get().invalidateResults;
          const setEdges = get().setEdges;
          const getMetadata = useMetadataStore.getState().getMetadata;
          if (!connection.source || !connection.target) {
            return false;
          }
          const srcNode = findNode(connection.source);
          const targetNode = findNode(connection.target);
          if (!srcNode?.type || !targetNode?.type) {
            return false;
          }
          const srcMetadata = getMetadata(srcNode.type);
          const targetMetadata = getMetadata(targetNode.type);
          const srcHandle = connection.sourceHandle;
          const srcOutput = srcMetadata?.outputs.find(
            (output: OutputSlot) => output.name === srcHandle
          );
          const srcType = srcOutput?.type.type;

          if (
            srcMetadata &&
            targetMetadata &&
            get().validateConnection(connection, srcMetadata, targetMetadata)
          ) {
            // if target handle was connected, remove existing edge
            const filteredEdges = edges.filter(
              (edge) =>
                !(
                  edge.target === connection.target &&
                  edge.targetHandle === connection.targetHandle
                )
            );

            const newConnection = {
              ...connection,
              id: uuidv4(),
              className: Slugify(srcType || "")
            };
            setEdges(addEdge(newConnection, filteredEdges));
            invalidateResults(connection.target as string);
          }
        }
      }),
      {
        name: "node-store",
        getStorage: () => localStorage
      }
    ),
    {
      limit: undo_limit,
      equality: customEquality
    }
  )
);
