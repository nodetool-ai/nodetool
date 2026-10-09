import { createScriptedGameSession, validateGame } from "@nodetool-ai/game-runtime";
import { gameSnapshot, type GameInputFrame, type GameSnapshot, type GameRenderFrame } from "@nodetool-ai/protocol";
import { createGameRenderer, loadBrowserGameFonts } from "./browser.js";
import { GameAudioPlayer } from "./audio.js";
import { mountTouchControls } from "./touch-controls.js";
import { gameKeyAction } from "./input.js";

declare global {
  interface Window {
    nativeGamePlayer: {
      readonly pause: () => void;
      readonly reset: () => Promise<void>;
      readonly step: (input: GameInputFrame) => Promise<void>;
      readonly snapshot: () => GameSnapshot;
    };
  }
}

const PLAYER_VERSIONS: readonly string[] = ["1", "3"];

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing player element: ${id}`);
  }
  return found;
}

function showStatus(message: string): void {
  const status = element("status");
  status.textContent = message;
  // Touch layouts overlay the status on the game, so it fades out after each message.
  status.classList.remove("flash");
  void status.offsetWidth;
  status.classList.add("flash");
}

let touchMode = false;
function pauseLabel(paused: boolean): string {
  return touchMode ? (paused ? "\u25B6" : "\u275A\u275A") : (paused ? "Resume" : "Pause");
}

async function start(): Promise<void> {
  const response = await fetch("./game.json");
  if (!response.ok) {
    throw new Error(`Game document failed to load (${response.status})`);
  }
  const validation = validateGame(await response.json());
  if (!validation.valid || !validation.document) {
    throw new Error(`Game document is invalid: ${validation.errors.join("; ")}`);
  }
  const game = validation.document;
  if (!PLAYER_VERSIONS.includes(game.engineVersion)) {
    throw new Error(`This player supports engine versions ${PLAYER_VERSIONS.join(" and ")}`);
  }
  const fonts = await loadBrowserGameFonts(game, async (assetId) =>
    assetId.startsWith("./assets/") ? assetId : null);
  const canvas = element("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport is not a canvas");
  }
  const audio = new GameAudioPlayer({
    assets: game.assets,
    tickRate: game.tickRate,
    resolveAsset: async (binding) => binding.assetId.startsWith("./assets/") ? binding.assetId : null,
    status: showStatus
  });
  audio.preload();
  function unlockAudio(): void { void audio.unlock(); }
  const renderer = await createGameRenderer({
    canvas,
    assets: async (logicalId) => {
      const ref = game.assets[logicalId]?.assetId;
      if (!ref || !ref.startsWith("./assets/")) {
        return null;
      }
      const assetResponse = await fetch(ref, { cache: "force-cache" });
      if (!assetResponse.ok) {
        return null;
      }
      return createImageBitmap(await assetResponse.blob(), { premultiplyAlpha: "none" });
    },
  });
  const effects = game.renderEffects ?? [];
  let effectNotice = "";
  if (effects.length > 0) {
    if (renderer.capabilities.gpuEffects) {
      renderer.setEffects(effects, game.hudEffectOrder);
    } else if (effects.some((effect) => effect.required)) {
      throw new Error("This game requires WebGPU effects, which are unavailable on this device");
    } else {
      effectNotice = "GPU effect omitted on this device";
    }
  }
  let session = await createScriptedGameSession(game, 1);
  audio.sync(session.snapshot());
  let latest: GameRenderFrame = session.frame();
  renderer.resize(latest.width * latest.pixelsPerUnit, latest.height * latest.pixelsPerUnit);
  document.documentElement.style.setProperty("--game-aspect", String(latest.width / latest.height));
  document.body.classList.toggle("landscape-game", latest.width > latest.height);
  let paused = false;
  // Keyboard and touch hold actions independently; the simulation sees their union.
  const keyboard = new Set<string>();
  let touch: ReadonlySet<string> = new Set<string>();
  const pressed = new Set<string>();
  const justPressed = new Set<string>();
  function syncPressed(): void {
    const next = new Set([...keyboard, ...touch]);
    for (const action of next) {
      if (!pressed.has(action)) justPressed.add(action);
    }
    pressed.clear();
    next.forEach((action) => pressed.add(action));
  }
  function releaseAll(): void {
    keyboard.clear();
    touch = new Set();
    pressed.clear();
    justPressed.clear();
  }
  const touchRoot = element("touch");
  function enableTouch(): void {
    if (touchMode) return;
    touchMode = true;
    document.body.classList.add("touch");
    // The touch toolbar is a narrow column of icon buttons in the screen margin.
    for (const [id, icon, label] of [["reset", "\u21BA", "Reset"], ["fullscreen", "\u26F6", "Fullscreen"]] as const) {
      element(id).textContent = icon;
      element(id).setAttribute("aria-label", label);
    }
    element("pause").setAttribute("aria-label", "Pause");
    element("pause").textContent = pauseLabel(paused);
    mountTouchControls(touchRoot, { inputActions: game.inputActions, onChange: (actions) => {
      touch = actions;
      syncPressed();
    } });
  }
  if (window.matchMedia("(pointer: coarse)").matches) enableTouch();
  window.addEventListener("touchstart", enableTouch, { passive: true });
  for (const type of ["pointerdown", "touchend", "keydown"] as const) window.addEventListener(type, unlockAudio, { passive: true });
  const fullscreen = element("fullscreen");
  if (!document.fullscreenEnabled) fullscreen.hidden = true;
  fullscreen.addEventListener("click", () => {
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: "hide" });
    void request.then(() => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      if (document.fullscreenElement && latest.width > latest.height) void orientation.lock?.("landscape").catch(() => undefined);
    }).catch(() => showStatus("Fullscreen is unavailable"));
  });
  let rendering: Promise<unknown> | undefined;
  let accumulator = 0;
  let lastTime = performance.now();
  let animationFrame = 0;
  const tickMs = 1000 / game.tickRate;
  const saveKey = `nodetool-game:${game.id}:${game.revision}:save`;

  function render(interpolation: number): void {
    if (rendering) {
      return;
    }
    rendering = renderer.render(latest, interpolation)
      .then(() => {
        if (effects.some((effect) => !effect.required) && renderer.capabilities.fallbackReason) {
          showStatus("GPU effect omitted after WebGPU failure");
        }
      })
      .catch((error) => showStatus(error instanceof Error ? error.message : "Rendering failed"))
      .finally(() => { rendering = undefined; });
  }

  function step(): boolean {
    try {
      const result = session.step({ pressed: [...pressed], justPressed: [...justPressed] });
      justPressed.clear();
      latest = result.frame;
      result.events.forEach((event) => audio.handle(event));
      audio.sync(session.snapshot());
      return true;
    } catch (error) {
      paused = true;
      element("pause").textContent = pauseLabel(true);
      showStatus(error instanceof Error ? error.message : "Game script failed");
      return false;
    }
  }

  function tick(now: number): void {
    if (!paused && !document.hidden) {
      accumulator += Math.min(250, now - lastTime);
      let steps = 0;
      while (accumulator >= tickMs && steps < 5) {
        if (!step()) {
          accumulator = 0;
          break;
        }
        accumulator -= tickMs;
        steps++;
      }
      if (steps === 5 && accumulator >= tickMs) {
        accumulator = 0;
      }
      render(accumulator / tickMs);
    }
    lastTime = now;
    animationFrame = requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", (event) => {
    const action = gameKeyAction(event.code, event.key);
    if (!game.inputActions.includes(action)) {
      return;
    }
    event.preventDefault();
    keyboard.add(action);
    syncPressed();
  });
  window.addEventListener("keyup", (event) => {
    keyboard.delete(gameKeyAction(event.code, event.key));
    syncPressed();
  });
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    releaseAll();
    accumulator = 0;
    lastTime = performance.now();
  });
  element("pause").addEventListener("click", () => {
    paused = !paused;
    if (paused) audio.pause();
    else audio.resume();
    element("pause").textContent = pauseLabel(paused);
    lastTime = performance.now();
  });
  element("step").addEventListener("click", () => {
    if (paused) {
      step();
      render(1);
    }
  });
  element("reset").addEventListener("click", () => {
    void createScriptedGameSession(game, 1).then((restored) => {
      session.dispose();
      session = restored;
      audio.reset(session.snapshot());
      latest = session.frame();
      releaseAll();
      accumulator = 0;
      showStatus("Game reset");
      render(1);
    }).catch((error) => showStatus(error instanceof Error ? error.message : "Game could not reset"));
  });
  element("save").addEventListener("click", () => {
    try {
      localStorage.setItem(saveKey, JSON.stringify(session.snapshot()));
      showStatus("Game saved");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Game could not be saved");
    }
  });
  element("load").addEventListener("click", () => {
    try {
      const saved = localStorage.getItem(saveKey);
      if (!saved) {
        showStatus("No saved game");
        return;
      }
      void createScriptedGameSession(game, 1, gameSnapshot.parse(JSON.parse(saved))).then((restored) => {
        session.dispose();
        session = restored;
        audio.reset(session.snapshot());
        latest = session.frame();
        accumulator = 0;
        showStatus("Game loaded");
        render(1);
      }).catch((error) => showStatus(error instanceof Error ? error.message : "Save could not be loaded"));
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Save could not be loaded");
    }
  });
  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(animationFrame);
    session.dispose();
    renderer.dispose();
    fonts.dispose();
    audio.dispose();
  });
  window.nativeGamePlayer = Object.freeze({
    pause: () => { paused = true; releaseAll(); accumulator = 0; },
    reset: async () => {
      paused = true;
      const replacement = await createScriptedGameSession(game, 1);
      session.dispose(); session = replacement;
      audio.reset(session.snapshot()); latest = session.frame(); releaseAll(); accumulator = 0;
      await rendering;
      await renderer.render(latest, 1);
    },
    step: async (input: GameInputFrame) => {
      paused = true;
      const result = session.step(input);
      latest = result.frame;
      result.events.forEach(event => audio.handle(event));
      audio.sync(session.snapshot());
      await rendering;
      await renderer.render(latest, 1);
    },
    snapshot: () => session.snapshot()
  });
  showStatus(`Ready (${renderer.backend})${effectNotice ? ` · ${effectNotice}` : ""}${fonts.diagnostics.length ? ` · ${fonts.diagnostics.join("; ")}` : ""}`);
  render(1);
  animationFrame = requestAnimationFrame(tick);
}

void start().catch((error) => {
  showStatus(error instanceof Error ? error.message : "Game could not start");
});
