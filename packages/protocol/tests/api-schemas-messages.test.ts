import { describe, it, expect } from "vitest";
import {
  messageResponse,
  listInput,
  listOutput,
  createInput,
  getInput,
  deleteInput,
  deleteOutput
} from "../src/api-schemas/messages.js";

const validMessage = {
  type: "message" as const,
  id: "m1",
  user_id: "u1",
  thread_id: "t1",
  role: "user",
  name: null,
  content: "hello",
  tool_calls: null,
  tool_call_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01"
};

describe("messages.messageResponse", () => {
  it("parses a minimal message with string content", () => {
    expect(messageResponse.safeParse(validMessage).success).toBe(true);
  });

  it("accepts array content", () => {
    expect(
      messageResponse.safeParse({ ...validMessage, content: [{ text: "hi" }] })
        .success
    ).toBe(true);
  });

  it("accepts record content and null content", () => {
    expect(
      messageResponse.safeParse({ ...validMessage, content: { a: 1 } }).success
    ).toBe(true);
    expect(
      messageResponse.safeParse({ ...validMessage, content: null }).success
    ).toBe(true);
  });

  it("accepts optional media_generation record", () => {
    expect(
      messageResponse.safeParse({
        ...validMessage,
        media_generation: { model: "x" }
      }).success
    ).toBe(true);
  });

  it("rejects a type other than 'message'", () => {
    expect(
      messageResponse.safeParse({ ...validMessage, type: "event" }).success
    ).toBe(false);
  });

  it("rejects a missing created_at", () => {
    const { created_at, ...rest } = validMessage;
    expect(messageResponse.safeParse(rest).success).toBe(false);
  });
});

describe("messages.listInput", () => {
  it("defaults limit to 100", () => {
    expect(listInput.parse({ thread_id: "t1" }).limit).toBe(100);
  });

  it("accepts cursor and reverse", () => {
    expect(
      listInput.safeParse({ thread_id: "t1", cursor: "c", reverse: true })
        .success
    ).toBe(true);
  });

  it("rejects an empty thread_id", () => {
    expect(listInput.safeParse({ thread_id: "" }).success).toBe(false);
  });

  it("rejects limit above 1000", () => {
    expect(listInput.safeParse({ thread_id: "t1", limit: 1001 }).success).toBe(
      false
    );
  });
});

describe("messages.listOutput", () => {
  it("parses messages and nullable next", () => {
    expect(
      listOutput.safeParse({ messages: [validMessage], next: null }).success
    ).toBe(true);
  });
});

describe("messages.createInput", () => {
  it("accepts role + content, thread_id optional", () => {
    expect(
      createInput.safeParse({ role: "user", content: "hi" }).success
    ).toBe(true);
  });

  it("rejects an empty role", () => {
    expect(createInput.safeParse({ role: "", content: "hi" }).success).toBe(
      false
    );
  });

  it("accepts null content", () => {
    expect(
      createInput.safeParse({ role: "assistant", content: null }).success
    ).toBe(true);
  });
});

describe("messages.getInput / deleteInput", () => {
  it("accept a non-empty id and reject empty", () => {
    expect(getInput.safeParse({ id: "x" }).success).toBe(true);
    expect(deleteInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("messages.deleteOutput", () => {
  it("requires ok: true", () => {
    expect(deleteOutput.safeParse({ ok: true }).success).toBe(true);
    expect(deleteOutput.safeParse({ ok: false }).success).toBe(false);
  });
});
