import { describe, it, expect } from "vitest";
import {
  threadResponse,
  listInput,
  listOutput,
  getInput,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  summarizeInput,
  summarizeOutput
} from "../src/api-schemas/threads.js";

describe("threads.threadResponse", () => {
  it("accepts a response with null title and omitted optionals", () => {
    const result = threadResponse.safeParse({
      id: "t1",
      user_id: "u1",
      title: null,
      created_at: "2020",
      updated_at: "2020"
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing required title (nullable, not optional)", () => {
    const result = threadResponse.safeParse({
      id: "t1",
      user_id: "u1",
      created_at: "2020",
      updated_at: "2020"
    });
    expect(result.success).toBe(false);
  });
});

describe("threads.listInput", () => {
  it("defaults limit to 10", () => {
    expect(listInput.parse({}).limit).toBe(10);
  });

  it("accepts limit at min boundary 1", () => {
    expect(listInput.safeParse({ limit: 1 }).success).toBe(true);
  });

  it("rejects limit below 1", () => {
    expect(listInput.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("accepts limit at max boundary 500", () => {
    expect(listInput.safeParse({ limit: 500 }).success).toBe(true);
  });

  it("rejects limit above 500", () => {
    expect(listInput.safeParse({ limit: 501 }).success).toBe(false);
  });

  it("rejects a non-integer limit", () => {
    expect(listInput.safeParse({ limit: 5.5 }).success).toBe(false);
  });
});

describe("threads.listOutput", () => {
  it("accepts null next", () => {
    expect(
      listOutput.safeParse({ threads: [], next: null }).success
    ).toBe(true);
  });

  it("rejects when next is omitted (nullable, not optional)", () => {
    expect(listOutput.safeParse({ threads: [] }).success).toBe(false);
  });
});

describe("threads.getInput / deleteInput / summarizeInput", () => {
  it("reject empty id", () => {
    expect(getInput.safeParse({ id: "" }).success).toBe(false);
    expect(deleteInput.safeParse({ id: "" }).success).toBe(false);
    expect(summarizeInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("threads.createInput", () => {
  it("accepts an empty object (all optional)", () => {
    expect(createInput.safeParse({}).success).toBe(true);
  });

  it("accepts null workflow_id", () => {
    expect(createInput.safeParse({ workflow_id: null }).success).toBe(true);
  });
});

describe("threads.updateInput", () => {
  it("requires a non-empty title", () => {
    expect(updateInput.safeParse({ id: "t", title: "" }).success).toBe(false);
    expect(updateInput.safeParse({ id: "t", title: "New" }).success).toBe(true);
  });
});

describe("threads.deleteOutput", () => {
  it("requires ok literal true", () => {
    expect(deleteOutput.safeParse({ ok: true }).success).toBe(true);
    expect(deleteOutput.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("threads.summarizeOutput", () => {
  it("requires a title string", () => {
    expect(summarizeOutput.safeParse({ title: "t" }).success).toBe(true);
    expect(summarizeOutput.safeParse({}).success).toBe(false);
  });
});
