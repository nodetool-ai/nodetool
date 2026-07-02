import { isChatDemoCast, CHAT_CAST_VERSION } from "../chatCastTypes";

describe("chatCastTypes", () => {
  describe("isChatDemoCast", () => {
    const validCast = {
      version: CHAT_CAST_VERSION,
      kind: "chat",
      id: "chat-1",
      name: "Chat demo",
      createdAt: "2026-01-01T00:00:00Z",
      durationMs: 5000,
      model: { type: "language_model", id: "gpt-5.4", name: "GPT-5.4", provider: "openai" },
      events: [],
    };

    it("returns true for a valid cast object", () => {
      expect(isChatDemoCast(validCast)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isChatDemoCast(null)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isChatDemoCast("string")).toBe(false);
      expect(isChatDemoCast(42)).toBe(false);
    });

    it("returns false for wrong version", () => {
      expect(isChatDemoCast({ ...validCast, version: 999 })).toBe(false);
    });

    it("returns false for the wrong kind", () => {
      expect(isChatDemoCast({ ...validCast, kind: "timeline" })).toBe(false);
    });

    it("returns false when id is not a string", () => {
      expect(isChatDemoCast({ ...validCast, id: 123 })).toBe(false);
    });

    it("returns false when events is not an array", () => {
      expect(isChatDemoCast({ ...validCast, events: "not-array" })).toBe(false);
    });
  });
});
