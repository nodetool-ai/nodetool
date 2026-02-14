/**
 * ComfyUI Workflow Converter
 * 
 * Converts between ComfyUI workflow format and NodeTool graph format.
 */

import {
  ComfyUIWorkflow,
  ComfyUINode,
  ComfyUILink,
  ComfyUIPrompt
} from "../services/ComfyUIService";
import { Graph, Node as GraphNode, Edge as GraphEdge } from "../stores/ApiTypes";
import log from "loglevel";

/**
 * Convert ComfyUI workflow to NodeTool graph
 */
export function comfyWorkflowToNodeToolGraph(
  comfyWorkflow: ComfyUIWorkflow
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Create a mapping of link IDs to their details
  const linkMap = new Map<number, ComfyUILink>();
  comfyWorkflow.links.forEach((link) => {
    linkMap.set(link.id, link);
  });

  // Convert nodes
  comfyWorkflow.nodes.forEach((comfyNode) => {
    const nodeToolNode = comfyNodeToNodeToolNode(comfyNode);
    nodes.push(nodeToolNode);
  });

  // Convert links to edges
  comfyWorkflow.links.forEach((link) => {
    const edge = comfyLinkToNodeToolEdge(link);
    edges.push(edge);
  });

  return {
    nodes,
    edges
  };
}

/**
 * Convert a single ComfyUI node to NodeTool node
 */
function comfyNodeToNodeToolNode(comfyNode: ComfyUINode): GraphNode {
  // Map ComfyUI node type to NodeTool node type with comfy prefix
  const nodeType = `comfy.${comfyNode.type}`;

  // Extract properties from widgets_values
  const properties: Record<string, any> = { ...comfyNode.properties };
  
  // Store widget values if present
  if (comfyNode.widgets_values) {
    properties._comfy_widgets = comfyNode.widgets_values;
  }

  // Create NodeTool node
  const nodeToolNode: GraphNode = {
    id: String(comfyNode.id),
    type: nodeType,
    data: properties,
    sync_mode: "on_any",
    ui_properties: {
      position: {
        x: comfyNode.pos[0],
        y: comfyNode.pos[1]
      },
      size: {
        width: comfyNode.size[0],
        height: comfyNode.size[1]
      },
      selected: false,
      selectable: true,
      draggable: true
    }
  };

  // Store original ComfyUI metadata
  const data = nodeToolNode.data as Record<string, any>;
  if (!data._comfy_metadata) {
    data._comfy_metadata = {
      original_type: comfyNode.type,
      order: comfyNode.order,
      mode: comfyNode.mode,
      flags: comfyNode.flags
    };
  }

  return nodeToolNode;
}

/**
 * Convert a ComfyUI link to NodeTool edge
 */
function comfyLinkToNodeToolEdge(link: ComfyUILink): GraphEdge {
  return {
    source: String(link.origin_id),
    target: String(link.target_id),
    sourceHandle: `output_${link.origin_slot}`,
    targetHandle: `input_${link.target_slot}`
  };
}

/**
 * Convert NodeTool graph to ComfyUI workflow
 */
export function nodeToolGraphToComfyWorkflow(
  graph: Graph,
  existingWorkflow?: ComfyUIWorkflow
): ComfyUIWorkflow {
  const nodes: ComfyUINode[] = [];
  const links: ComfyUILink[] = [];

  // Track max IDs for new nodes/links
  let maxNodeId = 0;
  let maxLinkId = 0;

  if (existingWorkflow) {
    maxNodeId = existingWorkflow.last_node_id || 0;
    maxLinkId = existingWorkflow.last_link_id || 0;
  }

  // Convert nodes
  graph.nodes.forEach((nodeToolNode) => {
    const nodeId = parseInt(nodeToolNode.id, 10);
    if (nodeId > maxNodeId) {
      maxNodeId = nodeId;
    }

    const comfyNode = nodeToolNodeToComfyNode(nodeToolNode);
    nodes.push(comfyNode);
  });

  // Convert edges to links
  graph.edges.forEach((edge, index) => {
    const linkId = maxLinkId + index + 1;
    const link = nodeToolEdgeToComfyLink(edge, linkId);
    links.push(link);
  });

  maxLinkId += graph.edges.length;

  return {
    last_node_id: maxNodeId,
    last_link_id: maxLinkId,
    nodes,
    links,
    groups: existingWorkflow?.groups || [],
    config: existingWorkflow?.config || {},
    extra: existingWorkflow?.extra || {},
    version: existingWorkflow?.version || 0.4
  };
}

/**
 * Convert NodeTool node to ComfyUI node
 */
function nodeToolNodeToComfyNode(nodeToolNode: GraphNode): ComfyUINode {
  // Extract original ComfyUI type from node type (remove "comfy." prefix)
  const comfyType = nodeToolNode.type.startsWith("comfy.")
    ? nodeToolNode.type.substring(6)
    : nodeToolNode.type;

  // Get data as Record
  const data = (nodeToolNode.data || {}) as Record<string, any>;
  
  // Get metadata if available
  const metadata = data._comfy_metadata || {};

  // Get position and size from ui_properties
  const uiProps = (nodeToolNode.ui_properties || {}) as Record<string, any>;
  const position = uiProps.position || {};
  const size = uiProps.size || {};
  
  const pos: [number, number] = [
    position.x || 0,
    position.y || 0
  ];

  const sizeArray: [number, number] = [
    size.width || 210,
    size.height || 80
  ];

  // Extract properties, excluding internal metadata fields
  const properties: Record<string, any> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith("_comfy")) {
      properties[key] = value;
    }
  });

  const comfyNode: ComfyUINode = {
    id: parseInt(nodeToolNode.id, 10),
    type: comfyType,
    pos,
    size: sizeArray,
    flags: metadata.flags || {},
    order: metadata.order || 0,
    mode: metadata.mode || 0,
    properties,
    widgets_values: data._comfy_widgets || []
  };

  return comfyNode;
}

/**
 * Convert NodeTool edge to ComfyUI link
 */
function nodeToolEdgeToComfyLink(edge: GraphEdge, linkId: number): ComfyUILink {
  // Parse slot indices from handle names
  const sourceSlot = edge.sourceHandle
    ? parseInt(edge.sourceHandle.replace("output_", ""), 10)
    : 0;
  const targetSlot = edge.targetHandle
    ? parseInt(edge.targetHandle.replace("input_", ""), 10)
    : 0;

  return {
    id: linkId,
    origin_id: parseInt(edge.source, 10),
    origin_slot: sourceSlot,
    target_id: parseInt(edge.target, 10),
    target_slot: targetSlot,
    type: "*" // ComfyUI uses "*" for generic type
  };
}

/**
 * Convert NodeTool graph to ComfyUI prompt format (for execution)
 */
export function nodeToolGraphToComfyPrompt(graph: Graph): ComfyUIPrompt {
  const prompt: ComfyUIPrompt = {};

  graph.nodes.forEach((node) => {
    // Skip if not a ComfyUI node
    if (!node.type.startsWith("comfy.")) {
      log.warn(`Skipping non-ComfyUI node: ${node.type}`);
      return;
    }

    // Extract class type (remove "comfy." prefix)
    const classType = node.type.substring(6);

    // Build inputs from node data and edges
    const inputs: Record<string, any> = {};

    // Get node data as Record
    const data = (node.data || {}) as Record<string, any>;

    // Add properties as inputs
    Object.entries(data).forEach(([key, value]) => {
      // Skip internal metadata fields
      if (!key.startsWith("_comfy")) {
        inputs[key] = value;
      }
    });

    // Add connected inputs from edges
    graph.edges.forEach((edge) => {
      if (edge.target === node.id && edge.targetHandle) {
        // Parse input name from handle
        const inputName = edge.targetHandle.replace("input_", "");
        const sourceNodeId = edge.source;
        const outputSlot = edge.sourceHandle
          ? parseInt(edge.sourceHandle.replace("output_", ""), 10)
          : 0;

        // ComfyUI format for connected inputs: [source_node_id, output_slot]
        inputs[inputName] = [sourceNodeId, outputSlot];
      }
    });

    prompt[node.id] = {
      inputs,
      class_type: classType
    };
  });

  return prompt;
}

/**
 * Check if a node type is a ComfyUI node
 */
export function isComfyUINode(nodeType: string): boolean {
  return nodeType.startsWith("comfy.");
}

/**
 * Check if a graph contains any ComfyUI nodes
 */
export function graphHasComfyUINodes(graph: Graph): boolean {
  return graph.nodes.some((node) => isComfyUINode(node.type));
}
