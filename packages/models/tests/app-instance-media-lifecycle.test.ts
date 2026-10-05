import { beforeEach, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";
import { Prediction, GenerationAttempt, GenerationOutput } from "../src/index.js";
import {
  attachGenerationToAppRun,
  createAppInstance,
  deleteAppInstance,
  duplicateAppInstance,
  getAppRun,
  listAppRuns,
  reserveAppRun,
  settleAppRun
} from "../src/app-instance.js";

beforeEach(() => { initTestDb(); });

it("duplicates media references and preserves library assets after source history deletion and late completion", async () => {
  const asset = await Asset.create<Asset>({ user_id: "owner", name: "Generated image", content_type: "image/png", file_id: "generated-image.png" });
  const source = await createAppInstance({
    userId: "owner", sourceId: "inline:media", name: "Source",
    snapshot: {
      document: { ...createEmptyDocument(), operations: [{ id: "main", name: "Render", workflowId: "workflow", inputs: {}, outputs: {}, policy: "parallel" }] },
      workflow_graphs: { workflow: { nodes: [], edges: [] } }, script_documents: {}
    },
    variables: { result: { type: "image", asset_id: asset.id, uri: `asset://${asset.id}` } }
  });
  const reserved = await reserveAppRun({ userId: "owner", instanceId: source.id, operationId: "main", invocationId: "render", origin: "ui", estimatedUsd: 0 });
  expect(reserved.allowed).toBe(true);
  if (!reserved.allowed) { throw new Error(reserved.reason); }
  const { generation } = await Prediction.acceptGeneration({ user_id: "owner", provider: "scripted", model: "image", idempotency_key: "image", input_fingerprint: "image" });
  const { attempt } = await GenerationAttempt.ensureForGeneration({ generation_id: generation.id, provider: "scripted", input_fingerprint: "image" });
  const output = await GenerationOutput.upsertOutput({ generation_id: generation.id, attempt_id: attempt.id, output_key: "image" });
  await output.update({ asset_id: asset.id, status: "ready" });
  expect(await attachGenerationToAppRun("owner", reserved.run.id, generation.id, output.id)).not.toBeNull();
  const copied = await duplicateAppInstance("owner", source.id, "Copy");
  expect(copied?.id).not.toBe(source.id);
  expect(copied?.variables).toEqual(source.variables);
  expect(copied?.snapshot).toEqual(source.snapshot);
  expect(await listAppRuns("owner", copied!.id)).toEqual([]);
  await deleteAppInstance("owner", source.id);
  await expect(settleAppRun("owner", reserved.run.id, { status: "completed", outputs: { result: { type: "image", asset_id: asset.id } } })).rejects.toMatchObject({ code: "not_found" });
  expect(await getAppRun("owner", reserved.run.id)).toBeNull();
  expect(await Asset.get(asset.id)).not.toBeNull();
  expect(await Prediction.get(generation.id)).not.toBeNull();
  expect((await GenerationOutput.get<GenerationOutput>(output.id))?.asset_id).toBe(asset.id);
  expect(await listAppRuns("owner", copied!.id)).toEqual([]);
});
