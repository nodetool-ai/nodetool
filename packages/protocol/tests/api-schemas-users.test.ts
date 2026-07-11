import { describe, it, expect } from "vitest";
import {
  userListItem,
  userCreateResponse,
  listOutput,
  getInput,
  createInput,
  removeInput,
  removeOutput,
  resetTokenInput
} from "../src/api-schemas/users.js";

describe("users.userListItem", () => {
  it("accepts a masked list item with token_hash", () => {
    const result = userListItem.safeParse({
      username: "alice",
      user_id: "u1",
      role: "admin",
      token_hash: "abcd...",
      created_at: "2020"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when token_hash is missing", () => {
    const result = userListItem.safeParse({
      username: "alice",
      user_id: "u1",
      role: "admin",
      created_at: "2020"
    });
    expect(result.success).toBe(false);
  });
});

describe("users.userCreateResponse", () => {
  it("carries a plaintext token", () => {
    const result = userCreateResponse.safeParse({
      username: "alice",
      user_id: "u1",
      role: "user",
      token: "secret",
      created_at: "2020"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when token is missing", () => {
    const result = userCreateResponse.safeParse({
      username: "alice",
      user_id: "u1",
      role: "user",
      created_at: "2020"
    });
    expect(result.success).toBe(false);
  });
});

describe("users.listOutput", () => {
  it("wraps an array of users", () => {
    expect(listOutput.safeParse({ users: [] }).success).toBe(true);
  });

  it("rejects when users is not an array", () => {
    expect(listOutput.safeParse({ users: {} }).success).toBe(false);
  });
});

describe("users.getInput / removeInput / resetTokenInput", () => {
  it("reject empty username", () => {
    expect(getInput.safeParse({ username: "" }).success).toBe(false);
    expect(removeInput.safeParse({ username: "" }).success).toBe(false);
    expect(resetTokenInput.safeParse({ username: "" }).success).toBe(false);
  });

  it("accept a non-empty username", () => {
    expect(getInput.safeParse({ username: "bob" }).success).toBe(true);
  });
});

describe("users.createInput", () => {
  it("defaults role to 'user'", () => {
    expect(createInput.parse({ username: "bob" }).role).toBe("user");
  });

  it("honors an explicit role", () => {
    expect(createInput.parse({ username: "bob", role: "admin" }).role).toBe(
      "admin"
    );
  });

  it("rejects an empty username", () => {
    expect(createInput.safeParse({ username: "" }).success).toBe(false);
  });
});

describe("users.removeOutput", () => {
  it("requires a message string", () => {
    expect(removeOutput.safeParse({ message: "deleted" }).success).toBe(true);
    expect(removeOutput.safeParse({}).success).toBe(false);
  });
});
