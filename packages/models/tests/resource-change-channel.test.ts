import { afterEach, expect, it, vi } from "vitest";

const driver = vi.hoisted(() => ({
  pool: vi.fn().mockResolvedValue([]),
  listen: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../src/db.js", () => ({
  getPostgresClient: () => driver.pool,
  resolvePostgresClientOptions: () => ({ max: 10 })
}));
vi.mock("postgres", () => ({
  default: () => ({ listen: driver.listen, end: driver.end })
}));
import {
  openResourceChangeChannel,
  packResourceChangeMessages,
  encodeResourceChangeGroup,
  MAX_PENDING_NOTIFICATIONS,
  RESYNC_MESSAGE,
  NOTIFY_PAYLOAD_LIMIT
} from "../src/resource-change-channel.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("keeps large UTF-8 ops intact in the outbox and sends only the id", async () => {
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    vi.fn(),
    vi.fn()
  );
  try {
    const message = JSON.stringify({
      origin: "writer",
      payload: { ops: [{ value: "🎬".repeat(3000) }] }
    });
    expect(Buffer.byteLength(message)).toBeGreaterThan(NOTIFY_PAYLOAD_LIMIT);
    await channel.publish(message);
    const insert = driver.pool.mock.calls.find(([sql]) =>
      sql.join("").includes("INSERT INTO resource_change_outbox")
    );
    expect(insert?.[2]).toBe(message);
    const notify = driver.pool.mock.calls.find(([sql]) =>
      sql.join("").includes("pg_notify")
    );
    expect(JSON.parse(notify?.[2])).toEqual({ outbox_id: insert?.[1] });
    expect(Buffer.byteLength(notify?.[2])).toBeLessThan(NOTIFY_PAYLOAD_LIMIT);
  } finally {
    await channel.close();
  }
});

it("notifies inline at the byte limit and resyncs only after re-listening", async () => {
  const resync = vi.fn();
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    vi.fn(),
    resync
  );
  try {
    const onListen = driver.listen.mock.calls[0]?.[2];
    onListen();
    expect(resync).not.toHaveBeenCalled();
    onListen();
    expect(resync).toHaveBeenCalledTimes(1);
    const message = "x".repeat(NOTIFY_PAYLOAD_LIMIT);
    await channel.publish(message);
    expect(
      driver.pool.mock.calls.some(([sql]) => sql.join("").includes("INSERT"))
    ).toBe(false);
    expect(driver.pool.mock.lastCall?.[2]).toBe(message);
    await channel.stopListening();
    onListen();
    expect(resync).toHaveBeenCalledTimes(1);
  } finally {
    await channel.close();
  }
  expect(driver.end).toHaveBeenCalledTimes(1);
});

it("sweeps expired outbox rows and stops maintenance on close", async () => {
  vi.useFakeTimers();
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    vi.fn(),
    vi.fn()
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(
    driver.pool.mock.calls.some(([sql]) =>
      sql.join("").includes("DELETE FROM resource_change_outbox")
    )
  ).toBe(true);
  await channel.close();
  const count = driver.pool.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(driver.pool).toHaveBeenCalledTimes(count);
});

it("packs messages under the limit and keeps singletons in the old form", () => {
  const a = JSON.stringify({ v: "a".repeat(40) });
  expect(packResourceChangeMessages([])).toEqual([]);
  expect(packResourceChangeMessages([a])).toEqual([[a]]);
  expect(encodeResourceChangeGroup([a])).toBe(a);
  expect(JSON.parse(encodeResourceChangeGroup([a, a]))).toEqual([
    JSON.parse(a),
    JSON.parse(a)
  ]);
  const limit = Buffer.byteLength(a) * 2 + 3;
  expect(packResourceChangeMessages([a, a, a], limit)).toEqual([[a, a], [a]]);
  for (const group of packResourceChangeMessages([a, a, a, a, a], limit)) {
    expect(Buffer.byteLength(encodeResourceChangeGroup(group))).toBeLessThanOrEqual(limit);
  }
  const big = JSON.stringify({ v: "b".repeat(100) });
  expect(packResourceChangeMessages([a, big, a], limit)).toEqual([[a], [big], [a]]);
});

it("sends messages published in one tick as one notification", async () => {
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    vi.fn(),
    vi.fn()
  );
  try {
    const one = JSON.stringify({ n: 1 });
    const two = JSON.stringify({ n: 2 });
    await Promise.all([channel.publish(one), channel.publish(two)]);
    const notifies = driver.pool.mock.calls.filter(([sql]) =>
      sql.join("").includes("pg_notify")
    );
    expect(notifies).toHaveLength(1);
    expect(JSON.parse(notifies[0]?.[2])).toEqual([{ n: 1 }, { n: 2 }]);
  } finally {
    await channel.close();
  }
});

it("drops the oldest pending messages past the cap and sends one resync marker", async () => {
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    vi.fn(),
    vi.fn()
  );
  try {
    const total = MAX_PENDING_NOTIFICATIONS + 5;
    const all = Array.from({ length: total }, (_, n) =>
      channel.publish(JSON.stringify({ n }))
    );
    await Promise.all(all);
    const sent = driver.pool.mock.calls
      .filter(([sql]) => sql.join("").includes("pg_notify"))
      .flatMap(([, , payload]) => {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? parsed : [parsed];
      });
    expect(sent.filter((m) => m.n !== undefined)).toHaveLength(
      MAX_PENDING_NOTIFICATIONS
    );
    expect(sent.at(-1)).toEqual(JSON.parse(RESYNC_MESSAGE));
    expect(sent.find((m) => m.n === 0)).toBeUndefined();
  } finally {
    await channel.close();
  }
});

it("passes a batch notification through to receive unchanged", async () => {
  const receive = vi.fn();
  const channel = await openResourceChangeChannel(
    "postgres://localhost/db",
    receive,
    vi.fn()
  );
  try {
    const onMessage = driver.listen.mock.calls[0]?.[1];
    onMessage('[{"n":1},{"n":2}]');
    await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(1));
    expect(receive).toHaveBeenCalledWith('[{"n":1},{"n":2}]');
  } finally {
    await channel.close();
  }
});
