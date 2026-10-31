/**
 * CLI product analytics: off unless the user ran `nodetool telemetry enable`.
 *
 * The CLI never prompts for consent, so scripts, CI, agents and `npx` runs
 * behave the same whether or not anyone could answer. `NODETOOL_TELEMETRY=0`
 * and `DO_NOT_TRACK=1` always win over stored consent, and no variable turns
 * telemetry on. Events carry the top-level command category and buckets only:
 * never arguments, paths, the working directory, environment variables or
 * any output. Sending is bounded to about a second after the command has
 * finished, never prints, and never changes the exit code.
 *
 * See docs/analytics.md.
 */
import { createRequire } from "node:module";
import {
  COMMAND_CATEGORIES,
  DEFAULT_ANALYTICS_ENDPOINT,
  createAnalyticsClient,
  createFetchTransport,
  isAnalyticsDisabledByEnv,
  platformFromNode,
  type AnalyticsClient,
  type AnalyticsEvent,
  type AnalyticsTransport,
  type CommandCategory
} from "@nodetool-ai/analytics";
import {
  createFileAnalyticsStore,
  defaultCliAnalyticsPath
} from "@nodetool-ai/analytics/node";

type Env = Readonly<Record<string, string | undefined>>;

/** How long the CLI waits for a send after the command finished. */
export const CLI_FLUSH_BUDGET_MS = 1_000;

const CLI_VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

/** Top-level commands reported under a category other than their own name. */
const COMMAND_ALIASES: Readonly<Record<string, CommandCategory>> = {
  apps: "app",
  generate: "run",
  pack: "packs",
  package: "packs",
  runtime: "packs",
  extension: "packs",
  "js-script": "run",
  jobs: "workflows",
  runs: "workflows",
  assets: "workflows"
};

/**
 * Map a top-level command name to its category. Only the name commander
 * matched is used, never `process.argv`, so no user value can reach it.
 */
export function commandCategory(commandName: string | undefined): CommandCategory {
  if (!commandName) return "other";
  const alias = COMMAND_ALIASES[commandName];
  if (alias) return alias;
  return (COMMAND_CATEGORIES as readonly string[]).includes(commandName)
    ? (commandName as CommandCategory)
    : "other";
}

/**
 * The ingestion URL. `NODETOOL_ANALYTICS_ENDPOINT` points a self-hosted or
 * test install elsewhere; it only redirects events, it never enables them.
 */
export function cliAnalyticsEndpoint(env: Env): string {
  const configured = env["NODETOOL_ANALYTICS_ENDPOINT"]?.trim();
  if (!configured) return DEFAULT_ANALYTICS_ENDPOINT;
  try {
    const url = new URL(configured);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
      return url.toString();
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_ANALYTICS_ENDPOINT;
}

export interface CliTelemetryOptions {
  env?: Env;
  storePath?: string;
  transport?: AnalyticsTransport;
  platform?: NodeJS.Platform;
}

export function createCliAnalyticsClient(
  options: CliTelemetryOptions = {}
): AnalyticsClient {
  const env = options.env ?? process.env;
  return createAnalyticsClient({
    clientType: "npm_cli",
    appVersion: CLI_VERSION,
    platform: platformFromNode(options.platform ?? process.platform),
    store: createFileAnalyticsStore(options.storePath ?? defaultCliAnalyticsPath()),
    transport:
      options.transport ??
      createFetchTransport({ url: cliAnalyticsEndpoint(env), timeoutMs: CLI_FLUSH_BUDGET_MS }),
    // The CLI sends once, after the command, instead of on a timer.
    flushDelayMs: null
  });
}

export interface CliTelemetrySession {
  track(event: AnalyticsEvent): void;
  /** Send what was recorded, waiting at most {@link CLI_FLUSH_BUDGET_MS}. */
  finish(): Promise<void>;
}

const NOOP_SESSION: CliTelemetrySession = {
  track: () => undefined,
  finish: async () => undefined
};

let active: CliTelemetrySession = NOOP_SESSION;

/**
 * Begin telemetry for one invocation. With consent absent or an env override
 * set, every later call is a no-op and nothing is read beyond the consent
 * file. Never throws.
 */
export function startCliTelemetry(
  commandName: string | undefined,
  options: CliTelemetryOptions = {}
): CliTelemetrySession {
  try {
    const env = options.env ?? process.env;
    if (isAnalyticsDisabledByEnv(env)) {
      active = NOOP_SESSION;
      return active;
    }
    // `telemetry status|inspect|enable|disable` manage consent; reporting
    // them would send an event as a side effect of turning telemetry on.
    if (commandName === "telemetry") {
      active = NOOP_SESSION;
      return active;
    }
    const client = createCliAnalyticsClient(options);
    client.track({
      event: "cli_started",
      properties: { commandCategory: commandCategory(commandName) }
    });
    let finished = false;
    active = {
      track: (event) => client.track(event),
      async finish() {
        if (finished) return;
        finished = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const budget = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CLI_FLUSH_BUDGET_MS);
          timer.unref();
        });
        try {
          await Promise.race([client.flush({ force: true }), budget]);
        } catch {
          // Telemetry never affects the command.
        } finally {
          if (timer) clearTimeout(timer);
          client.shutdown();
        }
      }
    };
    return active;
  } catch {
    active = NOOP_SESSION;
    return active;
  }
}

/** Record an event on the current invocation, if telemetry is on. */
export function trackCliEvent(event: AnalyticsEvent): void {
  try {
    active.track(event);
  } catch {
    // Never surfaces.
  }
}

/** Flush the current invocation's events. Call before `process.exit`. */
export async function finishCliTelemetry(): Promise<void> {
  try {
    await active.finish();
  } catch {
    // Never surfaces.
  }
}
