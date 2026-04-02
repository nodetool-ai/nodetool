import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeExecuteBashTool,
  makeSetOutputTool
} from "../src/nodes/tool-agents.js";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  ShellAgentNode,
  BrowserAgentNode,
  SQLiteAgentNode,
  SupabaseAgentNode,
  DocumentAgentNode,
  DocxAgentNode,
  EmailAgentNode,
  FfmpegAgentNode,
  FilesystemAgentNode,
  GitAgentNode,
  HtmlAgentNode,
  HttpApiAgentNode,
  ImageAgentNode,
  MediaAgentNode,
  PdfLibAgentNode,
  PptxAgentNode,
  SpreadsheetAgentNode,
  VectorStoreAgentNode,
  YtDlpDownloaderAgentNode,
  TOOL_AGENT_NODES
} from "../src/nodes/tool-agents.js";

describe("Tool agent node registration", () => {
  it("exports 19 tool agent nodes", () => {
    expect(TOOL_AGENT_NODES.length).toBe(19);
  });
});

const skillClasses = [
  {
    cls: ShellAgentNode,
    type: "nodetool.agents.ShellAgent",
    title: "Shell Agent"
  },
  {
    cls: BrowserAgentNode,
    type: "nodetool.agents.BrowserAgent",
    title: "Browser Agent"
  },
  {
    cls: SQLiteAgentNode,
    type: "nodetool.agents.SQLiteAgent",
    title: "SQLite Agent"
  },
  {
    cls: SupabaseAgentNode,
    type: "nodetool.agents.SupabaseAgent",
    title: "Supabase Agent"
  },
  {
    cls: DocumentAgentNode,
    type: "nodetool.agents.DocumentAgent",
    title: "Document Agent"
  },
  {
    cls: DocxAgentNode,
    type: "nodetool.agents.DocxAgent",
    title: "DOCX Agent"
  },
  {
    cls: EmailAgentNode,
    type: "nodetool.agents.EmailAgent",
    title: "Email Agent"
  },
  {
    cls: FfmpegAgentNode,
    type: "nodetool.agents.FfmpegAgent",
    title: "FFmpeg Agent"
  },
  {
    cls: FilesystemAgentNode,
    type: "nodetool.agents.FilesystemAgent",
    title: "Filesystem Agent"
  },
  { cls: GitAgentNode, type: "nodetool.agents.GitAgent", title: "Git Agent" },
  {
    cls: HtmlAgentNode,
    type: "nodetool.agents.HtmlAgent",
    title: "HTML Agent"
  },
  {
    cls: HttpApiAgentNode,
    type: "nodetool.agents.HttpApiAgent",
    title: "HTTP API Agent"
  },
  {
    cls: ImageAgentNode,
    type: "nodetool.agents.ImageAgent",
    title: "Image Agent"
  },
  {
    cls: MediaAgentNode,
    type: "nodetool.agents.MediaAgent",
    title: "Media Agent"
  },
  {
    cls: PdfLibAgentNode,
    type: "nodetool.agents.PdfLibAgent",
    title: "PDF-lib Agent"
  },
  {
    cls: PptxAgentNode,
    type: "nodetool.agents.PptxAgent",
    title: "PPTX Agent"
  },
  {
    cls: SpreadsheetAgentNode,
    type: "nodetool.agents.SpreadsheetAgent",
    title: "Spreadsheet Agent"
  },
  {
    cls: VectorStoreAgentNode,
    type: "nodetool.agents.VectorStoreAgent",
    title: "Vector Store Agent"
  },
  {
    cls: YtDlpDownloaderAgentNode,
    type: "nodetool.agents.YtDlpDownloaderAgent",
    title: "yt-dlp Downloader Agent"
  }
];

describe.each(skillClasses)("$title", ({ cls, type, title }) => {
  it(`has nodeType ${type}`, () => {
    expect((cls as any).nodeType).toBe(type);
  });

  it(`has title "${title}"`, () => {
    expect((cls as any).title).toBe(title);
  });

  it("has defaults with model and prompt", () => {
    const node = new (cls as any)();
    const d = node.serialize();
    expect(d).toHaveProperty("model");
    expect(d).toHaveProperty("prompt");
    expect(d).toHaveProperty("timeout_seconds");
  });

  it("process throws when prompt is empty", async () => {
    const node = new (cls as any)();
    await expect(node.process({})).rejects.toThrow();
  });
});

// Specific defaults overrides
describe("Agent-specific defaults", () => {
  it("BrowserAgentNode has timeout_seconds 150", () => {
    const node = new BrowserAgentNode();
    expect(node.serialize().timeout_seconds).toBe(150);
  });

  it("SQLiteAgentNode has db_path", () => {
    const node = new SQLiteAgentNode();
    const d = node.serialize();
    expect(d.db_path).toBe("memory.db");
    expect(d.allow_mutation).toBe(false);
  });

  it("FfmpegAgentNode has audio/video refs", () => {
    const node = new FfmpegAgentNode();
    const d = node.serialize();
    expect(d.audio).toHaveProperty("type", "audio");
    expect(d.video).toHaveProperty("type", "video");
  });

  it("ImageAgentNode has image ref and timeout 90", () => {
    const node = new ImageAgentNode();
    const d = node.serialize();
    expect(d.image).toHaveProperty("type", "image");
    expect(d.timeout_seconds).toBe(90);
  });

  it("YtDlpDownloaderAgentNode has url and output_dir", () => {
    const node = new YtDlpDownloaderAgentNode();
    const d = node.serialize();
    expect(d.url).toBe("");
    expect(d.output_dir).toBe("downloads/yt-dlp");
    expect(d.timeout_seconds).toBe(300);
  });

  it("PdfLibAgentNode has document ref", () => {
    const node = new PdfLibAgentNode();
    const d = node.serialize();
    expect(d.document).toHaveProperty("type", "document");
  });

  it("DocxAgentNode has timeout 300", () => {
    const node = new DocxAgentNode();
    expect(node.serialize().timeout_seconds).toBe(300);
  });

  it("HtmlAgentNode has max_output_chars 180000", () => {
    const node = new HtmlAgentNode();
    expect(node.serialize().max_output_chars).toBe(180000);
  });
});

describe("makeExecuteBashTool", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await realpath(
      await mkdtemp(path.join(tmpdir(), "skill-test-"))
    );
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("executes command and returns stdout", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = await tool.process!({} as any, { command: "echo hello" });
    expect(result).toMatchObject({ success: true, stdout: "hello\n" });
  });

  it("returns error for failing command", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = await tool.process!({} as any, { command: "exit 1" });
    expect(result).toMatchObject({ success: false });
  });

  it("runs in workspace directory", async () => {
    const tool = makeExecuteBashTool(workspaceDir);
    const result = (await tool.process!({} as any, { command: "pwd" })) as any;
    expect(result.stdout.trim()).toBe(workspaceDir);
  });

  it("has correct tool metadata", () => {
    const tool = makeExecuteBashTool(workspaceDir);
    expect(tool.name).toBe("execute_bash");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema!.required).toContain("command");
  });
});

describe("makeSetOutputTool", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await realpath(
      await mkdtemp(path.join(tmpdir(), "skill-test-"))
    );
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("records path in output sink", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool(
      "set_output_image",
      "Set output image",
      sink,
      workspaceDir
    );
    await writeFile(
      path.join(workspaceDir, "out.png"),
      Buffer.from("fake-png")
    );
    const result = await tool.process!({} as any, { path: "out.png" });
    expect(result).toMatchObject({ success: true });
    expect(sink).toEqual(["out.png"]);
  });

  it("rejects path outside workspace", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool(
      "set_output_image",
      "Set output image",
      sink,
      workspaceDir
    );
    const result = await tool.process!({} as any, { path: "../../etc/passwd" });
    expect(result).toMatchObject({ success: false });
    expect(sink).toHaveLength(0);
  });

  it("rejects non-existent file", async () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool(
      "set_output_image",
      "Set output image",
      sink,
      workspaceDir
    );
    const result = await tool.process!({} as any, { path: "nonexistent.png" });
    expect(result).toMatchObject({ success: false });
    expect(sink).toHaveLength(0);
  });

  it("has correct tool metadata", () => {
    const sink: string[] = [];
    const tool = makeSetOutputTool(
      "set_output_image",
      "Set output image",
      sink,
      workspaceDir
    );
    expect(tool.name).toBe("set_output_image");
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema!.required).toContain("path");
  });
});

describe("ToolAgentNode agent loop integration", () => {
  it("ShellAgentSkill calls runAgentLoop and returns text", async () => {
    const node = new ShellAgentNode();
    const workspaceDir = await mkdtemp(path.join(tmpdir(), "skill-int-"));

    const context = {
      getProvider: vi.fn().mockResolvedValue({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "Done.", done: true };
        },
        async *generateMessagesTraced(...args: any[]) {
          yield* (this as any).generateMessages(...args);
        }
      }),
      workspaceDir
    } as any;

    node.assign({
      prompt: "Say hello",
      model: { provider: "mock", id: "test-model" }
    });
    const result = await node.process(context);

    expect(result.text).toBe("Done.");
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("ImageSkill runs agent loop and produces image output", async () => {
    const workspaceDir = await mkdtemp(path.join(tmpdir(), "skill-img-"));

    let callIndex = 0;
    const context = {
      getProvider: vi.fn().mockResolvedValue({
        provider: "mock",
        generateMessages: async function* () {
          callIndex++;
          if (callIndex === 1) {
            yield {
              id: "tc_1",
              name: "execute_bash",
              args: {
                command: `printf "fake-png" > "${workspaceDir}/output.png"`
              }
            };
          } else if (callIndex === 2) {
            yield {
              id: "tc_2",
              name: "set_output_image",
              args: { path: "output.png" }
            };
          } else {
            yield {
              type: "chunk" as const,
              content: "Created image.",
              done: true
            };
          }
        },
        async *generateMessagesTraced(...args: any[]) {
          yield* (this as any).generateMessages(...args);
        }
      }),
      workspaceDir
    } as any;

    const node = new ImageAgentNode();
    node.assign({
      prompt: "Create an image",
      model: { provider: "mock", id: "test-model" }
    });
    const result = await node.process(context);

    expect(result.text).toBe("Created image.");
    expect(result.image).toBeDefined();
    expect((result.image as any).type).toBe("image");
    expect((result.image as any).data).toBeTruthy();

    await rm(workspaceDir, { recursive: true, force: true });
  });
});
