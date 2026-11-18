/**
 * The cloud HTTP transport checks every answer against its output schema
 * (review F17). A self-hosted cloud can answer anything, and ids, hashes and
 * paths from the answer later name files on this computer.
 */
import { describe, expect, it } from "vitest";
import { CloudHttpTransport, CloudRequestError } from "../src/cloud-http-transport.js";

const ID = "a".repeat(32);
const HASH = "b".repeat(64);

function transportAnswering(data: unknown): CloudHttpTransport {
  return new CloudHttpTransport({
    origin: "https://cloud.example",
    accessToken: "token",
    async fetchImpl() {
      return new Response(JSON.stringify({ result: { data } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
}

function capture(file: Record<string, unknown>) {
  return {
    set_id: ID,
    project_id: ID,
    expires_at: "2026-11-25T00:00:00.000Z",
    documents: [
      {
        kind: "workflow",
        document_id: ID,
        name: "Edit",
        revision_id: ID,
        content_hash: HASH,
        files: [file],
        missing_files: []
      }
    ]
  };
}

const goodFile = { asset_id: ID, hash: HASH, size: 3, name: "still.png", content_type: "image/png", path: "media/still.png" };

describe("CloudHttpTransport answers", () => {
  it("returns an answer that matches the schema", async () => {
    const set = await transportAnswering(capture(goodFile)).capture({ project_id: ID });
    expect(set.documents[0]?.files[0]?.hash).toBe(HASH);
  });

  it.each([
    ["a hash that is a path", { ...goodFile, hash: "../../etc/passwd" }],
    ["a path outside the folder", { ...goodFile, path: "../outside.png" }],
    ["a path into .nodetool", { ...goodFile, path: ".nodetool/cloud-staging/x" }],
    ["a name with a folder and no path", { ...goodFile, path: null, name: "../x.png" }]
  ])("refuses %s", async (_label, file) => {
    const answer = transportAnswering(capture(file)).capture({ project_id: ID });
    await expect(answer).rejects.toBeInstanceOf(CloudRequestError);
    await expect(answer).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("refuses an open answer whose needed hashes are not hashes", async () => {
    const answer = transportAnswering({ needed_hashes: ["../x"] }).open({
      transfer_id: ID,
      project_id: ID,
      first_publication: true,
      manifest: { project_name: "P", operations: [], required_files: [] }
    });
    await expect(answer).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
