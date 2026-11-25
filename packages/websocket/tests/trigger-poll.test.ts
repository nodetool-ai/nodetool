/**
 * The poll adapter serves a trigger whose events live in an external system.
 * A fake poller stands in for the node, so no test touches a mailbox. The
 * poller keeps its "mailbox" outside the registration, the way a real server
 * keeps mail, which is what makes the restart tests meaningful: only the cursor
 * string in the registration survives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllSecretCache,
  initTestDb,
  ModelObserver,
  Secret,
  TriggerRegistration,
  Workflow
} from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import { NodeRegistry, BaseNode } from "@nodetool-ai/node-sdk";
import type {
  TriggerPollInput,
  TriggerPollResult
} from "@nodetool-ai/node-sdk";
import { setMasterKey } from "@nodetool-ai/security";
import { TRIGGER_MAX_CONSECUTIVE_FAILURES } from "@nodetool-ai/protocol";
import {
  createRegistryPollerResolver,
  POLL_ERROR_PREFIX,
  type TriggerPoller,
  type TriggerPollerResolver
} from "../src/triggers/poll.js";
import { runSchedulerSweepOnce } from "../src/triggers/scheduler.js";
import { syncRegistrations } from "../src/triggers/registration-sync.js";

const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const MINUTE = 60_000;
const USER = "user-1";

/** A mailbox of numbered messages whose poll position is its cursor. */
class FakeMailbox {
  uids: number[] = [];
  polls: TriggerPollInput[] = [];
  failWith: Error | null = null;
  perPoll = 100;

  poller(requiredSettings: string[] = []): TriggerPoller {
    return {
      requiredSettings,
      poll: async (input): Promise<TriggerPollResult> => {
        this.polls.push(input);
        if (this.failWith) throw this.failWith;
        const newest = Math.max(0, ...this.uids);
        if (input.cursor === null) {
          return { events: [], cursor: String(newest) };
        }
        const last = Number(input.cursor);
        const batch = this.uids.filter((u) => u > last).slice(0, this.perPoll);
        return {
          events: batch.map((uid) => ({
            id: `v1:${uid}`,
            payload: { source: "email", uid },
            cursor: String(uid)
          })),
          cursor: String(batch.at(-1) ?? last)
        };
      }
    };
  }
}

async function makeRegistration(
  overrides: Partial<{
    config: Record<string, unknown>;
    cursor: string | null;
    lastFiredAtMs: number | null;
  }> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: USER,
    workflow_id: "wf-1",
    node_id: "n1",
    kind: "schedule",
    config_json: { interval_seconds: 60, ...overrides.config },
    enabled: 1,
    cursor: overrides.cursor ?? null,
    created_at: new Date(BASE_TIME).toISOString(),
    updated_at: new Date(BASE_TIME).toISOString(),
    last_fired_at:
      overrides.lastFiredAtMs != null
        ? new Date(overrides.lastFiredAtMs).toISOString()
        : null
  })) as TriggerRegistration;
}

async function reload(id: string): Promise<TriggerRegistration> {
  return (await TriggerRegistration.get(id)) as TriggerRegistration;
}

function resolverFor(poller: TriggerPoller): TriggerPollerResolver {
  return async () => poller;
}

/** A sweep at `now`, with a wakeup service that records what it delivers. */
async function sweep(
  poller: TriggerPoller,
  now: number,
  wakeupService = new TriggerWakeupService()
) {
  // Spying again on a service keeps the earlier calls, so start each sweep clean.
  const deliver = vi.spyOn(wakeupService, "deliverTriggerInput");
  deliver.mockClear();
  const notify = vi.fn();
  await runSchedulerSweepOnce({
    wakeupService,
    notify,
    now: () => now,
    resolvePoller: resolverFor(poller)
  });
  return { deliver, notify, wakeupService };
}

describe("poll adapter", () => {
  beforeEach(() => {
    initTestDb();
    setMasterKey("dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz");
    clearAllSecretCache();
  });
  afterEach(() => {
    ModelObserver.clear();
    clearAllSecretCache();
  });

  it("takes a baseline on the first poll and starts no run", async () => {
    const mailbox = new FakeMailbox();
    mailbox.uids = [1, 2, 3];
    const registration = await makeRegistration();

    const { deliver, notify } = await sweep(mailbox.poller(), BASE_TIME);

    expect(deliver).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(mailbox.polls[0].cursor).toBeNull();
    const after = await reload(registration.id);
    expect(after.cursor).toBe("3");
    expect(after.last_fired_at).toBe(new Date(BASE_TIME).toISOString());
  });

  it("starts one run per new event, each with its own idempotency key", async () => {
    const mailbox = new FakeMailbox();
    mailbox.uids = [1];
    const registration = await makeRegistration({ cursor: "1", lastFiredAtMs: BASE_TIME });
    mailbox.uids = [1, 2, 3];

    const { deliver, notify } = await sweep(mailbox.poller(), BASE_TIME + MINUTE);

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls.map(([c]) => c)).toEqual([
      {
        runId: "wf-1",
        nodeId: "n1",
        inputId: `${registration.id}:v1:2`,
        payload: { source: "email", uid: 2 }
      },
      {
        runId: "wf-1",
        nodeId: "n1",
        inputId: `${registration.id}:v1:3`,
        payload: { source: "email", uid: 3 }
      }
    ]);
    expect(notify).toHaveBeenCalledTimes(2);
    expect((await reload(registration.id)).cursor).toBe("3");
  });

  it("starts no run when the poll finds nothing, and waits one interval for the next", async () => {
    const mailbox = new FakeMailbox();
    mailbox.uids = [1];
    await makeRegistration({ cursor: "1", lastFiredAtMs: BASE_TIME });

    const { deliver } = await sweep(mailbox.poller(), BASE_TIME + MINUTE);
    expect(deliver).not.toHaveBeenCalled();
    expect(mailbox.polls).toHaveLength(1);

    // Not due again until another minute has passed.
    await sweep(mailbox.poller(), BASE_TIME + MINUTE + 30_000);
    expect(mailbox.polls).toHaveLength(1);
    await sweep(mailbox.poller(), BASE_TIME + 2 * MINUTE);
    expect(mailbox.polls).toHaveLength(2);
  });

  it("neither re-fires old mail nor misses new mail across a restart", async () => {
    const mailbox = new FakeMailbox();
    mailbox.uids = [1, 2];
    const registration = await makeRegistration();
    const wakeupService = new TriggerWakeupService();

    await sweep(mailbox.poller(), BASE_TIME, wakeupService);
    mailbox.uids.push(3);
    const first = await sweep(mailbox.poller(), BASE_TIME + MINUTE, wakeupService);
    expect(first.deliver).toHaveBeenCalledTimes(1);

    // The server stops. Mail arrives while it is down. A new process has a new
    // wakeup service and a new scheduler, and only the database survives.
    mailbox.uids.push(4, 5);
    const restarted = await sweep(
      mailbox.poller(),
      BASE_TIME + 10 * MINUTE,
      new TriggerWakeupService()
    );
    expect(restarted.deliver.mock.calls.map(([c]) => c.inputId)).toEqual([
      `${registration.id}:v1:4`,
      `${registration.id}:v1:5`
    ]);

    const quiet = await sweep(mailbox.poller(), BASE_TIME + 11 * MINUTE);
    expect(quiet.deliver).not.toHaveBeenCalled();
  });

  it("does not start a second run for an event whose cursor was never saved", async () => {
    // A crash after the input is stored and before the cursor is written
    // replays the same event. The wakeup service drops the repeat.
    const mailbox = new FakeMailbox();
    mailbox.uids = [1];
    const registration = await makeRegistration({ cursor: "1", lastFiredAtMs: BASE_TIME });
    mailbox.uids = [1, 2];
    const wakeupService = new TriggerWakeupService();

    const first = await sweep(mailbox.poller(), BASE_TIME + MINUTE, wakeupService);
    await expect(first.deliver.mock.results[0].value).resolves.toBe(true);

    await TriggerRegistration.updateColumns(registration.id, {
      cursor: "1",
      last_fired_at: new Date(BASE_TIME).toISOString()
    });
    const replay = await sweep(mailbox.poller(), BASE_TIME + 2 * MINUTE, wakeupService);
    expect(replay.deliver).toHaveBeenCalledTimes(1);
    await expect(replay.deliver.mock.results[0].value).resolves.toBe(false);
  });

  it("keeps the cursor of the last delivered event when a delivery fails", async () => {
    const mailbox = new FakeMailbox();
    mailbox.uids = [1];
    const registration = await makeRegistration({ cursor: "1", lastFiredAtMs: BASE_TIME });
    mailbox.uids = [1, 2, 3, 4];
    const wakeupService = new TriggerWakeupService();
    const real = wakeupService.deliverTriggerInput.bind(wakeupService);
    vi.spyOn(wakeupService, "deliverTriggerInput").mockImplementation(async (opts) => {
      if (opts.inputId.endsWith(":v1:4")) throw new Error("inbox is down");
      return real(opts);
    });

    await runSchedulerSweepOnce({
      wakeupService,
      now: () => BASE_TIME + MINUTE,
      resolvePoller: resolverFor(mailbox.poller())
    });

    const after = await reload(registration.id);
    expect(after.cursor).toBe("3");
    expect(after.last_error).toBe(
      `${POLL_ERROR_PREFIX}inbox is down (2 of 3 events delivered)`
    );

    // The next poll picks up where delivery stopped.
    const next = await sweep(mailbox.poller(), BASE_TIME + 2 * MINUTE);
    expect(next.deliver.mock.calls.map(([c]) => c.inputId)).toEqual([
      `${registration.id}:v1:4`
    ]);
  });

  it("hands the poller the node's saved properties, the cursor and the resolved secrets", async () => {
    await Secret.upsert({ userId: USER, key: "GOOGLE_MAIL_USER", value: "me@gmail.com" });
    const mailbox = new FakeMailbox();
    await makeRegistration({ config: { interval_seconds: 60, folder: "INBOX" }, cursor: "7" });

    await sweep(mailbox.poller(["GOOGLE_MAIL_USER", "GOOGLE_APP_PASSWORD"]), BASE_TIME);

    expect(mailbox.polls[0]).toEqual({
      properties: { interval_seconds: 60, folder: "INBOX" },
      cursor: "7",
      // The password was never saved, so it is absent and the node says so.
      secrets: { GOOGLE_MAIL_USER: "me@gmail.com" }
    });
  });

  describe("failures", () => {
    it("records a failed poll without starting a run, and waits one interval to retry", async () => {
      const mailbox = new FakeMailbox();
      mailbox.failWith = new Error("Invalid credentials (Failure)");
      const registration = await makeRegistration({ cursor: "4" });

      const { deliver } = await sweep(mailbox.poller(), BASE_TIME);
      expect(deliver).not.toHaveBeenCalled();

      const after = await reload(registration.id);
      expect(after.last_error).toBe(
        `${POLL_ERROR_PREFIX}Invalid credentials (Failure)`
      );
      expect(after.consecutive_failures).toBe(1);
      expect(after.cursor).toBe("4");
      expect(after.enabled).toBe(1);

      // A failed poll must not be retried on every 5 second sweep.
      await sweep(mailbox.poller(), BASE_TIME + 5_000);
      expect(mailbox.polls).toHaveLength(1);
      await sweep(mailbox.poller(), BASE_TIME + MINUTE);
      expect(mailbox.polls).toHaveLength(2);
    });

    it("disables the trigger after five failed polls in a row", async () => {
      const mailbox = new FakeMailbox();
      mailbox.failWith = new Error("socket closed");
      const registration = await makeRegistration();

      for (let i = 0; i < TRIGGER_MAX_CONSECUTIVE_FAILURES; i += 1) {
        await sweep(mailbox.poller(), BASE_TIME + i * MINUTE);
      }

      const after = await reload(registration.id);
      expect(after.enabled).toBe(0);
      expect(after.disabled_reason).toBe("failures");
      expect(after.consecutive_failures).toBe(TRIGGER_MAX_CONSECUTIVE_FAILURES);
      expect(mailbox.polls).toHaveLength(TRIGGER_MAX_CONSECUTIVE_FAILURES);
    });

    it("clears the poll's own error and failure count after a good poll", async () => {
      const mailbox = new FakeMailbox();
      mailbox.uids = [1];
      const registration = await makeRegistration({ cursor: "1" });
      mailbox.failWith = new Error("socket closed");
      await sweep(mailbox.poller(), BASE_TIME);
      mailbox.failWith = null;
      await sweep(mailbox.poller(), BASE_TIME + MINUTE);

      const after = await reload(registration.id);
      expect(after.last_error).toBeNull();
      expect(after.consecutive_failures).toBe(0);
    });

    it("leaves a run's failure and the failure count for the dispatcher", async () => {
      const mailbox = new FakeMailbox();
      mailbox.uids = [1];
      const registration = await makeRegistration({ cursor: "1" });
      await TriggerRegistration.updateColumns(registration.id, {
        last_error: "run failed: node exploded",
        consecutive_failures: 2
      });

      await sweep(mailbox.poller(), BASE_TIME);

      const after = await reload(registration.id);
      expect(after.last_error).toBe("run failed: node exploded");
      expect(after.consecutive_failures).toBe(2);
    });

    it("does not recreate a registration deleted during the poll", async () => {
      const mailbox = new FakeMailbox();
      const registration = await makeRegistration({ cursor: "0" });
      const poller = mailbox.poller();
      const slow: TriggerPoller = {
        requiredSettings: [],
        poll: async (input) => {
          await registration.delete();
          return poller.poll(input);
        }
      };
      await sweep(slow, BASE_TIME);
      expect(await TriggerRegistration.get(registration.id)).toBeNull();
    });

    it("keeps the cleared cursor when the node's properties were saved during the poll", async () => {
      const mailbox = new FakeMailbox();
      mailbox.uids = [1, 2, 3];
      const registration = await makeRegistration({
        config: { interval_seconds: 60, folder: "INBOX" },
        cursor: "1"
      });
      const poller = mailbox.poller();
      const edited: TriggerPoller = {
        requiredSettings: [],
        poll: async (input) => {
          // The user saves the workflow with another folder, which clears the
          // cursor in registration-sync.
          const row = await reload(registration.id);
          row.config_json = { interval_seconds: 60, folder: "Other" };
          row.cursor = null;
          await row.save();
          return poller.poll(input);
        }
      };
      await sweep(edited, BASE_TIME);
      expect((await reload(registration.id)).cursor).toBeNull();
    });

    it("never polls the same registration twice at once", async () => {
      const mailbox = new FakeMailbox();
      await makeRegistration({ cursor: "0" });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let started = 0;
      const slow: TriggerPoller = {
        requiredSettings: [],
        poll: async (input) => {
          started += 1;
          await gate;
          return mailbox.poller().poll(input);
        }
      };

      const first = sweep(slow, BASE_TIME);
      await vi.waitFor(() => expect(started).toBe(1));
      // A sweep 5 seconds later finds the registration still due.
      await sweep(slow, BASE_TIME + 5_000);
      expect(started).toBe(1);
      release();
      await first;
      expect(mailbox.polls).toHaveLength(1);
    });
  });

  it("still fires a plain tick for a registration with no poller", async () => {
    await makeRegistration();
    const wakeupService = new TriggerWakeupService();
    const spy = vi.spyOn(wakeupService, "deliverTriggerInput");
    await runSchedulerSweepOnce({
      wakeupService,
      now: () => BASE_TIME,
      resolvePoller: async () => null
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].payload).toMatchObject({
      source: "schedule",
      event_type: "tick"
    });
  });

  it("falls back to a plain tick when the poller cannot be resolved", async () => {
    await makeRegistration();
    const wakeupService = new TriggerWakeupService();
    const spy = vi.spyOn(wakeupService, "deliverTriggerInput");
    await runSchedulerSweepOnce({
      wakeupService,
      now: () => BASE_TIME,
      resolvePoller: async () => {
        throw new Error("workflow table is locked");
      }
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("createRegistryPollerResolver", () => {
  class PollingNode extends BaseNode {
    static readonly nodeType = "test.PollingTrigger";
    static readonly isTrigger = true;
    static readonly requiredSettings = ["TEST_SECRET"];
    static readonly pollTrigger = async (): Promise<TriggerPollResult> => ({
      events: [],
      cursor: "c"
    });
  }
  class PlainNode extends BaseNode {
    static readonly nodeType = "test.PlainTrigger";
    static readonly isTrigger = true;
  }

  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  async function workflowWith(type: string): Promise<WorkflowModel> {
    return (await Workflow.create<WorkflowModel>({
      user_id: USER,
      name: "wf",
      graph: { nodes: [{ id: "n1", type, data: {} }], edges: [] }
    })) as WorkflowModel;
  }

  function registrationOf(workflow: WorkflowModel): TriggerRegistration {
    return new TriggerRegistration({
      user_id: USER,
      workflow_id: workflow.id,
      node_id: "n1",
      kind: "schedule"
    });
  }

  it("finds the poller of a node class that declares one, and its settings", async () => {
    const registry = new NodeRegistry();
    registry.register(PollingNode);
    registry.register(PlainNode);
    const resolve = createRegistryPollerResolver(registry);

    const poller = await resolve(registrationOf(await workflowWith("test.PollingTrigger")));
    expect(poller?.requiredSettings).toEqual(["TEST_SECRET"]);
    expect(poller?.poll).toBe(PollingNode.pollTrigger);
  });

  it("returns null for a node with no poller, and for a registry that has none", async () => {
    const registry = new NodeRegistry();
    registry.register(PollingNode);
    registry.register(PlainNode);
    const resolve = createRegistryPollerResolver(registry);
    expect(
      await resolve(registrationOf(await workflowWith("test.PlainTrigger")))
    ).toBeNull();
    expect(
      await resolve(registrationOf(await workflowWith("test.Missing")))
    ).toBeNull();

    const empty = createRegistryPollerResolver(new NodeRegistry());
    expect(
      await empty(registrationOf(await workflowWith("test.PollingTrigger")))
    ).toBeNull();
  });

  it("picks up a node class registered after the resolver was made", async () => {
    const registry = new NodeRegistry();
    const resolve = createRegistryPollerResolver(registry);
    const registration = registrationOf(await workflowWith("test.PollingTrigger"));
    expect(await resolve(registration)).toBeNull();
    registry.register(PollingNode);
    expect(await resolve(registration)).not.toBeNull();
  });

  it("syncs the mail trigger node as a schedule registration, which is what the scheduler sweeps", async () => {
    // The kind map is what makes the scheduler see the registration at all.
    const workflow = await workflowWith("lib.mail.EmailTrigger");
    const [row] = await syncRegistrations(workflow, { enabled: true });
    expect(row.kind).toBe("schedule");
  });
});
