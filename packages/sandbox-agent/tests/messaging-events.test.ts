import { describe, it, expect, beforeEach } from "vitest";
import { buildServer } from "../src/server.js";
import { _resetForTests } from "../src/event-bus.js";

beforeEach(() => {
  _resetForTests();
});

describe("messaging + /events SSE", () => {
  it("notify_user publishes an event observable via /events", async () => {
    const app = buildServer();
    try {
      const published = await app.inject({
        method: "POST",
        url: "/message/notify",
        payload: { text: "progress update" }
      });
      expect(published.statusCode).toBe(200);
      const { event_id: id } = published.json();

      // After publishing, /events should replay the buffered event.
      // Use a timeout: inject holds the SSE connection open, so we read
      // the prefix using a real listen() + fetch.
      await app.listen({ host: "127.0.0.1", port: 0 });
      const port = (app.server.address() as { port: number }).port;
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/events`, {
        headers: { accept: "text/event-stream" },
        signal: controller.signal
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let chunk = "";
      // Read until we see a full SSE frame.
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        chunk += decoder.decode(value, { stream: true });
        if (chunk.includes("\n\n")) break;
      }
      controller.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore
      }

      const frame = chunk.split("\n\n")[0];
      expect(frame).toContain("progress update");
      expect(frame).toContain(id);
    } finally {
      await app.close();
    }
  });

  it("ask_user propagates suggest_user_takeover", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/message/ask",
        payload: {
          text: "Solve the captcha",
          suggest_user_takeover: true
        }
      });
      expect(res.statusCode).toBe(200);
      await app.listen({ host: "127.0.0.1", port: 0 });
      const port = (app.server.address() as { port: number }).port;
      const controller = new AbortController();
      const es = await fetch(`http://127.0.0.1:${port}/events`, {
        signal: controller.signal
      });
      const reader = es.body!.getReader();
      const decoder = new TextDecoder();
      let chunk = "";
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        chunk += decoder.decode(value, { stream: true });
        if (chunk.includes("\n\n")) break;
      }
      controller.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      expect(chunk).toContain('"type":"ask"');
      expect(chunk).toContain('"suggest_user_takeover":true');
    } finally {
      await app.close();
    }
  });

  it("idle emits an idle event", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/idle",
        payload: { reason: "objective complete" }
      });
      expect(res.statusCode).toBe(200);
      const { event_id } = res.json();
      expect(typeof event_id).toBe("string");
    } finally {
      await app.close();
    }
  });
});
