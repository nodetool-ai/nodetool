/**
 * End-to-end check of staged document approval interception in ChatTurnHandler
 * (docs/document-editor/prd.md, D2, R8, R9).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLogHook, type LogEntry } from "@nodetool-ai/config";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  createTextDocument,
  readTextDocument
} from "@nodetool-ai/asset-services/text-documents";
import { outboundControlMessageSchemas } from "@nodetool-ai/protocol";
import {
  fakeProvider,
  makeChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";

const USER = "1";
const PROJECT = "staged-proj";

let root: string;
let workspace: Workspace;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-chat-staged-doc-"));
  workspace = createLocalWorkspace(join(root, PROJECT));
  setProjectFolderResolver(async (projectId) => ({
    ok: true,
    projectId: projectId ?? PROJECT,
    workspace
  }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  setLogHook(null);
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await rm(root, { recursive: true, force: true });
});

describe("chat turn staged document approval", () => {
  it("emits document_proposal without modifying disk bytes in staged mode", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "draft.md",
      content: "# Draft\n\nOriginal sentence.\n"
    });

    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              await args.executeTool?.({
                id: "call-edit",
                name: "edit_document",
                args: {
                  asset_id: asset.id,
                  edits: [
                    {
                      old_text: "Original sentence.",
                      new_text: "Proposed sentence."
                    }
                  ]
                }
              });
              yield { type: "chunk", content: "Proposed update.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-staged-1",
      project_id: PROJECT,
      content: "Revise the sentence.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: asset.id, title: "draft.md" },
        document_edit_mode: "staged"
      }
    });

    const proposals = harness.session.messagesOfType("document_proposal");
    expect(proposals).toHaveLength(1);
    const parsed = outboundControlMessageSchemas.document_proposal.parse(
      proposals[0]
    );
    expect(parsed).toMatchObject({
      type: "document_proposal",
      asset_id: asset.id,
      thread_id: "thread-staged-1",
      base_content: "# Draft\n\nOriginal sentence.\n",
      proposed_content: "# Draft\n\nProposed sentence.\n"
    });
    expect(parsed.proposal_id).toBeTruthy();
    expect(parsed.turn_id).toBeTruthy();

    // Disk file must remain untouched until the user accepts in the editor.
    expect(await readTextDocument(asset)).toBe("# Draft\n\nOriginal sentence.\n");
  });

  it("stages edits by default when document_edit_mode is omitted", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "default-staged.md",
      content: "# Default\n\nOriginal line.\n"
    });

    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        workspaceResolver: async (projectId) => ({
          ok: true,
          projectId: projectId ?? PROJECT,
          workspace
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              await args.executeTool?.({
                id: "call-edit-default",
                name: "edit_document",
                args: {
                  asset_id: asset.id,
                  edits: [
                    { old_text: "Original line.", new_text: "Staged by default." }
                  ]
                }
              });
              yield { type: "chunk", content: "Proposed update.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-default-staged",
      project_id: PROJECT,
      content: "Edit the line.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: asset.id, title: "default-staged.md" }
      }
    });

    const proposals = harness.session.messagesOfType("document_proposal");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      type: "document_proposal",
      asset_id: asset.id,
      base_content: "# Default\n\nOriginal line.\n",
      proposed_content: "# Default\n\nStaged by default.\n"
    });
    expect(await readTextDocument(asset)).toBe("# Default\n\nOriginal line.\n");
  });

  it("intercepts sandbox workspace writes, copies, moves, and deletes on the focused document", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "sandbox-guarded.md",
      content: "# Guarded\n\nInitial.\n"
    });
    await workspace.write("replacement.md", "# Guarded\n\nCopied via sandbox.\n");

    let writeOutput = "";
    let copyOutput = "";
    let deleteOutput = "";
    let moveOutput = "";
    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        workspaceResolver: async (projectId) => ({
          ok: true,
          projectId: projectId ?? PROJECT,
          workspace
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              writeOutput = String(
                await args.executeTool?.({
                  id: "call-sandbox-write",
                  name: "run_code",
                  args: {
                    code: `await workspace.write("sandbox-guarded.md", "# Guarded\\n\\nFrom sandbox.\\n"); output("text", await workspace.read("sandbox-guarded.md"));`
                  }
                })
              );
              copyOutput = String(
                await args.executeTool?.({
                  id: "call-sandbox-copy",
                  name: "run_code",
                  args: {
                    code: `await workspace.copy("replacement.md", "sandbox-guarded.md"); output("text", await workspace.read("sandbox-guarded.md"));`
                  }
                })
              );
              deleteOutput = String(
                await args.executeTool?.({
                  id: "call-sandbox-delete",
                  name: "run_code",
                  args: {
                    code: `await workspace.remove("sandbox-guarded.md"); output("ok", true);`
                  }
                })
              );
              moveOutput = String(
                await args.executeTool?.({
                  id: "call-sandbox-move",
                  name: "run_code",
                  args: {
                    code: `await workspace.move("sandbox-guarded.md", "renamed.md"); output("ok", true);`
                  }
                })
              );
              yield { type: "chunk", content: "Done.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-sandbox-staged",
      project_id: PROJECT,
      content: "Write through code.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: asset.id, title: "sandbox-guarded.md" }
      }
    });

    const proposals = harness.session.messagesOfType("document_proposal");
    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({
      asset_id: asset.id,
      base_content: "# Guarded\n\nInitial.\n",
      proposed_content: "# Guarded\n\nFrom sandbox.\n"
    });
    expect(proposals[1]).toMatchObject({
      asset_id: asset.id,
      base_content: "# Guarded\n\nInitial.\n",
      proposed_content: "# Guarded\n\nCopied via sandbox.\n"
    });
    expect(writeOutput).toContain("From sandbox.");
    expect(copyOutput).toContain("Copied via sandbox.");
    expect(deleteOutput).toMatch(/staged approval is active/);
    expect(moveOutput).toMatch(/staged approval is active/);
    expect(await readTextDocument(asset)).toBe("# Guarded\n\nInitial.\n");
  });

  it("writes directly to disk and emits no document_proposal in direct mode", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "direct.md",
      content: "# Direct\n\nBefore.\n"
    });

    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              await args.executeTool?.({
                id: "call-edit",
                name: "edit_document",
                args: {
                  asset_id: asset.id,
                  edits: [{ old_text: "Before.", new_text: "After." }]
                }
              });
              yield { type: "chunk", content: "Applied directly.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-direct-1",
      project_id: PROJECT,
      content: "Apply directly.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: asset.id, title: "direct.md" },
        document_edit_mode: "direct"
      }
    });

    expect(harness.session.messagesOfType("document_proposal")).toHaveLength(0);
    expect(await readTextDocument(asset)).toBe("# Direct\n\nAfter.\n");
  });

  it("logs and fails closed for both edit_document and write_file when Asset.find throws", async () => {
    const asset = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "lookup-error.md",
      content: "# Unchanged\n\nDisk truth.\n"
    });

    const logEntries: LogEntry[] = [];
    setLogHook((entry) => {
      logEntries.push(entry);
      return { message: entry.message, args: entry.args };
    });

    const originalFind = Asset.find.bind(Asset);
    const findSpy = vi.spyOn(Asset, "find").mockImplementation(async (uid, id) => {
      if (id === asset.id && findSpy.mock.calls.filter((c) => c[1] === asset.id).length === 1) {
        throw new Error("database lookup timeout");
      }
      return originalFind(uid, id);
    });

    let editDocResult = "";
    let writeFileResult = "";
    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        workspaceResolver: async (projectId) => ({
          ok: true,
          projectId: projectId ?? PROJECT,
          workspace
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              editDocResult = String(
                await args.executeTool?.({
                  id: "call-edit-doc",
                  name: "edit_document",
                  args: {
                    asset_id: asset.id,
                    edits: [{ old_text: "Disk truth.", new_text: "Mutated." }]
                  }
                })
              );
              await args.executeTool?.({
                id: "call-read-file",
                name: "read_file",
                args: { file_path: "lookup-error.md" }
              });
              writeFileResult = String(
                await args.executeTool?.({
                  id: "call-write-file",
                  name: "write_file",
                  args: {
                    file_path: "lookup-error.md",
                    content: "# Overwritten\n"
                  }
                })
              );
              yield { type: "chunk", content: "Blocked.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-find-throws",
      project_id: PROJECT,
      content: "Edit the doc.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: asset.id, title: "lookup-error.md" },
        document_edit_mode: "staged"
      }
    });

    const warnLog = logEntries.find(
      (entry) =>
        entry.level === "warn" &&
        entry.message === "Failed to resolve focused document for staged approval"
    );
    expect(warnLog).toBeDefined();
    expect(JSON.stringify(warnLog?.args)).toContain("database lookup timeout");

    expect(editDocResult).toContain(
      "Focused document could not be loaded for staged approval; direct writes are blocked."
    );
    expect(writeFileResult).toContain(
      "Focused document could not be loaded for staged approval; direct writes are blocked."
    );
    expect(harness.session.messagesOfType("document_proposal")).toHaveLength(0);
    expect(await readTextDocument(asset)).toBe("# Unchanged\n\nDisk truth.\n");
  });

  it("logs and fails closed when Asset.find returns null for the focused document", async () => {
    const existing = await createTextDocument({
      userId: USER,
      projectId: PROJECT,
      name: "existing.md",
      content: "# Existing\n\nSafe on disk.\n"
    });

    const logEntries: LogEntry[] = [];
    setLogHook((entry) => {
      logEntries.push(entry);
      return { message: entry.message, args: entry.args };
    });

    let editDocResult = "";
    let writeFileResult = "";
    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        workspaceResolver: async (projectId) => ({
          ok: true,
          projectId: projectId ?? PROJECT,
          workspace
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              editDocResult = String(
                await args.executeTool?.({
                  id: "call-edit-missing",
                  name: "edit_document",
                  args: {
                    path: "existing.md",
                    content: "# Overwritten\n"
                  }
                })
              );
              await args.executeTool?.({
                id: "call-read-existing",
                name: "read_file",
                args: { file_path: "existing.md" }
              });
              writeFileResult = String(
                await args.executeTool?.({
                  id: "call-write-existing",
                  name: "write_file",
                  args: {
                    file_path: "existing.md",
                    content: "# Overwritten\n"
                  }
                })
              );
              yield { type: "chunk", content: "Blocked.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-find-null",
      project_id: PROJECT,
      content: "Edit the doc.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: "nonexistent-doc-id", title: "missing.md" },
        document_edit_mode: "staged"
      }
    });

    const warnLog = logEntries.find(
      (entry) =>
        entry.level === "warn" &&
        entry.message ===
          "Focused document unavailable for staged approval; blocking direct Markdown writes"
    );
    expect(warnLog).toBeDefined();

    const blockMsg =
      "Focused document could not be loaded for staged approval; direct writes are blocked.";
    expect(editDocResult).toContain(blockMsg);
    expect(writeFileResult).toContain(blockMsg);
    expect(harness.session.messagesOfType("document_proposal")).toHaveLength(0);
    expect(await readTextDocument(existing)).toBe("# Existing\n\nSafe on disk.\n");
  });

  it("blocks direct Markdown workspace writes while still staging edit_document when focused project mismatches turn workspace", async () => {
    const otherProject = "other-staged-proj";
    const otherWorkspace = createLocalWorkspace(join(root, otherProject));
    setProjectFolderResolver(async (projectId) => ({
      ok: true,
      projectId: projectId ?? PROJECT,
      workspace: projectId === otherProject ? otherWorkspace : workspace
    }));

    const remoteAsset = await createTextDocument({
      userId: USER,
      projectId: otherProject,
      name: "remote.md",
      content: "# Remote\n\nOriginal remote.\n"
    });
    await workspace.write("local.md", "# Local\n\nOriginal local.\n");
    await workspace.write("remote.md", "# Same Name Local\n\nOriginal same-name.\n");

    const logEntries: LogEntry[] = [];
    setLogHook((entry) => {
      logEntries.push(entry);
      return { message: entry.message, args: entry.args };
    });

    let writeLocalResult = "";
    let writeSameNameResult = "";
    let writeNonMdResult = "";
    let editDocResult = "";
    const harness = makeChatTurnHarness({
      session: {
        userId: USER,
        workspaceResolver: async () => ({
          ok: true,
          projectId: PROJECT,
          workspace
        }),
        resolveProvider: async () =>
          fakeProvider({
            generateLoop: async function* (args: GenerateLoopArgs) {
              await args.executeTool?.({
                id: "call-read-local",
                name: "read_file",
                args: { file_path: "local.md" }
              });
              writeLocalResult = String(
                await args.executeTool?.({
                  id: "call-write-local",
                  name: "write_file",
                  args: {
                    file_path: "local.md",
                    content: "# Local\n\nShould be blocked.\n"
                  }
                })
              );
              await args.executeTool?.({
                id: "call-read-same-name",
                name: "read_file",
                args: { file_path: "remote.md" }
              });
              writeSameNameResult = String(
                await args.executeTool?.({
                  id: "call-write-same-name",
                  name: "write_file",
                  args: {
                    file_path: "remote.md",
                    content: "# Same Name Local\n\nShould also be blocked.\n"
                  }
                })
              );
              writeNonMdResult = String(
                await args.executeTool?.({
                  id: "call-write-txt",
                  name: "write_file",
                  args: {
                    file_path: "scratch.txt",
                    content: "non-markdown ok\n"
                  }
                })
              );
              editDocResult = String(
                await args.executeTool?.({
                  id: "call-edit-remote",
                  name: "edit_document",
                  args: {
                    asset_id: remoteAsset.id,
                    edits: [
                      { old_text: "Original remote.", new_text: "Staged remote." }
                    ]
                  }
                })
              );
              yield { type: "chunk", content: "Done.", done: true };
            }
          })
      }
    });

    await harness.handler.handleChatMessage({
      thread_id: "thread-project-mismatch",
      project_id: PROJECT,
      content: "Edit remote doc.",
      provider: "mock",
      model: "m",
      permission_mode: "auto",
      ui_context: {
        source: "document_assistant",
        focused: { type: "document", id: remoteAsset.id, title: "remote.md" },
        document_edit_mode: "staged"
      }
    });

    const warnLog = logEntries.find(
      (entry) =>
        entry.level === "warn" &&
        entry.message ===
          "Focused document workspace could not be mapped for staged approval; blocking direct Markdown writes"
    );
    expect(warnLog).toBeDefined();

    const blockMsg =
      "Focused document path could not be mapped in this workspace while staged approval is active; direct Markdown writes are blocked.";
    expect(writeLocalResult).toContain(blockMsg);
    expect(writeSameNameResult).toContain(blockMsg);
    expect(writeNonMdResult).toContain("Created scratch.txt");
    expect(editDocResult).toContain("staged");

    // Local Markdown files untouched; non-Markdown file written
    expect(await workspace.readText("local.md")).toBe("# Local\n\nOriginal local.\n");
    expect(await workspace.readText("remote.md")).toBe(
      "# Same Name Local\n\nOriginal same-name.\n"
    );
    expect(await workspace.readText("scratch.txt")).toBe("non-markdown ok\n");

    // edit_document by asset_id still staged cleanly without modifying remote disk
    const proposals = harness.session.messagesOfType("document_proposal");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      type: "document_proposal",
      asset_id: remoteAsset.id,
      base_content: "# Remote\n\nOriginal remote.\n",
      proposed_content: "# Remote\n\nStaged remote.\n"
    });
    expect(await readTextDocument(remoteAsset)).toBe("# Remote\n\nOriginal remote.\n");
  });
});
