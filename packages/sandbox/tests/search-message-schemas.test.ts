import { describe, it, expect } from "vitest";
import {
  InfoSearchWebInput,
  SearchResult,
  MessageNotifyUserInput,
  MessageAskUserInput,
  SandboxEvent,
  IdleInput
} from "../src/schemas/index.js";

describe("search + messaging schemas", () => {
  it("requires a non-empty query", () => {
    expect(() => InfoSearchWebInput.parse({ query: "" })).toThrow();
  });

  it("caps count at 20", () => {
    expect(() => InfoSearchWebInput.parse({ query: "x", count: 21 })).toThrow();
    expect(() => InfoSearchWebInput.parse({ query: "x", count: 20 })).not.toThrow();
  });

  it("accepts known date_range values", () => {
    const parsed = InfoSearchWebInput.parse({
      query: "x",
      date_range: "past_week"
    });
    expect(parsed.date_range).toBe("past_week");
  });

  it("rejects unknown date_range", () => {
    expect(() =>
      InfoSearchWebInput.parse({ query: "x", date_range: "past_era" })
    ).toThrow();
  });

  it("normalizes a missing published_at to null", () => {
    const r = SearchResult.parse({
      title: "t",
      url: "u",
      snippet: "s",
      published_at: null
    });
    expect(r.published_at).toBeNull();
  });

  it("accepts attachments on notify_user", () => {
    const parsed = MessageNotifyUserInput.parse({
      text: "done",
      attachments: [{ path: "/workspace/report.pdf", mime: "application/pdf" }]
    });
    expect(parsed.attachments?.[0].path).toBe("/workspace/report.pdf");
  });

  it("accepts suggest_user_takeover on ask_user", () => {
    const parsed = MessageAskUserInput.parse({
      text: "solve captcha please",
      suggest_user_takeover: true
    });
    expect(parsed.suggest_user_takeover).toBe(true);
  });

  it("validates a well-formed SandboxEvent", () => {
    const ev = SandboxEvent.parse({
      id: "abc",
      type: "notify",
      timestamp: Date.now(),
      text: "hi"
    });
    expect(ev.type).toBe("notify");
  });

  it("allows an empty idle input", () => {
    expect(IdleInput.parse({}).reason).toBeUndefined();
  });
});
