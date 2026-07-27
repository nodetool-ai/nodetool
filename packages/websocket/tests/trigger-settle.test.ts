import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initTestDb,
  ModelObserver,
  TriggerRegistration
} from "@nodetool-ai/models";
import { TRIGGER_MAX_CONSECUTIVE_FAILURES } from "@nodetool-ai/protocol";
import {
  checkTriggerBounds,
  disableTrigger,
  rearmTrigger,
  settleTriggerOutcome,
  triggerRunParams
} from "../src/triggers/settle.js";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

async function makeRegistration(
  overrides: Partial<Record<string, unknown>> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: "wf-1",
    node_id: "n1",
    kind: "webhook",
    config_json: {},
    enabled: 1,
    ...overrides
  })) as TriggerRegistration;
}

function outcome(error: string | null) {
  return {
    error,
    stampFiredAt: true,
    firedAt: new Date(NOW).toISOString()
  };
}

describe("trigger settle rules", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  describe("checkTriggerBounds", () => {
    it("allows a registration with no bounds", async () => {
      const reg = await makeRegistration();
      expect(checkTriggerBounds(reg, NOW)).toEqual({ allowed: true });
    });

    it("refuses a registration past its expiry", async () => {
      const reg = await makeRegistration({
        expires_at: new Date(NOW - 1000).toISOString()
      });
      expect(checkTriggerBounds(reg, NOW)).toEqual({
        allowed: false,
        reason: "expired"
      });
    });

    it("allows a registration whose expiry is still ahead", async () => {
      const reg = await makeRegistration({
        expires_at: new Date(NOW + 1000).toISOString()
      });
      expect(checkTriggerBounds(reg, NOW).allowed).toBe(true);
    });

    it("ignores an unparseable expiry rather than stopping silently", async () => {
      const reg = await makeRegistration({ expires_at: "not a date" });
      expect(checkTriggerBounds(reg, NOW).allowed).toBe(true);
    });

    it("refuses a registration that has spent its run budget", async () => {
      const reg = await makeRegistration({ max_runs: 3, run_count: 3 });
      expect(checkTriggerBounds(reg, NOW)).toEqual({
        allowed: false,
        reason: "max_runs"
      });
    });

    it("allows one with runs left", async () => {
      const reg = await makeRegistration({ max_runs: 3, run_count: 2 });
      expect(checkTriggerBounds(reg, NOW).allowed).toBe(true);
    });
  });

  describe("settleTriggerOutcome", () => {
    it("counts a success and clears the failure streak", async () => {
      const reg = await makeRegistration({ consecutive_failures: 3 });

      expect(settleTriggerOutcome(reg, outcome(null))).toBeNull();

      expect(reg.run_count).toBe(1);
      expect(reg.consecutive_failures).toBe(0);
      expect(reg.last_error).toBeNull();
      expect(reg.last_fired_at).toBe(new Date(NOW).toISOString());
      expect(reg.enabled).toBe(1);
    });

    it("does not spend a run on a failure", async () => {
      const reg = await makeRegistration();

      settleTriggerOutcome(reg, outcome("boom"));

      expect(reg.run_count).toBe(0);
      expect(reg.consecutive_failures).toBe(1);
      expect(reg.last_error).toBe("boom");
    });

    it("disables after the failure threshold, keeping the last error", async () => {
      const reg = await makeRegistration({
        consecutive_failures: TRIGGER_MAX_CONSECUTIVE_FAILURES - 1
      });

      expect(settleTriggerOutcome(reg, outcome("boom"))).toBe("failures");

      expect(reg.enabled).toBe(0);
      expect(reg.disabled_reason).toBe("failures");
      expect(reg.last_error).toBe("boom");
    });

    it("stays armed one failure short of the threshold", async () => {
      const reg = await makeRegistration({
        consecutive_failures: TRIGGER_MAX_CONSECUTIVE_FAILURES - 2
      });

      expect(settleTriggerOutcome(reg, outcome("boom"))).toBeNull();
      expect(reg.enabled).toBe(1);
    });

    it("disables on the success that reaches max_runs", async () => {
      const reg = await makeRegistration({ max_runs: 2, run_count: 1 });

      expect(settleTriggerOutcome(reg, outcome(null))).toBe("max_runs");

      expect(reg.run_count).toBe(2);
      expect(reg.enabled).toBe(0);
      expect(reg.disabled_reason).toBe("max_runs");
    });

    it("leaves the fire time alone when the adapter owns it", async () => {
      const reg = await makeRegistration({
        kind: "schedule",
        last_fired_at: "2026-01-01T00:00:00.000Z"
      });

      settleTriggerOutcome(reg, { ...outcome(null), stampFiredAt: false });

      expect(reg.last_fired_at).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("rearmTrigger", () => {
    it("clears the dispatcher's verdict so the count starts over", async () => {
      const reg = await makeRegistration();
      disableTrigger(reg, "failures");
      reg.consecutive_failures = TRIGGER_MAX_CONSECUTIVE_FAILURES;

      rearmTrigger(reg);

      expect(reg.enabled).toBe(1);
      expect(reg.disabled_reason).toBeNull();
      expect(reg.consecutive_failures).toBe(0);
    });
  });

  describe("triggerRunParams", () => {
    it("reports a first run until one succeeds", async () => {
      const reg = await makeRegistration();

      expect(triggerRunParams(reg, NOW)).toEqual({
        last_fired_at: null,
        now: new Date(NOW).toISOString(),
        is_first_run: true
      });

      // A failure is not a first run spent — a backfill-seeding graph must
      // see `is_first_run` again on the retry.
      settleTriggerOutcome(reg, outcome("boom"));
      expect(triggerRunParams(reg, NOW).is_first_run).toBe(true);

      settleTriggerOutcome(reg, outcome(null));
      expect(triggerRunParams(reg, NOW).is_first_run).toBe(false);
    });
  });
});
