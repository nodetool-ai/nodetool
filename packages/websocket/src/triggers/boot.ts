/**
 * Boot wiring for the trigger subsystem.
 *
 * Everything the other trigger modules build is inert until this runs: the
 * database-backed stores, the `TriggerWakeupService` every ingestion adapter
 * appends through, the dispatcher that turns stored inputs into runs, and the
 * scheduler and file-watch adapters. Extracted from `server.ts` so it can be
 * started, stopped, and tested without booting the whole HTTP server — and so
 * embedded hosts (CLI harnesses, tests) can leave it out entirely.
 *
 * The wakeup service is installed as the process-wide singleton
 * (`setTriggerWakeupService`) so the manual-fire API and the webhook route
 * reach the same DB-backed instance rather than a lazily created memory
 * default. This is what makes `trigger_inputs` rows — and therefore
 * restart-safe dedupe and the boot backlog — real.
 *
 * The webhook route is a Fastify plugin and must be registered before
 * `app.listen`, i.e. before this module's services exist. It therefore reaches
 * the service and dispatcher through the module accessors instead of captured
 * references (`createTriggerWebhookRoute`).
 */

import { createLogger } from "@nodetool-ai/config";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { FastifyPluginAsync } from "fastify";
import {
  getActiveDispatcher,
  getTriggerWakeupService,
  setTriggerWakeupService,
  startDispatcher,
  type DispatcherHandle,
  type StartTriggerJob
} from "./dispatcher.js";
import { startFileWatch, type FileWatchHandle } from "./file-watch.js";
import { startScheduler, type SchedulerHandle } from "./scheduler.js";
import {
  DrizzleDurableInboxStore,
  DrizzleTriggerInputStore
} from "./stores.js";
import { createWebhookRoute } from "./webhook-route.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.boot");

/**
 * Whether the host should run trigger ingestion. Set
 * `NODETOOL_DISABLE_TRIGGERS=1` to opt a process out — a second server sharing
 * one database, or an embedded/CLI server that must not start background work.
 */
export function triggersEnabled(): boolean {
  const raw = process.env["NODETOOL_DISABLE_TRIGGERS"];
  if (!raw) return true;
  return !["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export interface StartTriggerServicesOptions {
  /** Overrides the `NODETOOL_DISABLE_TRIGGERS` env check. */
  enabled?: boolean;
  /** Run the schedule adapter. Defaults to true. */
  scheduler?: boolean;
  /** Run the file-watch adapter. Defaults to true. */
  fileWatch?: boolean;
  /** Node registry handed to the job starter. */
  registry?: NodeRegistry;
  /** Job starter; defaults to the dispatcher's `startHeadlessJob`. */
  startJob?: StartTriggerJob;
  dispatcherIntervalMs?: number;
  schedulerIntervalMs?: number;
  fileWatchIntervalMs?: number;
}

export interface TriggerServicesHandle {
  /** False when the subsystem was opted out; every member is then inert. */
  readonly enabled: boolean;
  /** The wired DB-backed service, or `null` when disabled. */
  readonly wakeupService: TriggerWakeupService | null;
  /** Hint the dispatcher that new inputs exist. */
  notify(): void;
  /** Await the dispatcher's current pass (tests, graceful shutdown). */
  drain(): Promise<void>;
  /** Stop the dispatcher timer, both adapters, and clear the singleton. */
  stop(): Promise<void>;
}

const DISABLED: TriggerServicesHandle = {
  enabled: false,
  wakeupService: null,
  notify: () => undefined,
  drain: () => Promise.resolve(),
  stop: () => Promise.resolve()
};

/**
 * The webhook ingestion plugin, bound to whatever service and dispatcher are
 * installed when a request arrives. Register it with the server's other routes;
 * `POST /api/webhooks/:token` is on the public-route allowlist and
 * authenticates per registration secret.
 */
export function createTriggerWebhookRoute(): FastifyPluginAsync {
  return createWebhookRoute({
    wakeupService: {
      deliverTriggerInput: (opts) =>
        getTriggerWakeupService().deliverTriggerInput(opts)
    },
    notify: () => {
      getActiveDispatcher()?.notify();
    }
  });
}

/**
 * Start the trigger subsystem. Safe to call on a host without a usable
 * database: construction failures are logged and yield an inert handle rather
 * than taking the server down with them.
 */
export function startTriggerServices(
  options: StartTriggerServicesOptions = {}
): TriggerServicesHandle {
  const enabled = options.enabled ?? triggersEnabled();
  if (!enabled) {
    log.info("Trigger ingestion disabled — no dispatcher or adapters started");
    return DISABLED;
  }

  const inputStore = new DrizzleTriggerInputStore();
  const wakeupService = new TriggerWakeupService(
    new DrizzleDurableInboxStore(),
    inputStore
  );
  setTriggerWakeupService(wakeupService);

  let dispatcher: DispatcherHandle | null = null;
  let scheduler: SchedulerHandle | null = null;
  let fileWatch: FileWatchHandle | null = null;

  try {
    // Starting the dispatcher also runs one immediate pass, which is the
    // boot-backlog drain: any input a previous process life stored but never
    // dispatched goes out now.
    const dispatcherOptions: Parameters<typeof startDispatcher>[0] = {
      store: inputStore
    };
    if (options.startJob) {
      dispatcherOptions.startJob = options.startJob;
    }
    if (options.registry) {
      dispatcherOptions.registry = options.registry;
    }
    if (options.dispatcherIntervalMs !== undefined) {
      dispatcherOptions.intervalMs = options.dispatcherIntervalMs;
    }
    dispatcher = startDispatcher(dispatcherOptions);

    const notify = dispatcher.notify;

    if (options.scheduler !== false) {
      const schedulerOptions: Parameters<typeof startScheduler>[0] = {
        wakeupService,
        notify
      };
      if (options.schedulerIntervalMs !== undefined) {
        schedulerOptions.intervalMs = options.schedulerIntervalMs;
      }
      scheduler = startScheduler(schedulerOptions);
    }

    if (options.fileWatch !== false) {
      const fileWatchOptions: Parameters<typeof startFileWatch>[0] = {
        wakeupService,
        notify
      };
      if (options.fileWatchIntervalMs !== undefined) {
        fileWatchOptions.intervalMs = options.fileWatchIntervalMs;
      }
      fileWatch = startFileWatch(fileWatchOptions);
    }
  } catch (err) {
    log.warn(
      "Trigger services failed to start — triggers are inactive for this process",
      err instanceof Error ? err : new Error(String(err))
    );
  }

  log.info("Trigger services started", {
    scheduler: scheduler !== null,
    fileWatch: fileWatch !== null
  });

  let stopped = false;

  return {
    enabled: true,
    wakeupService,
    notify: () => dispatcher?.notify(),
    drain: () => dispatcher?.drain() ?? Promise.resolve(),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      scheduler?.();
      dispatcher?.();
      // The file-watch teardown persists each registration's catch-up cursor,
      // so it is awaited rather than fired and forgotten.
      await fileWatch?.();
      if (getTriggerWakeupService() === wakeupService) {
        setTriggerWakeupService(null);
      }
    }
  };
}
