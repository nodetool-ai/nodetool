import { createGameSession3D, decodePreparedGameCollider3D, GamePlayerSaves } from "@nodetool-ai/game-runtime";
import { z } from "zod";
import { gameDocument3D, gameInputFrame3D, resolveGameInputBindings, type GameDocument3D, type GameInputFrame3D, type GameSnapshot3D, type GameInspection3D } from "@nodetool-ai/protocol";
import { createGameRenderer3D } from "./browser3d.js";
import { GameInput3D } from "./input3d.js";
import { browserGamepads } from "./input-bindings.js";
import { attachGameMouseInput } from "./mouse-input.js";
import { mountTouchControls, touchLayout, type GameTouchControls } from "./touch-controls.js";
import { GameAudioPlayer, gameAudioSpatialView3D } from "./audio.js";
import { FixedTickClock } from "./fixed-tick-host.js";
import { GameFrameBudgetMonitor, gameAudioVoiceCount } from "./frame-budget.js";
import { GameParticles3D } from "./particles/particles3d.js";
import { createIndexedDbGameSaveStorage } from "./save-storage.js";
import { attachGameUiPointer, claimGameUiPointer, browserGameUiInsets, browserGameUiMeasure, GameUiController } from "./ui/controller.js";
import { gameUiViewport3D } from "./ui/hud3d.js";

import { VerifiedStandaloneAssets } from "./standalone-assets.js";
import type { GamePlayerRenderedFrame } from "./standalone-frame.js";
import type { GameRendererStats3D } from "./renderer3d/index.js";

/** Counters of the last rendered frame, for `nodetool game perf`. */
export interface GamePlayerFrameStats3D {
  readonly frameNumber: number;
  readonly tick: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly renderMs: number;
}

declare global {
  interface Window {
    nativeGame3DPlayer: {
      readonly pause: () => void;
      /** Resumes live play after `pause`, `step` or `advance`. */
      readonly resume: () => void;
      /** Counters of the last rendered frame. */
      readonly stats: () => GamePlayerFrameStats3D;
      readonly step: (input: GameInputFrame3D) => Promise<GamePlayerRenderedFrame>;
      readonly reset: () => Promise<GamePlayerRenderedFrame>;
      readonly advance: (inputs: readonly GameInputFrame3D[]) => Promise<GamePlayerRenderedFrame>;
      readonly snapshot: () => GameSnapshot3D;
      readonly inspect: () => GameInspection3D;
      /** Progress and settings saves of this game in IndexedDB. */
      readonly saves: Pick<GamePlayerSaves, "save" | "load" | "remove" | "slots">;
    };
  }
}

function status(message: string): void {
  const element = document.getElementById("status");
  if (element) { element.textContent = message; }
}

async function start(): Promise<void> {
  const controller = new AbortController();
  const response = await fetch("./game.json", { signal: controller.signal });
  if (!response.ok) { throw new Error("Game document could not load"); }
  const game = gameDocument3D.parse(await response.json());
  const manifestResponse = await fetch("./manifest.json", { signal: controller.signal });
  if (!manifestResponse.ok) { throw new Error("Export manifest could not load"); }
  const manifest = z.object({ assets: z.record(z.string(), z.string().regex(/^\.\/assets\/[0-9a-f]{64}\.[a-z0-9]+$/)) }).parse(await manifestResponse.json());
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) { throw new Error("Game viewport is missing"); }
  const verifiedAssets = new VerifiedStandaloneAssets(game.assets, manifest.assets);
  try { await startPlayer(game, canvas, controller, verifiedAssets); }
  catch (error: unknown) { verifiedAssets.dispose(); throw error; }
}

async function startPlayer(game: GameDocument3D, canvas: HTMLCanvasElement, controller: AbortController,
  verifiedAssets: VerifiedStandaloneAssets): Promise<void> {
  for (const logicalId of Object.keys(game.assets)) { await verifiedAssets.verify(logicalId); }
  const open = () => createGameSession3D(game, 1, undefined, { signal: controller.signal, scriptOverrun: "skip",
    resolveCollider: async (binding) => {
      const bytes = await verifiedAssets.bytes(Object.entries(game.assets).find(([, entry]) => entry.assetId === binding.assetId)?.[0] ?? "");
      if (!bytes) { throw new Error("Export collider is missing"); }
      return decodePreparedGameCollider3D(bytes, binding);
    } });
  let session = await open();
  let paused = false;
  let contextPaused = false;
  const renderer = await createGameRenderer3D({ canvas, signal: controller.signal,
    resolveImage: async (logicalId) => {
      const bytes = await verifiedAssets.bytes(logicalId);
      const binding = Object.hasOwn(game.assets, logicalId) ? game.assets[logicalId] : undefined;
      return bytes && binding?.mediaKind === "image" ? { bytes, binding } : null;
    },
    resolveFont: async (logicalId) => { const bytes = await verifiedAssets.bytes(logicalId); return bytes ? { bytes, digest: game.assets[logicalId]?.digest } : null; },
    resolveModel: async (logicalId) => {
      const bytes = await verifiedAssets.bytes(logicalId);
      return bytes ? { bytes, digest: game.assets[logicalId]?.digest } : null;
    },
    onContextState: (state) => {
      contextPaused = state === "lost";
      status(state === "lost" ? "Graphics context lost. Play is paused until recovery." : "Graphics recovered");
    } });
  renderer.resize(game.presentation.hudWidth, game.presentation.hudWidth / game.presentation.aspectRatio);
  let frame = session.frame();
  const audio = new GameAudioPlayer({ assets: game.assets, scenes: game.scenes, tickRate: game.tickRate,
    resolveAsset: (binding) => verifiedAssets.bindingUrl(binding),
    status, mixer: game.audio?.mixer });
  audio.preload(); audio.sync(session.audioState());
  const budget = new GameFrameBudgetMonitor(game.performance?.budgets);
  const particles = new GameParticles3D(game.tickRate);
  for (const event of ["pointerdown", "keydown"] as const) { window.addEventListener(event, () => { void audio.unlock(); }, { signal: controller.signal, capture: true }); }
  // Script saves use per-game IndexedDB storage. Loaded data reaches scripts on the next frame.
  const saves = new GamePlayerSaves(createIndexedDbGameSaveStorage(game.id), { onError: (error) => status(error.message) });
  const step = (nextInput: GameInputFrame3D, replay = false): void => {
    const result = session.step(replay ? nextInput : saves.withLoaded(nextInput)); frame = result.frame;
    if (!replay) { saves.handle(result.saveRequests, () => session.snapshot()); }
    particles.tick(result.frame, session.takePresentationEvents());
    for (const event of result.events) { audio.handle(event); }
    audio.sync(session.audioState());
  };
  const input = new GameInput3D();
  // HUD buttons press their input actions on the same input, by pointer, touch or gamepad focus.
  // A locked pointer has no position, so HUD hits wait until the mouse is released.
  const hud = new GameUiController(input, browserGameUiMeasure(game.id));
  const hudViewport = gameUiViewport3D(game);
  const detachHud = attachGameUiPointer(canvas, hud, () => hudViewport, () => !paused && !contextPaused && document.pointerLockElement !== canvas);
  let hudInsets = browserGameUiInsets(canvas, hudViewport);
  window.addEventListener("resize", () => { hudInsets = browserGameUiInsets(canvas, hudViewport); }, { signal: controller.signal });
  let touchControls: GameTouchControls | undefined;
  const release = (): void => { touchControls?.release(); hud.release(); input.release(); };
  window.addEventListener("keydown", (event) => {
    input.keyDown(event.code, event.key);
    if (input.handlesKey(game, event.code, event.key)) { event.preventDefault(); }
  }, { signal: controller.signal });
  window.addEventListener("keyup", (event) => { input.keyUp(event.code); }, { signal: controller.signal });
  const bindings = resolveGameInputBindings(game);
  const mouseLook = bindings.look.some((binding) => binding.kind === "mouse");
  let unmountTouch: (() => void) | undefined;
  // The touch layer is styled by the staged style.css, because the export CSP blocks inline styles.
  const enableTouch = (): void => {
    if (unmountTouch) { return; }
    const layer = document.createElement("div");
    layer.className = "touch-layer";
    document.body.append(layer);
    const controls = mountTouchControls(layer, {
      layout: touchLayout(bindings), onChange: (state) => input.setTouch(state), onLook: (x, y) => input.touchLook(x, y),
      active: () => !paused && !contextPaused && !document.hidden,
      claimPointer: (event) => document.pointerLockElement !== canvas && claimGameUiPointer(canvas, hud, hudViewport, event),
      releasePointer: (id) => hud.pointerUp(id)
    });
    touchControls = controls;
    unmountTouch = () => { controls.dispose(); touchControls = undefined; layer.remove(); };
  };
  if (window.matchMedia("(pointer: coarse)").matches) { enableTouch(); }
  window.addEventListener("touchstart", enableTouch, { passive: true, signal: controller.signal });
  const detachMouse = attachGameMouseInput(canvas, input, {
    active: () => !paused && !contextPaused && !document.hidden,
    lookEnabled: () => mouseLook,
    onLockFailure: () => status("Mouse capture unavailable. Drag to turn the camera.")
  });
  window.addEventListener("blur", release, { signal: controller.signal });
  const clock = new FixedTickClock(game.tickRate);
  function setPaused(next: boolean): void {
    paused = next;
    release();
    input.setEnabled(!next);
    clock.reset();
    const pause = document.getElementById("pause");
    if (pause) { pause.textContent = next ? "Resume" : "Pause"; }
    if (next) { audio.pause(); } else { audio.resume(); }
  }
  let animationId = 0;
  let rendering: Promise<unknown> | undefined;
  let disposed = false;
  let frameNumber = 0;
  let lastStats: GamePlayerFrameStats3D = { frameNumber: 0, tick: 0, drawCalls: 0, triangles: 0, programs: 0, renderMs: 0 };
  const observe = (stats: GameRendererStats3D, tick: number): void => {
    frameNumber += 1;
    lastStats = { frameNumber, tick, drawCalls: stats.drawCalls, triangles: stats.triangles, programs: stats.programs, renderMs: stats.renderMs };
    budget.observe({ drawCalls: stats.drawCalls, triangles: stats.triangles, particles: particles.count, voices: gameAudioVoiceCount(audio.mixerState()) });
  };
  let replacement = new AbortController();
  let commands = Promise.resolve();
  function requireCurrent(signal: AbortSignal): void {
    if (signal.aborted || disposed) { throw new DOMException("Game command was superseded", "AbortError"); }
  }
  function queueCommand(action: () => Promise<GamePlayerRenderedFrame>): Promise<GamePlayerRenderedFrame> {
    const result = commands.then(action);
    commands = result.then(() => undefined, () => undefined);
    return result;
  }
  async function renderExplicit(signal: AbortSignal): Promise<GamePlayerRenderedFrame> {
    while (rendering) { await rendering; }
    requireCurrent(signal);
    audio.updateSpatial(gameAudioSpatialView3D(frame, 1));
    hud.update(frame.ui, hudViewport, hudInsets);
    const renderedFrame = hud.annotate(frame);
    const pending = renderer.render(renderedFrame, 1, particles);
    rendering = pending;
    try {
      const stats = await pending;
      requireCurrent(signal);
      observe(stats, renderedFrame.tick);
      return { tick: renderedFrame.tick, frameNumber };
    } finally {
      if (rendering === pending) { rendering = undefined; }
    }
  }
  const render = (interpolation: number): void => {
    if (rendering || disposed) { return; }
    audio.updateSpatial(gameAudioSpatialView3D(frame, interpolation));
    hud.update(frame.ui, hudViewport, hudInsets);
    const renderedTick = frame.tick;
    const pending = renderer.render(hud.annotate(frame), interpolation, particles)
      .then((stats) => {
        if (disposed) { return; }
        observe(stats, renderedTick);
      }).catch((error: unknown) => {
        if (!disposed) {
          if (renderer.capabilities.deviceStatus !== "lost") { setPaused(true); }
          status(error instanceof Error ? error.message : "Rendering failed");
        }
      }).finally(() => { if (rendering === pending) { rendering = undefined; } });
    rendering = pending;
  };
  document.addEventListener("visibilitychange", () => { release(); clock.reset(); }, { signal: controller.signal });
  const tick = (now: number): void => {
    if (disposed) { return; }
    if (!paused && !contextPaused && !document.hidden) {
      try {
        const interpolation = clock.advance(now, () => { input.pollGamepads(hud.pollGamepads(browserGamepads())); step(input.sample(game)); });
        void render(interpolation);
      } catch (error) { setPaused(true); status(error instanceof Error ? error.message : "Game script failed"); }
    } else if (contextPaused && renderer.capabilities.deviceStatus === "ready") {
      void render(1);
    }
    if (paused || contextPaused || document.hidden) { clock.reset(); }
    animationId = requestAnimationFrame(tick);
  };
  document.getElementById("pause")?.addEventListener("click", () => setPaused(!paused), { signal: controller.signal });
  document.getElementById("reset")?.addEventListener("click", () => {
    void window.nativeGame3DPlayer.reset().then(() => setPaused(false))
      .catch((error: unknown) => status(error instanceof Error ? error.message : "Reset failed"));
  }, { signal: controller.signal });
  const fullscreen = document.getElementById("fullscreen");
  if (fullscreen && !document.fullscreenEnabled) { fullscreen.hidden = true; }
  fullscreen?.addEventListener("click", () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" });
    void request.catch(() => status("Fullscreen is unavailable"));
  }, { signal: controller.signal });
  window.addEventListener("beforeunload", () => {
    disposed = true;
    replacement.abort();
    cancelAnimationFrame(animationId);
    unmountTouch?.();
    detachMouse();
    detachHud();
    session.dispose();
    renderer.dispose();
    audio.dispose();
    verifiedAssets.dispose();
    controller.abort();
  }, { once: true });
  window.nativeGame3DPlayer = Object.freeze({
    pause: () => setPaused(true),
    resume: () => { if (!disposed) { setPaused(false); } },
    stats: () => lastStats,
    step: async (nextInput: GameInputFrame3D) => {
      const parsed = gameInputFrame3D.parse(nextInput);
      const signal = replacement.signal;
      requireCurrent(signal);
      setPaused(true);
      return queueCommand(async () => {
        requireCurrent(signal);
        while (rendering) { await rendering; }
        requireCurrent(signal);
        step(parsed, true);
        return renderExplicit(signal);
      });
    },
    reset: async () => {
      requireCurrent(replacement.signal);
      replacement.abort();
      replacement = new AbortController();
      const signal = replacement.signal;
      setPaused(true);
      return queueCommand(async () => {
        requireCurrent(signal);
        const restored = await open();
        if (signal.aborted || disposed) { restored.dispose(); requireCurrent(signal); }
        while (rendering) {
          try { await rendering; } catch { /* Reset can recover from an earlier failed render. */ }
        }
        if (signal.aborted || disposed) { restored.dispose(); requireCurrent(signal); }
        session.dispose(); session = restored; saves.clear(); audio.reset(session.audioState());
        frame = session.frame(); particles.clear(); release(); clock.reset();
        return renderExplicit(signal);
      });
    },
    advance: async (inputs: readonly GameInputFrame3D[]) => {
      if (inputs.length > 10_000) { throw new Error("Recorded route exceeds 10000 ticks"); }
      const parsed = inputs.map((input) => gameInputFrame3D.parse(input));
      const signal = replacement.signal;
      requireCurrent(signal);
      setPaused(true);
      return queueCommand(async () => {
        requireCurrent(signal);
        while (rendering) { await rendering; }
        requireCurrent(signal);
        for (const nextInput of parsed) { step(nextInput, true); }
        return renderExplicit(signal);
      });
    },
    snapshot: () => session.snapshot(),
    inspect: () => session.inspect(),
    saves: Object.freeze({
      save: saves.save.bind(saves), load: saves.load.bind(saves), remove: saves.remove.bind(saves), slots: saves.slots.bind(saves)
    })
  });
  // A static HTTP host is required for browser modules and WASM.
  status(mouseLook ? "Ready. Use the game's controls. Click for mouse look, Escape releases the mouse."
    : "Ready. Use the game's controls. Mouse buttons work without pointer capture.");
  const initialSignal = replacement.signal;
  try { await renderExplicit(initialSignal); }
  catch (error: unknown) { if (!initialSignal.aborted) { throw error; } }
  if (!disposed) { animationId = requestAnimationFrame(tick); }
}

void start().catch((error) => status(error instanceof Error ? error.message : "Game could not start"));
