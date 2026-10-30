/**
 * `nodetool telemetry` — the CLI's consent controls for anonymous usage
 * analytics. Nothing is sent until `enable` runs, and nothing here ever
 * prompts. See docs/analytics.md.
 */
import type { Command } from "commander";
import {
  ANALYTICS_EVENTS,
  isAnalyticsDisabledByEnv,
  type AnalyticsClient
} from "@nodetool-ai/analytics";
import { defaultCliAnalyticsPath } from "@nodetool-ai/analytics/node";

import { asJson, printKv } from "./output.js";
import { cliAnalyticsEndpoint, createCliAnalyticsClient } from "../telemetry.js";

type Env = Readonly<Record<string, string | undefined>>;

export const NEVER_COLLECTED = [
  "command lines, arguments and flags",
  "file paths, file names and the working directory",
  "environment variables, API keys and tokens",
  "stdin, stdout and stderr",
  "prompts, workflow contents and outputs",
  "URLs you pass to commands",
  "account, project and workflow IDs"
] as const;

export interface TelemetryStatus {
  enabled: boolean;
  consent: string;
  disabledByEnv: boolean;
  configFile: string;
  endpoint: string;
  pendingEvents: number;
}

export async function telemetryStatus(
  client: AnalyticsClient,
  env: Env,
  configFile: string
): Promise<TelemetryStatus> {
  await client.ready;
  const disabledByEnv = isAnalyticsDisabledByEnv(env);
  const consent = client.getConsent().productAnalytics;
  return {
    enabled: consent === "granted" && !disabledByEnv,
    consent,
    disabledByEnv,
    configFile,
    endpoint: cliAnalyticsEndpoint(env),
    pendingEvents: client.pendingEvents().length
  };
}

function printStatus(status: TelemetryStatus): void {
  printKv({
    "Anonymous usage analytics": status.enabled ? "enabled" : "disabled",
    Consent: status.consent,
    "Disabled by environment": status.disabledByEnv
      ? "yes (NODETOOL_TELEMETRY or DO_NOT_TRACK)"
      : "no",
    "Config file": status.configFile,
    Endpoint: status.endpoint,
    "Unsent events": status.pendingEvents
  });
}

export function registerTelemetryCommands(
  program: Command,
  deps: { env?: Env; configFile?: string } = {}
): void {
  const env = deps.env ?? process.env;
  const configFile = deps.configFile ?? defaultCliAnalyticsPath();
  const client = (): AnalyticsClient =>
    createCliAnalyticsClient({ env, storePath: configFile });

  const telemetry = program
    .command("telemetry")
    .description(
      "Anonymous usage analytics for the CLI: off until you enable it"
    );

  telemetry
    .command("enable")
    .description("Share anonymous, coarse usage events")
    .action(async () => {
      const c = client();
      await c.setConsent("productAnalytics", "granted");
      console.log(
        "Anonymous usage analytics enabled. The CLI sends the command category, " +
          "platform, version and bucketed run counts and durations."
      );
      console.log(`Never collected: ${NEVER_COLLECTED.join("; ")}.`);
      if (isAnalyticsDisabledByEnv(env)) {
        console.log(
          "NODETOOL_TELEMETRY or DO_NOT_TRACK is set, so nothing is sent while it stays set."
        );
      }
      console.log("Run `nodetool telemetry disable` to turn it off.");
      c.shutdown();
    });

  telemetry
    .command("disable")
    .description("Stop sending and delete unsent events and the anonymous ID")
    .action(async () => {
      const c = client();
      await c.setConsent("productAnalytics", "denied");
      console.log("Anonymous usage analytics disabled. Unsent events and the anonymous ID were deleted.");
      c.shutdown();
    });

  telemetry
    .command("status")
    .description("Show whether telemetry is on and why")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const c = client();
      const status = await telemetryStatus(c, env, configFile);
      if (opts.json) asJson(status);
      else printStatus(status);
      c.shutdown();
    });

  telemetry
    .command("inspect")
    .description("Print unsent events and an example event exactly as they would be sent, without sending")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const c = client();
      const status = await telemetryStatus(c, env, configFile);
      const example = c.preview({
        event: "cli_started",
        properties: { commandCategory: "run" }
      });
      const report = {
        status,
        pending: c.pendingEvents(),
        example,
        events: Object.keys(ANALYTICS_EVENTS),
        neverCollected: NEVER_COLLECTED
      };
      if (opts.json) {
        asJson(report);
      } else {
        printStatus(status);
        console.log("\nExample event (not sent):");
        console.log(JSON.stringify(example, null, 2));
        console.log(`\nUnsent events (${report.pending.length}):`);
        for (const event of report.pending) console.log(JSON.stringify(event));
        console.log(`\nNever collected: ${NEVER_COLLECTED.join("; ")}.`);
      }
      c.shutdown();
    });
}
