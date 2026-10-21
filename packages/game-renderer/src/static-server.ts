import { createServer, type Server } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import type { Browser, BrowserType, LaunchOptions } from "playwright";
import { importOptionalModule } from "@nodetool-ai/config";
import { missingRuntimePackageError } from "@nodetool-ai/protocol";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".glb": "model/gltf-binary", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".ttf": "font/ttf", ".otf": "font/otf"
};

export interface StandaloneServer {
  readonly origin: string;
  close(): Promise<void>;
}

/** Serves an exported player directory on a loopback port. Paths that resolve outside `root` get 403. */
export async function serveStandaloneDirectory(root: string): Promise<StandaloneServer> {
  const server: Server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
      const path = await realpath(join(root, pathname === "/" ? "index.html" : pathname.slice(1)));
      if (!path.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; } // key-boundary-ok: node:path sep anchors containment after realpath.
      const bytes = await readFile(path);
      response.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
      response.end(bytes);
    })().catch(() => { response.writeHead(404); response.end(); });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Static player server did not bind"); }
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** Launches Playwright's Chromium. Playwright may live in the optional-node root (`nodetool runtime add playwright`). */
export async function launchStandaloneChromium(options: LaunchOptions): Promise<Browser> {
  let playwright: { readonly chromium: BrowserType };
  try { playwright = await importOptionalModule<{ readonly chromium: BrowserType }>("playwright", { commonJs: true }); }
  catch (error) { throw missingRuntimePackageError("playwright", "playwright", error); }
  return playwright.chromium.launch(options);
}
