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
  Position
} from "@xyflow/react";
import { customEquality } from "./customEquality";

import { Node as GraphNode, Edge as GraphEdge } from "./ApiTypes";
import log from "loglevel";
import { autoLayout } from "../core/graph";
import { isConnectable } from "../utils/TypeHandler";
import { WorkflowAttributes } from "./ApiTypes";
import useMetadataStore from "./MetadataStore";
import useErrorStore from "./ErrorStore";
import useResultsStore from "./ResultsStore";
import PlaceholderNode from "../components/node_types/PlaceholderNode";
import { graphEdgeToReactFlowEdge } from "./graphEdgeToReactFlowEdge";
import { graphNodeToReactFlowNode } from "./graphNodeToReactFlowNode";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";

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
const AUTO_SAVE_INTERVAL = 60000; // 1 minute

export interface NodeStoreState {
  shouldAutoLayout: boolean;
  setShouldAutoLayout: (value: boolean) => void;
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
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
  getWorkflowIsDirty: () => boolean;
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
) => {
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

  console.log(`[sanitizeGraph] Processing ${edges.length} edges`);

  const sanitizedEdges = edges.reduce((acc, edge) => {
    console.log(`[sanitizeGraph] Processing edge:`, edge);

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    // Basic validation: both nodes must exist
    if (!sourceNode || !targetNode) {
      log.warn(`Edge ${edge.id} references non-existent nodes. Removing edge.`);
      return acc;
    }

    // Both nodes must have types
    if (!sourceNode.type || !targetNode.type) {
      log.warn(
        `Edge ${edge.id} references nodes without types. Removing edge.`
      );
      return acc;
    }

    const sourceMetadata = metadata[sourceNode.type];
    const targetMetadata = metadata[targetNode.type];

    console.log(
      `[sanitizeGraph] Source metadata for ${sourceNode.type}:`,
      sourceMetadata?.outputs
    );
    console.log(
      `[sanitizeGraph] Target metadata for ${targetNode.type}:`,
      targetMetadata?.properties,
      `is_dynamic: ${targetMetadata?.is_dynamic}`
    );

    // Both nodes must have metadata
    if (!sourceMetadata || !targetMetadata) {
      log.warn(
        `Edge ${edge.id} references nodes with missing metadata. Removing edge.`
      );
      return acc;
    }

    // Validate source handle exists
    if (
      edge.sourceHandle &&
      !sourceMetadata.outputs.some(
        (output) => output.name === edge.sourceHandle
      )
    ) {
      log.warn(
        `Edge ${edge.id} references non-existent source handle "${edge.sourceHandle}". Available outputs:`,
        sourceMetadata.outputs.map((o) => o.name)
      );
      return acc;
    }

    // Validate target handle exists (for non-dynamic nodes)
    if (
      edge.targetHandle &&
      !targetMetadata.is_dynamic &&
      !targetMetadata.properties.some((prop) => prop.name === edge.targetHandle)
    ) {
      log.warn(
        `Edge ${edge.id} references non-existent target handle "${edge.targetHandle}". Available properties:`,
        targetMetadata.properties.map((p) => p.name)
      );
      return acc;
    }

    console.log(`[sanitizeGraph] Edge ${edge.id} is valid, keeping it`);
    // Edge is valid
    acc.push(edge);
    return acc;
  }, [] as Edge[]);

  console.log(
    `[sanitizeGraph] Kept ${sanitizedEdges.length} out of ${edges.length} edges`
  );
  return { nodes: sanitizedNodes, edges: sanitizedEdges };
};

/**
 * Creates a new node store instance with default values
 * Useful for testing or creating isolated stores
 */
export const createNodeStore = (
  workflow?: Workflow,
  state?: Partial<NodeStoreState>
) =>
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

        return {
          shouldAutoLayout: state?.shouldAutoLayout || false,
          missingModelFiles: [],
          missingModelRepos: [],
          workflow: workflow
            ? {
                id: workflow.id,
                name: workflow.name,
                access: workflow.access,
                description: workflow.description,
                thumbnail: workflow.thumbnail,
                tags: workflow.tags,
                settings: workflow.settings,
                updated_at: workflow.updated_at,
                created_at: workflow.created_at
              }
            : {
                id: "",
                name: "",
                access: "private",
                description: "",
                thumbnail: "",
                tags: [],
                settings: {},
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
              },
          workflowIsDirty: false,
          nodes: sanitizedNodes,
          edges: sanitizedEdges,
          edgeUpdateSuccessful: false,
          hoveredNodes: [],
          shouldFitToScreen: state?.shouldFitToScreen || false,
          connectionAttempted: false,
          setConnectionAttempted: (value: boolean) =>
            set({ connectionAttempted: value }),
          setHoveredNodes: (ids: string[]) => set({ hoveredNodes: ids }),
          generateNodeId: () => {
            return crypto.randomUUID();
          },
          generateNodeIds: (count: number) => {
            return Array.from({ length: count }, () => crypto.randomUUID());
          },
          generateEdgeId: () => {
            return crypto.randomUUID();
          },
          getInputEdges: (nodeId: string) =>
            get().edges.filter((e) => e.target === nodeId),
          getOutputEdges: (nodeId: string) =>
            get().edges.filter((e) => e.source === nodeId),
          getSelection: () => {
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
          getSelectedNodes: () => get().nodes.filter((node) => node.selected),
          setSelectedNodes: (nodes: Node<NodeData>[]) => {
            set({
              nodes: get().nodes.map((node) => ({
                ...node,
                selected: nodes.includes(node)
              }))
            });
          },
          getSelectedNodeIds: () =>
            get()
              .getSelectedNodes()
              .map((node) => node.id),
          setEdgeUpdateSuccessful: (value: boolean) =>
            set({ edgeUpdateSuccessful: value }),
          onNodesChange: (changes: NodeChange<Node<NodeData>>[]) => {
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
          onEdgesChange: (changes: EdgeChange[]) => {
            set({
              edges: applyEdgeChanges(changes, get().edges)
            });
            get().setWorkflowDirty(true);
          },
          onEdgeUpdate: (oldEdge: Edge, newConnection: Connection) => {
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
              }
            }
          },
          onConnect: (connection: Connection) => {
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
          },
          findNode: (id: string) => get().nodes.find((n) => n.id === id),
          findEdge: (id: string) => get().edges.find((e) => e.id === id),
          addNode: (node: Node<NodeData>) => {
            if (get().findNode(node.id)) {
              log.warn(`Node with id ${node.id} already exists`);
              return;
            }
            node.expandParent = true;
            node.data.workflow_id = get().workflow.id;
            set({ nodes: [...get().nodes, node], workflowIsDirty: true });
          },
          updateNode: (id: string, nodeUpdate: Partial<Node<NodeData>>) => {
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
              return { ...state, nodes: newNodes, workflowIsDirty: true };
            });
          },
          updateNodeData: (id: string, data: Partial<NodeData>) => {
            set({
              nodes: get().nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...data } } : n
              )
            });
          },
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
          deleteNode: (id: string) => {
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
          },
          deleteEdge: (id: string) => {
            set({ edges: get().edges.filter((e) => e.id !== id) });
          },
          addEdge: (edge: Edge) => {
            set({ edges: [...get().edges, edge] });
          },
          updateEdge: (edge: Edge) => {
            set({
              edges: [...get().edges.filter((e) => e.id !== edge.id), edge]
            });
          },
          updateEdgeHandle: (
            nodeId: string,
            oldHandle: string,
            newHandle: string
          ) => {
            set({
              edges: get().edges.map((edge) =>
                edge.target === nodeId && edge.targetHandle === oldHandle
                  ? { ...edge, targetHandle: newHandle }
                  : edge
              )
            });
          },
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
          setWorkflowDirty: (dirty: boolean) => {
            set({ workflowIsDirty: dirty });
          },
          autoLayout: async () => {
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
          setShouldAutoLayout: (value: boolean) => {
            set({ shouldAutoLayout: value });
          },
          clearMissingModels: () => {
            set({ missingModelFiles: [] });
          },
          clearMissingRepos: () => {
            set({ missingModelRepos: [] });
          },
          setShouldFitToScreen: (value: boolean) => {
            set({ shouldFitToScreen: value });
          },
          setNodes: (
            nodesOrCallback:
              | Node<NodeData>[]
              | ((nodes: Node<NodeData>[]) => Node<NodeData>[])
          ) => {
            if (typeof nodesOrCallback === "function") {
              set((state) => ({
                nodes: nodesOrCallback(state.nodes)
              }));
            } else {
              set({ nodes: nodesOrCallback });
            }
            get().setWorkflowDirty(true);
          },
          setEdges: (edges: Edge[]) => {
            set({ edges });
            get().setWorkflowDirty(true);
          },
          validateConnection: (
            connection: Connection,
            srcNode: Node<NodeData>,
            targetNode: Node<NodeData>
          ) => {
            const srcMetadata = useMetadataStore
              .getState()
              .getMetadata(srcNode.type as string);
            const targetMetadata = useMetadataStore
              .getState()
              .getMetadata(targetNode.type as string);
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
            const targetType = targetProperty?.type || {
              type: "str",
              optional: false,
              type_args: []
            };
            return (
              srcType !== undefined &&
              targetType !== undefined &&
              isConnectable(srcType, targetType)
            );
          },
          getWorkflowIsDirty: () => get().workflowIsDirty,
          workflowJSON: () => {
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
          selectAllNodes: () => {
            set({
              nodes: get().nodes.map((node) => ({
                ...node,
                selected: true
              }))
            });
          }
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
