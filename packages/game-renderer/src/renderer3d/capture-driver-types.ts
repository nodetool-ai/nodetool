import type { GameCapturePageInput3D, GameCapturePageReport3D } from "./capture-page.js";

export interface GameCaptureBrowser {
  close(): Promise<void>;
  newContext(options: { viewport: { width: number; height: number }; serviceWorkers: "block" }): Promise<{
    route(pattern: string, handler: (route: {
      request(): { url(): string };
      fulfill(options: { status: number; contentType: string; body: string }): Promise<void>;
      abort(reason: string): Promise<void>;
    }) => Promise<void>): Promise<unknown>;
    newPage(): Promise<{
      setDefaultTimeout(milliseconds: number): void;
      goto(url: string): Promise<unknown>;
      evaluate(callback: (input: GameCapturePageInput3D) => Promise<GameCapturePageReport3D>, input: GameCapturePageInput3D): Promise<GameCapturePageReport3D>;
      locator(selector: string): { screenshot(options: { type: "png" }): Promise<Uint8Array> };
    }>;
  }>;
}
export interface GameCaptureChromium {
  launch(options: { headless: true; chromiumSandbox: true; executablePath?: string; args: string[] }): Promise<GameCaptureBrowser>;
}
