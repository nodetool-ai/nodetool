/**
 * The cross-instance job control bus, in its SQLite (in-process) mode.
 *
 * PostgreSQL LISTEN/NOTIFY needs a live server, so what is pinned here is the
 * contract every host depends on regardless of dialect: a published verb
 * reaches every subscriber, unsubscribing really stops delivery, a repeat is
 * harmless, and publishing never throws into the caller.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  publishJobControl,
  subscribeJobControl,
  resetJobControlBusForTests,
  type JobControlMessage
} from "../src/job-control-bus.js";
import { initTestDb } from "../src/db.js";

const cancel = (jobId: string): JobControlMessage => ({
  job_id: jobId,
  user_id: "1",
  action: "cancel",
  origin: "machine-a"
});

describe("job control bus (in-process mode)", () => {
  beforeEach(() => {
    initTestDb();
    resetJobControlBusForTests();
  });

  it("delivers a published message to every subscriber", async () => {
    const first = vi.fn();
    const second = vi.fn();
    await subscribeJobControl(first);
    await subscribeJobControl(second);

    await publishJobControl(cancel("job-1"));

    expect(first).toHaveBeenCalledWith(cancel("job-1"));
    expect(second).toHaveBeenCalledWith(cancel("job-1"));
  });

  it("stops delivering after unsubscribe", async () => {
    const handler = vi.fn();
    const unsubscribe = await subscribeJobControl(handler);

    await publishJobControl(cancel("job-1"));
    unsubscribe();
    await publishJobControl(cancel("job-2"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(cancel("job-1"));
  });

  it("tolerates the same verb arriving twice", async () => {
    const cancelled = new Set<string>();
    await subscribeJobControl((message) => cancelled.add(message.job_id));

    await publishJobControl(cancel("job-1"));
    await publishJobControl(cancel("job-1"));

    expect([...cancelled]).toEqual(["job-1"]);
  });

  it("keeps a throwing handler from breaking the publisher or its peers", async () => {
    const later = vi.fn();
    await subscribeJobControl(() => {
      throw new Error("handler blew up");
    });
    await subscribeJobControl(later);

    await expect(publishJobControl(cancel("job-1"))).resolves.toBeUndefined();
    expect(later).toHaveBeenCalledWith(cancel("job-1"));
  });
});
