import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nativeGame3dDocument, nativeGameDocument, nativeGameDocumentJsonSchema, nativeGameTransaction, nativeGameScriptCommand, nativeGameScriptCommandJsonSchema, nativeGame2dDocument, nativeGame2dTransaction, nativeGame2dScriptCommand, nativeGame2dScriptCommandJsonSchema, nativeGameTransactionForDimension, nativeRuntimeRequest, nativeSaveCommand } from "../src/native-game.js";

import { nativeGameScriptDeclarations } from "../src/native-game-declarations.js";

const minimal = { schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "game", title: "Course", initialSceneId: "main", scenes: [{ id: "main", entities: [{ id: "player" }] }] };
describe("native game contract", () => {
  it("preserves snapshot JSON while requiring the authenticated same-session envelope", () => {
    const snapshot = { restoreScope: "same-session", authentication: "tag", build: "native-build", tick: 42, entities: [{ id: "player", state: { enabled: true } }] };
    const request = { protocolVersion: 1, requestId: "restore", sessionId: "session", operation: "restore", snapshot };
    const parsed = nativeRuntimeRequest.parse(request);
    expect(parsed.operation).toBe("restore");
    if (parsed.operation === "restore") { expect(parsed.snapshot).toEqual(snapshot); }
    for (const invalid of [{ ...snapshot, restoreScope: "foreign" }, { ...snapshot, authentication: 1 }, { ...snapshot, build: false }, { restoreScope: "same-session", build: "native-build" }, { ...snapshot, extra: undefined }]) {
      expect(nativeRuntimeRequest.safeParse({ ...request, snapshot: invalid }).success).toBe(false);
    }
  });
  it("admits bounded first-person camera settings and preserves fixed cameras", () => {
    const camera = { kind: "firstPerson", targetId: "player" };
    const firstPerson = nativeGame3dDocument.parse({ ...minimal, camera });
    expect(firstPerson.camera).toMatchObject({ kind: "firstPerson", targetId: "player", offset: [0, .65, 0], sensitivity: .002, near: .03, far: 160 });
    expect(nativeGame3dDocument.safeParse({ ...minimal, camera: { ...camera, near: 200 } }).success).toBe(false);
    expect(nativeGame3dDocument.safeParse({ ...minimal, camera: { ...camera, minPitch: .5 } }).success).toBe(false);
    expect(nativeGame3dDocument.safeParse({ ...minimal, camera: { near: 20000 } }).success).toBe(false);
    expect(nativeGame3dDocument.parse({ ...minimal, camera: { position: [1, 2, 3] } }).camera).toEqual({ position: [1, 2, 3], target: [0, 0, 0], fov: 60 });
    expect(nativeGameScriptDeclarations()).toContain("readonly camera: NativeGameCamera");
  });
  it("preserves unnormalized contextual transaction input and bounded JSON save commands", () => {
    const operation = { kind: "addEntity", sceneId: "main", entity: { id: "bare" } };
    const request = nativeRuntimeRequest.parse({ protocolVersion: 1, requestId: "edit", sessionId: "session", operation: "transaction", expectedRevision: 0, operations: [operation] });
    expect(request.operation).toBe("transaction");
    if (request.operation === "transaction") { expect(request.operations[0]).toEqual(operation); }
    expect(nativeSaveCommand.safeParse({ kind: "save", slot: "slot", data: {}, snapshot: false }).success).toBe(false);
    expect(nativeSaveCommand.safeParse({ kind: "save", slot: "slot", data: { huge: "x".repeat(16384) } }).success).toBe(false);
    expect(nativeSaveCommand.safeParse({ kind: "save", slot: "slot", data: { constructor: 1 } }).success).toBe(false);
  });
  it("admits the shared nonempty native fixture set", () => {
    const fixtures: unknown = JSON.parse(readFileSync(new URL("./fixtures/native-game/admission.json", import.meta.url), "utf8"));
    expect(Array.isArray(fixtures)).toBe(true);
    if (!Array.isArray(fixtures)) { throw new Error("Expected fixtures"); }
    expect(fixtures.length).toBeGreaterThan(0);
    const validate = new Ajv2020({ strict: false, useDefaults: true }).compile(nativeGameDocumentJsonSchema());
    for (const fixture of fixtures) {
      expect(nativeGameDocument.safeParse(fixture.document).success, fixture.name).toBe(fixture.valid);
      // JSON Schema counts code points. The native interpreter follows Zod UTF-16 limits instead.
      // AJV does not insert defaults within union branches. Native normalization is checked by CTest.
      const admitted = nativeGameDocument.safeParse(fixture.document);
      const value = admitted.success ? admitted.data : fixture.document;
      if (fixture.name !== "astral-length-limit") { expect(validate(structuredClone(value)), fixture.name).toBe(fixture.valid); }
    }
  });
  it("selects dimension before normalizing bare transaction entities and scenes", () => {
    const batch = { requestId: "edit", expectedRevision: 0, operations: [
      { kind: "addEntity", sceneId: "main", entity: { id: "bare" } },
      { kind: "addScene", scene: { id: "next", entities: [{ id: "bareScene" }] } }
    ] };
    const parsed = nativeGameTransactionForDimension("2d").parse(batch);
    expect(parsed).toEqual(nativeGame2dTransaction.parse(batch));
    const entityOperation = parsed.operations[0];
    if (entityOperation?.kind !== "addEntity") { throw new Error("Expected entity operation"); }
    expect(entityOperation.entity.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const sceneOperation = parsed.operations[1];
    if (sceneOperation?.kind !== "addScene") { throw new Error("Expected scene operation"); }
    expect(sceneOperation.scene.entities[0]?.transform).toEqual(entityOperation.entity.transform);
    expect(nativeGameTransactionForDimension("3d").parse(batch).operations[0]).not.toEqual(entityOperation);
  });
  it("rejects dimension-specific commands before execution", () => {
    const validate = new Ajv2020({ strict: false }).compile(nativeGame2dScriptCommandJsonSchema());
    for (const command of [
      { kind: "applyImpulse", impulse: [1, 0, 0] },
      { kind: "move", direction: { x: 1, y: 0 }, jump: true },
      { kind: "setPosition", position: [1, 2, 3] },
      { kind: "spawn", entity: { id: "bad", visual: { kind: "primitive", shape: "box" } } }
    ]) {
      expect(nativeGame2dScriptCommand.safeParse(command).success).toBe(false);
      expect(validate(command)).toBe(false);
    }
    const admitted = nativeGame2dScriptCommand.parse({ kind: "setVelocity", velocity: { x: 2, y: 3 } });
    expect(validate(admitted)).toBe(true);
    expect(nativeGameScriptCommand.safeParse(admitted).success).toBe(false);
    expect(nativeGame2dScriptCommand.safeParse({ kind: "playAnimation", clip: "walk" }).success).toBe(true);
    expect(nativeGame2dScriptCommand.safeParse({ kind: "setVisual", visual: { opacity: 0.5, flipX: true, rotation: 0.5, scaleX: 2, scaleY: 1 } }).success).toBe(true);
    expect(nativeGame2dScriptCommand.safeParse({ kind: "setVisual", visual: { scaleX: 0 } }).success).toBe(false);
    expect(nativeGameScriptCommand.safeParse({ kind: "playAnimation", clip: "walk" }).success).toBe(false);
    expect(nativeGame2dScriptCommand.safeParse({ kind: "move", direction: { x: 1, y: 0 } }).success).toBe(true);
    expect(nativeGameScriptCommand.safeParse({ kind: "move", direction: [1, 0, 0], jump: true }).success).toBe(true);
    expect(nativeGameScriptDeclarations("2d")).not.toContain('"kind": "applyImpulse"');
  });
  it("keeps the 2D envelope distinct from legacy and native 3D", () => {
    const document = { ...minimal, schemaVersion: 5, dimension: "2d" };
    expect(nativeGame2dDocument.parse(document).gravity).toEqual({ x: 0, y: -9.81 });
    expect(nativeGameDocument.safeParse({ ...document, schemaVersion: 4 }).success).toBe(false);
    expect(nativeGame2dDocument.safeParse({ ...document, engine: "2" }).success).toBe(false);
    expect(nativeGame2dDocument.safeParse({ ...document, camera: {} }).success).toBe(false);
  });
  it("normalizes defaults and nested entity transforms", () => {
    const document = nativeGameDocument.parse(minimal);
    expect(document.revision).toBe(0);
    expect(document.scenes[0]?.entities[0]?.transform.rotation).toEqual([0, 0, 0, 1]);
    expect(document.scripts).toEqual([]);
  });
  it("rejects legacy identity, unknown fields and nonfinite transforms", () => {
    expect(nativeGameDocument.safeParse({ ...minimal, engine: "2" }).success).toBe(false);
    expect(nativeGameDocument.safeParse({ ...minimal, extra: true }).success).toBe(false);
    expect(nativeGameDocument.safeParse({ ...minimal, scenes: [{ id: "main", entities: [{ id: "player", transform: { position: [Infinity, 0, 0] } }] }] }).success).toBe(false);
  });
  it("exports a closed versioned JSON schema", () => {
    const schema = nativeGameDocumentJsonSchema();
    expect(schema.oneOf ?? schema.anyOf).toHaveLength(2);
  });
  it("admits bounded typed transaction batches", () => {
    expect(nativeGameTransaction.parse({ requestId: "edit", expectedRevision: 0, operations: [{ kind: "addEntity", sceneId: "main", entity: { id: "crate" } }] }).operations[0]?.kind).toBe("addEntity");
    expect(nativeGameTransaction.safeParse({ requestId: "edit", expectedRevision: 0, operations: [] }).success).toBe(false);
    expect(nativeGameTransaction.safeParse({ requestId: "edit", expectedRevision: 0, operations: [{ kind: "eval", source: "bad" }] }).success).toBe(false);
  });
  it("admits bounded simulation and presentation fields", () => {
    const document = nativeGameDocument.parse({ ...minimal, scenes: [{ id: "main", entities: [{
      id: "player", body: { type: "dynamic" }, collider: { shape: "capsule" }, character: {},
      gameplay: { collectible: true }, visual: { kind: "primitive", shape: "capsule" },
      behaviors: [{ id: "move", scriptId: "script" }]
    }] }], camera: {}, hud: [{ id: "jump", kind: "button", text: "Jump", bounds: [0, 0, 0.2, 0.1], action: "jump" }] });
    const entity = document.scenes[0]?.entities[0];
    expect(entity?.body?.mass).toBe(1);
    expect(entity?.collider?.mask).toBe(65_535);
    expect(nativeGameDocument.safeParse({ ...document, scenes: [{ id: "main", entities: [{ id: "bad", collider: { shape: "box", layer: 16 } }] }] }).success).toBe(false);
    expect(nativeGameDocument.safeParse({ ...document, scenes: [{ id: "main", entities: [{ id: "bad", collider: { shape: "box", mask: 65_536 } }] }] }).success).toBe(false);
    expect(entity?.character?.maxSlopeDegrees).toBe(45);
    expect(entity?.behaviors[0]?.maxTickMs).toBe(20);
    expect(nativeGameDocument.safeParse({ ...document, scenes: [{ id: "main", entities: [{ id: "bad", body: { type: "dynamic", mass: -1 } }] }] }).success).toBe(false);
  });
  it("admits script commands consistently through Zod and generated schema", () => {
    const validate = new Ajv2020({ strict: false, useDefaults: true }).compile(nativeGameScriptCommandJsonSchema());
    const cases = [
      { valid: true, value: { kind: "setVelocity", velocity: [1, 0, 0] } },
      { valid: true, value: { kind: "query", queryId: "ray", origin: [0, 0, 0], direction: [0, 0, -1], maxDistance: 10 } },
      { valid: false, value: { kind: "setVelocity", velocity: [1, 0] } },
      { valid: false, value: { kind: "score", amount: Infinity } },
      { valid: false, value: { kind: "eval", source: "bad" } }
    ];
    for (const item of cases) {
      expect(nativeGameScriptCommand.safeParse(item.value).success).toBe(item.valid);
      expect(validate(structuredClone(item.value))).toBe(item.valid);
    }
  });
  it("generates guest command declarations from the admitted contract", () => {
    const source = nativeGameScriptDeclarations();
    expect(source).toContain('"kind": "applyImpulse"');
    expect(source).toContain('"impulse": readonly [number, number, number]');
    expect(source).toContain("onFixedUpdate");
    expect(source).toContain("readonly world: NativeGameScriptWorld");
    expect(source).toContain("declare function after(ticks: number, name: string)");
    expect(source).toContain("random(): number");
  });

});
