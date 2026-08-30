/**
 * Tests targeting exact uncovered lines for 100% statement coverage across:
 * workspace.ts, agents.ts, text-extra.ts,
 * data.ts, document.ts, code.ts, uuid.ts, vector.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { BaseProvider } from "@nodetool-ai/runtime";

// AgentNode drives the provider through generateLoop (the
// agents-provider-tool-loop refactor). Wrap a bare provider mock so its
// generateMessages generator runs under BaseProvider's real tool-calling loop.
function asLoopProvider(p: any): any {
  return {
    ...p,
    async *generateMessagesTraced(...a: any[]) {
      yield* (this as any).generateMessages(...a);
    },
    generateLoop(loopArgs: unknown) {
      return (
        BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
      ).generateLoop.call(this, loopArgs);
    }
  };
}

/**
 * Helper: assign props to a node AND patch serialize() so that
 * workspace_dir (which is not a declared @prop on most workspace nodes)
 * appears in the serialized output used by workspaceDirFrom().
 */
function assignWithWorkspaceDir(
  node: any,
  props: Record<string, unknown>
): void {
  node.assign(props);
  if ("workspace_dir" in props) {
    const origSerialize = node.serialize.bind(node);
    node.serialize = () => ({
      ...origSerialize(),
      workspace_dir: props.workspace_dir
    });
  }
}

// ============================================================================
// 3. AGENTS NODES
// ============================================================================

import {
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode
} from "@nodetool-ai/llm-nodes";

describe("agents nodes", () => {
  describe("SummarizerNode", () => {
    it("throws 'Select a model' when no model is configured", async () => {
      const node = new SummarizerNode();
      node.assign({ text: "Hello world. This is a test. Another sentence." });
      await expect(node.process()).rejects.toThrow("Select a model");
    });
  });

  describe("CreateThreadNode", () => {
    it("creates new thread with auto id", async () => {
      const node = new CreateThreadNode();
      const result = await node.process();
      expect(result.thread_id).toBeDefined();
      expect((result.thread_id as string).startsWith("thread_")).toBe(true);
    });

    it("creates or reuses thread with given id", async () => {
      const node = new CreateThreadNode();
      node.assign({ thread_id: "my-thread", title: "Custom" });
      const result = await node.process();
      expect(result.thread_id).toBe("my-thread");
      // Call again to hit the existing thread branch
      node.assign({ thread_id: "my-thread" });
      const result2 = await node.process();
      expect(result2.thread_id).toBe("my-thread");
    });
  });

  describe("ExtractorNode", () => {
    it("throws 'Select a model' when no model is configured", async () => {
      const node = new ExtractorNode();
      node.assign({ text: '{"name": "test", "value": 42}' });
      await expect(node.process()).rejects.toThrow("Select a model");
    });
  });

  describe("ClassifierNode", () => {
    it("throws for empty categories before checking the model", async () => {
      const node = new ClassifierNode();
      node.assign({ text: "hello", categories: [] });
      await expect(node.process()).rejects.toThrow(
        "At least 2 categories are required"
      );
    });

    it("throws 'Select a model' when categories are valid but no model is set", async () => {
      const node = new ClassifierNode();
      node.assign({
        text: "I love programming in python",
        categories: ["python", "javascript", "rust"]
      });
      await expect(node.process()).rejects.toThrow("Select a model");
    });
  });

  describe("AgentNode", () => {
    it("requires a selected model", async () => {
      const node = new AgentNode();
      node.assign({ prompt: "What is 2+2?" });
      await expect(node.process()).rejects.toThrow("Select a model");
    });

    it("streams provider output through process()", async () => {
      const node = new AgentNode();
      node.assign({
        prompt: "hello",
        model: { provider: "openai", id: "gpt-4" }
      });
      const result = await node.process({
        getProvider: vi.fn().mockResolvedValue(
          asLoopProvider({
            async *generateMessages() {
              yield {
                type: "chunk",
                content: "AI",
                content_type: "text",
                done: false
              };
              yield {
                type: "chunk",
                content: " response",
                content_type: "text",
                done: true
              };
            }
          })
        )
      } as any);
      expect(result.text).toBe("AI response");
    });

    it("uses provider when available", async () => {
      const mockProvider = {
        generateMessages: vi.fn(async function* () {
          yield {
            type: "chunk",
            content: "AI response",
            content_type: "text",
            done: true
          };
        })
      };
      const mockContext = {
        getProvider: vi.fn().mockResolvedValue(asLoopProvider(mockProvider))
      };
      const node = new AgentNode();
      node.assign({
        prompt: "hello",
        system: "sys",
        history: [
          { role: "user", content: "prev" },
          { role: "invalid_role", content: "skip" }
        ],
        model: { provider: "openai", id: "gpt-4" },
        max_tokens: 512
      });
      const result = await node.process(mockContext as any);
      expect(result.text).toBe("AI response");
      expect(mockProvider.generateMessages).toHaveBeenCalled();
    });

    it("loads and saves thread history through context model interfaces", async () => {
      const created: any[] = [];
      const mockProvider = {
        generateMessages: vi.fn(async function* ({ messages }: any) {
          expect(
            messages.some(
              (m: any) => m.role === "user" && m.content === "persisted-user"
            )
          ).toBe(true);
          yield {
            type: "chunk",
            content: "threaded",
            content_type: "text",
            done: true
          };
        })
      };
      const mockContext = {
        getProvider: vi.fn().mockResolvedValue(asLoopProvider(mockProvider)),
        hasModelInterface: (name: string) =>
          name === "getMessages" || name === "createMessage",
        getThreadMessages: vi.fn().mockResolvedValue({
          messages: [{ role: "user", content: "persisted-user" }],
          next: null
        }),
        createMessage: vi.fn(async (req: any) => {
          created.push(req);
        })
      };
      const node = new AgentNode();
      node.assign({
        prompt: "hello",
        thread_id: "thread-test",
        model: { provider: "test", id: "model" }
      });
      const result = await node.process(mockContext as any);
      expect(result.text).toBe("threaded");
      expect(created).toHaveLength(2);
      expect(created[0].role).toBe("user");
      expect(created[1].role).toBe("assistant");
    });

    it("replays thread history when local persistence is used", async () => {
      const createNode = new CreateThreadNode();
      createNode.assign({ thread_id: "coverage-thread-replay" });
      const { thread_id } = await createNode.process();
      const mockProvider = {
        generateMessages: vi.fn(async function* () {
          yield {
            type: "chunk",
            content: "reply-1",
            content_type: "text",
            done: true
          };
        })
      };
      const node = new AgentNode();
      node.assign({
        prompt: "hello",
        thread_id,
        model: { provider: "test", id: "model" }
      });
      await node.process({
        getProvider: vi.fn().mockResolvedValue(asLoopProvider(mockProvider))
      } as any);
      const secondProvider = {
        generateMessages: vi.fn(async function* ({ messages }: any) {
          expect(
            messages.some(
              (m: any) =>
                Array.isArray(m.content) && m.content[0]?.text === "hello"
            )
          ).toBe(true);
          expect(
            messages.some(
              (m: any) =>
                Array.isArray(m.content) && m.content[0]?.text === "reply-1"
            )
          ).toBe(true);
          yield {
            type: "chunk",
            content: "reply-2",
            content_type: "text",
            done: true
          };
        })
      };
      node.assign({
        prompt: "follow up",
        thread_id: thread_id as string,
        model: { provider: "test", id: "model" }
      });
      const result = await node.process({
        getProvider: vi.fn().mockResolvedValue(asLoopProvider(secondProvider))
      } as any);
      expect(result.text).toBe("reply-2");
    });
  });

  // Research node coverage is handled by the general Agent node in agents.ts
});

// ============================================================================
// 4. TEXT-EXTRA NODES — comprehensive coverage
// ============================================================================

import {
  AutomaticSpeechRecognitionNode,
  LoadTextAssetsNode,
  LoadTextFolderNode
} from "@nodetool-ai/text-nodes";

describe("AutomaticSpeechRecognitionNode", () => {
  it("throws without provider context and audio", async () => {
    const node = new AutomaticSpeechRecognitionNode();
    node.assign({
      model: {
        type: "asr_model",
        provider: "fal_ai",
        id: "openai/whisper-large-v3"
      },
      audio: { type: "audio", uri: "", data: null }
    });
    await expect(node.process()).rejects.toThrow(
      "AutomaticSpeechRecognition requires a provider-backed model and audio input."
    );
  });

  it("calls runProviderPrediction with base64 audio data", async () => {
    const node = new AutomaticSpeechRecognitionNode();
    const base64Audio = Buffer.from("fake audio data").toString("base64");
    node.assign({
      model: {
        type: "asr_model",
        provider: "fal_ai",
        id: "openai/whisper-large-v3"
      },
      audio: { type: "audio", uri: "", data: base64Audio }
    });
    // Every provider's automaticSpeechRecognition returns an ASRResult; a bare
    // string is a shape nothing can produce.
    const mockContext = {
      runProviderPrediction: vi.fn().mockResolvedValue({
        text: "transcribed text"
      })
    };
    const result = await node.process(mockContext as any);
    expect(result.text).toBe("transcribed text");
    expect(result.output).toBe("transcribed text");
    expect(mockContext.runProviderPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "fal_ai",
        capability: "automatic_speech_recognition",
        model: "openai/whisper-large-v3"
      })
    );
  });

  it("reads audio from Uint8Array data", async () => {
    const node = new AutomaticSpeechRecognitionNode();
    node.assign({
      model: {
        type: "asr_model",
        provider: "fal_ai",
        id: "openai/whisper-large-v3"
      },
      audio: { type: "audio", uri: "", data: new Uint8Array([1, 2, 3]) }
    });
    const mockContext = {
      runProviderPrediction: vi.fn().mockResolvedValue({ text: "hello world" })
    };
    const result = await node.process(mockContext as any);
    expect(result.text).toBe("hello world");
  });

  it("throws when no audio bytes provided even with context", async () => {
    const node = new AutomaticSpeechRecognitionNode();
    node.assign({
      model: {
        type: "asr_model",
        provider: "fal_ai",
        id: "openai/whisper-large-v3"
      },
      audio: { type: "audio", uri: "", data: null }
    });
    const mockContext = {
      runProviderPrediction: vi.fn()
    };
    await expect(node.process(mockContext as any)).rejects.toThrow(
      "AutomaticSpeechRecognition requires a provider-backed model and audio input."
    );
  });
});

describe("LoadTextAssetsNode", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "load-text-assets-"));
    await fs.writeFile(path.join(tmpDir, "file1.txt"), "content one");
    await fs.writeFile(path.join(tmpDir, "file2.txt"), "content two");
    await fs.writeFile(path.join(tmpDir, "ignore.bin"), "binary data");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("process() returns first file and lists", async () => {
    const node = new LoadTextAssetsNode();
    node.assign({ folder: { type: "folder", uri: "", path: tmpDir } });
    const result = await node.process();
    expect(result.text).toBeDefined();
    expect(Array.isArray(result.texts)).toBe(true);
  });

  it("genProcess yields text files from folder", async () => {
    const node = new LoadTextAssetsNode();
    node.assign({ folder: { type: "folder", uri: "", path: tmpDir } });
    const items: Record<string, unknown>[] = [];
    for await (const item of node.genProcess()) {
      items.push(item);
    }
    // 2 files + 1 final list yield
    expect(items.length).toBe(3);
    const texts = items.filter((i) => i.text).map((i) => i.text).sort();
    expect(texts).toEqual(["content one", "content two"]);
  });

  it("genProcess throws on empty folder", async () => {
    const node = new LoadTextAssetsNode();
    node.assign({ folder: "" });
    const gen = node.genProcess();
    await expect(gen.next()).rejects.toThrow("folder cannot be empty");
  });
});

describe("LoadTextFolderNode", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "load-text-folder-"));
    await fs.writeFile(path.join(tmpDir, "a.txt"), "alpha");
    await fs.writeFile(path.join(tmpDir, "b.md"), "bravo");
    await fs.writeFile(path.join(tmpDir, "c.png"), "not text");
    await fs.mkdir(path.join(tmpDir, "sub"));
    await fs.writeFile(path.join(tmpDir, "sub", "d.txt"), "delta");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("yields only matching extensions", async () => {
    const node = new LoadTextFolderNode();
    node.assign({
      folder: tmpDir,
      extensions: [".txt"],
      include_subdirectories: false
    });
    const items: { text: string; path: string }[] = [];
    for await (const item of node.genProcess()) {
      if ("texts" in item) continue; // skip final list yield
      items.push(item as { text: string; path: string });
    }
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("alpha");
  });

  it("includes subdirectories when enabled", async () => {
    const node = new LoadTextFolderNode();
    node.assign({
      folder: tmpDir,
      extensions: [".txt"],
      include_subdirectories: true
    });
    const items: { text: string; path: string }[] = [];
    for await (const item of node.genProcess()) {
      if ("texts" in item) continue; // skip final list yield
      items.push(item as { text: string; path: string });
    }
    expect(items.length).toBe(2);
    const texts = items.map((i) => i.text).sort();
    expect(texts).toEqual(["alpha", "delta"]);
  });

  it("throws on empty folder", async () => {
    const node = new LoadTextFolderNode();
    node.assign({ folder: "" });
    const gen = node.genProcess();
    await expect(gen.next()).rejects.toThrow("folder cannot be empty");
  });
});

// ============================================================================
// 6. DOCUMENT — remaining uncovered lines
// ============================================================================

import { ListDocumentsNode } from "@nodetool-ai/document-nodes";

describe("document.ts uncovered lines", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("ListDocumentsNode streams document files", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "text");
    await fs.writeFile(path.join(tmpDir, "b.pdf"), "pdf");
    await fs.writeFile(path.join(tmpDir, "c.xyz"), "unknown");
    const node = new ListDocumentsNode();
    const results: any[] = [];
    node.assign({ folder: tmpDir });
    for await (const item of node.genProcess()) {
      if ("documents" in item) continue; // skip final list yield
      results.push(item);
    }
    expect(results.length).toBe(2); // .txt and .pdf
  });

  it("ListDocumentsNode recursive", async () => {
    await fs.mkdir(path.join(tmpDir, "sub"));
    await fs.writeFile(path.join(tmpDir, "sub", "deep.md"), "markdown");
    const node = new ListDocumentsNode();
    const results: any[] = [];
    node.assign({ folder: tmpDir, recursive: true });
    for await (const item of node.genProcess()) {
      results.push(item);
    }
    expect(
      results.some((r) => (r.document?.uri as string)?.includes("deep.md"))
    ).toBe(true);
  });
});

