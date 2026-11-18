/**
 * The Claude session half of a blind participant, shared by the browser runner
 * (`runParticipant.ts`) and the desktop runner (`runNativeParticipant.ts`).
 *
 * A runner owns its surface: how the participant sees (screenshots) and acts
 * (tools). This module owns everything else that makes a session part of a
 * study: the isolated SDK options, the init audit, the soft and hard time
 * limits, the verbatim participant log, the transcript without image data,
 * `contract.json`, `participant-report.md`, and `summary.json`.
 */

import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  createSdkMcpServer,
  query,
  type SDKMessage
} from "@anthropic-ai/claude-agent-sdk";
import { isolatedSessionOptions } from "./isolatedSession";

/** Time after the soft limit for the participant to write its report. */
export const REPORT_GRACE_MS = 3 * 60_000;

export type Outcome =
  | "FINISHED"
  | "ACTION_LIMIT"
  | "TIME_LIMIT"
  | "BLOCKED_ENVIRONMENT"
  | "RUNNER_ERROR";

export interface Receipt {
  step: number;
  screenshot: string;
  text: string;
}

/** What a runner's surface exposes to the shared session loop. */
export interface ParticipantSurface {
  readonly startedAt: number;
  /** Actions performed so far. */
  readonly actions: number;
  /** Wall time spent inside surface actions, excluding model time. */
  readonly surfaceMs: number;
  /** Set by the loop when `maxMinutes` passes; the surface then refuses actions. */
  softLimitReached: boolean;
  start(): Promise<void>;
  close(): Promise<void>;
}

/** The SDK tool type, taken from the server factory so both runners agree. */
export type ParticipantTool = NonNullable<
  Parameters<typeof createSdkMcpServer>[0]["tools"]
>[number];

export interface RunParticipantSessionOptions {
  outDir: string;
  repoRoot: string;
  protocolPath: string;
  protocol: string;
  /** Protocol plus the surface's tool guide. */
  systemPrompt: string;
  /** The rendered task packet, the session's only user message. */
  prompt: string;
  model: string;
  serverName: string;
  tools: ParticipantTool[];
  surface: ParticipantSurface;
  maxActions: number;
  maxMinutes: number;
  /** Runner-specific contract fields, such as the packet and the browser or display settings. */
  contract: Record<string, unknown>;
  /** Runner-specific summary fields. */
  summary?: () => Record<string, unknown>;
}

/** Redact inline image data so transcripts stay small and text-only. */
export function stripImages(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripImages);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "image") {
      return { type: "image", data: "<omitted>" };
    }
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, stripImages(v)])
    );
  }
  return value;
}

export function toolResult(receipt: Receipt, data: string) {
  return {
    content: [
      { type: "text" as const, text: receipt.text },
      { type: "image" as const, data, mimeType: "image/png" }
    ]
  };
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Append one receipt to `steps.jsonl` with its elapsed time. */
export function receiptLogger(outDir: string, startedAt: () => number) {
  const stepsPath = join(outDir, "steps.jsonl");
  return async (r: Receipt): Promise<void> =>
    appendFile(stepsPath, `${JSON.stringify({ ...r, t: Date.now() - startedAt() })}\n`);
}

export async function prepareOutDir(outDir: string): Promise<void> {
  await mkdir(join(outDir, "screenshots"), { recursive: true });
  await mkdir(join(outDir, "private"), { recursive: true });
}

/**
 * Run one participant session to its end and write the study files. Sets
 * `process.exitCode` to 1 when the boundary audit or the runner failed.
 */
export async function runParticipantSession(
  opts: RunParticipantSessionOptions
): Promise<Record<string, unknown>> {
  const { outDir, surface, serverName } = opts;
  const transcriptPath = join(outDir, "transcript.jsonl");
  /** The participant's own step notes, verbatim and in order. */
  const logPath = join(outDir, "participant-log.md");

  const toolNames = opts.tools.map((t) => `mcp__${serverName}__${t.name}`);
  const abortController = new AbortController();
  const { options, accountContext } = await isolatedSessionOptions({
    systemPrompt: opts.systemPrompt,
    model: opts.model,
    maxTurns: opts.maxActions * 2 + 20,
    allowedTools: toolNames,
    mcpServers: {
      [serverName]: createSdkMcpServer({ name: serverName, version: "1.0.0", tools: opts.tools })
    },
    abortController
  });

  const contract = {
    ...opts.contract,
    renderedPrompt: opts.prompt,
    protocol: {
      path: relative(opts.repoRoot, opts.protocolPath),
      sha256: createHash("sha256").update(opts.protocol).digest("hex")
    },
    systemPromptSha256: createHash("sha256").update(opts.systemPrompt).digest("hex"),
    model: opts.model,
    toolAllowlist: toolNames,
    accountContext,
    sdkOptions: {
      ...options,
      systemPrompt: "<participant protocol + tool guide>",
      mcpServers: Object.keys(options.mcpServers ?? {}),
      env: "<process env minus nested-session vars>",
      settings: options.settings,
      abortController: undefined
    },
    startedAt: new Date().toISOString()
  };
  await writeFile(join(outDir, "contract.json"), JSON.stringify(contract, null, 2));

  let outcome: Outcome = "FINISHED";
  let finalText = "";
  let costUsd: number | null = null;
  let initAudit: object | null = null;

  const softTimer = setTimeout(() => {
    surface.softLimitReached = true;
  }, opts.maxMinutes * 60_000);
  const hardTimer = setTimeout(() => {
    outcome = "TIME_LIMIT";
    abortController.abort();
  }, opts.maxMinutes * 60_000 + REPORT_GRACE_MS);

  try {
    await surface.start();
    for await (const msg of query({ prompt: opts.prompt, options }) as AsyncIterable<SDKMessage>) {
      await appendFile(transcriptPath, `${JSON.stringify(stripImages(msg))}\n`);
      if (msg.type === "system" && msg.subtype === "init") {
        const extraTools = msg.tools.filter((t) => !toolNames.includes(t));
        const extraServers = msg.mcp_servers.filter((s) => s.name !== serverName);
        initAudit = {
          tools: msg.tools,
          mcpServers: msg.mcp_servers,
          skills: msg.skills,
          plugins: msg.plugins,
          agents: msg.agents ?? [],
          model: msg.model,
          cwd: msg.cwd,
          claudeCodeVersion: msg.claude_code_version,
          extraTools,
          extraServers
        };
        // The init lists skills, plugins and agents the CLI discovered, not
        // ones the model can reach: `skills: []` hides the listing and the
        // Skill and Agent tools are absent. The tool set is the boundary.
        const ownServer = msg.mcp_servers.find((s) => s.name === serverName);
        const missingTools = toolNames.filter((t) => !msg.tools.includes(t));
        if (
          extraTools.length > 0 ||
          missingTools.length > 0 ||
          extraServers.length > 0 ||
          ownServer?.status !== "connected"
        ) {
          outcome = "BLOCKED_ENVIRONMENT";
          abortController.abort();
          break;
        }
      }
      if (msg.type === "assistant") {
        const notes = msg.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        if (notes.trim()) {
          await appendFile(logPath, `${notes.trim()}\n\n`);
        }
      }
      if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype === "success") {
          finalText = msg.result;
        } else if (outcome === "FINISHED") {
          outcome = "RUNNER_ERROR";
        }
      }
    }
  } catch (err) {
    if (outcome === "FINISHED") {
      outcome = "RUNNER_ERROR";
    }
    await writeFile(
      join(outDir, "private", "runner-error.txt"),
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
  } finally {
    clearTimeout(softTimer);
    clearTimeout(hardTimer);
    await surface.close();
  }

  if (outcome === "FINISHED" && surface.actions >= opts.maxActions) {
    outcome = "ACTION_LIMIT";
  }
  if (outcome === "FINISHED" && surface.softLimitReached) {
    outcome = "TIME_LIMIT";
  }
  const elapsedMs = Date.now() - surface.startedAt;
  const summary = {
    sessionId: opts.contract.sessionId,
    outcome,
    validity: outcome === "BLOCKED_ENVIRONMENT" ? "unverified" : "boundary-audited",
    accountContext,
    actions: surface.actions,
    elapsedMs,
    ...opts.summary?.(),
    overheadMs: elapsedMs - surface.surfaceMs,
    agentCostUsd: costUsd,
    initAudit
  };
  await writeFile(join(outDir, "participant-report.md"), finalText || "(no final account)\n");
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (outcome === "BLOCKED_ENVIRONMENT" || outcome === "RUNNER_ERROR") {
    process.exitCode = 1;
  }
  return summary;
}
