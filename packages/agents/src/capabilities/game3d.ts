import { createHash } from "node:crypto";
import { posix } from "node:path";
import { z } from "zod";
import { Asset, Game } from "@nodetool-ai/models";
import {
  gameAssetBinding3D, gameInputFrame3D, gameModelImportSettings3D, gamePreparedCollider3D, gameRenderFrame3D, gameSnapshot3D, gameVector3,
  shortResourceId, type GameAssetBinding3D, type GameDocument3D, type GameInputFrame3D, type GameInspection3D,
} from "@nodetool-ai/protocol";
import { createGameSession3D, decodePreparedGameCollider3D, hashGameSnapshot3D } from "@nodetool-ai/game-runtime";
import { assetKeyCandidates } from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";
import type { CapabilityRun } from "./types.js";
import { persistOutput } from "../tools/asset-persist.js";
import { readGameAssetInput, GAME_ASSET_NODE_RUNNER_CONTEXT_KEY, type GameAssetNodeRunner } from "./game-asset-source.js";

const MAX_TICKS = 18_000;
const MAX_BYTES = 64 * 1024 * 1024;
const EXTENSIONS: Readonly<Record<string, string>> = {
  "model/gltf-binary": "glb", "application/json": "json", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "font/ttf": "ttf", "font/otf": "otf"
};

export function gameOutline3D(document: GameDocument3D): Record<string, unknown> {
  return { settings: { dimension: document.dimension, schemaVersion: document.schemaVersion, engineVersion: document.engineVersion,
    entrySceneId: document.entrySceneId, presentation: document.presentation, inputActions: document.inputActions,
    inputAxes: document.inputAxes, collisionLayers: document.collisionLayers },
  scenes: document.scenes.map((scene) => ({ id: scene.id, name: scene.name, activeCameraId: scene.activeCameraId, gravity: scene.gravity,
    environment: scene.environment, entities: scene.entities.map((entity) => ({ id: entity.id, name: entity.name, parentId: entity.parentId,
      position: entity.transform3d.position, modelSlot: entity.model?.assetId, primitive: entity.primitive?.kind, body: entity.body3d?.type,
      collider: entity.collider3d?.kind, character: entity.character3d !== undefined, camera: entity.camera3d?.behavior.kind,
      interactions: entity.interactionActor, behaviorKinds: entity.behaviors.map((behavior) => behavior.kind) })) })),
  prefabs: Object.fromEntries(Object.entries(document.prefabs).map(([id, prefab]) => [id, { rootId: prefab.rootId, entities: prefab.entities.length }])),
  assets: Object.fromEntries(Object.entries(document.assets).map(([slot, binding]) => {
    const asset: Record<string, unknown> = { assetId: binding.assetId, mediaKind: binding.mediaKind };
    if ("bounds" in binding) { asset.bounds = binding.bounds; }
    return [slot, asset];
  })) };
}

export function inputFrames3D(value: unknown, requiredTicks = 0): GameInputFrame3D[] | { error: string } {
  if (value === undefined) { value = []; }
  if (!Array.isArray(value)) { return { error: "inputs must be an array" }; }
  const frames: GameInputFrame3D[] = [];
  for (const item of value) {
    const parsed = gameInputFrame3D.extend({ ticks: z.number().int().min(1).max(MAX_TICKS).optional() }).safeParse(item);
    if (!parsed.success) { return { error: "Invalid 3D input frame", }; }
    const repeats = parsed.data.ticks ?? 1;
    if (frames.length + repeats > MAX_TICKS) { return { error: `inputs must total at most ${MAX_TICKS} ticks` }; }
    for (let index = 0; index < repeats; index++) {
      frames.push({ pressed: parsed.data.pressed, justPressed: index === 0 ? parsed.data.justPressed : [],
        axes: parsed.data.axes, look: parsed.data.look });
    }
  }
  if (requiredTicks > MAX_TICKS) { return { error: `inputs must total at most ${MAX_TICKS} ticks` }; }
  while (frames.length < requiredTicks) { frames.push({ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } }); }
  return frames;
}

export function ownedAssetResolver3D(run: CapabilityRun, user: string, document: GameDocument3D) {
  const cache = new Map<string, Uint8Array>();
  return async (slot: string, signal?: AbortSignal): Promise<Uint8Array | null> => {
    signal?.throwIfAborted();
    const binding = document.assets[slot];
    if (!binding || !/^[a-f0-9]{32}$/.test(binding.assetId)) { return null; }
    const cached = cache.get(binding.assetId);
    if (cached) { return cached; }
    const asset = await Asset.find(user, binding.assetId);
    const storage = run.context.assetStorage;
    const extension = asset && EXTENSIONS[asset.content_type];
    if (!asset || !storage || !extension || (asset.size ?? 0) > MAX_BYTES) { return null; }
    let bytes: Uint8Array | null = null;
    for (const key of assetKeyCandidates(user, `${asset.id}.${extension}`)) {
      signal?.throwIfAborted();
      bytes = await storage.retrieve(storage.uriForKey(key));
      if (bytes) { break; }
    }
    if (!bytes || bytes.length > MAX_BYTES || createHash("sha256").update(bytes).digest("hex") !== binding.digest) {
      throw new Error(`Asset ${slot} is missing or changed`);
    }
    cache.set(binding.assetId, bytes);
    return bytes;
  };
}

function sessionOptions3D(run: CapabilityRun, user: string, document: GameDocument3D) {
  const resolveAsset = ownedAssetResolver3D(run, user, document);
  return { signal: run.context.signal, resolveCollider: async (binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>, signal?: AbortSignal) => {
    const slot = Object.entries(document.assets).find(([, asset]) => asset.assetId === binding.assetId && asset.digest === binding.digest)?.[0];
    const bytes = slot ? await resolveAsset(slot, signal) : null;
    if (!bytes) { throw new Error(`Prepared collider ${binding.assetId} is unavailable`); }
    return decodePreparedGameCollider3D(bytes, binding);
  } };
}

export async function captureFrames3D(run: CapabilityRun, user: string, document: GameDocument3D, ticks: readonly number[], inputs: readonly GameInputFrame3D[], seed: number, options: Record<string, unknown>): Promise<unknown> {
  const { captureGameFrame3D } = await import("@nodetool-ai/game-renderer/node3d");
  const resolveAsset = ownedAssetResolver3D(run, user, document);
  const snapshotInput = options.snapshot === undefined ? undefined : gameSnapshot3D.safeParse(options.snapshot);
  if (snapshotInput && !snapshotInput.success) { return { error: "Invalid 3D capture snapshot" }; }
  const session = await createGameSession3D(document, seed, snapshotInput?.success ? snapshotInput.data : undefined, sessionOptions3D(run, user, document));
  const frames: Record<string, unknown>[] = [];
  let completedTick = session.inspect().tick;
  const initialTick = completedTick;
  const deadline = Date.now() + 30_000;
  try {
    for (const tick of ticks) {
      if (tick < initialTick) { return { error: "Capture tick precedes the supplied snapshot" }; }
      while (completedTick < tick) {
        if (completedTick % 240 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
        run.context.signal?.throwIfAborted();
        if (Date.now() >= deadline) { return { error: "3D capture time limit exceeded", frames }; }
        completedTick = session.step(inputs[completedTick - initialTick] ?? gameInputFrame3D.parse({ pressed: [] })).tick;
      }
      let frame = session.frame();
      if (options.camera !== undefined) {
        const camera = gameRenderFrame3D.shape.camera.partial().safeParse(options.camera);
        if (!camera.success) { return { error: "Invalid 3D inspection camera" }; }
        frame = { ...frame, camera: { ...frame.camera, ...camera.data } };
      }
      const stateHash = await hashGameSnapshot3D(session.snapshot());
      const captureOptions: Parameters<typeof captureGameFrame3D>[1] = { resolveAsset: async (slot, signal) => {
        const bytes = await resolveAsset(slot, signal);
        return bytes ? { bytes, digest: document.assets[slot]?.digest } : null;
      }, signal: run.context.signal, stateHash, interpolation: 1,
      boundsOverlay: Array.isArray(options.overlays) && options.overlays.includes("bounds"), timeoutMs: Math.max(1, deadline - Date.now()) };
      const scale = z.number().positive().max(4).safeParse(options.scale);
      const size: { width?: number; height?: number } = {};
      if (scale.success) {
        size.width = Math.round(document.presentation.hudWidth * scale.data);
        size.height = Math.round(document.presentation.hudHeight * scale.data);
      }
      const captured = await captureGameFrame3D(frame, { ...captureOptions, ...size });
      const saved = await persistOutput(run.context, captured.png, { mime: "image/png", namePrefix: `game3d-${document.id}-${tick}` });
      frames.push({ tick, state_hash: stateHash, image: { type: "image", asset_id: saved.asset_id,
        uri: saved.asset_uri ?? saved.path, path: saved.path, mime_type: saved.mime_type }, capabilities: captured.capabilities,
        stats: captured.stats, projected_bounds: captured.projectedBounds, hud_texts: frame.hud.map((label) => label.text) });
    }
    return { dimension: "3d", game_id: shortResourceId(document.id), revision: document.revision, frames };
  } catch (error) {
    run.context.signal?.throwIfAborted();
    return { error: error instanceof Error ? error.message : String(error), dimension: "3d", frames };
  } finally { session.dispose(); }
}

const assertion3D = z.strictObject({
  at_tick: z.number().int().min(0).max(MAX_TICKS).optional(), before_tick: z.number().int().min(0).max(MAX_TICKS).optional(),
  entity_id: z.string().optional(), near: gameVector3.extend({ tolerance: z.number().finite().nonnegative() }).optional(),
  region: z.strictObject({ min: gameVector3, max: gameVector3 }).optional(), grounded: z.boolean().optional(),
  event: z.string().optional(), no_script_errors: z.boolean().optional(), replay_matches: z.boolean().optional()
});
export async function playtestGame3D(run: CapabilityRun, user: string, document: GameDocument3D, args: Record<string, unknown>): Promise<unknown> {
  const parsedAssertions = z.array(assertion3D).safeParse(args.assertions ?? []);
  if (!parsedAssertions.success) { return { error: "Invalid 3D assertions", diagnostics: parsedAssertions.error.issues }; }
  const assertions = parsedAssertions.data;
  const captures = z.array(z.number().int().min(0).max(MAX_TICKS)).max(8).safeParse(args.capture_ticks ?? []);
  if (!captures.success) { return { error: "Invalid capture ticks" }; }
  const snapshotInput = args.snapshot === undefined ? undefined : gameSnapshot3D.safeParse(args.snapshot);
  if (snapshotInput && !snapshotInput.success) { return { error: "Invalid 3D snapshot" }; }
  const initialTick = snapshotInput?.success ? snapshotInput.data.tick : 0;
  const horizon = Math.max(0, ...captures.data, ...assertions.map((assertion) => assertion.at_tick ?? assertion.before_tick ?? 0));
  const inputs = inputFrames3D(args.inputs, Math.max(0, horizon - initialTick));
  if ("error" in inputs) { return inputs; }
  const seed = typeof args.seed === "number" && Number.isSafeInteger(args.seed) ? args.seed : 1;
  const restore = z.number().int().min(initialTick).max(MAX_TICKS).optional().safeParse(args.restore_at_tick);
  if (!restore.success) { return { error: "restore_at_tick must be within the replay tick range" }; }
  const options = sessionOptions3D(run, user, document);
  const session = await createGameSession3D(document, seed, snapshotInput?.success ? snapshotInput.data : undefined, options);
  let restored: Awaited<ReturnType<typeof createGameSession3D>> | undefined;
  const restoreTick = restore.data;
  const inspections = new Map<number, GameInspection3D>();
  const events: Array<Record<string, unknown>> = [];
  const contacts = new Map<string, number>();
  let state = session.inspect();
  inspections.set(state.tick, state);
  const started = Date.now();
  let scriptError: { tick: number; message: string } | null = null;
  let replayMatches: boolean | undefined;
  let wallTimeLimited = false;
  let cancelled = false;
  try {
    for (const input of inputs) {
      if (state.tick % 240 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
      if (run.context.signal?.aborted) { cancelled = true; break; }
      if (Date.now() - started > 15_000) { wallTimeLimited = true; break; }
      if (restoreTick === state.tick) { restored = await createGameSession3D(document, seed, session.snapshot(), options); }
      try {
        const result = session.step(input);
        restored?.step(input);
        state = session.inspect();
        if (assertions.some((assertion) => assertion.at_tick === result.tick)) { inspections.set(result.tick, state); }
        for (const event of result.events) {
          if (event.kind === "contact") {
            const pair = `${[event.entityId, event.otherId].sort().join("|")}:${event.phase}`;
            contacts.set(pair, (contacts.get(pair) ?? 0) + 1);
          } else { events.push({ tick: result.tick, ...event }); }
        }
      } catch (error) { scriptError = { tick: state.tick + 1, message: error instanceof Error ? error.message : String(error) }; break; }
    }
    const snapshot = scriptError ? null : session.snapshot();
    const stateHash = snapshot ? await hashGameSnapshot3D(snapshot) : null;
    if (restored && snapshot && !cancelled && !wallTimeLimited) { replayMatches = stateHash === await hashGameSnapshot3D(restored.snapshot()); }
    const assertionResults = assertions.map((assertion) => {
      if (assertion.no_script_errors) { return { assertion, passed: scriptError === null, observed: scriptError }; }
      if (assertion.replay_matches) { return { assertion, passed: replayMatches === true, observed: replayMatches ?? null }; }
      if (assertion.event) {
        const observed = events.find((event) => (event.kind === assertion.event || event.kind === "trigger" && event.event === assertion.event) &&
          (assertion.before_tick === undefined || typeof event.tick === "number" && event.tick <= assertion.before_tick));
        return { assertion, passed: observed !== undefined, observed: observed ?? null };
      }
      const inspection = assertion.at_tick === undefined ? state : inspections.get(assertion.at_tick);
      const entity = inspection?.entities.find((candidate) => candidate.id === assertion.entity_id);
      if (!entity) { return { assertion, passed: false, observed: null }; }
      const position = entity.transform.position;
      if (assertion.near) { return { assertion, passed: Math.hypot(position.x - assertion.near.x, position.y - assertion.near.y, position.z - assertion.near.z) <= assertion.near.tolerance, observed: position }; }
      if (assertion.region) {
        const { min, max } = assertion.region;
        return { assertion, passed: position.x >= min.x && position.x <= max.x && position.y >= min.y && position.y <= max.y && position.z >= min.z && position.z <= max.z, observed: position };
      }
      if (assertion.grounded !== undefined) { return { assertion, passed: entity.grounded === assertion.grounded, observed: entity.grounded }; }
      return { assertion, passed: false, error: "Unsupported assertion" };
    });
    const images = captures.data.length && snapshot && !cancelled && !wallTimeLimited ? await captureFrames3D(run, user, document,
      [...new Set(captures.data)].sort((a, b) => a - b), inputs, seed, { snapshot: snapshotInput?.success ? snapshotInput.data : undefined }) : undefined;
    return { dimension: "3d", game_id: shortResourceId(document.id), revision: document.revision, ticks: state.tick, state, snapshot,
      state_hash: stateHash, replay_matches: replayMatches, events, contacts: [...contacts].map(([pair_phase, count]) => ({ pair_phase, count })),
      assertion_results: assertionResults, script_error: scriptError, route_complete: scriptError === null && !cancelled && !wallTimeLimited,
      wall_time_limited: wallTimeLimited, cancelled, captures: images };
  } finally { restored?.dispose(); session.dispose(); }
}

/** Verify a collider candidate's JSON and derive metadata from its actual coordinates. */
export function colliderBinding3D(bytes: Uint8Array, binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>): GameAssetBinding3D {
  const geometry = gamePreparedCollider3D.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (binding.shape === "triangleMesh" && !geometry.indices?.length) { throw new Error("Triangle mesh requires indices"); }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < geometry.vertices.length; index += 3) {
    min.x = Math.min(min.x, geometry.vertices[index]); max.x = Math.max(max.x, geometry.vertices[index]);
    min.y = Math.min(min.y, geometry.vertices[index + 1]); max.y = Math.max(max.y, geometry.vertices[index + 1]);
    min.z = Math.min(min.z, geometry.vertices[index + 2]); max.z = Math.max(max.z, geometry.vertices[index + 2]);
  }
  return { ...binding, preparationVersion: "1", bounds: { min, max }, vertices: geometry.vertices.length / 3, triangles: (geometry.indices?.length ?? 0) / 3 };
}

export async function stageModelGameAsset3D(run: CapabilityRun, game: Game, workspace: Workspace, document: GameDocument3D, args: Record<string, unknown>): Promise<unknown> {
  const kind = args.kind;
  const input = args.input_file;
  let bytes: Uint8Array | null = null;
  if (typeof input === "string") { bytes = await readGameAssetInput(run, workspace, input); }
  else if (kind === "model") {
    if (args.background === true || args.generation_id !== undefined) { return { error: "Model node generation is synchronous. Import a completed model through input_file." }; }
    const nodeType = args.node_type;
    const params = z.record(z.string(), z.unknown()).safeParse(args.params ?? {});
    if (typeof nodeType !== "string" || !params.success) { return { error: "Model generation requires node_type and params, or input_file" }; }
    const runner = run.context.get?.<GameAssetNodeRunner>(GAME_ASSET_NODE_RUNNER_CONTEXT_KEY);
    const result = typeof runner === "function" ? await runner({ node_type: nodeType, inputs: params.data }) :
      await run.invoke("run_node", { node_type: nodeType, inputs: params.data });
    const envelope = z.record(z.string(), z.unknown()).safeParse(result);
    if (envelope.success && typeof envelope.data.error === "string") { return { error: envelope.data.error }; }
    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    const modelRef = z.object({ type: z.literal("model3d").optional(), uri: z.string().optional(), data: z.union([z.string(), z.instanceof(Uint8Array)]).optional(), asset_id: z.string().optional() });
    for (const candidate of envelope.success ? [envelope.data.model, envelope.data.model3d, envelope.data.output, envelope.data.result, result] : [result]) {
      const parsed = modelRef.safeParse(candidate);
      if (parsed.success && (parsed.data.uri || parsed.data.data || parsed.data.asset_id)) {
        bytes = parsed.data.asset_id ? await readGameAssetInput(run, workspace, `asset://${parsed.data.asset_id}`) :
          await loadMediaRefBytes({ ...parsed.data, type: "model3d" }, run.context);
        if (bytes) { break; }
      }
    }
  }
  if (!bytes || bytes.length > MAX_BYTES) { return { error: "Model or collider source is unavailable or exceeds the byte budget" }; }
  const sourceDigest = createHash("sha256").update(bytes).digest("hex");
  const preparationSchema = kind === "model" ? gameModelImportSettings3D.partial() :
    gameModelImportSettings3D.partial().extend({ shape: z.enum(["convexHull", "triangleMesh"]) });
  const preparation = preparationSchema.safeParse(args.preparation ?? {});
  if (!preparation.success) { return { error: "Invalid import settings. Collider preparation requires shape convexHull or triangleMesh.", diagnostics: preparation.error.issues }; }
  const dependencies = z.record(z.string(), z.string()).safeParse(args.dependency_files ?? {});
  if (!dependencies.success) { return { error: "dependency_files must map source URIs to owned asset URIs or workspace paths" }; }
  const resolveDependency = async (uri: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const mapped = dependencies.data[uri];
    if (mapped !== undefined) { return readGameAssetInput(run, workspace, mapped); }
    if (typeof input !== "string" || input.startsWith("asset://") || uri.includes(":") || uri.startsWith("/") || uri.includes("\\")) { return null; }
    const path = posix.normalize(posix.join(posix.dirname(input), uri));
    return readGameAssetInput(run, workspace, path);
  };
  const sourceId = typeof input === "string" && input.startsWith("asset://") && run.context.userId ?
    (await Asset.find(run.context.userId, input.slice(8).replace(/\.(glb|gltf|json)$/i, "")))?.id : undefined;
  const { normalizeGameModel3D, createGameColliderCandidate3D } = await import("@nodetool-ai/game-renderer/preparation3d");
  let binding: GameAssetBinding3D;
  let isPreparedCollider = false;
  if (kind === "collider") {
    try { isPreparedCollider = gamePreparedCollider3D.safeParse(JSON.parse(new TextDecoder().decode(bytes))).success; }
    catch { /* A binary model source is normalized before collider generation. */ }
  }
  if (isPreparedCollider) {
    const shape = z.enum(["convexHull", "triangleMesh"]).parse("shape" in preparation.data ? preparation.data.shape : undefined);
    binding = colliderBinding3D(bytes, gameAssetBinding3D.options[1].parse({ mediaKind: "collider", assetId: `candidate:${sourceDigest}`, digest: sourceDigest,
      shape, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, vertices: 0, triangles: 0 }));
    await decodePreparedGameCollider3D(bytes, gameAssetBinding3D.options[1].parse(binding));
  } else {
    const { scale, forward, origin } = preparation.data;
    const importSettings: Partial<z.infer<typeof gameModelImportSettings3D>> = {};
    if (scale !== undefined) { importSettings.scale = scale; }
    if (forward !== undefined) { importSettings.forward = forward; }
    if (origin !== undefined) { importSettings.origin = origin; }
    const normalized = await normalizeGameModel3D(bytes, { assetId: `candidate:${sourceDigest}`, sourceAssetId: sourceId,
      importSettings, resolveDependency, signal: run.context.signal,
      provenance: typeof input === "string" ? `import:${input}` : `node:${String(args.node_type)}` });
    if (!normalized.ok) { return { error: "Model preparation failed", diagnostics: normalized.diagnostics }; }
    if (kind === "model") { bytes = normalized.bytes; binding = normalized.binding; }
    else {
      const shape = z.enum(["convexHull", "triangleMesh"]).parse("shape" in preparation.data ? preparation.data.shape : undefined);
      const collider = await createGameColliderCandidate3D(normalized.bytes, { assetId: `candidate:${normalized.binding.digest}`, shape, signal: run.context.signal });
      if (!collider.ok) { return { error: "Collider preparation failed", diagnostics: collider.diagnostics }; }
      bytes = collider.bytes; binding = collider.binding;
    }
  }
  const extension = kind === "model" ? "glb" : "json";
  await workspace.write(`${game.source_root}/assets/${binding.digest}.${extension}`, bytes, kind === "model" ? "model/gltf-binary" : "application/json");
  return { dimension: "3d", game_id: shortResourceId(document.id), slot: args.slot, binding, candidate_workspace_id: game.workspace_id,
    draft_updated_at: game.draft_updated_at, installed: false, next: "Call install_native_game_asset with this binding to install the verified candidate." };
}
