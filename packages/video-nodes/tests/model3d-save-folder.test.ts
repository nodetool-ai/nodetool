import { describe, expect, it } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SaveModel3DNode } from "@nodetool-ai/video-nodes";

describe("SaveModel3DNode folder ref", () => {
  it("writes into the folder the ref points at, not \"[object Object]\"", async () => {
    const dir = await mkdtemp(join(tmpdir(), "savemodel3d-"));
    const node = new SaveModel3DNode();
    node.assign({
      model: { type: "model_3d", data: "AAECAw==", format: "glb" },
      folder: { type: "folder", uri: dir },
      name: "mesh.glb"
    });

    const { output } = await node.process();

    expect(output.uri).toBe(`file://${join(dir, "mesh.glb")}`);
    expect(await readdir(dir)).toEqual(["mesh.glb"]);
  });
});
