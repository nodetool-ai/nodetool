/**
 * Canvas Export Tools - LLM tools for exporting designs
 */

import { FrontendToolRegistry } from "../../frontendTools";
import { useLayoutCanvasStore } from "../../../../components/design/LayoutCanvasStore";
import { ExportResponse } from "./types";
import { convertToSketch, downloadSketchFile } from "../../../../components/design/sketch";

// Helper to get store state
const getStore = () => useLayoutCanvasStore.getState();

// =============================================================================
// Export JSON
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_export_json",
  description: "Export the canvas design as JSON data. Returns the full canvas data structure.",
  parameters: {
    type: "object",
    properties: {
      pretty: {
        type: "boolean",
        description: "Format JSON with indentation for readability"
      }
    }
  },
  async execute({ pretty = true }): Promise<ExportResponse> {
    const data = getStore().canvasData;
    
    return {
      ok: true,
      message: `Exported canvas with ${data.elements.length} element(s) as JSON`,
      format: "json",
      data
    };
  }
});

// =============================================================================
// Export Sketch File
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_export_sketch",
  description: "Export the canvas design as a Sketch (.sketch) file. Initiates download in browser.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "Filename without extension (default: 'design')"
      },
      pageName: {
        type: "string",
        description: "Name for the Sketch page (default: 'Page 1')"
      }
    }
  },
  async execute({ filename = "design", pageName = "Page 1" }): Promise<ExportResponse> {
    const data = getStore().canvasData;
    
    try {
      const page = convertToSketch(data, pageName);
      await downloadSketchFile([page], `${filename}.sketch`);
      
      return {
        ok: true,
        message: `Sketch file "${filename}.sketch" exported with ${data.elements.length} element(s)`,
        format: "sketch",
        downloadInitiated: true
      };
    } catch (error) {
      return {
        ok: false,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        format: "sketch",
        downloadInitiated: false
      } as any;
    }
  }
});

// =============================================================================
// Get Export Data (without downloading)
// =============================================================================

FrontendToolRegistry.register({
  name: "ui_canvas_get_export_data",
  description: "Get canvas data in a portable format without triggering download. Useful for saving or further processing.",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["json", "minimal"],
        description: "Export format: 'json' for full data, 'minimal' for essential properties only"
      }
    }
  },
  async execute({ format = "json" }) {
    const data = getStore().canvasData;
    
    if (format === "minimal") {
      // Return minimal representation for LLM consumption
      return {
        ok: true,
        message: `Minimal export: ${data.elements.length} element(s)`,
        canvas: {
          width: data.width,
          height: data.height,
          backgroundColor: data.backgroundColor
        },
        elements: data.elements.map(el => ({
          id: el.id,
          type: el.type,
          name: el.name,
          bounds: { x: el.x, y: el.y, width: el.width, height: el.height },
          // Include key properties based on type
          ...(el.type === "text" && { 
            content: (el.properties as any).content,
            fontSize: (el.properties as any).fontSize 
          }),
          ...(el.type === "rectangle" && { 
            fillColor: (el.properties as any).fillColor,
            borderRadius: (el.properties as any).borderRadius 
          }),
          ...(el.type === "image" && { 
            source: (el.properties as any).source 
          })
        }))
      };
    }
    
    // Full JSON export
    return {
      ok: true,
      message: `Full export: ${data.elements.length} element(s)`,
      data
    };
  }
});
