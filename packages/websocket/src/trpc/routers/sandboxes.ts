import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const execFileAsync = promisify(execFile);

const SANDBOX_NAME_PREFIX = "nodetool-sandbox-";
const MANAGED_LABEL = "com.nodetool.sandbox.managed";
const OWNER_LABEL = "com.nodetool.sandbox.owner";

const listOutput = z.array(
  z.object({
    container_id: z.string(),
    name: z.string(),
    status: z.string(),
    status_text: z.string(),
    age_seconds: z.number().int().nonnegative(),
    cpu_percent: z.number().nonnegative().nullable(),
    memory_usage_bytes: z.number().int().nonnegative().nullable(),
    memory_limit_bytes: z.number().int().nonnegative().nullable(),
    vnc_http_url: z.string().nullable(),
    vnc_ws_url: z.string().nullable()
  })
);

const actionInput = z.object({
  container_id: z.string().min(1)
});

const actionOutput = z.object({
  ok: z.literal(true)
});

const toolCallsInput = z.object({
  container_id: z.string().min(1),
  limit: z.number().int().min(1).max(500).default(100)
});

const toolCallsOutput = z.array(
  z.object({
    id: z.string(),
    timestamp: z.string().nullable(),
    tool_name: z.string().nullable(),
    message: z.string()
  })
);

interface DockerPsRow {
  ID?: string;
  Names?: string;
  State?: string;
  Status?: string;
}

interface DockerStatsRow {
  ID?: string;
  Container?: string;
  CPUPerc?: string;
  MemUsage?: string;
}

interface DockerInspect {
  Id?: string;
  Name?: string;
  Created?: string;
  State?: {
    Status?: string;
  };
  Config?: {
    Labels?: Record<string, string>;
  };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
}

function normalizeName(name?: string): string {
  if (!name) return "";
  return name.startsWith("/") ? name.slice(1) : name;
}

function isLoopbackIp(hostIp?: string): boolean {
  return hostIp === "127.0.0.1" || hostIp === "::1";
}

function isOwnedManagedSandbox(inspect: DockerInspect, userId: string): boolean {
  const name = normalizeName(inspect.Name);
  if (!name.startsWith(SANDBOX_NAME_PREFIX)) return false;
  const labels = inspect.Config?.Labels ?? {};
  return labels[MANAGED_LABEL] === "true" && labels[OWNER_LABEL] === userId;
}

async function runDocker(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("docker", args, {
      maxBuffer: 2 * 1024 * 1024
    });
    return typeof result === "string" ? result : result.stdout;
  } catch (error) {
    console.warn(
      `Sandbox router: docker command failed (${args.join(" ")})`,
      error
    );
    // Docker may be unavailable on this host; treat as no data.
    return "";
  }
}

function getStderr(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof (error as { stderr?: unknown }).stderr === "string"
  ) {
    return (error as { stderr: string }).stderr;
  }
  return "";
}

async function runDockerStrict(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("docker", args, {
      maxBuffer: 2 * 1024 * 1024
    });
    return typeof result === "string" ? result : result.stdout;
  } catch (error) {
    const stderr = getStderr(error);
    const normalizedStderr = stderr.trim().toLowerCase();
    if (
      normalizedStderr.includes("no such container") ||
      normalizedStderr.includes("not found")
    ) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Sandbox not found"
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sandbox operation failed"
    });
  }
}

function parseJsonLines<T>(input: string): T[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        // JSON parse failed, skip malformed line.
        return [];
      }
    });
}

function parsePercent(raw?: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseBytes(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*([kmgtp]?i?b)?$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? "b").toLowerCase();
  const kib = 1024;
  const mib = kib ** 2;
  const gib = kib ** 3;
  const tib = kib ** 4;
  const pib = kib ** 5;
  const factors: Record<string, number> = {
    b: 1,
    kb: 1_000,
    mb: 1_000_000,
    gb: 1_000_000_000,
    tb: 1_000_000_000_000,
    pb: 1_000_000_000_000_000,
    kib,
    mib,
    gib,
    tib,
    pib
  };
  const factor = factors[unit];
  if (factor === undefined) return null;
  return Math.round(value * factor);
}

function parseMemUsage(raw?: string): {
  usage: number | null;
  limit: number | null;
} {
  if (!raw) return { usage: null, limit: null };
  const [usageRaw, limitRaw] = raw.split("/").map((part) => part.trim());
  return {
    usage: parseBytes(usageRaw),
    limit: parseBytes(limitRaw)
  };
}

function getLoopbackPortBinding(
  inspect: DockerInspect | undefined,
  key: string
): {
  hostIp: string;
  hostPort: string;
} | null {
  const binding = inspect?.NetworkSettings?.Ports?.[key];
  if (!Array.isArray(binding) || binding.length === 0) return null;
  const first = binding[0];
  if (!first?.HostPort || !isLoopbackIp(first.HostIp)) return null;
  return {
    hostIp: first.HostIp ?? "127.0.0.1",
    hostPort: first.HostPort
  };
}

async function listOwnedSandboxes(userId: string): Promise<DockerInspect[]> {
  const psOut = await runDocker([
    "ps",
    "-a",
    "--filter",
    `name=${SANDBOX_NAME_PREFIX}`,
    "--format",
    "{{json .}}"
  ]);
  const rows = parseJsonLines<DockerPsRow>(psOut);
  const ids = rows.map((r) => r.ID).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const inspectOut = await runDocker(["inspect", ...ids]);
  if (!inspectOut) return [];

  try {
    const inspect = JSON.parse(inspectOut) as DockerInspect[];
    return inspect.filter((entry) => isOwnedManagedSandbox(entry, userId));
  } catch {
    // Failed to parse inspect output; return empty set.
    return [];
  }
}

function enforceSingleSandboxPolicy(sandboxes: DockerInspect[]): void {
  if (sandboxes.length > 1) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Only one active sandbox is allowed per user (found ${sandboxes.length})`
    });
  }
}

async function resolveOwnedSandbox(
  userId: string,
  containerId: string
): Promise<DockerInspect> {
  const owned = await listOwnedSandboxes(userId);
  enforceSingleSandboxPolicy(owned);
  const matched = owned.find((entry) => entry.Id === containerId);
  if (!matched) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sandbox does not belong to the current user"
    });
  }
  return matched;
}

// Sandbox tool routes/logs use snake_case names like shell_exec and browser_navigate.
// Keep this list in sync with sandbox-tools manifest entries when adding new tools.
const TOOL_NAME_REGEX =
  /\b(shell_[a-z_]+|browser_[a-z_]+|screen_capture|screen_click|file_[a-z_]+|search_web|message_notify_user|message_ask_user|deploy_expose_port)\b/;

export const sandboxesRouter = router({
  list: protectedProcedure.output(listOutput).query(async ({ ctx }) => {
    const owned = await listOwnedSandboxes(ctx.userId);
    enforceSingleSandboxPolicy(owned);
    if (owned.length === 0) return [];

    const ids = owned.map((entry) => entry.Id).filter((id): id is string => Boolean(id));
    const statsOut = await runDocker([
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
      ...ids
    ]);
    const statsRows = parseJsonLines<DockerStatsRow>(statsOut);
    const statsById = new Map<string, DockerStatsRow>();
    for (const row of statsRows) {
      if (row.ID) statsById.set(row.ID, row);
      if (row.Container) statsById.set(row.Container, row);
    }

    const now = Date.now();
    return owned
      .map((inspect) => {
        const id = inspect.Id;
        if (!id) return null;
        const stats = statsById.get(id) ?? statsById.get(normalizeName(inspect.Name));
        const createdAt = inspect.Created ? Date.parse(inspect.Created) : NaN;
        const ageSeconds = Number.isFinite(createdAt)
          ? Math.max(0, Math.floor((now - createdAt) / 1000))
          : 0;
        const vncBinding = getLoopbackPortBinding(inspect, "6080/tcp");
        const vncHttpUrl = vncBinding
          ? `http://${vncBinding.hostIp}:${vncBinding.hostPort}`
          : null;
        const vncWsUrl = vncBinding
          ? `ws://${vncBinding.hostIp}:${vncBinding.hostPort}`
          : null;
        const mem = parseMemUsage(stats?.MemUsage);

        return {
          container_id: id,
          name: normalizeName(inspect.Name) || id.slice(0, 12),
          status: inspect.State?.Status ?? "unknown",
          status_text: inspect.State?.Status ?? "unknown",
          age_seconds: ageSeconds,
          cpu_percent: parsePercent(stats?.CPUPerc),
          memory_usage_bytes: mem.usage,
          memory_limit_bytes: mem.limit,
          vnc_http_url: vncHttpUrl,
          vnc_ws_url: vncWsUrl
        };
      })
      .filter((entry): entry is z.infer<typeof listOutput>[number] => entry !== null);
  }),

  pause: protectedProcedure
    .input(actionInput)
    .output(actionOutput)
    .mutation(async ({ ctx, input }) => {
      await resolveOwnedSandbox(ctx.userId, input.container_id);
      await runDockerStrict(["pause", input.container_id]);
      return { ok: true as const };
    }),

  resume: protectedProcedure
    .input(actionInput)
    .output(actionOutput)
    .mutation(async ({ ctx, input }) => {
      await resolveOwnedSandbox(ctx.userId, input.container_id);
      await runDockerStrict(["unpause", input.container_id]);
      return { ok: true as const };
    }),

  kill: protectedProcedure
    .input(actionInput)
    .output(actionOutput)
    .mutation(async ({ ctx, input }) => {
      await resolveOwnedSandbox(ctx.userId, input.container_id);
      await runDockerStrict(["rm", "-f", input.container_id]);
      return { ok: true as const };
    }),

  toolCalls: protectedProcedure
    .input(toolCallsInput)
    .output(toolCallsOutput)
    .query(async ({ ctx, input }) => {
      await resolveOwnedSandbox(ctx.userId, input.container_id);
      const out = await runDockerStrict([
        "logs",
        "--timestamps",
        "--tail",
        String(input.limit),
        input.container_id
      ]);

      const lines = out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return lines.map((line, index) => {
        const match = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/);
        const timestamp = match?.[1] ?? null;
        const message = match?.[2] ?? line;
        const toolMatch = message.match(TOOL_NAME_REGEX);
        const messagePrefixKey = message
          .toLowerCase()
          .replace(/\s+/g, "-")
          .slice(0, 48);
        return {
          id: `${input.container_id}-line${index}-${timestamp ?? "none"}-${messagePrefixKey}`,
          timestamp,
          tool_name: toolMatch?.[1] ?? null,
          message
        };
      });
    })
});
