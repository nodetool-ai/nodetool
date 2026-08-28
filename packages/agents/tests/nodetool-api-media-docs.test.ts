/**
 * `nodetool.media` judging + `nodetool.documents` conversion — code actions run
 * in the real QuickJS sandbox against a fake chat tool router. No network, no
 * model, no pandoc.
 */
import { Buffer } from "node:buffer";
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { buildNodetoolApiPromptSection } from "../src/codeact/nodetool-api.js";
import { createMockContext } from "./_helpers/mock-context.js";

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

const CRITIQUE_TOOLS = [
  "find_model",
  "generate_image",
  "critique_image",
  "compare_images",
  "score_image_adherence",
  "understand_video"
].map(toolDef);

const PIPELINE_TOOLS = ["generate_image"].map(toolDef);

/** 1×1 red PNG — valid input for `image.adjust`. */
const RED_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const DOCUMENT_TOOLS = [
  "convert_document",
  "extract_pdf_text",
  "extract_pdf_tables",
  "convert_markdown_to_pdf",
  "convert_pdf_to_markdown"
].map(toolDef);

function createFakeRouter(opts: { imageBytes?: "tiny" | "png" } = {}) {
  const calls: ChatCodeActToolCall[] = [];
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    const args = call.args;
    switch (call.name) {
      case "find_model":
        return JSON.stringify({
          capability: args["capability"],
          total: 1,
          results: [
            { provider: "openai", model_id: "gpt-5.4-mini", name: "mini" }
          ]
        });
      case "generate_image":
        // The shape a real generation returns: an asset URI and id, plus a
        // host `uri` the guest may not read.
        return JSON.stringify({
          type: "image",
          asset_id: "img1",
          asset_uri: "asset://img1.png",
          url: "asset://img1",
          uri: "file:///var/assets/img1.png"
        });
      case "read_media_bytes": {
        if (args["uri"] !== "asset://img1.png") {
          return JSON.stringify({ error: `Could not read ${String(args["uri"])}` });
        }
        const content_base64 =
          opts.imageBytes === "png" ? RED_PNG_B64 : "AQID";
        return JSON.stringify({
          uri: args["uri"],
          size: Buffer.from(content_base64, "base64").length,
          mime_type: "image/png",
          content_base64
        });
      }
      case "save_asset":
        return JSON.stringify({
          success: true,
          name: args["name"],
          asset_id: "grey1",
          asset_uri: "asset://grey1.png",
          content_type: args["content_type"] ?? "image/png",
          size: 12
        });
      case "critique_image":
        return JSON.stringify({
          type: "critique",
          verdict: "revise",
          defects: [{ defect: "six fingers", location: "left hand", fix: "..." }],
          strengths: []
        });
      case "compare_images":
        return JSON.stringify({
          type: "comparison",
          winner: args["images"] ? (args["images"] as string[])[1] : null,
          matches: []
        });
      case "understand_video":
        return JSON.stringify({
          text: "A fox crosses a snowfield.",
          provider: args["provider"],
          model: args["model"]
        });
      case "score_image_adherence":
        return JSON.stringify({
          type: "adherence",
          score: 0.75,
          passed: 3,
          total: 4
        });
      case "extract_pdf_text":
        return JSON.stringify({ text: "page one\npage two" });
      case "extract_pdf_tables":
      case "convert_document":
      case "convert_markdown_to_pdf":
      case "convert_pdf_to_markdown":
        return JSON.stringify({ output_file: args["output_file"] });
      default:
        return JSON.stringify({ error: `Unknown tool ${call.name}` });
    }
  };
  return { executeTool, calls };
}

function makeSession(
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  executeTool: (call: ChatCodeActToolCall) => Promise<unknown>,
  context: ProcessingContext = createMockContext() as unknown as ProcessingContext
) {
  return createChatCodeActSession({
    tools,
    executeTool,
    context
  });
}

function pipelineContext(): ProcessingContext {
  const png = Buffer.from(RED_PNG_B64, "base64");
  const ctx = createMockContext() as unknown as ProcessingContext & {
    resolveAssetBytes: (uri: string) => Promise<{ bytes: Uint8Array | null }>;
    hasModelInterface: (name: string) => boolean;
    createAsset: (args: unknown) => Promise<{ id: string }>;
  };
  ctx.resolveAssetBytes = async (uri: string) =>
    uri.includes("img1")
      ? { bytes: png }
      : { bytes: null };
  ctx.hasModelInterface = (name: string) => name === "createAsset";
  ctx.createAsset = async () => ({ id: "grey1" });
  return ctx;
}

async function runAction(
  session: ReturnType<typeof createChatCodeActSession>,
  code: string
) {
  const observation = await session.executeAction({ code });
  return JSON.parse(observation) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("nodetool.media judging", () => {
  it("critiques an image with the judge's own vision model", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(CRITIQUE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const judge = await nodetool.models.pick("generate_message");
       const c = await nodetool.media.critique("asset://img1.png", "a fox in snow",
         judge, { taste_profile: "muted palettes" });
       return c.verdict;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("revise");
    expect(calls[1]).toMatchObject({
      name: "critique_image",
      args: {
        provider: "openai",
        model: "gpt-5.4-mini",
        image: "asset://img1.png",
        brief: "a fox in snow",
        taste_profile: "muted palettes"
      }
    });
  });

  it("compares candidates as an images array", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(CRITIQUE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const r = await nodetool.media.compare(["a.png", "b.png"], "a fox",
         "openai/gpt-5.4-mini");
       return r.winner;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("b.png");
    expect(calls[0]).toMatchObject({
      name: "compare_images",
      args: {
        provider: "openai",
        model: "gpt-5.4-mini",
        images: ["a.png", "b.png"],
        brief: "a fox"
      }
    });
  });

  it("reads a video with a multimodal model", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(CRITIQUE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const r = await nodetool.media.understandVideo("asset://clip1.mp4",
         "What happens?", "gemini/gemini-3-pro", { max_tokens: 400 });
       return r.text;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("A fox crosses a snowfield.");
    expect(calls[0]).toMatchObject({
      name: "understand_video",
      args: {
        provider: "gemini",
        model: "gemini-3-pro",
        video: "asset://clip1.mp4",
        prompt: "What happens?",
        max_tokens: 400
      }
    });
  });

  it("scores adherence, passing explicit questions through", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(CRITIQUE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const r = await nodetool.media.scoreAdherence("asset://img1.png",
         "a red fox", "openai/gpt-5.4-mini", { questions: ["Is the fox red?"] });
       return r.score;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe(0.75);
    expect(calls[0]).toMatchObject({
      name: "score_image_adherence",
      args: {
        provider: "openai",
        model: "gpt-5.4-mini",
        image: "asset://img1.png",
        brief: "a red fox",
        questions: ["Is the fox red?"]
      }
    });
  });

  it("still demands a model reference for the judge", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession(CRITIQUE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.media.critique("a.png", "a fox");
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("nodetool.models.pick");
  });
});

describe("generate → image.adjust → nodetool.media.toImage", () => {
  it("feeds a generation result into image.adjust and saves the handle", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(PIPELINE_TOOLS, executeTool, pipelineContext());
    const obs = await runAction(
      session,
      `const img = await nodetool.media.generateImage(
         "a clockmaker", { provider: "fal_ai", model_id: "fal-ai/flux/schnell" });
       const grey = await image.adjust(img, { grayscale: true });
       const saved = await nodetool.media.toImage(grey);
       let bytes = "none";
       try {
         await nodetool.media.bytes(grey);
         bytes = "returned";
       } catch (e) { bytes = e.message; }
       return { uri: saved.asset_uri, handle: grey.uri, bytes: bytes };`
    );
    expect(obs.ok).toBe(true);
    // There is no way to pull the bytes into the guest: they stay host-side
    // and the guest only ever sees the handle. The namespace guard answers for
    // the method that is not there, so the refusal names `nodetool.media`
    // rather than arriving as `TypeError: not a function`.
    expect(obs.result).toMatchObject({ uri: "asset://grey1.png" });
    const bytes = String((obs.result as { bytes?: string }).bytes);
    expect(bytes).toContain("nodetool.media.bytes does not exist");
    expect(bytes).not.toContain("not a function");
    expect(String((obs.result as { handle?: string }).handle)).toMatch(
      /^sandbox:\/\/media\//
    );
    expect(calls.map((c) => c.name)).toEqual(["generate_image"]);
  });
});

describe("nodetool.documents", () => {
  it("converts between formats through pandoc's arg names", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(DOCUMENT_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const r = await nodetool.documents.convert("notes.md", "notes.docx", {
         from_format: "markdown", to_format: "docx"
       });
       return r.output_file;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("notes.docx");
    expect(calls[0]).toMatchObject({
      name: "convert_document",
      args: {
        input_file: "notes.md",
        output_file: "notes.docx",
        from_format: "markdown",
        to_format: "docx"
      }
    });
  });

  it("extracts text and tables under the PDF tools' `path` argument", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(DOCUMENT_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const text = await nodetool.documents.extractText("report.pdf", {
         start_page: 1, end_page: 3
       });
       await nodetool.documents.extractTables("report.pdf", "tables.json");
       return text.text;`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("page one");
    expect(calls[0]).toMatchObject({
      name: "extract_pdf_text",
      args: { path: "report.pdf", start_page: 1, end_page: 3 }
    });
    expect(calls[1]).toMatchObject({
      name: "extract_pdf_tables",
      args: { path: "report.pdf", output_file: "tables.json" }
    });
  });

  it("round-trips markdown and PDF", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(DOCUMENT_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.documents.markdownToPdf("notes.md", "notes.pdf");
       await nodetool.documents.pdfToMarkdown("notes.pdf", "back.md");
       return "done";`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "convert_markdown_to_pdf",
      args: { input_file: "notes.md", output_file: "notes.pdf" }
    });
    expect(calls[1]).toMatchObject({
      name: "convert_pdf_to_markdown",
      args: { input_file: "notes.pdf", output_file: "back.md" }
    });
  });

  it("throws a named error when a backing tool is absent", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession([toolDef("convert_document")], executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.documents.extractText("report.pdf");
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain('"extract_pdf_text"');
    expect(String(obs.result)).toContain("not in this toolbelt");
  });

  it("documents both namespaces only when the belt can serve them", () => {
    const section = buildNodetoolApiPromptSection([
      "critique_image",
      "convert_document"
    ]);
    expect(section).toContain("nodetool.media");
    expect(section).toContain("nodetool.documents");
    expect(section).toContain("scoreAdherence(");
    expect(section).toContain("understandVideo(");
    expect(section).toContain("pdfToMarkdown(");
    expect(buildNodetoolApiPromptSection(["web_search"])).not.toContain(
      "nodetool.documents"
    );
  });

  it("tells the action to record generation results via thread memory", () => {
    const section = buildNodetoolApiPromptSection([
      "find_model",
      "generate_image"
    ]);
    expect(section).toContain("Hold each result in a local variable");
    expect(section).toContain(
      "never re-run generation for something already saved"
    );
    expect(section).toContain(
      "record the uris a later action or turn will need"
    );
    expect(section).toContain("await nodetool.memory.save(uris.join(");
    expect(section).not.toContain("`state`");
  });
});
