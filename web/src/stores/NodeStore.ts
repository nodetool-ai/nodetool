/**
 * NodeStore manages the state of the workflow editor's nodes and edges.
 * It provides functionality for:
 * - Managing nodes and their connections
 * - Handling node/edge selection and updates
 * - Workflow state management and serialization
 * - Auto-layout capabilities
 * - Undo/redo support via temporal state
 */

import { temporal } from "zundo";
import type { TemporalState } from "zundo";
import { create, StoreApi, UseBoundStore } from "zustand";
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
  Position,
  Viewport
} from "@xyflow/react";
import { customEquality } from "./customEquality";

import { Node as GraphNode, Edge as GraphEdge } from "./ApiTypes";
import log from "loglevel";
import { autoLayout } from "../core/graph";
import { isConnectable } from "../utils/TypeHandler";
import { findOutputHandle, findInputHandle, hasOutputHandle, hasInputHandle } from "../utils/handleUtils";
import { WorkflowAttributes } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";
import useErrorStore from "./ErrorStore";
import useResultsStore from "./ResultsStore";
import PlaceholderNode from "../components/node_types/PlaceholderNode";
import { graphEdgeToReactFlowEdge } from "./graphEdgeToReactFlowEdge";
import { graphNodeToReactFlowNode } from "./graphNodeToReactFlowNode";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";

/**
 * Generates a UUID v4 string
 * Falls back to a simple implementation if crypto.randomUUID is not available
 */
const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
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
};

type NodeSelection = {
  nodes: Node<NodeData>[];
  edges: Edge[];
};

export const DEFAULT_NODE_WIDTH = 200;

const undo_limit = 1000;

/**
 * Validates if an edge is valid based on node existence and handle validity
 */
const isValidEdge = (
  edge: Edge,
  nodeMap: Map<string, Node<NodeData>>,
  metadata: Record<string, NodeMetadata>
): boolean => {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);

  // Basic validation: nodes must exist
  if (!sourceNode || !targetNode || !sourceNode.type || !targetNode.type) {
    return false;
  }

  const sourceMetadata = metadata[sourceNode.type];
  const targetMetadata = metadata[targetNode.type];

  // If metadata is missing, we can't validate handles properly
  // But we should still check basic handle requirements
  if (!sourceMetadata || !targetMetadata) {
    // At minimum, edges must have handles specified
    if (!edge.sourceHandle || !edge.targetHandle) {
      return false;
    }
    // Allow the edge for now - it will be validated again when metadata loads
    return true;
  }

  if (!edge.sourceHandle || !edge.targetHandle) {
    return false;
  }

  // Validate source handle
  if (!hasOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata)) {
    return false;
  }

  // Validate target handle
  if (!hasInputHandle(targetNode, edge.targetHandle, targetMetadata)) {
    return false;
  }

  return true;
};

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
  setShouldFitToScreen: (value: boolean) => void;
  selectAllNodes: () => void;
  cleanup: () => void;
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

const sanitizeGraph = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  metadata: Record<string, NodeMetadata>
): { nodes: Node<NodeData>[]; edges: Edge[] } => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const sanitizedNodes = nodes.map((node) => {
    const sanitizedNode = { ...node };
    if (sanitizedNode.parentId && !nodeMap.has(sanitizedNode.parentId)) {
      log.warn(
        `Node ${sanitizedNode.id} references non-existent parent ${sanitizedNode.parentId}. Removing parent reference.`
      );
      delete sanitizedNode.parentId;
    }
    return sanitizedNode;
  });

  const sanitizedEdges = edges.filter((edge) => {
    if (isValidEdge(edge, nodeMap, metadata)) {
      return true;
    }

    // Log detailed information about why the edge was removed
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      log.warn(
        `Edge ${edge.id} references non-existent nodes. Source: ${
          edge.source
        } (${sourceNode ? "exists" : "missing"}), Target: ${edge.target} (${
          targetNode ? "exists" : "missing"
        }). Removing edge.`
      );
    } else if (!sourceNode.type || !targetNode.type) {
      log.warn(
        `Edge ${edge.id} connects nodes without types. Source type: ${sourceNode.type}, Target type: ${targetNode.type}. Removing edge.`
      );
    } else {
      const sourceMetadata = metadata[sourceNode.type];
      const targetMetadata = metadata[targetNode.type];

      if (
        !sourceMetadata ||
        !targetMetadata ||
        !edge.sourceHandle ||
        !edge.targetHandle
      ) {
        log.warn(
          `Edge ${edge.id} references invalid source or target handle. Source: ${edge.sourceHandle}, Target: ${edge.targetHandle}. Removing edge.`
        );
        return false;
      }

      const sourceHasValidHandle = hasOutputHandle(sourceNode, edge.sourceHandle, sourceMetadata);
      const targetHasValidHandle = hasInputHandle(targetNode, edge.targetHandle, targetMetadata);

      if (!sourceHasValidHandle) {
        const sourceDynamicOutputs = sourceNode.data.dynamic_outputs || {};
        log.warn(
          `Edge ${edge.id} references invalid source handle "${
            edge.sourceHandle
          }" on node ${edge.source} (type: ${
            sourceNode.type
          }). Available outputs: ${[
            ...sourceMetadata.outputs.map((o) => o.name),
            ...Object.keys(sourceDynamicOutputs)
          ].join(", ")}. Removing edge.`
        );
      } else if (!targetHasValidHandle) {
        const dynamicProperties = targetNode.data.dynamic_properties || {};
        log.warn(
          `Edge ${edge.id} references invalid target handle "${
            edge.targetHandle
          }" on node ${edge.target} (type: ${
            targetNode.type
          }). Available properties: ${[
            ...targetMetadata.properties.map((p) => p.name),
            ...Object.keys(dynamicProperties)
          ].join(", ")}. Removing edge.`
        );
      }
    }

    return false;
  });

  const removedEdgeCount = edges.length - sanitizedEdges.length;
  if (removedEdgeCount > 0) {
    log.info(
      `Sanitized graph: removed ${removedEdgeCount} invalid edge(s) out of ${edges.length} total edges.`
    );
  }

  return { nodes: sanitizedNodes, edges: sanitizedEdges };
};

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
        // const modelFiles = extractModelFiles(workflow.graph.nodes);
        // setTimeout(() => {
        //   tryCacheFiles(modelFiles).then((paths) => {
        //     set({
        //       missingModelFiles: paths.filter((m) => !m.downloaded)
        //     });
        //   });
        //   const modelRepos = extractModelRepos(workflow.graph.nodes);
        //   tryCacheRepos(modelRepos).then((repos) => {
        //     set({
        //       missingModelRepos: repos
        //         .filter((r) => !r.downloaded)
        //         .map((r) => r.repo_id)
        //     });
        //   });
        // }, 1000);

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
            if (
              !srcNode ||
              !targetNode ||
              !get().validateConnection(connection, srcNode, targetNode)
            ) {
              return;
            }

            // Remove any existing connections to this target handle
            const filteredEdges = get().edges.filter(
              (edge) =>
                !(
                  edge.target === connection.target &&
                  edge.targetHandle === connection.targetHandle
                )
            );

            const newEdge = {
              ...connection,
              id: get().generateEdgeId(),
              sourceHandle: connection.sourceHandle || null,
              targetHandle: connection.targetHandle || null
            } as Edge;

            set({
              edges: addEdge(
                newEdge,
                filteredEdges.map((edge) => ({
                  ...edge,
                  sourceHandle: edge.sourceHandle || null,
                  targetHandle: edge.targetHandle || null
                }))
              )
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
            set({
              nodes: get().nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...data } } : n
              )
            });
          },
          updateNodeProperties: (id: string, properties: any): void => {
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
              log.warn(`Cannot add edge ${edge.id}: edge validation failed`);
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

            const getBounds = (nodes: Node<NodeData>[]) => {
              const minX = Math.min(...nodes.map((n) => n.position.x));
              const minY = Math.min(...nodes.map((n) => n.position.y));
              const maxX = Math.max(
                ...nodes.map(
                  (n) => n.position.x + (n.measured?.width ?? n.width ?? 100)
                )
              );
              const maxY = Math.max(
                ...nodes.map(
                  (n) => n.position.y + (n.measured?.height ?? n.height ?? 100)
                )
              );
              return { minX, minY, maxX, maxY };
            };

            const originalBounds = getBounds(selectedNodes);
            const layoutedNodes = await autoLayout(edges, selectedNodes);
            const layoutBounds = getBounds(layoutedNodes);

            const dx = originalBounds.minX - layoutBounds.minX;
            const dy = originalBounds.minY - layoutBounds.minY;

            const updatedNodes = allNodes.map((node) => {
              const layoutedNode = layoutedNodes.find((n) => n.id === node.id);
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
          setShouldFitToScreen: (value: boolean): void => {
            set({ shouldFitToScreen: value });
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
            const srcHandle = findOutputHandle(srcNode, connection.sourceHandle, srcMetadata);
            if (!srcHandle) {
              return false;
            }

            // Validate target handle exists
            const targetHandle = findInputHandle(targetNode, connection.targetHandle, targetMetadata);
            if (!targetHandle) {
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
            const nodeId = get().generateNodeId();
            useResultsStore.getState().clearResults(nodeId);
            return {
              id: nodeId,
              type: metadata.node_type,
              style: {
                width: DEFAULT_NODE_WIDTH
              },
              data: {
                properties: defaults,
                collapsed: false,
                selectable: true,
                workflow_id: get().workflow.id,
                dynamic_properties: {}
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
          const { workflow, nodes, edges, ...rest } = state;
          return { workflow, nodes, edges };
        }
      }
    )
  );

const extractModelRepos = (nodes: GraphNode[]): string[] => {
  return nodes.reduce<string[]>((acc, node) => {
    const data = node.data as Record<string, any>;
    for (const name of Object.keys(data)) {
      const value = data[name];
      if (value && value.type?.startsWith("hf.")) {
        if (value.repo_id && !value.path) {
          acc.push(value.repo_id);
        }
      }
    }
    return acc;
  }, []);
};

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
            path: value.path,
            downloaded: false
          });
        }
      }
    }
    return acc;
  }, []);
};
