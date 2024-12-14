import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { create, useStore } from "zustand";
import {
  NodeMetadata,
  OutputSlot,
  Property,
  RepoPath,
  UnifiedModel,
  Workflow
} from "./ApiTypes";
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
  reconnectEdge,
  Position
} from "@xyflow/react";
import { customEquality } from "./customEquality";

import { Node as GraphNode, Edge as GraphEdge } from "./ApiTypes";
import { useWorkflowStore } from "./WorkflowStore";
import { useNotificationStore } from "./NotificationStore";
import { uuidv4 } from "./uuidv4";
import { devLog, devWarn } from "../utils/DevLog";
import { autoLayout } from "../core/graph";
import { Slugify, isConnectable } from "../utils/TypeHandler";
import { WorkflowAttributes } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";
import useErrorStore from "./ErrorStore";
import useResultsStore from "./ResultsStore";
import { tryCacheFiles } from "../serverState/tryCacheFiles";

type NodeUIProperties = {
  selected?: boolean;
  selectable?: boolean;
  position: XYPosition;
  width?: number;
  height?: number;
  zIndex?: number;
  title?: string;
  color?: string;
};

type NodeSelection = {
  nodes: Node<NodeData>[];
  edges: Edge[];
};

const DEFAULT_NODE_WIDTH = 200;

const graphEdgeToReactFlowEdge = (edge: GraphEdge): Edge => {
  return {
    id: edge.id || uuidv4(),
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    className: edge.ui_properties?.className
  };
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
    expandParent: !(
      node.type === "nodetool.group.Loop" ||
      node.type === "nodetool.workflows.base_node.Comment" ||
      node.type === "nodetool.workflows.base_node.Group"
    ),
    selectable: ui_properties?.selectable,
    data: {
      properties: node.data || {},
      selectable: ui_properties?.selectable,
      dirty: true,
      collapsed: false,
      workflow_id: workflow.id,
      title: ui_properties?.title,
      color: ui_properties?.color
    },
    position: ui_properties?.position || { x: 0, y: 0 },
    style: {
      width: ui_properties?.width || DEFAULT_NODE_WIDTH,
      height: ui_properties?.height
    },
    zIndex:
      node.type == "nodetool.group.Loop" ||
      node.type == "nodetool.workflows.base_node.Group"
        ? -10
        : ui_properties?.zIndex
  };
}

export function reactFlowNodeToGraphNode(node: Node<NodeData>): GraphNode {
  const ui_properties: NodeUIProperties = {
    selected: node.selected,
    position: node.position,
    zIndex: node.zIndex || 0,
    width: node.measured?.width || DEFAULT_NODE_WIDTH,
    height: undefined,
    title: node.data.title,
    color: node.data.color,
    selectable: true
  };

  if (node.type === "nodetool.group.Loop") {
    ui_properties.selectable = false;
    ui_properties.height = node.measured?.height;
  }

  if (
    node.type === "nodetool.workflows.base_node.Comment" ||
    node.type === "nodetool.workflows.base_node.Group" ||
    node.type === "nodetool.workflows.base_node.Preview"
  ) {
    ui_properties.height = node.measured?.height;
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
const AUTO_SAVE_INTERVAL = 5000; // 5 seconds

export interface NodeStore {
  explicitSave: boolean;
  shouldAutoLayout: boolean;
  setExplicitSave: (value: boolean) => void;
  setShouldAutoLayout: (value: boolean) => void;
  workflow: WorkflowAttributes;
  lastWorkflow: WorkflowAttributes | null;
  nodes: Node<NodeData>[];
  hoveredNodes: string[];
  setHoveredNodes: (ids: string[]) => void;
  edges: Edge[];
  edgeUpdateSuccessful: boolean;
  missingModelFiles: RepoPath[];
  generateNodeId: () => string;
  generateEdgeId: () => string;
  getInputEdges: (nodeId: string) => Edge[];
  getOutputEdges: (nodeId: string) => Edge[];
  getSelection: () => NodeSelection;
  getSelectedNodes: () => Node<NodeData>[];
  setSelectedNodes: (nodes: Node<NodeData>[]) => void;
  getSelectedNodeIds: () => string[];
  setEdgeUpdateSuccessful: (value: boolean) => void;
  onNodesChange: OnNodesChange<Node<NodeData>>;
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
  getModels: () => UnifiedModel[];
  setNodes: (nodes: Node<NodeData>[], setDirty?: boolean) => void;
  setEdges: (edges: Edge[]) => void;
  setWorkflow: (workflow: Workflow) => void;
  setWorkflowAttributes: (attributes: WorkflowAttributes) => void;
  getWorkflow: () => Workflow;
  newWorkflow: () => string;
  saveWorkflow: () => Promise<Workflow>;
  syncWithWorkflowStore: () => void;
  getWorkflowIsDirty: () => boolean;
  setWorkflowDirty: (dirty: boolean) => void;
  updateFromWorkflowStore: () => Promise<void>;
  validateConnection: (
    connection: Connection,
    srcMetadata: NodeMetadata,
    targetMetadata: NodeMetadata
  ) => boolean;
  sanitizeGraph: (
    nodes: Node<NodeData>[],
    edges: Edge[],
    metadata: Record<string, NodeMetadata>
  ) => { nodes: Node<NodeData>[]; edges: Edge[] };
  workflowJSON: () => string;
  createNode: (
    metadata: NodeMetadata,
    position: XYPosition,
    properties?: Record<string, any>
  ) => Node<NodeData>;
  autoLayout: () => Promise<void>;
  clearMissingModels: () => void;
  workflowIsDirty: boolean;
  autoSaveInterval: NodeJS.Timeout | null;
  startAutoSave: () => void;
  stopAutoSave: () => void;
}

export const useTemporalStore = <T>(
  selector: (state: TemporalState<NodeStore>) => T,
  equality?: (a: T, b: T) => boolean
) => useStore(useNodeStore.temporal, selector, equality);

export const useNodeStore = create<NodeStore>()(
  temporal(
    (set, get) => ({
      explicitSave: false as boolean,
      shouldAutoLayout: false as boolean,
      missingModelFiles: [],
      workflow: {
        id: "",
        name: "",
        access: "private",
        description: "",
        thumbnail: "",
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      lastWorkflow: null,
      workflowIsDirty: false,
      nodes: [] as Node<NodeData>[],
      edges: [] as Edge[],
      edgeUpdateSuccessful: false as boolean,
      hoveredNodes: [],
      autoSaveInterval: null,

      /**
       * Get all models referenced by the workflow.
       */
      getModels: () => {
        const nodes = get().nodes;
        return nodes.reduce((acc, node) => {
          for (const key in node.data.properties) {
            const property = node.data.properties[key];
            if (property?.type && property?.repo_id) {
              acc.push(property as UnifiedModel);
            }
          }
          return acc;
        }, [] as UnifiedModel[]);
      },

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
      autoLayout: async () => {
        const allNodes = get().nodes;
        let selectedNodes = allNodes.filter((node) => node.selected);
        const edges = get().edges;
        if (selectedNodes.length <= 1) {
          selectedNodes = allNodes;
        }
        const layoutedNodes = await autoLayout(edges, selectedNodes);
        const updatedNodes = allNodes.map((node) => {
          const layoutedNode = layoutedNodes.find((n) => n.id === node.id);
          return layoutedNode ? layoutedNode : node;
        });

        set({ nodes: updatedNodes });
      },

      /**
       * Create a new node. The node is not added to the workflow.
       *
       * @param metadata The metadata of the node to create.
       * @param position The position of the node.
       * @returns The new node.
       */
      createNode: (
        metadata: NodeMetadata,
        position: XYPosition,
        properties?: Record<string, any>
      ): Node<NodeData> => {
        const defaults = metadata.properties.reduce<Record<string, any>>(
          (acc, property) => ({
            ...acc,
            [property.name]: property.default
          }),
          {}
        );
        if (properties) {
          for (const key in properties) {
            defaults[key] = properties[key];
          }
        }
        return {
          id: get().generateNodeId(),
          type: metadata.node_type,
          data: {
            properties: defaults,
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
        const nodeToDelete = get().findNode(id);
        if (!nodeToDelete) {
          devWarn(`Node with id ${id} not found`);
          return;
        }
        const focusedElement = document.activeElement as HTMLElement;
        if (
          focusedElement.classList.contains("MuiInput-input") ||
          focusedElement.tagName === "TEXTAREA"
        ) {
          return;
        }
        const nodes: Node<NodeData>[] = get()
          .nodes.filter((node) => node.id !== id)
          .map((node) => {
            return {
              ...node,
              parentId: node.parentId === id ? undefined : node.parentId
            };
          });

        useErrorStore.getState().clearErrors(id);
        useResultsStore.getState().clearResults(id);

        set({
          nodes: nodes,
          edges: get().edges.filter(
            (edge) => edge.source !== id && edge.target !== id
          )
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
       * Set the explicit save flag.
       */
      setExplicitSave: (value: boolean) => {
        set({ explicitSave: value });
      },

      getWorkflowIsDirty: () => {
        return get().workflowIsDirty;
      },

      setWorkflowDirty: (dirty: boolean) => {
        set({ workflowIsDirty: dirty });
      },

      /**
       * Set the current workflow.
       */
      setWorkflow: (workflow: Workflow) => {
        get().syncWithWorkflowStore();

        const modelFiles = extractModelFiles(workflow.graph.nodes);
        tryCacheFiles(modelFiles).then((paths) => {
          set({
            missingModelFiles: paths.filter((m) => !m.downloaded)
          });
        });

        const shouldAutoLayout = get().shouldAutoLayout;
        const metadata = useMetadataStore.getState().metadata;

        if (!metadata) {
          throw new Error("Metadata not loaded");
        }

        const unsanitizedNodes = (workflow.graph?.nodes || []).map(
          (n: GraphNode) => graphNodeToReactFlowNode(workflow, n)
        );
        const unsanitizedEdges = (workflow.graph?.edges || []).map(
          (e: GraphEdge) => graphEdgeToReactFlowEdge(e)
        );

        const { nodes: sanitizedNodes, edges: sanitizedEdges } =
          get().sanitizeGraph(unsanitizedNodes, unsanitizedEdges, metadata);

        set({
          workflow: workflow,
          lastWorkflow: workflow,
          shouldAutoLayout: false,
          edges: sanitizedEdges,
          nodes: sanitizedNodes,
          workflowIsDirty: false
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
        get().syncWithWorkflowStore();
        get().saveWorkflow();
        return newWorkflow.id;
      },

      /**
       * Sync with workflow store.
       */
      syncWithWorkflowStore: () => {
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
        get().setWorkflowDirty(false);
        set({ lastWorkflow: workflow });
        return updateWorkflow(workflow);
      },

      /**
       * Get the current workflow.
       */
      getWorkflow: (): Workflow => {
        const workflow = get().workflow;
        const edges = get().edges;
        const isHandleConnected = (nodeId: string, handle: string) => {
          return edges.some(
            (edge) => edge.target === nodeId && edge.targetHandle === handle
          );
        };
        const unconnectedProperties = (node: Node<NodeData>) => {
          const properties: Record<string, any> = {};
          for (const name in node.data.properties) {
            if (!isHandleConnected(node.id, name)) {
              properties[name] = node.data.properties[name];
            }
          }
          return properties;
        };
        const nodes = get().nodes.map((node) => {
          return {
            ...node,
            data: {
              ...node.data,
              properties: unconnectedProperties(node)
            }
          };
        });
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
      addNode: (node: Node<NodeData>) => {
        if (get().findNode(node.id)) {
          devWarn(`Node with id ${node.id} already exists`);
          return;
        }
        node.data.dirty = true;
        node.expandParent = true;
        node.data.workflow_id = get().workflow.id;

        const isGroupOrLoopNode =
          node.type === "nodetool.workflows.base_node.Group" ||
          node.type === "nodetool.group.Loop";

        let updatedNodes;
        if (isGroupOrLoopNode) {
          updatedNodes = [node, ...get().nodes];
        } else {
          updatedNodes = [...get().nodes, node];
        }

        set({ nodes: updatedNodes });
        get().setWorkflowDirty(true);

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
        get().setWorkflowDirty(true);
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? ({ ...n, ...node } as Node<NodeData>) : n
          )
        }));
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
                : node) as Node<NodeData>
          )
        });
        get().setWorkflowDirty(true);
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
                : node) as Node<NodeData>
          )
        });
        get().setWorkflowDirty(true);
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
       * Get the selected nodes.
       *
       * @returns The selected nodes.
       */
      getSelectedNodes: () => {
        return get().nodes.filter((node) => node.selected);
      },

      /**
       * Get the ids of the selected nodes.
       *
       * @returns The ids of the selected nodes.
       */
      getSelectedNodeIds: () => {
        return get()
          .getSelectedNodes()
          .map((node) => node.id);
      },

      /**
       * Set the selected nodes.
       *
       * @param nodes The nodes to set as selected.
       */
      setSelectedNodes: (nodes: Node<NodeData>[]) => {
        set({
          nodes: get().nodes.map((node) => ({
            ...node,
            selected: nodes.includes(node)
          }))
        });
      },

      /**
       * Set the nodes of the workflow.
       *
       * @param nodes The nodes of the workflow.
       */
      setNodes: (nodes: Node<NodeData>[], setDirty: boolean = true) => {
        if (setDirty) {
          nodes.forEach((node) => {
            node.data.dirty = true;
            node.data.workflow_id = get().workflow.id;
          });
        }
        set({ nodes });
        get().setWorkflowDirty(true);
      },

      /**
       * Set the edges of the workflow.
       *
       * @param edges The edges of the workflow.
       */
      setEdges: (edges: Edge[]) => {
        set({ edges });
        get().setWorkflowDirty(true);
      },

      /**
       * Handle changes to the nodes.
       *
       * @param changes The changes to the nodes.
       */
      onNodesChange: (changes: NodeChange<Node<NodeData>>[]) => {
        const nodes = applyNodeChanges(changes, get().nodes);
        set({ nodes });
        get().setWorkflowDirty(true);
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
        get().setWorkflowDirty(true);
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
          get().setEdges(reconnectEdge(oldEdge, connection, filteredEdges));
        } else {
          set({ edgeUpdateSuccessful: false });
        }
      },

      validateConnection: (
        connection: Connection,
        srcMetadata: NodeMetadata,
        targetMetadata: NodeMetadata
      ) => {
        if (
          !srcMetadata ||
          !targetMetadata ||
          !connection.sourceHandle ||
          !connection.targetHandle
        ) {
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

      sanitizeGraph: (
        nodes: Node<NodeData>[],
        edges: Edge[],
        metadata: Record<string, NodeMetadata>
      ): { nodes: Node<NodeData>[]; edges: Edge[] } => {
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));
        const sanitizedNodes = nodes.map((node) => {
          const sanitizedNode = { ...node };
          if (sanitizedNode.parentId && !nodeMap.has(sanitizedNode.parentId)) {
            devWarn(
              `Node ${sanitizedNode.id} references non-existent parent ${sanitizedNode.parentId}. Removing parent reference.`
            );
            delete sanitizedNode.parentId;
          }

          return sanitizedNode;
        });
        const sanitizedEdges = edges.reduce((acc, edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (sourceNode && targetNode && sourceNode.type && targetNode.type) {
            const sourceMetadata = metadata[sourceNode.type];
            const targetMetadata = metadata[targetNode.type];
            if (!sourceMetadata || !targetMetadata) {
              return acc;
            }
            if (
              sourceMetadata.outputs.some(
                (output) => output.name === edge.sourceHandle
              ) &&
              targetMetadata.properties.some(
                (prop) => prop.name === edge.targetHandle
              )
            ) {
              acc.push(edge);
            }
          }
          return acc;
        }, [] as Edge[]);

        return { nodes: sanitizedNodes, edges: sanitizedEdges };
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

          setEdges(
            addEdge(
              newConnection,
              filteredEdges.map((edge) => ({
                ...edge,
                sourceHandle: edge.sourceHandle || null,
                targetHandle: edge.targetHandle || null,
                className: edge.className || ""
              }))
            )
          );
        }
      },

      /**
       * Clear the list of missing model files
       */
      clearMissingModels: () => {
        set({ missingModelFiles: [] });
      },

      /**
       * Start auto-saving the workflow periodically
       */
      startAutoSave: () => {
        // Clear any existing interval first
        get().stopAutoSave();

        const interval = setInterval(async () => {
          if (get().getWorkflowIsDirty()) {
            // devLog("Auto-saving workflow...");
            await get().saveWorkflow();
          }
        }, AUTO_SAVE_INTERVAL);

        set({ autoSaveInterval: interval });
      },

      /**
       * Stop auto-saving the workflow
       */
      stopAutoSave: () => {
        const currentInterval = get().autoSaveInterval;
        if (currentInterval) {
          clearInterval(currentInterval);
          set({ autoSaveInterval: null });
        }
      }
    }),
    {
      limit: undo_limit,
      equality: customEquality
    }
  )
);

/**
 * Extract model files from workflow nodes that need to be cached
 */
const extractModelFiles = (nodes: GraphNode[]): RepoPath[] => {
  return nodes.reduce<RepoPath[]>((acc, node) => {
    const data = node.data as Record<string, any>;
    for (const name of Object.keys(data)) {
      const value = data[name];
      if (value && value.type?.startsWith("hf.")) {
        if (value.repo_id && value.path) {
          acc.push({
            repo_id: value.repo_id,
            path: value.path
          });
        }
      }
    }
    return acc;
  }, []);
};
