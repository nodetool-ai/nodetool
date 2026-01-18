import { TypeMetadata } from "./ApiTypes";

/**
 * Data structure representing a node in the workflow graph.
 * 
 * Contains all runtime data for a node including its properties,
 * positioning, and state information. This is the primary data
 * structure used throughout the node editor and workflow execution.
 * 
 * @example
 * ```typescript
 * const nodeData: NodeData = {
 *   properties: { name: "Text Input", text: "Hello World" },
 *   selectable: true,
 *   workflow_id: "workflow-123",
 *   title: "Text Node",
 *   color: "#4A90D9",
 *   collapsed: false,
 *   bypassed: false
 * };
 * ```
 */
export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  dynamic_properties: any;
  dynamic_outputs?: Record<string, TypeMetadata>;
  sync_mode?: string;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
  bypassed?: boolean; // When true, node is bypassed and passes inputs through to outputs
  // Original node type from the workflow graph (useful when React Flow falls back to "default" type)
  originalType?: string;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
