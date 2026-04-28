/**
 * Google-powered tools: grounded search and image generation via Gemini API.
 *
 * Port of src/nodetool/agents/tools/google_tools.py
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getGeminiApiKey(): string {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

export class GoogleGroundedSearchTool extends Tool {
  readonly name = "google_grounded_search";
  readonly description =
    "Search the web using Google's Gemini API with grounding capabilities";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "The search query to execute"
      }
    },
    required: ["query"]
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const query = params["query"];
    if (typeof query !== "string" || !query) {
      return { error: "Search query is required" };
    }

    try {
      const apiKey = getGeminiApiKey();
      const url = `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseModalities: ["TEXT"] }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        return {
          error: `Gemini API error: ${response.status} ${response.statusText}`
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const candidates = data["candidates"] as
        | Array<Record<string, unknown>>
        | undefined;

      if (!candidates?.length) {
        return { error: "No response received from Gemini API" };
      }

      const candidate = candidates[0];
      const content = candidate["content"] as
        | Record<string, unknown>
        | undefined;
      const parts = content?.["parts"] as
        | Array<Record<string, unknown>>
        | undefined;

      // Extract text results
      const results: string[] = [];
      if (parts) {
        for (const part of parts) {
          if (typeof part["text"] === "string") {
            results.push(part["text"]);
          }
        }
      }

      // Extract grounding metadata / sources
      const groundingMetadata = candidate["groundingMetadata"] as
        | Record<string, unknown>
        | undefined;
      const sources: Array<{ title: string; url: string }> = [];

      if (groundingMetadata) {
        const chunks = groundingMetadata["groundingChunks"] as
          | Array<Record<string, unknown>>
          | undefined;
        if (chunks) {
          for (const chunk of chunks) {
            const web = chunk["web"] as Record<string, unknown> | undefined;
            if (web?.["uri"]) {
              sources.push({
                title: String(web["title"] ?? "Unknown Source"),
                url: String(web["uri"])
              });
            }
          }
        }
      }

      return {
        query,
        results,
        sources,
        status: "success"
      };
    } catch (e) {
      return { error: `Google grounded search failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const query = String(params["query"] ?? "something");
    const msg = `Searching Google (grounded) for '${query}'...`;
    return msg.length > 80 ? "Searching Google (grounded)..." : msg;
  }
}

export class GoogleImageGenerationTool extends Tool {
  readonly name = "google_image_generation";
  readonly description =
    "Generate images based on a text prompt using Google's Gemini/Imagen API";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string" as const,
        description: "The text prompt describing the image to generate"
      },
      output_file: {
        type: "string" as const,
        description: "The path to save the generated image as a PNG file"
      }
    },
    required: ["prompt", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const prompt = params["prompt"];
    const outputFile = params["output_file"];

    if (typeof prompt !== "string" || !prompt)
      return { error: "Image generation prompt is required" };
    if (typeof outputFile !== "string" || !outputFile)
      return { error: "Output file is required" };

    try {
      const apiKey = getGeminiApiKey();
      // Use Imagen 3 REST API
      const url = `${GEMINI_API_BASE}/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

      const body = {
        instances: [{ prompt }],
        parameters: { sampleCount: 1 }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        return { error: `Gemini API error: ${response.status} - ${errText}` };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const predictions = data["predictions"] as
        | Array<Record<string, unknown>>
        | undefined;

      if (!predictions?.length) {
        return { error: "No images generated" };
      }

      const imageB64 = predictions[0]["bytesBase64Encoded"] as
        | string
        | undefined;
      if (!imageB64) return { error: "No image bytes found in response" };

      const imageBuffer = Buffer.from(imageB64, "base64");
      const workspace = (context as unknown as Record<string, unknown>)[
        "workspaceDir"
      ] as string | undefined;
      const filePath = workspace
        ? path.join(workspace, outputFile)
        : outputFile;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, imageBuffer);

      return {
        type: "image",
        prompt,
        output_file: outputFile,
        status: "success"
      };
    } catch (e) {
      return { error: `Google image generation failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const prompt = String(params["prompt"] ?? "an image");
    const msg = `Generating image '${prompt}' using Google...`;
    return msg.length > 80 ? "Generating an image using Google..." : msg;
  }
}
