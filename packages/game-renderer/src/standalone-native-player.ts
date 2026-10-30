import { startNativeBrowserPlayer } from "./native-cpp/player.js";

const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const status = document.getElementById("status");
if (!(canvas instanceof HTMLCanvasElement) || !(hud instanceof HTMLElement) || !(status instanceof HTMLElement)) {
  throw new Error("Native player page is missing its canvas, HUD or status element");
}
void startNativeBrowserPlayer({ canvas, hud, status, baseUrl: new URL("./", import.meta.url) }).catch((error: unknown) => {
  status.textContent = `Native game could not start: ${error instanceof Error ? error.message : String(error)}. Serve the complete export over HTTPS or localhost HTTP in a browser with WebAssembly, module workers and WebGL2.`;
});
