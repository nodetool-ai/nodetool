import { createGameSession3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";
import { z } from "zod";
import { gameDocument3D, resolveGameInputBindings, type GameInputFrame3D, type GameSnapshot3D, type GameInspection3D } from "@nodetool-ai/protocol";
import { createGameRenderer3D } from "./browser3d.js";
import { GameInput3D } from "./input3d.js";
import { browserGamepads } from "./input-bindings.js";
import { mountTouchControls, touchLayout, TOUCH_CONTROLS_CSS } from "./touch-controls.js";
import { GameAudioPlayer } from "./audio.js";
import { FixedTickClock } from "./fixed-tick-host.js";

declare global {
  interface Window {
    nativeGame3DPlayer: {
      readonly pause: () => void;
      readonly step: (input: GameInputFrame3D) => Promise<void>;
      readonly reset: () => Promise<void>;
      readonly advance: (inputs: readonly GameInputFrame3D[]) => Promise<void>;
      readonly snapshot: () => GameSnapshot3D;
      readonly inspect: () => GameInspection3D;
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
  const localAssets = new Map<string, Uint8Array>();
  for (const [logicalId, binding] of Object.entries(game.assets)) {
    const path = manifest.assets[logicalId];
    if (!path || !path.startsWith(`./assets/${binding.digest}.`)) { throw new Error(`Export asset ${logicalId} has no verified local path`); }
    const asset = await fetch(path, { signal: controller.signal });
    if (!asset.ok) { throw new Error(`Export asset ${logicalId} could not load`); }
    const bytes = new Uint8Array(await asset.arrayBuffer());
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== binding.digest) { throw new Error(`Export asset ${logicalId} failed its digest check`); }
    localAssets.set(logicalId, bytes);

  }
  const open = () => createGameSession3D(game, 1, undefined, { signal: controller.signal,
    resolveCollider: async (binding) => {
      const bytes = localAssets.get(Object.entries(game.assets).find(([, entry]) => entry.assetId === binding.assetId)?.[0] ?? "");
      if (!bytes) { throw new Error("Export collider is missing"); }
      return decodePreparedGameCollider3D(bytes, binding);
    } });
  let session = await open();
  let paused = false;
  let contextPaused = false;
  const renderer = await createGameRenderer3D({ canvas, signal: controller.signal,
    resolveFont: async (logicalId) => { const bytes = localAssets.get(logicalId); return bytes ? { bytes, digest: game.assets[logicalId]?.digest } : null; },
    resolveModel: async (logicalId) => {
      const bytes = localAssets.get(logicalId);
      return bytes ? { bytes, digest: game.assets[logicalId]?.digest } : null;
    },
    onContextState: (state) => {
      contextPaused = state === "lost";
      status(state === "lost" ? "Graphics context lost. Play is paused until recovery." : "Graphics recovered");
    } });
  renderer.resize(game.presentation.hudWidth, game.presentation.hudWidth / game.presentation.aspectRatio);
  let frame = session.frame();
  const audio = new GameAudioPlayer({ assets: game.assets, tickRate: game.tickRate,
    resolveAsset: async (binding) => manifest.assets[Object.entries(game.assets).find(([, entry]) => entry.assetId === binding.assetId && entry.digest === binding.digest)?.[0] ?? ""] ?? null,
    status, mixer: game.audio?.mixer });
  audio.preload(); audio.sync(session.snapshot());
  for (const event of ["pointerdown", "keydown"] as const) { window.addEventListener(event, () => { void audio.unlock(); }, { signal: controller.signal }); }
  const step = (nextInput: GameInputFrame3D): void => {
    const result = session.step(nextInput); frame = result.frame;
    for (const event of result.events) { audio.handle(event); }
    audio.sync(session.snapshot());
  };
  const input = new GameInput3D();
  let dragging = false;
  const release = (): void => { input.release(); dragging = false; };
  window.addEventListener("keydown", (event) => {
    input.keyDown(event.code);
    if (input.handlesKey(game, event.code)) { event.preventDefault(); }
  }, { signal: controller.signal });
  window.addEventListener("keyup", (event) => { input.keyUp(event.code); }, { signal: controller.signal });
  const mouseFire = game.inputActions.includes("fire");
  const bindings = resolveGameInputBindings(game);
  const mouseLook = bindings.look.some((binding) => binding.kind === "mouse");
  let touchMode = false;
  const enableTouch = (): void => {
    if (touchMode) { return; }
    touchMode = true;
    const style = document.createElement("style");
    style.textContent = TOUCH_CONTROLS_CSS;
    const layer = document.createElement("div");
    layer.className = "touch-layer";
    document.head.append(style);
    document.body.append(layer);
    mountTouchControls(layer, { layout: touchLayout(bindings), onChange: (state) => input.setTouch(state), onLook: (x, y) => input.touchLook(x, y) });
  };
  if (window.matchMedia("(pointer: coarse)").matches) { enableTouch(); }
  window.addEventListener("touchstart", enableTouch, { passive: true, signal: controller.signal });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") { return; }
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    input.mouseDown(event.button);
    if ((mouseFire || mouseLook) && document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock().catch(() => { status(mouseFire ? "Mouse capture unavailable. Hold and drag to aim, or press F to fire." : "Mouse capture unavailable. Drag to turn the camera."); });
    }
  }, { signal: controller.signal });
  window.addEventListener("pointerup", (event) => { dragging = false; input.mouseUp(event.button); }, { signal: controller.signal });
  canvas.addEventListener("pointercancel", release, { signal: controller.signal });
  document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas) { release(); } }, { signal: controller.signal });
  canvas.addEventListener("pointermove", (event) => { if (dragging || document.pointerLockElement === canvas) { input.look(event.movementX, event.movementY); } }, { signal: controller.signal });
  window.addEventListener("blur", release, { signal: controller.signal });
  const clock = new FixedTickClock(game.tickRate);
  let animationId = 0;
  let rendering = false;
  let disposed = false;
  const render = async (interpolation: number): Promise<void> => {
    if (rendering || disposed) { return; }
    rendering = true;
    try { await renderer.render(frame, interpolation); }
    catch (error) { if (renderer.capabilities.deviceStatus !== "lost") { paused = true; } status(error instanceof Error ? error.message : "Rendering failed"); }
    finally { rendering = false; }
  };
  document.addEventListener("visibilitychange", () => { release(); clock.reset(); }, { signal: controller.signal });
  const tick = (now: number): void => {
    if (disposed) { return; }
    if (!paused && !contextPaused && !document.hidden) {
      try {
        const interpolation = clock.advance(now, () => { input.pollGamepads(browserGamepads()); step(input.sample(game)); });
        void render(interpolation);
      } catch (error) { paused = true; clock.reset(); status(error instanceof Error ? error.message : "Game script failed"); }
    } else if (contextPaused && renderer.capabilities.deviceStatus === "ready") {
      void render(1);
    }
    if (paused || contextPaused || document.hidden) { clock.reset(); }
    animationId = requestAnimationFrame(tick);
  };
  document.getElementById("pause")?.addEventListener("click", (event) => {
    paused = !paused;
    // Input pressed while paused is dropped rather than delivered on resume (F23).
    input.setEnabled(!paused);
    if (event.currentTarget instanceof HTMLButtonElement) { event.currentTarget.textContent = paused ? "Resume" : "Pause"; }
    release(); clock.reset();
    if (paused) { audio.pause(); } else { audio.resume(); }
  }, { signal: controller.signal });
  document.getElementById("reset")?.addEventListener("click", () => {
    paused = true;
    void open().then((replacement) => { session.dispose(); session = replacement; audio.reset(session.snapshot()); frame = session.frame(); clock.reset(); release(); paused = false; void render(1); })
      .catch((error) => status(error instanceof Error ? error.message : "Reset failed"));
  }, { signal: controller.signal });
  window.addEventListener("beforeunload", () => {
    disposed = true;
    cancelAnimationFrame(animationId);
    controller.abort();
    session.dispose();
    renderer.dispose();
    audio.dispose();
  }, { once: true });
  window.nativeGame3DPlayer = Object.freeze({
    pause: () => { paused = true; release(); clock.reset(); },
    step: async (nextInput: GameInputFrame3D) => { paused = true; step(nextInput); await render(1); },
    reset: async () => { paused = true; const replacement = await open(); session.dispose(); session = replacement; audio.reset(session.snapshot()); frame = session.frame(); release(); clock.reset(); await render(1); },
    advance: async (inputs: readonly GameInputFrame3D[]) => {
      if (inputs.length > 10_000) { throw new Error("Recorded route exceeds 10000 ticks"); }
      paused = true;
      for (const nextInput of inputs) { step(nextInput); }
      await render(1);
    },
    snapshot: () => session.snapshot(),
    inspect: () => session.inspect()
  });
  // A static HTTP host is required for browser modules and WASM.
  status(mouseFire ? "Ready. Click to capture the mouse and fire. WASD moves, F fires, Space jumps, Escape releases the mouse."
    : "Ready. Move with WASD, arrows or a gamepad, jump with Space. Click to capture the mouse for looking, Escape releases it.");
  await render(1);
  animationId = requestAnimationFrame(tick);
}

void start().catch((error) => status(error instanceof Error ? error.message : "Game could not start"));
