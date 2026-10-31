/**
 * The media module, loaded on demand. It loads node-av's native addon, which
 * no browser, edge or Turbopack bundle can place, so those bundlers are told
 * to leave the import alone. esbuild ignores the hint and inlines it, which is
 * what the packaged backend needs.
 */
export function loadMediaModule(): Promise<typeof import("./media/index.js")> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "./media/index.js");
}
