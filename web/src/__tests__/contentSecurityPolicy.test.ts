/**
 * The app's CSP is the one place a `<video>` can fail for a reason no
 * component can see.
 *
 * Deployed, an asset's `get_url` is a signed URL on the storage host — a
 * different origin than the page. `img-src` allows `https:`, so images loaded;
 * `media-src` was `'self' blob:`, so every cross-origin video and audio source
 * was blocked, and Safari painted the crossed-out play button. Local dev and
 * Electron hid it: Vite proxies `/api` to the same origin, and Electron ships
 * its own, wider policy.
 *
 * Media and images come from the same asset URLs, so the two directives have to
 * accept the same sources.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INDEX_HTML = join(__dirname, "..", "..", "index.html");

function cspDirectives(): Map<string, string[]> {
  const html = readFileSync(INDEX_HTML, "utf8");
  const meta = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/.exec(
    html
  );
  if (!meta) {
    throw new Error("no Content-Security-Policy meta tag in index.html");
  }
  const directives = new Map<string, string[]>();
  for (const part of meta[1].split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) {
      directives.set(name, sources);
    }
  }
  return directives;
}

describe("index.html Content-Security-Policy", () => {
  it("declares both img-src and media-src", () => {
    const csp = cspDirectives();
    expect(csp.get("img-src")).toBeDefined();
    expect(csp.get("media-src")).toBeDefined();
  });

  it("accepts every image source for media too", () => {
    const csp = cspDirectives();
    const media = new Set(csp.get("media-src"));
    const missing = (csp.get("img-src") ?? []).filter((s) => !media.has(s));

    expect(missing).toEqual([]);
  });

  it("allows the cross-origin https sources signed asset URLs use", () => {
    expect(cspDirectives().get("media-src")).toContain("https:");
  });
});
