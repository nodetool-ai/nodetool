import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canAccessCollection,
  isManagedCollection,
  MANAGED_COLLECTION_PREFIX,
  SqliteVecProvider,
  validateCollectionName
} from "../src/index.js";

let provider: SqliteVecProvider;

beforeEach(() => {
  provider = new SqliteVecProvider({ dbPath: ":memory:" });
});

afterEach(() => {
  provider.close();
});

describe("sqlite-vec partition key", () => {
  it("answers a query from one partition only", async () => {
    const collection = await provider.createCollection({ name: "parts", partitionKey: "project_id" });
    await collection.upsert([
      { id: "a1", embedding: [1, 0], metadata: { project_id: "a" } },
      { id: "b1", embedding: [1, 0.05], metadata: { project_id: "b" } },
      { id: "a2", embedding: [0, 1], metadata: { project_id: "a" } }
    ]);
    const inA = await collection.query({ embedding: [1, 0], topK: 5, partition: "a" });
    expect(inA.map((match) => match.id)).toEqual(["a1", "a2"]);
    const everywhere = await collection.query({ embedding: [1, 0], topK: 5 });
    expect(everywhere.map((match) => match.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("refuses a partition on a collection without a partition key", async () => {
    const collection = await provider.createCollection({ name: "flat" });
    await collection.upsert([{ id: "x", embedding: [1, 0] }]);
    await expect(collection.query({ embedding: [1, 0], partition: "a" })).rejects.toThrow(/no partition key/);
  });
});

describe("sqlite-vec dimension", () => {
  it("records the dimension and rejects vectors of another size", async () => {
    const collection = await provider.createCollection({ name: "dims" });
    await collection.upsert([{ id: "x", embedding: [1, 0, 0] }]);
    const [info] = await provider.listCollections();
    expect(info?.dimension).toBe(3);
    await expect(collection.upsert([{ id: "y", embedding: [1, 0] }])).rejects.toThrow(/3-dimension/);
    await expect(
      collection.upsert([
        { id: "p", embedding: [1, 0, 0] },
        { id: "q", embedding: [1, 0] }
      ])
    ).rejects.toThrow(/differ in dimension/);
  });

  it("sets a busy timeout so a second process can write", () => {
    expect(provider.rawStore.db.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
});

describe("managed collections", () => {
  it("are recognized by name or metadata and closed to every user", () => {
    expect(isManagedCollection(`${MANAGED_COLLECTION_PREFIX}abc`)).toBe(true);
    expect(isManagedCollection("notes", { managed: "library" })).toBe(true);
    expect(isManagedCollection("notes", {})).toBe(false);
    expect(canAccessCollection({ managed: "library", owner_user_id: "u1" }, "u1")).toBe(false);
    expect(canAccessCollection({ owner_user_id: "u1" }, "u1")).toBe(true);
    expect(validateCollectionName(`${MANAGED_COLLECTION_PREFIX}mine`)).toMatch(/reserved/);
    expect(validateCollectionName("mine")).toBeNull();
  });
});
