/**
 * `nodetool triggers list|register|unregister|fire`.
 *
 * A trigger listens inside a running server: its scheduler, webhook route and
 * file watcher read the registrations, and firing one goes through its
 * dispatcher. So every command here calls the server (`--api-url`, else
 * `NODETOOL_API_URL`, else the local server on port 7777), never the local
 * database.
 *
 * Saving a workflow creates one registration per trigger node, switched off.
 * `register` switches one on and `unregister` switches it off. The row itself
 * follows the graph: it goes away when the trigger node is removed.
 *
 * Agents cannot reach these procedures (`sandbox-coverage.ts` withholds them),
 * so no capability backs these commands. Arming a trigger leaves execution
 * behind that outlives the run that armed it.
 */

import type { Command } from "commander";
import type { EditorTriggerRegistration } from "@nodetool-ai/protocol/api-schemas/triggers.js";
import type { JsonValue } from "@nodetool-ai/protocol/zod-schema";
import { createApiClient } from "../api-client.js";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import { asJson, printKv, printTable } from "@nodetool-ai/cli-common/commands/output";

const DEFAULT_API_URL = "http://127.0.0.1:7777";

interface TriggerOptions {
  apiUrl?: string;
  json?: boolean;
}

interface ListOptions extends TriggerOptions {
  workflowId?: string;
  showSecrets?: boolean;
}

interface FireOptions extends TriggerOptions {
  payload?: string;
  idempotencyKey?: string;
}

function client(opts: TriggerOptions): ReturnType<typeof createApiClient> {
  return createApiClient(opts.apiUrl ?? DEFAULT_API_URL);
}

function fail(error: unknown, json?: boolean): void {
  process.exitCode = printCommandError(error, json);
}

/** The webhook secret signs deliveries, so it is shown only on request. */
function redact(
  registration: EditorTriggerRegistration,
  showSecrets: boolean
): EditorTriggerRegistration {
  if (showSecrets || registration.webhook_secret === null) {
    return registration;
  }
  return { ...registration, webhook_secret: "***" };
}

function parsePayload(raw: string | undefined): JsonValue | undefined {
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as JsonValue;
  } catch (error) {
    throw new Error(
      `--payload must be JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function common(command: Command): Command {
  return command
    .option(
      "--api-url <url>",
      `Server that runs the triggers (default ${DEFAULT_API_URL})`,
      process.env["NODETOOL_API_URL"]
    )
    .option("--json", "Output as JSON");
}

export function registerTriggerCommands(program: Command): void {
  const triggers = program
    .command("triggers")
    .description(
      "Workflow triggers on a running server: list, register, unregister, fire"
    );

  common(
    triggers
      .command("list")
      .description(
        "List trigger registrations. With --workflow-id, every registration of " +
          "that workflow, on or off, with its schedule and webhook details. " +
          "Without it, the active ones and the ones the server switched off."
      )
      .option("--workflow-id <id>", "Only this workflow's registrations")
      .option("--show-secrets", "Print webhook secrets instead of ***")
  ).action(async (opts: ListOptions) => {
    try {
      const api = client(opts);
      if (opts.workflowId) {
        const { triggers: rows } = await api.triggers.listByWorkflow.query({
          workflowId: opts.workflowId
        });
        const shown = rows.map((row) => redact(row, opts.showSecrets === true));
        if (opts.json) {
          asJson(shown);
          return;
        }
        printTable(
          shown.map((row) => ({
            ...row,
            schedule: row.cron_expr
              ? `${row.cron_expr} (${row.cron_tz ?? "UTC"})`
              : row.interval_seconds !== null
                ? `every ${row.interval_seconds}s`
                : ""
          })),
          ["id", "node_id", "kind", "enabled", "schedule", "next_fire_at", "run_count", "last_error"]
        );
        return;
      }
      const { triggers: rows } = await api.triggers.running.query(undefined);
      if (opts.json) {
        asJson(rows);
        return;
      }
      printTable(rows, ["id", "workflow_id", "node_id", "kind", "enabled", "last_fired_at", "run_count", "disabled_reason"]);
    } catch (error) {
      fail(error, opts.json);
    }
  });

  common(
    triggers
      .command("register <registration_id>")
      .description(
        "Switch a trigger registration on, so the server starts listening for it. " +
          "Find the id with `triggers list --workflow-id <id>`."
      )
  ).action(async (id: string, opts: TriggerOptions) => {
    try {
      const row = await client(opts).triggers.start.mutate({ id });
      if (opts.json) {
        asJson(row);
        return;
      }
      printKv(row);
    } catch (error) {
      fail(error, opts.json);
    }
  });

  common(
    triggers
      .command("unregister <registration_id>")
      .description(
        "Switch a trigger registration off. The registration stays while the " +
          "trigger node is in the workflow, so `register` can switch it on again."
      )
  ).action(async (id: string, opts: TriggerOptions) => {
    try {
      const row = await client(opts).triggers.stop.mutate({ id });
      if (opts.json) {
        asJson(row);
        return;
      }
      printKv(row);
    } catch (error) {
      fail(error, opts.json);
    }
  });

  common(
    triggers
      .command("fire <registration_id>")
      .description(
        "Deliver one event to an active trigger and run its workflow, as a " +
          "webhook call or a schedule tick would. Waits for the run to " +
          "finish, then prints its job id."
      )
      .option("--payload <json>", "Event payload as JSON (default {})")
      .option(
        "--idempotency-key <key>",
        "Fire at most once for this key; a repeat is refused"
      )
  ).action(async (id: string, opts: FireOptions) => {
    try {
      const result = await client(opts).triggers.fire.mutate({
        registrationId: id,
        payload: parsePayload(opts.payload),
        idempotencyKey: opts.idempotencyKey
      });
      if (opts.json) {
        asJson(result);
        return;
      }
      console.log(result.job_id);
    } catch (error) {
      fail(error, opts.json);
    }
  });
}
