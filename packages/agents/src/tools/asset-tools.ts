/**
 * Asset management tools for the agent system.
 *
 * Port of src/nodetool/agents/tools/asset_tools.py
 *
 * Provides:
 * - SaveAssetTool: Save text content as an asset file via storage adapter
 * - ReadAssetTool: Read content from a stored asset file
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

export class SaveAssetTool extends Tool {
  readonly name = "save_asset";
  readonly description = "Save content as an asset file";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: {
        type: "string" as const,
        description: "Name of the asset file to save",
      },
      content: {
        type: "string" as const,
        description: "Text content to save",
      },
      content_type: {
        type: "string" as const,
        description: "MIME type of the content (defaults to text/plain)",
      },
    },
    required: ["name", "content"] as string[],
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const name = params.name;
      const content = params.content;
      const contentType = params.content_type;

      if (typeof name !== "string" || !name) {
        return { success: false, error: "name is required and must be a string" };
      }
      if (typeof content !== "string") {
        return { success: false, error: "content must be a string" };
      }

      if (!context.storage) {
        return { success: false, error: "No storage adapter configured" };
      }

      const mime = typeof contentType === "string" && contentType ? contentType : "text/plain";
      const data = new TextEncoder().encode(content);
      const key = `assets/${name}`;
      const uri = await context.storage.store(key, data, mime);

      return {
        success: true,
        name,
        uri,
        content_type: mime,
        size: data.byteLength,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const name = params.name;
    if (typeof name === "string" && name) {
      const msg = `Saving asset as ${name}...`;
      return msg.length > 80 ? "Saving asset..." : msg;
    }
    return "Saving asset...";
  }
}

export class ReadAssetTool extends Tool {
  readonly name = "read_asset";
  readonly description = "Read an asset file";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: {
        type: "string" as const,
        description: "Name of the asset file to read",
      },
    },
    required: ["name"] as string[],
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const name = params.name;

      if (typeof name !== "string" || !name) {
        return { success: false, error: "name is required and must be a string" };
      }

      if (!context.storage) {
        return { success: false, error: "No storage adapter configured" };
      }

      // Build the expected URI from the asset key
      const key = `assets/${name}`;

      // Try common URI schemes that the storage adapter may use
      const schemes = [`memory://${key}`, `file://${key}`, `s3://${key}`];

      let data: Uint8Array | null = null;
      let matchedUri: string | null = null;

      // First try storing nothing - just check if we can retrieve by key directly
      for (const uri of schemes) {
        const result = await context.storage.retrieve(uri);
        if (result) {
          data = result;
          matchedUri = uri;
          break;
        }
      }

      if (!data) {
        return {
          success: false,
          error: `Asset not found: ${name}`,
        };
      }

      const content = new TextDecoder().decode(data);

      return {
        success: true,
        name,
        content,
        uri: matchedUri,
        size: data.byteLength,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const name = params.name;
    if (typeof name === "string" && name) {
      const msg = `Reading asset ${name}...`;
      return msg.length > 80 ? "Reading an asset..." : msg;
    }
    return "Reading an asset...";
  }
}
