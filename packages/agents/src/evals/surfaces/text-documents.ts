/**
 * Headless bridge for the text-documents tool-loop eval.
 *
 * Like the memory bridge, this drives the REAL capabilities: create, read,
 * edit, list versions and restore run against an in-memory database and a
 * project folder in a temporary directory, so a case scores what the user
 * would see in the document editor afterwards. A seed writes documents (and
 * their version history) through the same capabilities, in turns of their
 * own, before the model's first call.
 */

import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { initTestDb } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type Workspace
} from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../../capabilities/lazy-tool.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";

const EVAL_USER = "eval-user";
const EVAL_PROJECT = "eval-project";
/** The model's calls all belong to one turn, as in a chat. */
const EVAL_TURN = "eval-turn";

/** Snapshot the case predicates run against: each seeded file's content. */
export interface TextDocumentsFinalState {
  files: Record<string, string>;
}

/** Calls a real capability in a turn of its own. */
type SeedCall = (
  name: string,
  args: Record<string, unknown>,
  turn: string
) => Promise<Record<string, unknown>>;

function contextFor(workspace: Workspace, jobId: string): ProcessingContext {
  const values = new Map<string, unknown>();
  const dir = workspace.localDir;
  // SAFETY: the text-document capabilities read the user, project, job,
  // thread, workspace and the run's key-value store off the context, and
  // nothing else in this bridge reaches for another member.
  return {
    getSecret: async () => null,
    userId: EVAL_USER,
    projectId: EVAL_PROJECT,
    jobId,
    threadId: "eval-thread",
    workspace,
    workspaceDir: dir,
    resolveWorkspacePath: (rel: string) => {
      if (!dir) throw new Error("No local workspace");
      return resolve(dir, rel);
    },
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value)
  } as unknown as ProcessingContext;
}

const TARGET = {
  asset_id: z.string().optional(),
  path: z.string().optional()
};

/** The model-facing tools, with the parameters each capability accepts. */
const TOOL_PARAMETERS: Record<string, z.ZodTypeAny> = {
  create_document: z.object({
    name: z.string(),
    content: z.string(),
    directory: z.string().optional()
  }),
  read_document: z.object(TARGET),
  edit_document: z.object({
    ...TARGET,
    edits: z
      .array(
        z.object({
          old_text: z.string(),
          new_text: z.string(),
          replace_all: z.boolean().optional()
        })
      )
      .optional(),
    content: z.string().optional(),
    append: z.string().optional()
  }),
  list_document_versions: z.object(TARGET),
  restore_document_version: z.object({ ...TARGET, version: z.number().int() })
};

/**
 * A fresh bridge over a clean database and project folder. `tracked` names
 * the files the final state reports, relative to the project folder.
 */
export function createTextDocumentsToolBridge(
  tracked: readonly string[],
  seed?: (call: SeedCall) => Promise<void>
): HeadlessSurfaceBridge<TextDocumentsFinalState> {
  initTestDb();
  const root = mkdtempSync(join(tmpdir(), "nodetool-eval-docs-"));
  const workspace = createLocalWorkspace(join(root, EVAL_PROJECT));
  setProjectFolderResolver(async (projectId) => ({
    ok: true,
    projectId: projectId ?? EVAL_PROJECT,
    workspace
  }));

  const invoke: SeedCall = async (name, args, turn) => {
    const context = contextFor(workspace, turn);
    const tool = toolForCapabilityName(name);
    return (await tool.process(context, args)) as Record<string, unknown>;
  };

  let state: TextDocumentsFinalState = { files: {} };
  const refresh = async (): Promise<void> => {
    const files: Record<string, string> = {};
    for (const path of tracked) {
      const dir = workspace.localDir;
      if (!dir) continue;
      try {
        files[path] = await readFile(join(dir, path), "utf8");
      } catch {
        // A tracked file that does not exist yet reads as absent.
      }
    }
    state = { files };
  };

  // Every tool awaits the seed, so it finishes before the first call runs.
  const ready: Promise<void> = (async () => {
    if (seed) await seed(invoke);
    await refresh();
  })();

  const tools: HeadlessTool[] = Object.entries(TOOL_PARAMETERS).map(
    ([name, parameters]) => {
      const spec = toolForCapabilityName(name);
      return {
        name,
        description: spec.description,
        parameters,
        execute: async (args: Record<string, unknown>) => {
          await ready;
          const result = await invoke(name, args, EVAL_TURN);
          await refresh();
          return result;
        }
      };
    }
  );

  return { tools, finalState: () => state };
}

// --- cases -------------------------------------------------------------------

const PLAN = "launch-plan.md";
const PRICING = "pricing.md";

const PLAN_SEED =
  "# Launch plan\n\n" +
  "Launch date: March 3\n\n" +
  "## Channels\n\n" +
  "- Newsletter\n" +
  "- Product Hunt\n";

const planRevised: ToolLoopStatePredicate<TextDocumentsFinalState> = {
  name: "the plan names March 10 and no longer March 3",
  test: (s) => {
    const text = s.files[PLAN] ?? "";
    return /March 10/.test(text) && !/March 3\b/.test(text);
  }
};

const planHasRisks: ToolLoopStatePredicate<TextDocumentsFinalState> = {
  name: "the plan gained a Risks section with the staffing risk",
  test: (s) => /^## Risks/m.test(s.files[PLAN] ?? "") && /staff/i.test(s.files[PLAN] ?? ""),
  detail: "Expected a `## Risks` heading followed by the staffing risk."
};

const planChannelsKept: ToolLoopStatePredicate<TextDocumentsFinalState> = {
  name: "the existing channel list is untouched",
  test: (s) => /- Newsletter\n- Product Hunt/.test(s.files[PLAN] ?? ""),
  detail: "A targeted edit keeps the rest of the document as it was."
};

const pricingRestored: ToolLoopStatePredicate<TextDocumentsFinalState> = {
  name: "pricing.md is back to $49 a month",
  test: (s) => {
    const text = s.files[PRICING] ?? "";
    return /\$49/.test(text) && !/\$59/.test(text);
  }
};

const TEXT_DOCUMENTS_SYSTEM_PROMPT = `You are an assistant that edits the Markdown documents in the user's project folder.

Use these tools:
- create_document({ name, content, directory? }) — create a document.
- read_document({ path }) — read a document's full Markdown.
- edit_document({ path, edits?, content?, append? }) — change a document. Prefer edits: exact old_text to new_text replacements.
- list_document_versions({ path }) — list a document's stored versions.
- restore_document_version({ path, version }) — restore a stored version.

Read a document before you edit it. Call one tool at a time and use each result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

export const TEXT_DOCUMENTS_TOOL_LOOP_CASES: ToolLoopEvalCase<TextDocumentsFinalState>[] =
  [
    {
      id: "revise-launch-plan",
      description:
        "Read a document, change one fact in place and add a section, keeping the rest.",
      objective:
        `In "${PLAN}" the launch moved a week later, to March 10. Update the ` +
        "date, and add a Risks section that lists one risk: support staffing " +
        "over the launch week. Leave the rest of the plan as it is.",
      systemPrompt: TEXT_DOCUMENTS_SYSTEM_PROMPT,
      createBridge: () =>
        createTextDocumentsToolBridge([PLAN], async (call) => {
          await call("create_document", { name: PLAN, content: PLAN_SEED }, "seed-1");
        }),
      expect: {
        requiredTools: ["read_document", "edit_document"],
        ordering: [["read_document", "edit_document"]],
        finalState: [planRevised, planHasRisks, planChannelsKept],
        minToolCalls: 2,
        maxToolCalls: 8
      }
    },
    {
      id: "restore-earlier-price",
      description:
        "Find the version before an unwanted change in the history and restore it.",
      objective:
        `Someone raised the monthly price in "${PRICING}" by mistake. Look at ` +
        "the document's history and restore the version from before that " +
        "change. Do not retype the document.",
      systemPrompt: TEXT_DOCUMENTS_SYSTEM_PROMPT,
      createBridge: () =>
        createTextDocumentsToolBridge([PRICING], async (call) => {
          await call(
            "create_document",
            { name: PRICING, content: "# Pricing\n\nPro: $49 a month\n" },
            "seed-1"
          );
          // An edit in a later turn keeps the $49 text as a version.
          await call(
            "edit_document",
            { path: PRICING, edits: [{ old_text: "$49", new_text: "$59" }] },
            "seed-2"
          );
        }),
      expect: {
        requiredTools: ["list_document_versions", "restore_document_version"],
        forbiddenTools: ["create_document"],
        ordering: [["list_document_versions", "restore_document_version"]],
        finalState: [pricingRestored],
        minToolCalls: 2,
        maxToolCalls: 8
      }
    }
  ];
