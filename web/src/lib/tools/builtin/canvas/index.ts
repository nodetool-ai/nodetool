/**
 * LLM Canvas Design Tools
 * 
 * A comprehensive set of tools for LLM agents to create and manipulate
 * design elements on a canvas. Compatible with Sketch file format.
 * 
 * Tool Categories:
 * - Creation: Create artboards, shapes, text, images, lines, groups
 * - Manipulation: Update, move, resize, style, delete, duplicate elements
 * - Layout: Align, distribute, tidy, set spacing, layer ordering
 * - Query: Get state, find elements, inspect properties
 * - Export: JSON export, Sketch file export
 * 
 * Usage:
 * Tools are automatically registered with FrontendToolRegistry when this
 * module is imported. LLM agents can call them via the standard tool
 * execution interface.
 * 
 * @example
 * // Import to register all canvas tools
 * import "@/lib/tools/builtin/canvas";
 * 
 * // Tools are now available to LLM agents:
 * // - ui_canvas_create_artboard
 * // - ui_canvas_create_rectangle
 * // - ui_canvas_create_text
 * // - etc.
 */

// Register all tool modules
import "./createTools";
import "./manipulateTools";
import "./layoutTools";
import "./queryTools";
import "./exportTools";

// Export types for consumers
export * from "./types";

/**
 * List of all registered canvas tools
 * 
 * Creation Tools:
 * - ui_canvas_create_artboard: Initialize canvas/artboard
 * - ui_canvas_create_rectangle: Create rectangle element
 * - ui_canvas_create_ellipse: Create ellipse/circle element
 * - ui_canvas_create_text: Create text element
 * - ui_canvas_create_image: Create image element
 * - ui_canvas_create_line: Create line element
 * - ui_canvas_create_group: Group elements together
 * 
 * Manipulation Tools:
 * - ui_canvas_update_element: Update element properties
 * - ui_canvas_move_element: Move element position
 * - ui_canvas_resize_element: Resize element dimensions
 * - ui_canvas_apply_style: Apply styling (fill, stroke, shadow, etc.)
 * - ui_canvas_delete_elements: Delete elements
 * - ui_canvas_duplicate_elements: Duplicate elements
 * - ui_canvas_set_text: Update text content
 * - ui_canvas_set_image: Update image source
 * - ui_canvas_select: Select elements
 * 
 * Layout Tools:
 * - ui_canvas_align_elements: Align elements
 * - ui_canvas_distribute_elements: Distribute elements evenly
 * - ui_canvas_tidy_elements: Arrange into grid
 * - ui_canvas_set_spacing: Set precise spacing
 * - ui_canvas_bring_to_front: Bring to front (z-order)
 * - ui_canvas_send_to_back: Send to back (z-order)
 * - ui_canvas_bring_forward: Bring forward one level
 * - ui_canvas_send_backward: Send backward one level
 * 
 * Query Tools:
 * - ui_canvas_get_state: Get full canvas state
 * - ui_canvas_get_element: Get element by ID
 * - ui_canvas_list_elements: List/filter elements
 * - ui_canvas_get_selection: Get selected elements
 * - ui_canvas_find_at_position: Find elements at position
 * - ui_canvas_get_bounds: Calculate element bounds
 * - ui_canvas_get_dimensions: Get canvas size
 * 
 * Export Tools:
 * - ui_canvas_export_json: Export as JSON
 * - ui_canvas_export_sketch: Export as .sketch file
 * - ui_canvas_get_export_data: Get export data without download
 */
export const CANVAS_TOOLS = [
  // Creation
  "ui_canvas_create_artboard",
  "ui_canvas_create_rectangle",
  "ui_canvas_create_ellipse",
  "ui_canvas_create_text",
  "ui_canvas_create_image",
  "ui_canvas_create_line",
  "ui_canvas_create_group",
  // Manipulation
  "ui_canvas_update_element",
  "ui_canvas_move_element",
  "ui_canvas_resize_element",
  "ui_canvas_apply_style",
  "ui_canvas_delete_elements",
  "ui_canvas_duplicate_elements",
  "ui_canvas_set_text",
  "ui_canvas_set_image",
  "ui_canvas_select",
  // Layout
  "ui_canvas_align_elements",
  "ui_canvas_distribute_elements",
  "ui_canvas_tidy_elements",
  "ui_canvas_set_spacing",
  "ui_canvas_bring_to_front",
  "ui_canvas_send_to_back",
  "ui_canvas_bring_forward",
  "ui_canvas_send_backward",
  // Query
  "ui_canvas_get_state",
  "ui_canvas_get_element",
  "ui_canvas_list_elements",
  "ui_canvas_get_selection",
  "ui_canvas_find_at_position",
  "ui_canvas_get_bounds",
  "ui_canvas_get_dimensions",
  // Export
  "ui_canvas_export_json",
  "ui_canvas_export_sketch",
  "ui_canvas_get_export_data"
] as const;

export type CanvasToolName = typeof CANVAS_TOOLS[number];
