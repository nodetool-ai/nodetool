import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNativeCpp2dCourse } from "../src/native-template.js";
import { requestNativeEditor } from "../src/native-editor-client.js";

describe("live native editor client", () => {
  it("preserves editor conflicts and rejects pre-aborted requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-editor-client-"));
    const path = process.platform === "win32" ? `\\\\.\\pipe\\native-editor-${process.pid}` : join(directory, "editor.sock");
    const server = createServer((socket) => {
      socket.once("data", (bytes) => {
        const request = JSON.parse(bytes.toString());
        expect(request.operation).toBe("transaction");
        expect(request.expectedRevision).toBe(3);
        socket.end(`${JSON.stringify({ requestId: request.requestId, status: "error", error: { code: "conflict", message: "Document revision changed", currentRevision: 4 } })}\n`);
      });
    });
    await new Promise<void>((resolve) => server.listen(path, resolve));
    try {
      await expect(requestNativeEditor(path, { operation: "transaction", expectedRevision: 3, operations: [{ kind: "setTitle", title: "Agent edit" }] }, { dimension: "3d" })).rejects.toMatchObject({ code: "conflict", currentRevision: 4 });
      const controller = new AbortController(); controller.abort();
      await expect(requestNativeEditor(path, { operation: "inspect" }, { signal: controller.signal })).rejects.toBeDefined();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("inspects the live dimension before applying entity defaults", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-editor2d-client-"));
    const path = process.platform === "win32" ? `\\\\.\\pipe\\native-editor2d-${process.pid}` : join(directory, "editor.sock");
    const document = createNativeCpp2dCourse("d".repeat(32)).document;
    const operations: string[] = [], requestIds: string[] = [];
    const server = createServer((socket) => socket.once("data", (bytes) => {
      const request = JSON.parse(bytes.toString()); operations.push(request.operation); requestIds.push(request.requestId);
      if (request.operation === "transaction") { expect(request.operations[0].entity.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }); }
      socket.end(`${JSON.stringify({ requestId: request.requestId, status: "ok", result: { document, revision: 0, playing: false } })}\n`);
    }));
    await new Promise<void>((resolve) => server.listen(path, resolve));
    try {
      await requestNativeEditor(path, { operation: "transaction", expectedRevision: 0, operations: [{ kind: "addEntity", sceneId: "course", entity: { id: "new" } }] }, { requestId: "stable-edit" });
      expect(operations).toEqual(["inspect", "transaction"]);
      expect(requestIds[0]).not.toBe(requestIds[1]); expect(requestIds[1]).toBe("stable-edit");
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(directory, { recursive: true, force: true }); }
  });

});
