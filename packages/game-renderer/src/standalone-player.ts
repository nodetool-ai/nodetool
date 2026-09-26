import { createScriptedGameSession, validateGame } from "@nodetool-ai/game-runtime";
import { gameSnapshot, type GameEvent, type GameRenderFrame } from "@nodetool-ai/protocol";
import { createGameRenderer } from "./browser.js";

const PLAYER_VERSION = "1";

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing player element: ${id}`);
  }
  return found;
}

function showStatus(message: string): void {
  element("status").textContent = message;
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
  if (game.engineVersion !== PLAYER_VERSION) {
    throw new Error(`This player supports engine version ${PLAYER_VERSION}`);
  }
  const canvas = element("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Game viewport is not a canvas");
  }
  const audioContext = new AudioContext();
  const sounds = new Map<string, HTMLAudioElement>();
  function playAudio(event: GameEvent): void {
    if (event.kind !== "audio") {
      return;
    }
    const ref = game.assets[event.assetId]?.assetId;
    if (ref?.startsWith("builtin:")) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.12);
      return;
    }
    if (!ref?.startsWith("./assets/")) {
      return;
    }
    let audio = sounds.get(ref);
    if (!audio) {
      audio = new Audio(ref);
      sounds.set(ref, audio);
    }
    audio.currentTime = 0;
    void audio.play().catch(() => showStatus("Audio could not play"));
  }
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
  const effect = game.renderEffects?.[0];
  let effectNotice = "";
  if (effect) {
    if (renderer.capabilities.gpuEffects) {
      renderer.setEffect(effect);
    } else if (effect.required) {
      throw new Error("This game requires WebGPU effects, which are unavailable on this device");
    } else {
      effectNotice = "GPU effect omitted on this device";
    }
  }
  let session = await createScriptedGameSession(game, 1);
  let latest: GameRenderFrame = session.frame();
  renderer.resize(latest.width * latest.pixelsPerUnit, latest.height * latest.pixelsPerUnit);
  const pressed = new Set<string>();
  const justPressed = new Set<string>();
  let paused = false;
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
        if (effect && !effect.required && renderer.capabilities.fallbackReason) {
          showStatus("GPU effect omitted after device loss");
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
      result.events.forEach(playAudio);
      return true;
    } catch (error) {
      paused = true;
      element("pause").textContent = "Resume";
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

  function keyAction(code: string, key: string): string {
    switch (code) {
      case "ArrowLeft": case "KeyA": return "left";
      case "ArrowRight": case "KeyD": return "right";
      case "ArrowUp": case "KeyW": return "up";
      case "ArrowDown": case "KeyS": return "down";
      default: return key.toLowerCase();
    }
  }
  window.addEventListener("keydown", (event) => {
    const action = keyAction(event.code, event.key);
    if (!game.inputActions.includes(action)) {
      return;
    }
    event.preventDefault();
    if (!pressed.has(action)) {
      justPressed.add(action);
    }
    pressed.add(action);
    void audioContext.resume().catch(() => showStatus("Audio could not start"));
  });
  window.addEventListener("keyup", (event) => {
    const action = keyAction(event.code, event.key);
    pressed.delete(action);
  });
  window.addEventListener("blur", () => { pressed.clear(); justPressed.clear(); });
  document.addEventListener("visibilitychange", () => {
    pressed.clear();
    justPressed.clear();
    accumulator = 0;
    lastTime = performance.now();
  });
  element("pause").addEventListener("click", () => {
    paused = !paused;
    element("pause").textContent = paused ? "Resume" : "Pause";
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
      latest = session.frame();
      pressed.clear();
      justPressed.clear();
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
    void audioContext.close();
  });
  showStatus(`Ready (${renderer.backend})${effectNotice ? ` · ${effectNotice}` : ""}`);
  render(1);
  animationFrame = requestAnimationFrame(tick);
}

void start().catch((error) => {
  showStatus(error instanceof Error ? error.message : "Game could not start");
});
