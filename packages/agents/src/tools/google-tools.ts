/**
 * Google-powered tools: grounded search and image generation via Gemini API.
 *
 * Port of src/nodetool/agents/tools/google_tools.py
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { persistBinaryOutput } from "./binary-output.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function getGeminiApiKey(context?: ProcessingContext): Promise<string> {
  // Prefer the context's secretResolver (encrypted DB) over env vars so the
  // chat-cli + agent picks up keys configured via `nodetool secrets store`.
  const fromCtx =
    typeof context?.getSecret === "function"
      ? await context.getSecret("GEMINI_API_KEY")
      : null;
  const key = fromCtx ?? process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

export class GoogleGroundedSearchTool extends Tool {
  readonly name = "google_grounded_search";
  readonly description =
    "Search the web using Google's Gemini API with grounding capabilities";
  readonly jsonSchema = {
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
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const query = params["query"];
    if (typeof query !== "string" || !query) {
      return { error: "Search query is required" };
    }

    try {
      const apiKey = await getGeminiApiKey(context);
      const url = `${GEMINI_API_BASE}/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

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

      const results: string[] = [];
      if (parts) {
        for (const part of parts) {
          if (typeof part["text"] === "string") {
            results.push(part["text"]);
          }
        }
      }

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
    "Generate images based on a text prompt using Google's Gemini/Imagen API. " +
    "The result includes `display_markdown` — a ready-to-paste markdown image " +
    "embed pointing at a UI-fetchable URL. When narrating the result to the " +
    "user, include `display_markdown` verbatim; never construct your own " +
    "markdown from `output_file` (a workspace key, not a URL).";
  readonly jsonSchema = {
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
      const apiKey = await getGeminiApiKey(context);
      const url = `${GEMINI_API_BASE}/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] }
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
      const candidates = data["candidates"] as
        | Array<Record<string, unknown>>
        | undefined;

      if (!candidates?.length) {
        return { error: "No images generated" };
      }

      const content = candidates[0]["content"] as
        | Record<string, unknown>
        | undefined;
      const parts = content?.["parts"] as
        | Array<Record<string, unknown>>
        | undefined;
      const imagePart = parts?.find((part) => {
        const inlineData = part["inlineData"] as
          | Record<string, unknown>
          | undefined;
        return typeof inlineData?.["data"] === "string";
      });
      const inlineData = imagePart?.["inlineData"] as
        | Record<string, unknown>
        | undefined;
      const imageB64 = inlineData?.["data"] as string | undefined;
      if (!imageB64) return { error: "No image bytes found in response" };

      const bytes = Uint8Array.from(Buffer.from(imageB64, "base64"));
      const persisted = await persistBinaryOutput(context, bytes, {
        outputFile,
        contentType:
          typeof inlineData?.["mimeType"] === "string"
            ? inlineData["mimeType"]
            : "image/png",
        uiPrefix: "gemini-images"
      });

      return {
        type: "image",
        prompt,
        ...persisted,
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
