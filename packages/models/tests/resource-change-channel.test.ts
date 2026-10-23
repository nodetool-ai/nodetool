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
