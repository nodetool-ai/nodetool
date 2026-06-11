/**
 * `nodetool worker` CLI commands — GPU-worker provisioning, registered on a
 * Commander `Command` via `registerWorkerCommands(program)`.
 *
 * The whole group runs against a single `WorkerManager` (from
 * `@nodetool-ai/compute`), which owns the profiles→instances identity model and
 * loads each target's API key from the secret store. The CLI's only job is to
 * unlock the DB + master key (like the deleted `runpod-worker.ts` script did),
 * parse flags, and render the manager's results.
 *
 * Verbs:
 *   worker profile add <name> --target <t> --image <img> [--gpu <g>] [...]
 *   worker profile list [--json]
 *   worker profile rm <name>
 *   worker create --profile <name> [--attach]
 *   worker create --target <t> --image <img> [--gpu <g>] [--attach]   (inline)
 *   worker list [--json]
 *   worker status <id>
 *   worker stop <id> | --all
 */

import { Command } from "commander";

import { WorkerManager } from "@nodetool-ai/compute";
import { initDb } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath } from "@nodetool-ai/config";
import { registerWorkerModelsCommands } from "./worker-models.js";

const SUPPORTED_TARGETS = ["runpod", "vast"] as const;
type SupportedTarget = (typeof SUPPORTED_TARGETS)[number];

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Redact a high-entropy bearer token for human-readable output. Shows only the
 * first 8 characters so the user can confirm a token exists without leaking the
 * full secret to shell history, CI logs, or terminal transcripts. The full
 * token is retrievable on demand via `worker token <id>`.
 */
function maskToken(token: string | null | undefined): string {
  if (!token) {
    return "(none)";
  }
  return `${token.slice(0, 8)}… (full token: worker token <id>)`;
}

/** Print a simple aligned table. Missing values render as empty. */
function printTable(rows: Record<string, unknown>[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log(
      cols
        .map((c, i) => ` ${String(row[c] ?? "").padEnd(widths[i]!)} `)
        .join("│")
    );
  }
}

// ---------------------------------------------------------------------------
// Manager + DB setup
// ---------------------------------------------------------------------------

/**
 * Unlock the DB + master key (so the manager can read API keys from the secret
 * store) and return a fresh `WorkerManager`. Mirrors the resolution the deleted
 * `runpod-worker.ts` script used: best-effort init, env fallback handled inside
 * the manager.
 */
async function getWorkerManager(): Promise<WorkerManager> {
  try {
    initDb(getDefaultDbPath());
    await initMasterKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `Could not unlock the secret store: ${msg}\n` +
        `Falling back to env vars for provider API keys.`
    );
  }
  return new WorkerManager();
}

/** Unify error handling on every sub-command: print and exit non-zero. */
function runAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  };
}

function assertTarget(value: string): SupportedTarget {
  if (!SUPPORTED_TARGETS.includes(value as SupportedTarget)) {
    throw new Error(
      `Invalid --target '${value}': expected one of ${SUPPORTED_TARGETS.join(", ")}.`
    );
  }
  return value as SupportedTarget;
}

/** Build a profile `spec` JSON blob from the inline provisioning flags. */
function specFromFlags(opts: {
  gpu?: string;
  vcpu?: string;
}): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  if (opts.gpu) {
    spec.gpu = opts.gpu;
  }
  if (opts.vcpu) {
    const n = Number.parseInt(opts.vcpu, 10);
    if (Number.isFinite(n)) {
      spec.vcpu = n;
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkerCommands(program: Command): void {
  const worker = program
    .command("worker")
    .description("Provision, attach, and tear down GPU workers");

  registerProfile(worker);
  registerCreate(worker);
  registerList(worker);
  registerStatus(worker);
  registerToken(worker);
  registerStop(worker);
  registerWorkerModelsCommands(worker, getWorkerManager);
}

// ---------------------------------------------------------------------------
// worker profile
// ---------------------------------------------------------------------------

function registerProfile(worker: Command): void {
  const profile = worker
    .command("profile")
    .description("Manage reusable worker presets");

  profile
    .command("add <name>")
    .description("Create a worker profile")
    .requiredOption("--target <target>", "Provider target (runpod | vast)")
    .requiredOption("--image <image>", "Worker container image")
    .option("--gpu <gpu>", "GPU type (provider-specific)")
    .option("--vcpu <n>", "vCPU count")
    .option(
      "--token-policy <policy>",
      "Token policy (generate | fixed)",
      "generate"
    )
    .option("--idle-timeout <minutes>", "Idle auto-stop timeout in minutes")
    .option("--max-lifetime <minutes>", "Hard TTL in minutes")
    .action(
      runAction(
        async (
          name: string,
          opts: {
            target: string;
            image: string;
            gpu?: string;
            vcpu?: string;
            tokenPolicy: string;
            idleTimeout?: string;
            maxLifetime?: string;
          }
        ) => {
          const target = assertTarget(opts.target);
          const manager = await getWorkerManager();
          const created = await manager.createProfile({
            name,
            target,
            image: opts.image,
            spec: specFromFlags(opts),
            token_policy: opts.tokenPolicy,
            idle_timeout_minutes: opts.idleTimeout
              ? Number.parseInt(opts.idleTimeout, 10)
              : null,
            max_lifetime_minutes: opts.maxLifetime
              ? Number.parseInt(opts.maxLifetime, 10)
              : null
          });
          console.log(`Created worker profile '${created.name}'.`);
        }
      )
    );

  profile
    .command("list")
    .description("List worker profiles")
    .option("--json", "Output as JSON")
    .action(
      runAction(async (opts: { json?: boolean }) => {
        const manager = await getWorkerManager();
        const profiles = await manager.listProfiles();
        if (opts.json) {
          asJson(profiles);
          return;
        }
        printTable(
          profiles.map((p) => ({
            name: p.name,
            target: p.target,
            image: p.image,
            idle: p.idle_timeout_minutes ?? "",
            ttl: p.max_lifetime_minutes ?? ""
          })),
          ["name", "target", "image", "idle", "ttl"]
        );
      })
    );

  profile
    .command("rm <name>")
    .description("Delete a worker profile")
    .action(
      runAction(async (name: string) => {
        const manager = await getWorkerManager();
        await manager.deleteProfile(name);
        console.log(`Deleted worker profile '${name}'.`);
      })
    );
}

// ---------------------------------------------------------------------------
// worker create
// ---------------------------------------------------------------------------

function registerCreate(worker: Command): void {
  worker
    .command("create")
    .description("Provision a worker from a profile (or inline flags)")
    .option("--profile <name>", "Provision from an existing profile")
    .option("--target <target>", "Inline: provider target (runpod | vast)")
    .option("--image <image>", "Inline: worker container image")
    .option("--gpu <gpu>", "Inline: GPU type")
    .option("--vcpu <n>", "Inline: vCPU count")
    .option(
      "--token-policy <policy>",
      "Inline: token policy (generate | fixed)",
      "generate"
    )
    .option("--idle-timeout <minutes>", "Inline: idle auto-stop in minutes")
    .option("--max-lifetime <minutes>", "Inline: hard TTL in minutes")
    .option("--attach", "Attach the new worker once it is running")
    .action(
      runAction(
        async (opts: {
          profile?: string;
          target?: string;
          image?: string;
          gpu?: string;
          vcpu?: string;
          tokenPolicy: string;
          idleTimeout?: string;
          maxLifetime?: string;
          attach?: boolean;
        }) => {
          const manager = await getWorkerManager();

          let profileName = opts.profile;
          if (!profileName) {
            // Inline form: synthesise a one-off profile from the flags.
            if (!opts.target || !opts.image) {
              throw new Error(
                "Provide --profile <name>, or the inline form " +
                  "--target <t> --image <img> [--gpu <g>]."
              );
            }
            const target = assertTarget(opts.target);
            profileName = `inline-${target}-${Date.now()}`;
            await manager.createProfile({
              name: profileName,
              target,
              image: opts.image,
              spec: specFromFlags(opts),
              token_policy: opts.tokenPolicy,
              idle_timeout_minutes: opts.idleTimeout
                ? Number.parseInt(opts.idleTimeout, 10)
                : null,
              max_lifetime_minutes: opts.maxLifetime
                ? Number.parseInt(opts.maxLifetime, 10)
                : null
            });
          }

          const instance = await manager.provision(profileName);
          console.log(`Provisioned worker '${instance.id}'.`);
          console.log(`  wsUrl: ${instance.ws_url}`);
          console.log(`  token: ${maskToken(instance.token)}`);
          console.log(`  status: ${instance.status}`);

          if (opts.attach) {
            const conn = await manager.attach(instance.id);
            console.log(`Attached. Bridge target: ${conn.wsUrl}`);
            console.log(`export NODETOOL_WORKER_URL=${conn.wsUrl}`);
            if (conn.token) {
              // Never print the raw bearer token to stdout — it would leak into
              // shell history, CI logs, and terminal transcripts. Give a
              // pipeable retrieval path instead (token: ${maskToken(conn.token)}).
              console.log("# NODETOOL_WORKER_TOKEN was redacted; set it with:");
              console.log(
                `#   export NODETOOL_WORKER_TOKEN=$(nodetool worker token ${instance.id})`
              );
            }
          }
        }
      )
    );
}

// ---------------------------------------------------------------------------
// worker list
// ---------------------------------------------------------------------------

function registerList(worker: Command): void {
  worker
    .command("list")
    .description("List worker instances")
    .option("--json", "Output as JSON")
    .action(
      runAction(async (opts: { json?: boolean }) => {
        const manager = await getWorkerManager();
        const instances = await manager.list();
        if (opts.json) {
          asJson(instances);
          return;
        }
        printTable(
          instances.map((i) => ({
            id: i.id,
            profile: i.profile_name,
            target: i.target,
            status: i.status,
            cost: i.estimated_cost_usd ?? "",
            ws_url: i.ws_url
          })),
          ["id", "profile", "target", "status", "cost", "ws_url"]
        );
      })
    );
}

// ---------------------------------------------------------------------------
// worker status
// ---------------------------------------------------------------------------

function registerStatus(worker: Command): void {
  worker
    .command("status <id>")
    .description("Refresh a worker instance's status from its provider")
    .action(
      runAction(async (id: string) => {
        const manager = await getWorkerManager();
        const state = await manager.status(id);
        console.log(state);
      })
    );
}

// ---------------------------------------------------------------------------
// worker token
// ---------------------------------------------------------------------------

function registerToken(worker: Command): void {
  worker
    .command("token <id>")
    .description(
      "Print a worker's decrypted bearer token (pipe into NODETOOL_WORKER_TOKEN)"
    )
    .action(
      runAction(async (id: string) => {
        const manager = await getWorkerManager();
        // getInstance decrypts on demand; bulk `list` withholds the token.
        const instance = await manager.getInstance(id);
        if (!instance) {
          throw new Error(`Worker instance not found: ${id}`);
        }
        if (!instance.token) {
          throw new Error(`Worker instance '${id}' has no token (open worker).`);
        }
        // Print ONLY the token so it pipes cleanly, e.g.
        //   export NODETOOL_WORKER_TOKEN=$(nodetool worker token i1)
        console.log(instance.token);
      })
    );
}

// ---------------------------------------------------------------------------
// worker stop
// ---------------------------------------------------------------------------

function registerStop(worker: Command): void {
  worker
    .command("stop [id]")
    .description("Stop a worker by id, or every worker with --all")
    .option("--all", "Stop every non-stopped worker")
    .action(
      runAction(async (id: string | undefined, opts: { all?: boolean }) => {
        const manager = await getWorkerManager();
        if (opts.all) {
          await manager.stopAll();
          console.log("Stopped all workers.");
          return;
        }
        if (!id) {
          throw new Error("Provide a worker id, or --all to stop everything.");
        }
        await manager.stop(id);
        console.log(`Stopped worker '${id}'.`);
      })
    );
}
