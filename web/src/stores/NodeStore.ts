/**
 * NodeStore manages workflow graph state for a single editor tab.
 *
 * Responsibilities:
 * - Track nodes/edges, selection, viewport, and hover state
 * - Enforce connection validity (handle types, prevent cycles) via
 *   `isValidEdge`/`sanitizeGraph`
 * - Run ELK auto-layout when requested and resize group nodes accordingly
 * - Provide serialization helpers to/from backend graph shapes
 * - Offer temporal undo/redo on nodes/edges/workflow via zundo (limit 1000)
 */

import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { create, StoreApi, UseBoundStore } from "zustand";
import {
  NodeMetadata,
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
  Position,
  Viewport
} from "@xyflow/react";
import { customEquality } from "./customEquality";

import { Node as GraphNode, Edge as GraphEdge } from "./ApiTypes";
import log from "loglevel";
import { autoLayout } from "../core/graph";
import { isConnectable, isCollectType } from "../utils/TypeHandler";
import {
  findOutputHandle,
  findInputHandle
} from "../utils/handleUtils";
import { WorkflowAttributes } from "./ApiTypes";
import { wouldCreateCycle } from "../utils/graphCycle";
import useMetadataStore from "./MetadataStore";
import useErrorStore from "./ErrorStore";
import useResultsStore from "./ResultsStore";
import PlaceholderNode from "../components/node_types/PlaceholderNode";
import {
  graphEdgeToReactFlowEdge
} from "./graphEdgeToReactFlowEdge";
import { graphNodeToReactFlowNode } from "./graphNodeToReactFlowNode";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { isValidEdge, sanitizeGraph } from "../core/workflow/graphMapping";
import { GROUP_NODE_TYPE } from "../utils/nodeUtils";

/**
 * Generates a default name for input nodes based on their type.
 * For example, "nodetool.input.StringInput" becomes "string_input_1"
 */
const generateInputNodeName = (nodeType: string, existingNodes: Node<NodeData>[]): string => {
  // Extract the input type from the node type (e.g., "StringInput" from "nodetool.input.StringInput")
  const match = nodeType.match(/nodetool\.input\.(\w+)Input$/);
  if (!match) {
    // Handle special cases like Folder
    const folderMatch = nodeType.match(/nodetool\.input\.(\w+)$/);
    if (folderMatch) {
      const baseName = folderMatch[1].toLowerCase();
      const existingCount = existingNodes.filter(
        (n) => n.type === nodeType
      ).length;
      return `${baseName}_${existingCount + 1}`;
    }
    return "input_1";
  }

  const inputType = match[1].toLowerCase();
  const baseName = `${inputType}_input`;
  
  // Count existing input nodes of the same type
  const existingCount = existingNodes.filter(
    (n) => n.type === nodeType
  ).length;
  
  return `${baseName}_${existingCount + 1}`;
};

/**
 * Generates a UUID v4 string
 * Falls back to a simple implementation if crypto.randomUUID is not available
 */
const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0;
    const hexValue = char === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return hexValue.toString(16);
  });
};

export type NodeUIProperties = {
  selected?: boolean;
  selectable?: boolean;
  position: XYPosition;
  width?: number;
  height?: number;
  zIndex?: number;
  title?: string;
  color?: string;
  bypassed?: boolean;
};

type NodeSelection = {
  nodes: Node<NodeData>[];
  edges: Edge[];
};

export const DEFAULT_NODE_WIDTH = 280;

const undo_limit = 1000;

export interface NodeStoreState {
  shouldAutoLayout: boolean;
  setShouldAutoLayout: (value: boolean) => void;
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
  viewport: Viewport | null;
  setViewport: (viewport: Viewport) => void;
  hoveredNodes: string[];
  setHoveredNodes: (ids: string[]) => void;
  edges: Edge[];
  edgeUpdateSuccessful: boolean;
  missingModelFiles: RepoPath[];
  missingModelRepos: string[];
  generateNodeId: () => string;
  generateNodeIds: (count: number) => string[];
  generateEdgeId: () => string;
  getInputEdges: (nodeId: string) => Edge[];
  getOutputEdges: (nodeId: string) => Edge[];
  getSelection: () => NodeSelection;
  getSelectedNodes: () => Node<NodeData>[];
  setSelectedNodes: (nodes: Node<NodeData>[]) => void;
  selectNodesByType: (nodeType: string) => void;
  getSelectedNodeIds: () => string[];
  setEdgeUpdateSuccessful: (value: boolean) => void;
  setEdgeSelectionState: (edgeSelections: Record<string, boolean>) => void;
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
  updateEdgeHandle: (
    nodeId: string,
    oldHandle: string,
    newHandle: string
  ) => void;
  getModels: () => UnifiedModel[];
  setNodes: (
    nodesOrCallback:
      | Node<NodeData>[]
      | ((nodes: Node<NodeData>[]) => Node<NodeData>[])
  ) => void;
  setEdges: (edges: Edge[]) => void;
  getWorkflow: () => Workflow;
  setWorkflowDirty: (dirty: boolean) => void;
  validateConnection: (
    connection: Connection,
    srcNode: Node<NodeData>,
    targetNode: Node<NodeData>
  ) => boolean;
  workflowJSON: () => string;
  createNode: (
    metadata: NodeMetadata,
    position: XYPosition,
    properties?: Record<string, any>
  ) => Node<NodeData>;
  autoLayout: () => Promise<void>;
  clearMissingModels: () => void;
  clearMissingRepos: () => void;
  workflowIsDirty: boolean;
  shouldFitToScreen: boolean;
  fitViewTargetNodeIds: string[] | null;
  setShouldFitToScreen: (value: boolean, nodeIds?: string[] | null) => void;
  selectAllNodes: () => void;
  cleanup: () => void;
  toggleBypass: (nodeId: string) => void;
  setBypass: (nodeId: string, bypassed: boolean) => void;
  toggleBypassSelected: () => void;
  addCommentNode: (position: { x: number; y: number }) => void;
}

export type PartializedNodeStore = Pick<
  NodeStoreState,
  "workflow" | "nodes" | "edges"
>;

export type NodeStore = UseBoundStore<
  StoreApi<NodeStoreState> & {
    temporal: StoreApi<TemporalState<PartializedNodeStore>>;
  }
>;

/**
 * Creates a new node store instance with default values
 * Useful for testing or creating isolated stores
 */
export const createNodeStore = (
  workflow?: Workflow,
  state?: Partial<NodeStoreState>
): NodeStore =>
  create<NodeStoreState>()(
    temporal(
      (set, get) => {
        const metadata = useMetadataStore.getState().metadata;
        const nodeTypes = useMetadataStore.getState().nodeTypes;
        const addNodeType = useMetadataStore.getState().addNodeType;

        const unsanitizedNodes = workflow
          ? (workflow.graph?.nodes || []).map((n: GraphNode) =>
              graphNodeToReactFlowNode(workflow, n)
            )
          : [];
        const unsanitizedEdges = workflow
          ? (workflow.graph?.edges || []).map((e: GraphEdge) =>
              graphEdgeToReactFlowEdge(e)
            )
          : [];

        const { nodes: sanitizedNodes, edges: sanitizedEdges } = sanitizeGraph(
          unsanitizedNodes,
          unsanitizedEdges,
          metadata
        );

        for (const node of sanitizedNodes) {
          if (node.type && !nodeTypes[node.type]) {
            addNodeType(node.type, PlaceholderNode);
          }
        }

        // Store the unsubscribe function for cleanup
        let unsubscribeMetadata: (() => void) | null = null;

        // Subscribe to metadata changes to re-sanitize edges when metadata loads
        unsubscribeMetadata = useMetadataStore.subscribe((state) => {
          // Re-sanitize edges when metadata becomes available
          const currentState = get();
          const metadataCount = Object.keys(state.metadata).length;
          const edgeCount = currentState.edges.length;

          if (metadataCount > 0 && edgeCount > 0) {
            const { edges: sanitizedEdges } = sanitizeGraph(
              currentState.nodes,
              currentState.edges,
              state.metadata
            );
            set({ edges: sanitizedEdges });
          }
        });

        return {
          shouldAutoLayout: state?.shouldAutoLayout || false,
          missingModelFiles: [],
          missingModelRepos: [],
          viewport: null,
          workflow: workflow
            ? workflow
            : {
                id: "",
                name: "",
                access: "private",
                description: "",
                thumbnail: "",
                tags: [],
                run_mode: "workflow",
                settings: {},
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
              },
          workflowIsDirty: false,
          nodes: sanitizedNodes,
          edges: sanitizedEdges,
          edgeUpdateSuccessful: false,
          hoveredNodes: [],
          shouldFitToScreen: state?.shouldFitToScreen ?? true,
          fitViewTargetNodeIds: state?.fitViewTargetNodeIds ?? null,
          connectionAttempted: false,
          setConnectionAttempted: (value: boolean): void =>
            set({ connectionAttempted: value }),
          setHoveredNodes: (ids: string[]): void => set({ hoveredNodes: ids }),
          generateNodeId: (): string => {
            return generateUUID();
          },
          generateNodeIds: (count: number): string[] => {
            return Array.from({ length: count }, () => generateUUID());
          },
          generateEdgeId: (): string => {
            return generateUUID();
          },
          getInputEdges: (nodeId: string): Edge[] =>
            get().edges.filter((e) => e.target === nodeId),
          getOutputEdges: (nodeId: string): Edge[] =>
            get().edges.filter((e) => e.source === nodeId),
          getSelection: (): NodeSelection => {
            const nodes = get().nodes.filter((node) => node.selected);
            const nodeIds = nodes.reduce((acc, node) => {
              acc[node.id] = true;
              return acc;
            }, {} as Record<string, boolean>);
            const edges = get().edges.filter(
              (edge) => edge.source in nodeIds && edge.target in nodeIds
            );
            return { nodes, edges };
          },
          getSelectedNodes: (): Node<NodeData>[] =>
            get().nodes.filter((node) => node.selected),
          setSelectedNodes: (nodes: Node<NodeData>[]): void => {
            set({
              nodes: get().nodes.map((node) => ({
                ...node,
                selected: nodes.includes(node)
              }))
            });
          },
          selectNodesByType: (nodeType: string): void => {
            const nodes = get().nodes;
            const matchingCount = nodes.filter((node) => {
              const currentType = node.type;
              const originalType = node.data?.originalType;
              return (
                currentType === nodeType ||
                (!!originalType && originalType === nodeType)
              );
            }).length;
            log.info(
              "[NodeStore] selectNodesByType",
              nodeType,
              "matching",
              matchingCount
            );
            console.info(
              "[NodeStore] selectNodesByType",
              nodeType,
              "matching",
              matchingCount
            );
            if (matchingCount === 0) {
              return;
            }
            set({
              nodes: nodes.map((node) => {
                const currentType = node.type;
                const originalType = node.data?.originalType;
                const isMatch =
                  currentType === nodeType ||
                  (!!originalType && originalType === nodeType);
                return {
                  ...node,
                  selected: isMatch
                };
              })
            });
          },
          getSelectedNodeIds: (): string[] =>
            get()
              .getSelectedNodes()
              .map((node) => node.id),
          setEdgeUpdateSuccessful: (value: boolean): void =>
            set({ edgeUpdateSuccessful: value }),
          onNodesChange: (changes: NodeChange<Node<NodeData>>[]): void => {
            // Check if changes are only internal React Flow updates (dimensions, positions from ResizeObserver, selection)
            const isOnlyInternalChanges = changes.every(
              (change) =>
                change.type === "dimensions" ||
                change.type === "select" ||
                (change.type === "position" && change.dragging === false)
            );

            const nodes = applyNodeChanges(changes, get().nodes);
            set({ nodes });

            // Only mark as dirty if there are actual user changes, not just internal React Flow updates
            if (!isOnlyInternalChanges) {
              get().setWorkflowDirty(true);
            }
          },
          onEdgesChange: (changes: EdgeChange[]): void => {
            // Check if changes are only selection-related
            const isOnlySelectionChanges = changes.every(
              (change) => change.type === "select"
            );

            set({
              edges: applyEdgeChanges(changes, get().edges)
            });

            // Only mark as dirty if there are actual edge modifications, not just selection changes
            if (!isOnlySelectionChanges) {
              get().setWorkflowDirty(true);
            }
          },
          setEdgeSelectionState: (
            edgeSelections: Record<string, boolean>
          ): void => {
            const selectionEntries = Object.entries(edgeSelections);
            if (selectionEntries.length === 0) {
              return;
            }

            const currentEdges = get().edges;
            let changed = false;

            const updatedEdges = currentEdges.map((edge) => {
              if (edge.id in edgeSelections) {
                const shouldSelect = edgeSelections[edge.id];
                const isSelected = Boolean(edge.selected);
                if (isSelected !== shouldSelect) {
                  changed = true;
                  return { ...edge, selected: shouldSelect };
                }
              }
              return edge;
            });

            if (changed) {
              set({ edges: updatedEdges });
            }
          },
          onEdgeUpdate: (oldEdge: Edge, newConnection: Connection): void => {
            const edge = get().edges.find((e) => e.id === oldEdge.id);
            if (edge) {
              const srcNode = get().findNode(newConnection.source);
              const targetNode = get().findNode(newConnection.target);
              if (
                srcNode &&
                targetNode &&
                get().validateConnection(newConnection, srcNode, targetNode)
              ) {
                const newEdge = {
                  ...edge,
                  source: newConnection.source,
                  target: newConnection.target,
                  sourceHandle: newConnection.sourceHandle || null,
                  targetHandle: newConnection.targetHandle || null
                };
                set({
                  edges: get().edges.map((e) =>
                    e.id === oldEdge.id ? newEdge : e
                  )
                });
                get().setWorkflowDirty(true);
              }
            }
          },
          onConnect: (connection: Connection): void => {
            const srcNode = get().findNode(connection.source);
            const targetNode = get().findNode(connection.target);
            if (!connection.targetHandle) {
              return;
            }
            const isDynamicProperty =
              targetNode?.data.dynamic_properties[connection.targetHandle] !==
              undefined;
            if (
              !srcNode ||
              !targetNode ||
              !(
                isDynamicProperty ||
                get().validateConnection(connection, srcNode, targetNode)
              )
            ) {
              return;
            }

            // Check if the target handle is a "collect" handle (list[T])
            // Collect handles allow multiple incoming connections
            let isCollectHandle = false;
            if (targetNode && connection.targetHandle) {
              const targetMetadata = useMetadataStore
                .getState()
                .getMetadata(targetNode.type || "");
              if (targetMetadata) {
                const targetHandle = findInputHandle(
                  targetNode,
                  connection.targetHandle,
                  targetMetadata
                );
                if (targetHandle?.type && isCollectType(targetHandle.type)) {
                  isCollectHandle = true;
                }
              }
            }

            // Remove any existing connections to this target handle
            // UNLESS it's a collect handle, which allows multiple connections
            const filteredEdges = isCollectHandle
              ? get().edges
              : get().edges.filter(
                  (edge) =>
                    !(
                      edge.target === connection.target &&
                      edge.targetHandle === connection.targetHandle
                    )
                );

            if (
              wouldCreateCycle(
                filteredEdges as Edge[],
                connection.source,
                connection.target
              )
            ) {
              return;
            }

            const newEdge = {
              ...connection,
              id: get().generateEdgeId(),
              sourceHandle: connection.sourceHandle || null,
              targetHandle: connection.targetHandle || null
            } as Edge;

            // Normalize handles to null if undefined for consistency
            // This is necessary because edge comparison and serialization expect null, not undefined
            const normalizedEdges = filteredEdges.map((edge) => ({
              ...edge,
              sourceHandle: edge.sourceHandle || null,
              targetHandle: edge.targetHandle || null
            }));

            set({
              edges: addEdge(newEdge, normalizedEdges)
            });
            get().setWorkflowDirty(true);
          },
          findNode: (id: string): Node<NodeData> | undefined =>
            get().nodes.find((n) => n.id === id),
          findEdge: (id: string): Edge | undefined =>
            get().edges.find((e) => e.id === id),
          addNode: (node: Node<NodeData>): void => {
            if (get().findNode(node.id)) {
              log.warn(`Node with id ${node.id} already exists`);
              return;
            }
            node.expandParent = true;
            node.data.workflow_id = get().workflow.id;
            set({ nodes: [...get().nodes, node] });
            get().setWorkflowDirty(true);
          },
          updateNode: (
            id: string,
            nodeUpdate: Partial<Node<NodeData>>
          ): void => {
            // Check if this is only a selection change
            const isOnlySelectionChange =
              Object.keys(nodeUpdate).length === 1 && "selected" in nodeUpdate;

            set((state) => {
              let newNodes = state.nodes.map((n) =>
                n.id === id ? { ...n, ...nodeUpdate } : n
              );

              // If parentId is being set or changed, reorder nodes
              if (nodeUpdate.parentId !== undefined) {
                const updatedNode = newNodes.find((n) => n.id === id);
                if (updatedNode) {
                  // Remove the node from its current position
                  newNodes = newNodes.filter((n) => n.id !== id);
                  const parentIndex = newNodes.findIndex(
                    (n) => n.id === nodeUpdate.parentId
                  );

                  if (
                    nodeUpdate.parentId === null ||
                    nodeUpdate.parentId === undefined
                  ) {
                    // If removing parentId, add to the end (or handle as per existing logic for no parent)
                    newNodes.push(updatedNode);
                  } else if (parentIndex !== -1) {
                    // Insert after the parent
                    newNodes.splice(parentIndex + 1, 0, updatedNode);
                  } else {
                    // Parent not found (should not happen if data is consistent), add to end
                    // Or, if parentId is set but parent is not in the list yet,
                    // this might still cause issues.
                    // For safety, add child to the end if parent not found.
                    // React Flow might still complain if parent isn't rendered.
                    newNodes.push(updatedNode);
                  }
                }
              }
              return { ...state, nodes: newNodes };
            });

            // Only mark as dirty if this is not just a selection change
            if (!isOnlySelectionChange) {
              get().setWorkflowDirty(true);
            }
          },
          updateNodeData: (id: string, data: Partial<NodeData>): void => {
            set((state) => {
              const index = state.nodes.findIndex((n) => n.id === id);
              if (index === -1) {
                return state;
              }
              const nodes = state.nodes.slice();
              const target = nodes[index];
              nodes[index] = {
                ...target,
                data: { ...target.data, ...data }
              };
              return { ...state, nodes };
            });
          },
          updateNodeProperties: (id: string, properties: any): void => {
            const workflow_id = get().workflow.id;
            set((state) => {
              const index = state.nodes.findIndex((n) => n.id === id);
              if (index === -1) {
                return state;
              }
              const nodes = state.nodes.slice();
              const target = nodes[index];
              nodes[index] = {
                ...target,
                data: {
                  ...target.data,
                  workflow_id,
                  properties: {
                    ...target.data.properties,
                    ...properties
                  }
                }
              };
              return { ...state, nodes };
            });
            get().setWorkflowDirty(true);
          },
          deleteNode: (id: string): void => {
            const nodeToDelete = get().findNode(id);
            if (!nodeToDelete) {
              log.warn(`Node with id ${id} not found`);
              return;
            }
            const focusedElement = document.activeElement as HTMLElement;
            if (
              focusedElement.classList.contains("MuiInput-input") ||
              focusedElement.tagName === "TEXTAREA"
            ) {
              return;
            }
            // Optimization: Use single pass to filter and update parentId
            const nodes: Node<NodeData>[] = [];
            for (const node of get().nodes) {
              if (node.id !== id) {
                if (node.parentId === id) {
                  nodes.push({ ...node, parentId: undefined });
                } else {
                  nodes.push(node);
                }
              }
            }

            useErrorStore.getState().clearErrors(id);
            useResultsStore.getState().clearResults(id);

            set({
              nodes: nodes,
              edges: get().edges.filter(
                (edge) => edge.source !== id && edge.target !== id
              )
            });
            get().setWorkflowDirty(true);
          },
          deleteEdge: (id: string): void => {
            set({ edges: get().edges.filter((e) => e.id !== id) });
            get().setWorkflowDirty(true);
          },
          addEdge: (edge: Edge): void => {
            // Validate the edge before adding it
            const sourceNode = get().findNode(edge.source);
            const targetNode = get().findNode(edge.target);

            if (!sourceNode || !targetNode) {
              log.warn(
                `Cannot add edge ${edge.id}: source or target node not found`
              );
              return;
            }

            // Validate the edge properly using the same validation logic
            const metadata = useMetadataStore.getState().metadata;
            const nodeMap = new Map(get().nodes.map((n) => [n.id, n]));

            if (!isValidEdge(edge, nodeMap, metadata)) {
              log.warn(
                `Cannot add edge ${edge.id}: edge validation failed`,
                edge
              );
              return;
            }

            // Ensure handles are properly set
            const sanitizedEdge = {
              ...edge,
              sourceHandle: edge.sourceHandle || null,
              targetHandle: edge.targetHandle || null
            };

            set({ edges: [...get().edges, sanitizedEdge] });
            get().setWorkflowDirty(true);
          },
          updateEdge: (edge: Edge): void => {
            set({
              edges: [...get().edges.filter((e) => e.id !== edge.id), edge]
            });
            get().setWorkflowDirty(true);
          },
          updateEdgeHandle: (
            nodeId: string,
            oldHandle: string,
            newHandle: string
          ): void => {
            set({
              edges: get().edges.map((edge) =>
                edge.target === nodeId && edge.targetHandle === oldHandle
                  ? { ...edge, targetHandle: newHandle }
                  : edge
              )
            });
            get().setWorkflowDirty(true);
          },
          getModels: (): UnifiedModel[] => {
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
          getWorkflow: (): Workflow => {
            const workflow = get().workflow;
            const edges = get().edges;
            
            // Optimization: Build a set of connected handles for O(1) lookups
            // instead of checking all edges for each property (O(n*m*e) -> O(n*m))
            const connectedHandles = new Set<string>();
            for (const edge of edges) {
              if (edge.target && edge.targetHandle) {
                connectedHandles.add(`${edge.target}:${edge.targetHandle}`);
              }
            }
            
            const isHandleConnected = (nodeId: string, handle: string) => {
              return connectedHandles.has(`${nodeId}:${handle}`);
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
          setWorkflowDirty: (dirty: boolean): void => {
            set({ workflowIsDirty: dirty });
          },
          autoLayout: async (): Promise<void> => {
            const allNodes = get().nodes;
            let selectedNodes = allNodes.filter((node) => node.selected);
            const edges = get().edges;
            if (selectedNodes.length <= 1) {
              selectedNodes = allNodes;
            }

            // Optimization: Calculate bounds in single pass instead of 4 separate iterations
            const getBounds = (nodes: Node<NodeData>[]) => {
              // Note: In practice, this is never called with empty arrays since autoLayout
              // only runs when there are nodes. Return zero bounds for consistency.
              if (nodes.length === 0) {
                return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
              }
              
              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              
              for (const node of nodes) {
                const nodeX = node.position.x;
                const nodeY = node.position.y;
                const width = node.measured?.width ?? node.width ?? 100;
                const height = node.measured?.height ?? node.height ?? 100;
                
                if (nodeX < minX) {minX = nodeX;}
                if (nodeY < minY) {minY = nodeY;}
                if (nodeX + width > maxX) {maxX = nodeX + width;}
                if (nodeY + height > maxY) {maxY = nodeY + height;}
              }
              
              return { minX, minY, maxX, maxY };
            };

            const originalBounds = getBounds(selectedNodes);
            const layoutedNodes = await autoLayout(edges, selectedNodes);
            const layoutBounds = getBounds(layoutedNodes);

            const dx = originalBounds.minX - layoutBounds.minX;
            const dy = originalBounds.minY - layoutBounds.minY;

            // Optimization: Use Map for O(1) lookups instead of O(n) find operations
            const layoutedNodeMap = new Map(
              layoutedNodes.map((n) => [n.id, n])
            );

            const updatedNodes = allNodes.map((node) => {
              const layoutedNode = layoutedNodeMap.get(node.id);
              if (layoutedNode) {
                return {
                  ...node,
                  position: {
                    x: layoutedNode.position.x + dx,
                    y: layoutedNode.position.y + dy
                  }
                };
              }
              return node;
            });

            get().setNodes(updatedNodes);
            set({ shouldFitToScreen: true });
          },
          setShouldAutoLayout: (value: boolean): void => {
            set({ shouldAutoLayout: value });
          },
          clearMissingModels: (): void => {
            set({ missingModelFiles: [] });
          },
          clearMissingRepos: (): void => {
            set({ missingModelRepos: [] });
          },
          setShouldFitToScreen: (
            value: boolean,
            nodeIds?: string[] | null
          ): void => {
            set({
              shouldFitToScreen: value,
              fitViewTargetNodeIds: nodeIds ?? null
            });
          },
          setNodes: (
            nodesOrCallback:
              | Node<NodeData>[]
              | ((nodes: Node<NodeData>[]) => Node<NodeData>[])
          ): void => {
            if (typeof nodesOrCallback === "function") {
              set((state) => ({
                nodes: nodesOrCallback(state.nodes)
              }));
            } else {
              set({ nodes: nodesOrCallback });
            }
            get().setWorkflowDirty(true);
          },
          setEdges: (edges: Edge[]): void => {
            const metadata = useMetadataStore.getState().metadata;
            const nodes = get().nodes;

            // Only sanitize if metadata is available and edges have actually changed
            if (Object.keys(metadata).length > 0) {
              const { edges: sanitizedEdges } = sanitizeGraph(
                nodes,
                edges,
                metadata
              );
              set({ edges: sanitizedEdges });
            } else {
              set({ edges });
            }

            get().setWorkflowDirty(true);
          },
          validateConnection: (
            connection: Connection,
            srcNode: Node<NodeData>,
            targetNode: Node<NodeData>
          ): boolean => {
            // Basic validation: ensure handles are provided
            if (!connection.sourceHandle || !connection.targetHandle) {
              return false;
            }

            const srcMetadata = useMetadataStore
              .getState()
              .getMetadata(srcNode.type as string);
            const targetMetadata = useMetadataStore
              .getState()
              .getMetadata(targetNode.type as string);

            // If either node doesn't have metadata (placeholder nodes), allow connection
            if (!srcMetadata || !targetMetadata) {
              return true;
            }

            // Check for existing connection
            const edges = get().edges;
            const existingConnection = edges.find(
              (edge) =>
                edge.source === connection.source &&
                edge.sourceHandle === connection.sourceHandle &&
                edge.target === connection.target &&
                edge.targetHandle === connection.targetHandle
            );
            if (existingConnection) {
              return false;
            }

            // Validate source handle exists
            const srcHandle = findOutputHandle(
              srcNode,
              connection.sourceHandle,
              srcMetadata
            );
            if (!srcHandle) {
              return false;
            }

            // Validate target handle exists
            const targetHandle = findInputHandle(
              targetNode,
              connection.targetHandle,
              targetMetadata
            );
            if (!targetHandle) {
              return false;
            }

            if (
              wouldCreateCycle(
                get().edges,
                connection.source,
                connection.target
              )
            ) {
              return false;
            }

            // Validate type compatibility
            return isConnectable(srcHandle.type, targetHandle.type);
          },
          workflowJSON: (): string => {
            const workflow = get().getWorkflow();
            workflow.id = "";
            return JSON.stringify(workflow, null, 2);
          },
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
            
            // Generate default name for input nodes if name property exists but is empty
            const isInputNode = metadata.node_type.startsWith("nodetool.input.");
            if (isInputNode && "name" in defaults && !defaults.name) {
              defaults.name = generateInputNodeName(metadata.node_type, get().nodes);
            }
            
            const nodeId = get().generateNodeId();
            useResultsStore.getState().clearResults(nodeId);

            // Set default size for Preview and CompareImages nodes
            const isPreviewNode =
              metadata.node_type === "nodetool.workflows.base_node.Preview";
            const isCompareImagesNode =
              metadata.node_type === "nodetool.compare.CompareImages";
            let defaultStyle: { width: number; height?: number };
            if (isPreviewNode) {
              defaultStyle = { width: 400, height: 300 };
            } else if (isCompareImagesNode) {
              defaultStyle = { width: 450, height: 350 };
            } else {
              defaultStyle = { width: DEFAULT_NODE_WIDTH };
            }

            const defaultTitle =
              metadata.node_type === GROUP_NODE_TYPE
                ? metadata.title || "Group"
                : undefined;

            return {
              id: nodeId,
              type: metadata.node_type,
              style: defaultStyle,
              data: {
                properties: defaults,
                collapsed: false,
                selectable: true,
                workflow_id: get().workflow.id,
                dynamic_properties: {},
                title: defaultTitle
              },
              targetPosition: Position.Left,
              position: position
            };
          },
          selectAllNodes: (): void => {
            set({
              nodes: get().nodes.map((node) => ({
                ...node,
                selected: true
              }))
            });
          },
          toggleBypass: (nodeId: string): void => {
            const node = get().findNode(nodeId);
            if (node) {
              const newBypassed = !node.data.bypassed;
              set((state) => ({
                nodes: state.nodes.map((n) =>
                  n.id === nodeId
                    ? { 
                        ...n, 
                        className: newBypassed ? "bypassed" : undefined,
                        data: { ...n.data, bypassed: newBypassed } 
                      }
                    : n
                )
              }));
              get().setWorkflowDirty(true);
            }
          },
          setBypass: (nodeId: string, bypassed: boolean): void => {
            set((state) => ({
              nodes: state.nodes.map((n) =>
                n.id === nodeId
                  ? { 
                      ...n, 
                      className: bypassed ? "bypassed" : undefined,
                      data: { ...n.data, bypassed } 
                    }
                  : n
              )
            }));
            get().setWorkflowDirty(true);
          },
          toggleBypassSelected: (): void => {
            const selectedNodes = get().getSelectedNodes();
            if (selectedNodes.length === 0) {
              return;
            }
            
            // Determine if we should bypass or enable based on majority
            const bypassedCount = selectedNodes.filter(n => n.data.bypassed).length;
            const shouldBypass = bypassedCount < selectedNodes.length / 2;
            
            set((state) => ({
              nodes: state.nodes.map((n) =>
                n.selected
                  ? { 
                      ...n, 
                      className: shouldBypass ? "bypassed" : undefined,
                      data: { ...n.data, bypassed: shouldBypass } 
                    }
                  : n
              )
            }));
            get().setWorkflowDirty(true);
          },
          addCommentNode: (position: { x: number; y: number }): void => {
            const nodeId = get().generateNodeId();
            const commentNode: Node<NodeData> = {
              id: nodeId,
              type: "nodetool.workflows.base_node.Comment",
              position,
              data: {
                properties: {
                  comment: "",
                  comment_color: "#ffffff"
                },
                selectable: true,
                workflow_id: get().workflow.id,
                dynamic_properties: {}
              },
              style: {
                width: 280,
                height: 100
              }
            };
            get().addNode(commentNode);
          },
          cleanup: () => {
            if (unsubscribeMetadata) {
              unsubscribeMetadata();
              unsubscribeMetadata = null;
            }
          },
          setViewport: (viewport: Viewport): void => {
            set({ viewport: viewport });
          },
          ...state
        };
      },
      {
        limit: undo_limit,
        equality: customEquality,
        partialize: (state): PartializedNodeStore => {
          const { workflow, nodes, edges } = state;
          return { workflow, nodes, edges };
        }
      }
    )
  );

