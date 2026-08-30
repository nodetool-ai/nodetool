import { describe, it, expect } from "vitest";
import { FakeClientSession } from "./fake-client-session.js";
import type { ClientSession } from "../src/session/client-session.js";

/** A consumer written against the seam, not against the fake. */
async function announce(session: ClientSession, jobId: string): Promise<void> {
  session.sendDetached({ type: "job_update", job_id: jobId, status: "queued" });
  await session.send({ type: "job_update", job_id: jobId, status: "running" });
  session.logError("announce", new Error("boom"));
}

describe("FakeClientSession", () => {
  it("records send and sendDetached frames in call order", async () => {
    const session = new FakeClientSession();

    await session.send({ type: "first" });
    session.sendDetached({ type: "second" });
    await session.send({ type: "third" });

    expect(session.sent).toEqual([
      { channel: "send", message: { type: "first" } },
      { channel: "sendDetached", message: { type: "second" } },
      { channel: "send", message: { type: "third" } }
    ]);
    expect(session.messages.map((message) => message.type)).toEqual([
      "first",
      "second",
      "third"
    ]);
  });

  it("serves a ClientSession-typed consumer", async () => {
    const session = new FakeClientSession({ userId: "u-7" });

    await announce(session, "job-1");

    expect(session.userId).toBe("u-7");
    expect(session.appSession).toBeNull();
    expect(session.messagesOfType("job_update")).toEqual([
      { type: "job_update", job_id: "job-1", status: "queued" },
      { type: "job_update", job_id: "job-1", status: "running" }
    ]);
    expect(session.errors).toHaveLength(1);
    expect(session.errors[0]?.context).toBe("announce");
  });

  it("has no executor unless one is supplied", () => {
    expect(() =>
      new FakeClientSession().resolveExecutor({ id: "n1", type: "t" })
    ).toThrow(/no executor for node n1/);
  });
});
