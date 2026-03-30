import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

describe("Jobs API", () => {
  it("lists jobs (empty initially)", async () => {
    const res = await get("/jobs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toEqual([]);
  });

  it("returns 404 for non-existent job", async () => {
    const res = await get("/jobs/does-not-exist");
    expect(res.status).toBe(404);
  });
});
