/**
 * Asset management tools for the agent system.
 *
 * Port of src/nodetool/agents/tools/asset_tools.py
 *
 * Provides:
 * - SaveAssetTool: Save text or binary (base64) content as an asset.
 *   Prefers `context.createAsset` (DB + storage, returns asset:// URI) and
 *   falls back to the lower-level storage adapter for plain text/key-value.
 * - ReadAssetTool: Read content from a stored asset file.
 */

import { Buffer } from "node:buffer";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

export class SaveAssetTool extends Tool {
  readonly name = "save_asset";
  readonly description =
    "Save content as an asset. Use this for any artifact you want to surface in the chat (text reports, JSON, manifests, images, audio). Pass `content_base64` for binary data and `content` for text. Returns an asset_id and asset:// URI you can reference in later steps.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: {
        type: "string" as const,
        description:
          "Display name of the asset (e.g. 'summary.md', 'report.json', 'cover.png')."
      },
      content: {
        type: "string" as const,
        description:
          "Text content. Use this for text/markdown/JSON. Mutually exclusive with content_base64."
      },
      content_base64: {
        type: "string" as const,
        description:
          "Binary content as a base64 string. Use this for images/audio/video bytes returned by other tools."
      },
      content_type: {
        type: "string" as const,
        description:
          "MIME type (e.g. 'text/markdown', 'application/json', 'image/png'). Defaults to text/plain for text and application/octet-stream for binary."
      }
    },
    required: ["name"] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const name = params.name;
      const content = params.content;
      const contentBase64 = params.content_base64;
      const contentTypeArg = params.content_type;

      if (typeof name !== "string" || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
      }
      const hasText = typeof content === "string";
      const hasBinary = typeof contentBase64 === "string" && contentBase64;
      if (!hasText && !hasBinary) {
        return {
          success: false,
          error:
            "Either `content` (text) or `content_base64` (binary) is required"
        };
      }

      const data = hasBinary
        ? new Uint8Array(Buffer.from(contentBase64 as string, "base64"))
        : new TextEncoder().encode(content as string);
      const mime =
        typeof contentTypeArg === "string" && contentTypeArg
          ? contentTypeArg
          : hasBinary
            ? "application/octet-stream"
            : "text/plain";

      // Prefer the model interface (DB + storage). This is what the chat
      // UI surfaces in the asset browser and what other tools can reference
      // by `asset://<id>.<ext>` URIs.
      if (typeof context.createAsset === "function") {
        const asset = (await context.createAsset({
          name,
          contentType: mime,
          content: data
        })) as { id?: string };
        if (asset && typeof asset.id === "string") {
          return {
            success: true,
            name,
            asset_id: asset.id,
            asset_uri: `asset://${asset.id}`,
            content_type: mime,
            size: data.byteLength
          };
        }
      }

      // Fallback: write to the storage adapter directly.
      if (!context.storage) {
        return {
          success: false,
          error:
            "No storage adapter or createAsset interface available — cannot persist asset"
        };
      }
      const key = `assets/${name}`;
      const uri = await context.storage.store(key, data, mime);
      return {
        success: true,
        name,
        uri,
        content_type: mime,
        size: data.byteLength
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
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
        description: "Name of the asset file to read"
      }
    },
    required: ["name"] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const name = params.name;

      if (typeof name !== "string" || !name) {
        return {
          success: false,
          error: "name is required and must be a string"
        };
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
          error: `Asset not found: ${name}`
        };
      }

      const content = new TextDecoder().decode(data);

      return {
        success: true,
        name,
        content,
        uri: matchedUri,
        size: data.byteLength
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e)
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
