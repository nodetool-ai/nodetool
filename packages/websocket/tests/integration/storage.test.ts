import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, getBaseUrl } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

const headers = { "x-user-id": "test-user" };

describe("Storage API", () => {
  it("uploads and downloads a file", async () => {
    const content = "hello world";
    const putRes = await fetch(`${getBaseUrl()}/api/storage/test-file.txt`, {
      method: "PUT",
      headers: { ...headers, "content-type": "text/plain" },
      body: content
    });
    expect([200, 201, 204]).toContain(putRes.status);

    const getRes = await fetch(`${getBaseUrl()}/api/storage/test-file.txt`, {
      headers
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.text();
    expect(body).toBe(content);
  });

  it("returns 404 for non-existent file", async () => {
    const res = await fetch(
      `${getBaseUrl()}/api/storage/nonexistent-file.txt`,
      { headers }
    );
    expect(res.status).toBe(404);
  });

  it("HEAD returns metadata without body", async () => {
    // Upload first
    await fetch(`${getBaseUrl()}/api/storage/meta-test.txt`, {
      method: "PUT",
      headers: { ...headers, "content-type": "text/plain" },
      body: "metadata check"
    });

    const headRes = await fetch(`${getBaseUrl()}/api/storage/meta-test.txt`, {
      method: "HEAD",
      headers
    });
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get("content-length")).toBeTruthy();
  });

  it("deletes a file", async () => {
    await fetch(`${getBaseUrl()}/api/storage/delete-me.txt`, {
      method: "PUT",
      headers: { ...headers, "content-type": "text/plain" },
      body: "bye"
    });

    const delRes = await fetch(`${getBaseUrl()}/api/storage/delete-me.txt`, {
      method: "DELETE",
      headers
    });
    expect([200, 204]).toContain(delRes.status);

    const getRes = await fetch(`${getBaseUrl()}/api/storage/delete-me.txt`, {
      headers
    });
    expect(getRes.status).toBe(404);
  });
});
