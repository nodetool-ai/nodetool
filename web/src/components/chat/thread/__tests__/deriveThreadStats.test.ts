/**
 * @jest-environment node
 */
import { deriveThreadStats } from "../deriveThreadStats";
import type { Message } from "../../../../stores/ApiTypes";

const msg = (m: Partial<Message>): Message => ({ role: "user", ...m } as Message);

describe("deriveThreadStats", () => {
  test("returns all-null for empty input", () => {
    expect(deriveThreadStats([])).toEqual({
      model: null,
      provider: null,
      runtimeMs: null,
      lastRunAt: null,
      spend: null
    });
  });

  test("sums cost across messages into spend", () => {
    const stats = deriveThreadStats([
      msg({ role: "user", created_at: "2026-05-28T11:38:00.000Z" }),
      msg({ role: "assistant", model: "m", cost: 0.12, created_at: "2026-05-28T11:39:00.000Z" }),
      msg({ role: "user", created_at: "2026-05-28T11:40:00.000Z" }),
      msg({ role: "assistant", model: "m", cost: 0.06, created_at: "2026-05-28T11:41:00.000Z" })
    ]);
    expect(stats.spend).toBeCloseTo(0.18, 5);
  });

  test("spend is null when no message reports a cost", () => {
    const stats = deriveThreadStats([
      msg({ role: "user", created_at: "2026-05-28T11:38:00.000Z" }),
      msg({ role: "assistant", model: "m", created_at: "2026-05-28T11:39:00.000Z" })
    ]);
    expect(stats.spend).toBeNull();
  });

  test("returns all-null when there is no assistant reply", () => {
    const stats = deriveThreadStats([
      msg({ role: "user", content: "hi", created_at: "2026-05-28T11:38:00Z" })
    ]);
    expect(stats.model).toBeNull();
    expect(stats.lastRunAt).toBeNull();
  });

  test("picks model/provider/last-run from the last assistant message", () => {
    const stats = deriveThreadStats([
      msg({ role: "user", created_at: "2026-05-28T11:38:00.000Z" }),
      msg({
        role: "assistant",
        model: "flux.2-pro",
        provider: "fal",
        created_at: "2026-05-28T11:39:04.000Z"
      })
    ]);
    expect(stats.model).toBe("flux.2-pro");
    expect(stats.provider).toBe("fal");
    expect(stats.lastRunAt).toBe("2026-05-28T11:39:04.000Z");
    expect(stats.runtimeMs).toBe(64000);
  });

  test("measures runtime from the user message that started the last turn", () => {
    const stats = deriveThreadStats([
      msg({ role: "user", created_at: "2026-05-28T10:00:00.000Z" }),
      msg({ role: "assistant", model: "m", created_at: "2026-05-28T10:00:02.000Z" }),
      msg({ role: "user", created_at: "2026-05-28T11:00:00.000Z" }),
      msg({ role: "assistant", model: "m", created_at: "2026-05-28T11:00:05.000Z" })
    ]);
    expect(stats.runtimeMs).toBe(5000);
  });

  test("falls back to an earlier assistant model when the last one omits it", () => {
    const stats = deriveThreadStats([
      msg({ role: "assistant", model: "gpt", provider: "openai", created_at: "2026-05-28T10:00:00.000Z" }),
      msg({ role: "assistant", created_at: "2026-05-28T10:01:00.000Z" })
    ]);
    expect(stats.model).toBe("gpt");
    expect(stats.provider).toBe("openai");
  });
});
