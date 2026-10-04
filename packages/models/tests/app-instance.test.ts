import { appInstanceResponse } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  createAppInstance,
  ensureDefaultAppInstance,
  getDefaultAppInstance,
  listAppInstances,
  settleDeletedAppRunBilling,
  getAppInstance,
  updateAppInstance,
  duplicateAppInstance,
  deleteAppInstance,
  reserveAppRun,
  getAppRun,
  listAppRuns,
  settleAppRun,
  setAppRunInputs,
  deleteAppRun,
  attachGenerationToAppRun,
  sweepInterruptedAppRuns,
  sanitizeAppRunContent,
  validateAppRunSnapshot,
  APP_SNAPSHOT_STRING_LIMIT,
  APP_RUN_CONTENT_STRING_LIMIT,
  APP_RUN_CONTENT_BYTE_LIMIT,
  updateAppRunEstimate,
  claimAppRun,
  findAppRunByInvocation,
  reconcileAppRunCost,
  AppInstanceConflictError,
  type AppRunSnapshot
} from "../src/app-instance.js";
import { initTestDb, getDb, getRawDb } from "../src/db.js";
import {
  Prediction,
  GenerationAttempt,
  GenerationOutput
} from "../src/index.js";
import { Application } from "../src/application.js";
import {
  applicationUsage,
  setApplicationBudget
} from "../src/application-budget.js";
import { exportPersonalData, erasePersonalData } from "../src/personal-data.js";
import {
  cleanupStorage,
  DEFAULT_STORAGE_RETENTION_POLICY
} from "../src/storage-maintenance.js";
import { applicationInvocations } from "../src/schema/application-budgets.js";
import { eq } from "drizzle-orm";

const snapshot = (): AppRunSnapshot => ({
  document: {
    ...createEmptyDocument(),
    operations: [
      {
        id: "op",
        name: "Run",
        workflowId: "wf",
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ]
  },
  workflow_graphs: { wf: { nodes: [], edges: [] } },
  script_documents: {}
});
const create = (applicationId?: string) =>
  createAppInstance({
    userId: "u1",
    applicationId,
    sourceId: "example:test",
    snapshot: snapshot(),
    variables: { x: 1 }
  });
const reserve = async (instanceId: string, invocationId = "inv-1") => {
  const result = await reserveAppRun({
    userId: "u1",
    instanceId,
    operationId: "op",
    invocationId,
    origin: "ui",
    estimatedUsd: 0.5
  });
  if (!result.allowed) throw new Error(result.reason);
  return result;
};
describe("durable app instances and operation runs", () => {
  beforeEach(() => {
    initTestDb();
  });
  it("creates frozen inline snapshots without publishing or making library applications", async () => {
    const definition = snapshot();
    const instance = await createAppInstance({
      userId: "u1",
      sourceId: "inline:1",
      snapshot: definition
    });
    definition.document.operations[0]!.name = "Changed";
    expect(
      (await getAppInstance("u1", instance.id))?.snapshot.document.operations[0]
        ?.name
    ).toBe("Run");
    expect(
      getRawDb().prepare("SELECT count(*) n FROM applications").get()
    ).toEqual({ n: 0 });
  });
  it("preserves long working-state strings while keeping run history bounded", async () => {
    const initialText = "scene ".repeat(5000);
    const updatedText = "draft ".repeat(5000);
    const outputText = "final ".repeat(5000);
    const instance = await createAppInstance({
      userId: "u1", sourceId: "example:long-state", snapshot: snapshot(),
      variables: { screenplay: initialText, token: "credential", media: Buffer.from("bytes") }
    });
    expect(initialText).toHaveLength(30_000);
    expect(instance.variables.screenplay).toBe(initialText);
    expect(instance.variables.token).toBe("[REDACTED:secret]");
    expect(instance.variables.media).toBe("[media omitted]");
    const updated = await updateAppInstance("u1", instance.id, {
      expectedRevision: 0, variables: { screenplay: updatedText, unrelated: initialText }
    });
    expect(updated.variables.screenplay).toBe(updatedText);
    const { run } = await reserve(instance.id);
    const terminal = await settleAppRun("u1", run.id, {
      status: "completed", outputs: { screenplay: outputText, __app_outputs: { screenplay: outputText } }
    });
    expect(terminal.outputs?.screenplay).toBe(outputText.slice(0, APP_RUN_CONTENT_STRING_LIMIT));
    const reloaded = await getAppInstance("u1", instance.id);
    expect(reloaded?.variables.screenplay).toBe(outputText);
    expect(reloaded?.variables.__app_outputs).toEqual({ screenplay: outputText });
    expect(reloaded?.variables.unrelated).toBe(initialText);
  });

  it("rejects oversized working state instead of silently truncating it", async () => {
    const oversized = "scene ".repeat(Math.ceil(APP_RUN_CONTENT_BYTE_LIMIT / 6));
    await expect(createAppInstance({
      userId: "u1", sourceId: "example:oversized-state", snapshot: snapshot(), variables: { screenplay: oversized }
    })).rejects.toMatchObject({ code: "invalid_input" });
    const instance = await create();
    await expect(updateAppInstance("u1", instance.id, { expectedRevision: 0, variables: { screenplay: oversized } }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect((await getAppInstance("u1", instance.id))?.revision).toBe(0);
    const { run } = await reserve(instance.id);
    await expect(settleAppRun("u1", run.id, { status: "completed", outputs: { screenplay: oversized } }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect((await getAppRun("u1", run.id))?.status).toBe("running");
    expect((await getAppInstance("u1", instance.id))?.variables).toEqual({ x: 1 });
  });

  it("preserves executable snapshot bytes and rejects oversized code instead of truncating", async () => {
    const definition = snapshot();
    const code =
      "// contact person@example.com and use literal secret-123456\n" +
      "// unchanged body\n".repeat(2000);
    definition.script_documents.script = {
      schemaVersion: 1,
      description: "Example",
      code,
      inputs: [],
      outputs: [],
      secrets: [],
      timeoutSeconds: 60,
      tests: []
    };
    const instance = await createAppInstance({
      userId: "u1",
      sourceId: "inline:code",
      snapshot: definition,
      secretValues: ["secret-123456"]
    });
    expect(instance.snapshot.script_documents.script?.code).toBe(code);
    const { run } = await reserve(instance.id);
    expect(run.snapshot?.script_documents.script?.code).toBe(code);
    definition.script_documents.script.code = "x".repeat(
      APP_SNAPSHOT_STRING_LIMIT + 1
    );
    await expect(
      createAppInstance({
        userId: "u1",
        sourceId: "inline:large",
        snapshot: definition
      })
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("omits serialized Buffer and typed media bytes and rejects non-JSON execution snapshots", () => {
    const content = appInstanceResponse.shape.variables.parse(
      sanitizeAppRunContent({
        bytes: Buffer.from([1, 2, 3]),
        image: {
          type: "image",
          data: new Uint8Array([4, 5, 6]),
          uri: "asset://asset-1"
        }
      })
    );
    expect(content.bytes).toBe("[media omitted]");
    expect(appInstanceResponse.shape.variables.parse(content.image).data).toBe(
      "[media omitted]"
    );
    expect(appInstanceResponse.shape.variables.parse(content.image).uri).toBe(
      "asset://asset-1"
    );
    const definition = snapshot();
    definition.document.ui.root.props = { invalid: 1n };
    expect(() => validateAppRunSnapshot(definition)).toThrowError(
      expect.objectContaining({ code: "invalid_input" })
    );
    definition.document.ui.root.props = {
      custom: { toJSON: () => "changed-source" }
    };
    expect(() => validateAppRunSnapshot(definition)).toThrowError(
      expect.objectContaining({ code: "invalid_input" })
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    definition.document.ui.root.props = { cyclic };
    expect(() => validateAppRunSnapshot(definition)).toThrowError(
      expect.objectContaining({ code: "invalid_input" })
    );
  });
  it("returns one default across racing callers and duplicate instances have no history", async () => {
    const input = { userId: "u1", sourceId: "example:1", snapshot: snapshot() };
    const [a, b] = await Promise.all([
      ensureDefaultAppInstance(input),
      ensureDefaultAppInstance(input)
    ]);
    expect(a.id).toBe(b.id);
    await reserve(a.id);
    const copy = await duplicateAppInstance("u1", a.id, "Other");
    expect(copy.is_default).toBe(0);
    expect(await listAppRuns("u1", copy.id)).toEqual([]);
  });
  it("finds an older default beyond the recent instance page", async () => {
    const input = {
      userId: "u1",
      sourceId: "example:many",
      snapshot: snapshot()
    };
    const initial = await ensureDefaultAppInstance(input);
    for (let index = 0; index < 101; index++) {
      await createAppInstance(input);
    }
    getRawDb()
      .prepare("UPDATE app_instances SET updated_at='2000-01-01' WHERE id=?")
      .run(initial.id);
    expect(
      (await listAppInstances("u1", null, input.sourceId, 100)).some(
        (row) => row.id === initial.id
      )
    ).toBe(false);
    expect((await ensureDefaultAppInstance(input)).id).toBe(initial.id);
    expect((await getDefaultAppInstance("u1", input.sourceId))?.id).toBe(
      initial.id
    );
    expect(await getDefaultAppInstance("u2", input.sourceId)).toBeNull();
  });
  it("resolves application prefixes within the instance owner scope and stores full ids", async () => {
    const id = "123456789abc00000000000000000001";
    const foreign = "123456789abc00000000000000000002";
    await Application.create<Application>({ id, user_id: "u1" });
    await Application.create<Application>({ id: foreign, user_id: "u2" });
    const input = {
      userId: "u1",
      applicationId: id.slice(0, 12),
      snapshot: snapshot()
    };
    const initial = await ensureDefaultAppInstance(input);
    expect(initial.application_id).toBe(id);
    expect(initial.source_id).toBe(id);
    expect((await ensureDefaultAppInstance(input)).id).toBe(initial.id);
    expect(
      (await getDefaultAppInstance("u1", id, input.applicationId))?.id
    ).toBe(initial.id);
    expect(
      (await listAppInstances("u1", input.applicationId)).map((row) => row.id)
    ).toEqual([initial.id]);
    await expect(
      createAppInstance({ ...input, userId: "u3" })
    ).rejects.toMatchObject({ code: "not_found" });
    await Application.create<Application>({
      id: "123456789abc00000000000000000003",
      user_id: "u1"
    });
    await expect(createAppInstance(input)).rejects.toMatchObject({
      code: "conflict"
    });
  });
  it("rejects foreign owners and resolves only exact unique 12-character resource prefixes", async () => {
    const i = await create();
    expect(await getAppInstance("u2", i.id)).toBeNull();
    expect((await getAppInstance("u1", i.id.slice(0, 12)))?.id).toBe(i.id);
    expect(await getAppInstance("u1", i.id.slice(0, 11))).toBeNull();
    const second = i.id.slice(0, 12) + "ffffffffffffffffffff";
    getRawDb()
      .prepare(
        "INSERT INTO app_instances SELECT ?,user_id,application_id,source_id,name,version,snapshot,variables,revision,0,created_at,updated_at FROM app_instances WHERE id=?"
      )
      .run(second, i.id);
    await expect(getAppInstance("u1", i.id.slice(0, 12))).rejects.toThrow(
      "Ambiguous"
    );
    await expect(
      reserveAppRun({
        userId: "u2",
        instanceId: i.id,
        operationId: "op",
        invocationId: "foreign",
        origin: "agent"
      })
    ).rejects.toThrow("not found");
  });
  it("uses revision CAS and preserves newer state when a delayed run finishes", async () => {
    const i = await create();
    const { run } = await reserve(i.id);
    await updateAppInstance("u1", i.id, {
      expectedRevision: 0,
      variables: { x: 2 }
    });
    await expect(
      updateAppInstance("u1", i.id, {
        expectedRevision: 0,
        variables: { x: 3 }
      })
    ).rejects.toBeInstanceOf(AppInstanceConflictError);
    const settled = await settleAppRun("u1", run.id, {
      status: "completed",
      outputs: { x: 9 }
    });
    expect(settled.state_conflict).toBe(1);
    expect(settled.outputs).toEqual({ x: 9 });
    expect((await getAppInstance("u1", i.id))?.variables).toEqual({ x: 2 });
    expect(
      (
        await settleAppRun("u1", run.id, {
          status: "failed",
          outputs: { x: 10 }
        })
      ).status
    ).toBe("completed");
  });
  it("claims a reserved execution exactly once and never claims terminal or foreign runs", async () => {
    const i = await create();
    const { run } = await reserve(i.id);
    expect(await claimAppRun("u2", run.id)).toBe(false);
    const claims = await Promise.all([
      claimAppRun("u1", run.id),
      claimAppRun("u1", run.id)
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await findAppRunByInvocation("u1", run.invocation_id))?.id).toBe(
      run.id
    );
    expect(await findAppRunByInvocation("u2", run.invocation_id)).toBeNull();
    await settleAppRun("u1", run.id, { status: "completed" });
    expect(await claimAppRun("u1", run.id)).toBe(false);
  });
  it("does not release estimates while generation cost remains unresolved", async () => {
    const i = await create();
    const { run } = await reserve(i.id);
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "test",
      model: "mock",
      idempotency_key: "cost-1",
      input_fingerprint: "cost-input",
      metadata: { app_run_id: run.id }
    });
    await settleAppRun("u1", run.id, { status: "completed", knownLlmUsd: 0.1 });
    expect((await reconcileAppRunCost("u1", run.id, 0))?.actual_usd).toBeNull();
    await generation.update({ status: "completed", cost: 0.25 });
    expect((await reconcileAppRunCost("u1", run.id, 0))?.actual_usd).toBeNull();
    await generation.update({ reconciled_at: new Date().toISOString() });
    expect((await reconcileAppRunCost("u1", run.id, 0.1))?.actual_usd).toBe(
      0.35
    );
    expect((await reconcileAppRunCost("u1", run.id))?.actual_usd).toBe(0.35);
  });
  it("persists known LLM-only accounting and merges outputs from other operations", async () => {
    const i = await create();
    await updateAppInstance("u1", i.id, {
      expectedRevision: 0,
      variables: {
        x: 1,
        __app_outputs: { "older:slot": "keep" },
        __app_inputs: { old: "keep" }
      }
    });
    const { run } = await reserve(i.id);
    await settleAppRun("u1", run.id, {
      status: "completed",
      knownLlmUsd: 0.2,
      outputs: {
        __app_outputs: { "op:slot": "new" },
        __app_inputs: { current: "new" }
      }
    });
    expect((await reconcileAppRunCost("u1", run.id))?.actual_usd).toBe(0.2);
    expect((await getAppInstance("u1", i.id))?.variables).toEqual({
      x: 1,
      __app_outputs: { "older:slot": "keep", "op:slot": "new" },
      __app_inputs: { old: "keep", current: "new" }
    });
    expect((await getAppRun("u1", run.id))?.outputs).toEqual({
      __app_outputs: { "op:slot": "new" },
      __app_inputs: { current: "new" }
    });
  });
  it("keeps null output values and keeps budget estimates for unmeasured terminal costs", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    await setApplicationBudget("saved", {
      period: "total",
      maxInvocations: 1,
      maxUsd: 1
    });
    const results = await Promise.all([reserve(i.id), reserve(i.id)]);
    expect(results[0].run.id).toBe(results[1].run.id);
    const run = results[0].run;
    await settleAppRun("u1", run.id, {
      status: "completed",
      outputs: { x: null }
    });
    expect((await getAppInstance("u1", i.id))?.variables).toEqual({ x: null });
    expect((await applicationUsage("saved", "total")).spentUsd).toBe(0.5);
    expect((await reserve(i.id)).created).toBe(false);
    const denial = await reserveAppRun({
      userId: "u1",
      instanceId: i.id,
      operationId: "op",
      invocationId: "second",
      origin: "ui",
      estimatedUsd: 0.5
    });
    expect(denial.allowed).toBe(false);
  });
  it("reconciles interrupted work only for the owning server and preserves estimates", async () => {
    const i = await create();
    const old = await reserve(i.id, "old");
    const other = await reserve(i.id, "other");
    const unclaimed = await reserve(i.id, "unclaimed");
    await claimAppRun("u1", old.run.id, "server-a");
    await claimAppRun("u1", other.run.id, "server-b");
    const future = new Date(Date.now() + 1000).toISOString();
    expect(await sweepInterruptedAppRuns(future, "server-a")).toBe(1);
    expect((await getAppRun("u1", old.run.id))?.status).toBe("failed");
    expect((await getAppRun("u1", old.run.id))?.actual_usd).toBeNull();
    expect((await getAppRun("u1", other.run.id))?.status).toBe("running");
    expect((await getAppRun("u1", unclaimed.run.id))?.status).toBe("running");
    expect(await sweepInterruptedAppRuns(future, null)).toBe(2);
  });
  it("closes interrupted deleted billing reservations without restoring error content", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    const { run } = await reserve(i.id);
    await claimAppRun("u1", run.id, "server-a");
    await deleteAppRun("u1", run.id);
    const future = new Date(Date.now() + 1000).toISOString();
    expect(await sweepInterruptedAppRuns(future, "server-b")).toBe(0);
    expect(await sweepInterruptedAppRuns(future, "server-a")).toBe(1);
    expect(
      getRawDb()
        .prepare(
          "SELECT status,error,instance_id,actual_usd FROM application_invocations WHERE id=?"
        )
        .get(run.id)
    ).toEqual({
      status: "failed",
      error: null,
      instance_id: null,
      actual_usd: null
    });
    expect((await applicationUsage("saved", "total")).spentUsd).toBe(0.5);
  });
  it("rechecks zero-price UI reservations under the budget lock before claiming work", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    await setApplicationBudget("saved", { period: "total", maxUsd: 1 });
    const first = await reserveAppRun({
      userId: "u1",
      instanceId: i.id,
      operationId: "op",
      invocationId: "zero-1",
      origin: "ui",
      estimatedUsd: 0
    });
    const second = await reserveAppRun({
      userId: "u1",
      instanceId: i.id,
      operationId: "op",
      invocationId: "zero-2",
      origin: "ui",
      estimatedUsd: 0
    });
    if (!first.allowed || !second.allowed)
      throw new Error("zero estimates should reserve");
    await updateAppRunEstimate("u1", first.run.id, 0.8);
    await expect(
      updateAppRunEstimate("u1", second.run.id, 0.8)
    ).rejects.toMatchObject({ code: "budget_exceeded" });
    expect((await getAppRun("u1", second.run.id))?.estimated_usd).toBe(0);
    await claimAppRun("u1", first.run.id);
    await expect(
      updateAppRunEstimate("u1", first.run.id, 0.5)
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("deleting saved run history preserves lifetime budget reservations", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    await setApplicationBudget("saved", {
      period: "total",
      maxInvocations: 1,
      maxUsd: 1
    });
    const { run } = await reserve(i.id);
    await settleAppRun("u1", run.id, {
      status: "completed",
      outputs: { x: "copied-content" }
    });
    await deleteAppRun("u1", run.id);
    expect(await getAppRun("u1", run.id)).toBeNull();
    expect((await applicationUsage("saved", "total")).spentUsd).toBe(0.5);
    expect((await applicationUsage("saved", "total")).invocations).toBe(1);
    const row = getRawDb()
      .prepare(
        "SELECT instance_id,snapshot,inputs,outputs,documents,error,trace_id,root_span_id FROM application_invocations WHERE id=?"
      )
      .get(run.id);
    expect(row).toEqual({
      instance_id: null,
      snapshot: null,
      inputs: null,
      outputs: null,
      documents: null,
      error: null,
      trace_id: null,
      root_span_id: null
    });
    const denied = await reserveAppRun({
      userId: "u1",
      instanceId: i.id,
      operationId: "op",
      invocationId: "next",
      origin: "ui"
    });
    expect(denied.allowed).toBe(false);
    await deleteAppInstance("u1", i.id);
    expect((await applicationUsage("saved", "total")).invocations).toBe(1);
  });
  it("settles deleted saved-run billing and reconciles pending children without restoring history", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    const { run } = await reserve(i.id);
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "test",
      model: "mock",
      idempotency_key: "pending-cost",
      input_fingerprint: "input",
      metadata: { app_run_id: run.id }
    });
    await deleteAppRun("u1", run.id);
    await expect(
      settleDeletedAppRunBilling("u2", run.id, {
        status: "completed",
        knownLlmUsd: 0.1
      })
    ).resolves.toBe(false);
    await expect(
      settleDeletedAppRunBilling("u1", run.id, {
        status: "completed",
        knownLlmUsd: 0.1
      })
    ).resolves.toBe(true);
    expect(
      getRawDb()
        .prepare(
          "SELECT status,actual_usd,known_llm_usd FROM application_invocations WHERE id=?"
        )
        .get(run.id)
    ).toEqual({ status: "completed", actual_usd: null, known_llm_usd: 0.1 });
    expect((await applicationUsage("saved", "total")).spentUsd).toBe(0.5);
    await generation.update({
      status: "completed",
      cost: 0.2,
      reconciled_at: new Date().toISOString()
    });
    await reconcileAppRunCost("u1", run.id);
    expect((await applicationUsage("saved", "total")).spentUsd).toBeCloseTo(
      0.3
    );
    expect(await getAppRun("u1", run.id)).toBeNull();
    expect(await listAppRuns("u1", i.id)).toEqual([]);
    expect(
      getRawDb()
        .prepare(
          "SELECT instance_id,inputs,outputs,snapshot FROM application_invocations WHERE id=?"
        )
        .get(run.id)
    ).toEqual({
      instance_id: null,
      inputs: null,
      outputs: null,
      snapshot: null
    });
    await expect(
      settleDeletedAppRunBilling("u1", run.id, {
        status: "failed",
        actualUsd: 99
      })
    ).resolves.toBe(false);
  });
  it("redacts dynamic credentials and stores public runs without visitor content or state writes", async () => {
    await Application.create<Application>({ id: "public", user_id: "u1" });
    const i = await create("public");
    await setApplicationBudget("public", { maxInvocations: 10 });
    const result = await reserveAppRun({
      userId: "u1",
      instanceId: i.id,
      operationId: "op",
      invocationId: "visitor",
      origin: "public",
      requireFiniteBudget: true,
      inputs: { prompt: "visitor-private" }
    });
    if (!result.allowed) throw new Error("Denied");
    await setAppRunInputs("u1", result.run.id, { prompt: "visitor-private" });
    const final = await settleAppRun("u1", result.run.id, {
      status: "completed",
      outputs: { x: "visitor-private" }
    });
    expect(final.snapshot).toBeNull();
    expect(final.inputs).toBeNull();
    expect(final.outputs).toBeNull();
    expect(final.documents).toBeNull();
    expect((await getAppInstance("u1", i.id))?.variables).toEqual({ x: 1 });
    const { run } = await reserve(i.id, "private");
    await setAppRunInputs("u1", run.id, {
      prompt: "ordinary prompt secret-123456"
    });
    await settleAppRun("u1", run.id, {
      status: "completed",
      outputs: { result: "secret-123456" },
      secretValues: ["secret-123456"]
    });
    expect(JSON.stringify(await getAppRun("u1", run.id))).not.toContain(
      "secret-123456"
    );
    expect((await getAppRun("u1", run.id))?.inputs?.prompt).toContain(
      "ordinary prompt"
    );
  });
  it("exports and erases instances and runs with the owning account", async () => {
    const i = await create();
    await reserve(i.id);
    const exported = await exportPersonalData("u1");
    expect(JSON.stringify(exported)).toContain(i.id);
    const foreign = await exportPersonalData("u2");
    expect(JSON.stringify(foreign)).not.toContain(i.id);
    await erasePersonalData("u1");
    expect(await getAppInstance("u1", i.id)).toBeNull();
  });
  it("deletes attachment references but keeps generations and outputs when instances are deleted", async () => {
    const i = await create();
    const { run } = await reserve(i.id);
    const { generation } = await Prediction.acceptGeneration({
      user_id: "u1",
      provider: "test",
      model: "mock",
      idempotency_key: "generation-1",
      input_fingerprint: "input-1"
    });
    const { attempt } = await GenerationAttempt.ensureForGeneration({
      generation_id: generation.id,
      provider: "test",
      input_fingerprint: "input-1"
    });
    const output = await GenerationOutput.upsertOutput({
      generation_id: generation.id,
      attempt_id: attempt.id,
      output_key: "result"
    });
    await expect(
      attachGenerationToAppRun("u2", run.id, generation.id, output.id)
    ).resolves.toBeNull();
    const a = await attachGenerationToAppRun(
      "u1",
      run.id,
      generation.id,
      output.id
    );
    expect(a?.id).toBeDefined();
    const again = await attachGenerationToAppRun(
      "u1",
      run.id,
      generation.id,
      output.id
    );
    expect(again?.id).toBe(a?.id);
    await deleteAppInstance("u1", i.id);
    expect(
      getRawDb()
        .prepare(
          "SELECT count(*) n FROM nodetool_generation_attachments WHERE target_id=?"
        )
        .get(run.id)
    ).toEqual({ n: 0 });
    expect(await Prediction.get(generation.id)).not.toBeNull();
    expect(await GenerationOutput.get(output.id)).not.toBeNull();
    await expect(
      attachGenerationToAppRun("u1", run.id, generation.id, output.id)
    ).resolves.toBeNull();
  });
  it("rejects late attachment when deletion wins before the parent transaction", async () => {
    await Application.create<Application>({ id: "saved", user_id: "u1" });
    const i = await create("saved");
    const { run } = await reserve(i.id);
    const database = getDb();
    const transaction = database.transaction.bind(database);
    const interception = vi
      .spyOn(database, "transaction")
      .mockImplementationOnce((body, config) => {
        // The caller already read the run; deletion now wins before the attachment lock.
        getRawDb()
          .prepare(
            "UPDATE application_invocations SET instance_id=NULL,inputs=NULL,outputs=NULL,snapshot=NULL,content_expired=1 WHERE id=?"
          )
          .run(run.id);
        return transaction(body, config);
      });
    try {
      await expect(
        attachGenerationToAppRun(
          "u1",
          run.id,
          "unused-generation",
          "unused-output"
        )
      ).resolves.toBeNull();
    } finally {
      interception.mockRestore();
    }
    expect(
      getRawDb()
        .prepare(
          "SELECT count(*) n FROM nodetool_generation_attachments WHERE target_id=?"
        )
        .get(run.id)
    ).toEqual({ n: 0 });
    expect(await getAppRun("u1", run.id)).toBeNull();
  });
  it("prunes snapshots before records and removes attachment references while keeping media", async () => {
    const i = await create();
    const { run } = await reserve(i.id);
    await settleAppRun("u1", run.id, {
      status: "completed",
      outputs: { x: "old-content" }
    });
    await getDb()
      .update(applicationInvocations)
      .set({
        created_at: "2026-01-01T00:00:00Z",
        settled_at: "2026-01-01T00:00:00Z"
      })
      .where(eq(applicationInvocations.id, run.id));
    await cleanupStorage(
      "u1",
      {
        ...DEFAULT_STORAGE_RETENTION_POLICY,
        runTraceRetentionDays: 1,
        terminalJobRetentionDays: 365
      },
      new Date("2026-02-01")
    );
    expect((await getAppRun("u1", run.id))?.outputs).toBeNull();
    expect((await getAppRun("u1", run.id))?.content_expired).toBe(1);
    await cleanupStorage(
      "u1",
      { ...DEFAULT_STORAGE_RETENTION_POLICY, terminalJobRetentionDays: 1 },
      new Date("2026-02-01")
    );
    expect(await getAppRun("u1", run.id)).toBeNull();
    expect(
      await attachGenerationToAppRun("u1", run.id, "missing", "missing")
    ).toBeNull();
    expect(await deleteAppRun("u2", run.id)).toBe(false);
    expect(await deleteAppInstance("u1", i.id)).toBe(true);
  });
});
