import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

let SandboxShellNode: (typeof import("../src/nodes/sandbox.js"))["SandboxShellNode"];
let SandboxBrowserNavigateNode: (typeof import("../src/nodes/sandbox.js"))["SandboxBrowserNavigateNode"];
let SandboxFileNode: (typeof import("../src/nodes/sandbox.js"))["SandboxFileNode"];
let SandboxAgentNode: (typeof import("../src/nodes/sandbox.js"))["SandboxAgentNode"];

const mocks = vi.hoisted(() => {
  const client = {
    shellExec: vi.fn(async () => ({ id: "cmd-1", started: true })),
    shellWait: vi.fn(async () => ({
      id: "cmd-1",
      output: "ok",
      running: false,
      exit_code: 0,
      timed_out: false
    })),
    shellView: vi.fn(async () => ({
      id: "cmd-1",
      output: "",
      running: true,
      exit_code: null
    })),
    browserView: vi.fn(async () => ({ elements: [] })),
    browserNavigate: vi.fn(async () => ({ url: "https://example.com" })),
    browserRestart: vi.fn(async () => ({ url: "about:blank" })),
    browserClick: vi.fn(async () => ({ clicked: true })),
    browserInput: vi.fn(async () => ({ typed: true })),
    browserMoveMouse: vi.fn(async () => ({ moved: true })),
    browserPressKey: vi.fn(async () => ({ pressed: true })),
    browserSelectOption: vi.fn(async () => ({ selected: ["x"] })),
    browserScroll: vi.fn(async () => ({ scroll_y: 10 })),
    browserConsoleExec: vi.fn(async () => ({ result_json: "{}" })),
    browserConsoleView: vi.fn(async () => ({ messages: [] })),
    fileRead: vi.fn(async () => ({ content: "x", total_lines: 1, truncated: false })),
    fileWrite: vi.fn(async () => ({ bytes_written: 1, file: "a.txt" })),
    fileStrReplace: vi.fn(async () => ({ replacements: 1, file: "a.txt" })),
    fileFindInContent: vi.fn(async () => ({ matches: [] })),
    fileFindByName: vi.fn(async () => ({ paths: [] }))
  };

  return {
    client,
    acquire: vi.fn(async () => ({ client })),
    runAgentLoop: vi.fn(async () => ({ text: "done" }))
  };
});

vi.mock("@nodetool-ai/sandbox", () => {
  class SessionStore {
    acquire = mocks.acquire;
  }

  class DockerSandboxProvider {}

  return {
    SessionStore,
    DockerSandboxProvider
  };
});

vi.mock("../src/nodes/agents.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/nodes/agents.js")>();
  return {
    ...actual,
    runAgentLoop: mocks.runAgentLoop
  };
});

describe("sandbox nodes", () => {
  beforeAll(async () => {
    const mod = await import("../src/nodes/sandbox.js");
    SandboxShellNode = mod.SandboxShellNode;
    SandboxBrowserNavigateNode = mod.SandboxBrowserNavigateNode;
    SandboxFileNode = mod.SandboxFileNode;
    SandboxAgentNode = mod.SandboxAgentNode;
  });

  beforeEach(() => {
    mocks.acquire.mockClear();
    mocks.runAgentLoop.mockClear();
    mocks.client.shellExec.mockClear();
    mocks.client.shellWait.mockClear();
    mocks.client.shellView.mockClear();
    mocks.client.browserView.mockClear();
    mocks.client.browserNavigate.mockClear();
    mocks.client.browserRestart.mockClear();
    mocks.client.browserClick.mockClear();
    mocks.client.browserInput.mockClear();
    mocks.client.browserMoveMouse.mockClear();
    mocks.client.browserPressKey.mockClear();
    mocks.client.browserSelectOption.mockClear();
    mocks.client.browserScroll.mockClear();
    mocks.client.browserConsoleExec.mockClear();
    mocks.client.browserConsoleView.mockClear();
    mocks.client.fileRead.mockClear();
    mocks.client.fileWrite.mockClear();
    mocks.client.fileStrReplace.mockClear();
    mocks.client.fileFindInContent.mockClear();
    mocks.client.fileFindByName.mockClear();
  });

  it("SandboxShell executes and waits for command output", async () => {
    const node = new SandboxShellNode();
    node.assign({
      workspace_dir: "/workspace",
      command: "echo hi",
      wait_seconds: 1
    });

    const result = await node.process();
    expect(mocks.client.shellExec).toHaveBeenCalledWith({
      id: expect.stringMatching(/^cmd-/),
      command: "echo hi",
      exec_dir: "/workspace"
    });
    const commandId = mocks.client.shellExec.mock.calls[0][0].id as string;
    expect(mocks.client.shellWait).toHaveBeenCalledWith({
      id: commandId,
      seconds: 1
    });
    expect(result).toEqual({
      output: "ok",
      running: false,
      exit_code: 0,
      timed_out: false
    });
  });

  it("reuses the default sandbox session across nodes in the same workflow run", async () => {
    const context = {
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1"
    } as unknown as ProcessingContext;

    const first = new SandboxShellNode();
    first.assign({ command: "echo first", wait_seconds: 1 });
    const second = new SandboxFileNode();
    second.assign({ action: "write", params: { file: "a.txt", content: "x" } });

    await first.process(context);
    await second.process(context);

    expect(mocks.acquire).toHaveBeenNthCalledWith(
      1,
      "user-1:workflow-1:workflow",
      { env: { NODETOOL_USER_ID: "user-1" } }
    );
    expect(mocks.acquire).toHaveBeenNthCalledWith(
      2,
      "user-1:workflow-1:workflow",
      { env: { NODETOOL_USER_ID: "user-1" } }
    );
  });

  it("reuses the sandbox across workflow runs with different job ids", async () => {
    const first = new SandboxShellNode();
    first.assign({ command: "echo first", wait_seconds: 1 });
    const second = new SandboxShellNode();
    second.assign({ command: "echo second", wait_seconds: 1 });

    await first.process({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-1"
    } as unknown as ProcessingContext);
    await second.process({
      userId: "user-1",
      workflowId: "workflow-1",
      jobId: "job-2"
    } as unknown as ProcessingContext);

    expect(mocks.acquire).toHaveBeenNthCalledWith(
      1,
      "user-1:workflow-1:workflow",
      { env: { NODETOOL_USER_ID: "user-1" } }
    );
    expect(mocks.acquire).toHaveBeenNthCalledWith(
      2,
      "user-1:workflow-1:workflow",
      { env: { NODETOOL_USER_ID: "user-1" } }
    );
  });

  it("SandboxBrowserNavigate calls the navigate tool with the URL and wait_until", async () => {
    const node = new SandboxBrowserNavigateNode();
    node.assign({
      url: "https://example.com",
      wait_until: "load"
    });

    const result = await node.process();
    expect(mocks.client.browserNavigate).toHaveBeenCalledWith({
      url: "https://example.com",
      wait_until: "load"
    });
    expect(result).toEqual({
      url: "https://example.com",
      title: undefined,
      status: undefined
    });
  });

  it("SandboxFile dispatches file actions", async () => {
    const node = new SandboxFileNode();
    node.assign({
      action: "write",
      params: { file: "a.txt", content: "x" }
    });

    const result = await node.process();
    expect(mocks.client.fileWrite).toHaveBeenCalledWith({
      file: "a.txt",
      content: "x"
    });
    expect(result.output).toEqual({ bytes_written: 1, file: "a.txt" });
  });

  it("SandboxAgent wires sandbox tools into buildTools", async () => {
    const node = new SandboxAgentNode();
    node.assign({
      prompt: "do work",
      model: { provider: "openai", id: "gpt-5" }
    });

    const context = {} as unknown as ProcessingContext;
    // buildTools is protected but we can access it via cast to verify
    // that SandboxAgentNode augments the tool list with sandbox tools
    const tools = await (node as unknown as { buildTools(ctx: unknown): Promise<unknown[]> }).buildTools(context);

    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(10);
  });
});
