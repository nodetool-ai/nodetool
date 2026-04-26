/**
 * OpenAI-powered tools: web search, image generation, text-to-speech.
 *
 * Port of src/nodetool/agents/tools/openai_tools.py
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

async function getOpenAIClient() {
  // Dynamic import to avoid hard dependency
  const { OpenAI } = await import("openai");
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

export class OpenAIWebSearchTool extends Tool {
  readonly name = "openai_web_search";
  readonly description = "Search the web using OpenAI's web search API";
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
      const client = await getOpenAIClient();
      const completion = await client.chat.completions.create({
        model: "gpt-4o-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content: query }]
      });

      return {
        query,
        results: completion.choices[0]?.message?.content ?? "",
        status: "success"
      };
    } catch (e) {
      return { error: `Web search failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const query = String(params["query"] ?? "something");
    const msg = `Searching the web for '${query}' using OpenAI...`;
    return msg.length > 80 ? "Searching the web using OpenAI..." : msg;
  }
}

export class OpenAIImageGenerationTool extends Tool {
  readonly name = "openai_image_generation";
  readonly description =
    "Generate an image from a text prompt using OpenAI DALL-E";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string" as const,
        description: "A text description of the desired image."
      },
      output_file: {
        type: "string" as const,
        description: "The path to save the generated image as a PNG file."
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
      const client = await getOpenAIClient();
      const response = await client.images.generate({
        model: "gpt-image-2",
        prompt,
        n: 1
      });

      const imageData = response.data?.[0];
      if (!imageData) return { error: "No image data received from OpenAI" };

      const b64Image = imageData.b64_json as string | undefined;
      if (!b64Image) return { error: "No image data received from OpenAI" };

      const workspace = (context as unknown as Record<string, unknown>)[
        "workspace"
      ] as string | undefined;
      const filePath = workspace
        ? path.join(workspace, outputFile)
        : outputFile;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(b64Image, "base64"));

      return {
        type: "image",
        prompt,
        output_file: outputFile,
        status: "success"
      };
    } catch (e) {
      return { error: `Image generation failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const prompt = String(params["prompt"] ?? "an image");
    const msg = `Generating ${prompt} using OpenAI...`;
    return msg.length > 80 ? "Generating an image using OpenAI..." : msg;
  }
}

export class OpenAITextToSpeechTool extends Tool {
  readonly name = "openai_text_to_speech";
  readonly description = "Convert text into spoken audio using OpenAI TTS";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      input: {
        type: "string" as const,
        description: "The text to synthesize speech from (max 4096 characters)."
      },
      output_file: {
        type: "string" as const,
        description: "The path to save the generated audio as an mp3 file."
      },
      voice: {
        type: "string" as const,
        description:
          "The voice to use (e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')."
      },
      speed: {
        type: "number" as const,
        description: "The speed of the speech (0.25 to 4.0).",
        default: 1.0
      }
    },
    required: ["input", "voice", "output_file"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const textInput = params["input"];
    const voice = (params["voice"] as string | undefined) ?? "alloy";
    const speed = (params["speed"] as number | undefined) ?? 1.0;
    const outputFile = params["output_file"];

    if (typeof textInput !== "string" || !textInput)
      return { error: "Input text is required" };
    if (typeof outputFile !== "string" || !outputFile)
      return { error: "Output file is required" };
    if (textInput.length > 4096)
      return { error: "Input text exceeds maximum length of 4096 characters" };

    try {
      const client = await getOpenAIClient();
      const response = await client.audio.speech.create({
        model: "tts-1",
        voice,
        input: textInput,
        response_format: "mp3",
        speed
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      const workspace = (context as unknown as Record<string, unknown>)[
        "workspace"
      ] as string | undefined;
      const filePath = workspace
        ? path.join(workspace, outputFile)
        : outputFile;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);

      return {
        type: "audio",
        input_text: textInput,
        voice,
        model: "tts-1",
        format: "mp3",
        speed,
        output_file: outputFile,
        status: "success"
      };
    } catch (e) {
      return { error: `Text-to-speech failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const voice = String(params["voice"] ?? "a voice");
    const text = String(params["input"] ?? "some text");
    const msg = `Converting text to speech with voice ${voice}...`;
    if (text.length < 30 && msg.length + text.length + 4 < 80) {
      return `Converting '${text}' to speech with voice ${voice}...`;
    }
    return msg.length > 80 ? "Converting text to speech..." : msg;
  }
}
