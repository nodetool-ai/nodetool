import { chromium } from "playwright";

export interface GameGoldenFontEvidence {
  readonly browserVersion: string;
  readonly fonts: readonly { readonly familyName: string; readonly postScriptName: string; readonly glyphCount: number }[];
}

/** Requires the browser's generic HUD font to match the accepted golden environment. */
export async function assertGameGoldenFont(fontconfig: string, cacheDirectory: string): Promise<GameGoldenFontEvidence> {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    env: { ...process.env, FONTCONFIG_FILE: fontconfig, XDG_CACHE_HOME: cacheDirectory } });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.setContent('<span id="probe" style="font:18px system-ui,sans-serif">AETHER SKYBOUND / BLACKSITE + 0123456789</span>');
    await page.evaluate(() => document.fonts.ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#probe" });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const used = fonts.filter((font) => font.glyphCount > 0);
    if (!used.length || used.some((font) => font.familyName !== "Liberation Sans" || font.postScriptName !== "LiberationSans")) {
      throw new Error(`Golden captures require Liberation Sans (fonts-liberation test prerequisite): ${JSON.stringify(used)}`);
    }
    return { browserVersion: browser.version(), fonts: used };
  } finally { await browser.close(); }
}

/** Scopes the golden-only font configuration through successful or failed captures. */
export async function withGameGoldenFontEnvironment(fontconfig: string, cacheDirectory: string, capture: () => Promise<void>): Promise<void> {
  const previousFontconfig = process.env["FONTCONFIG_FILE"];
  const previousCache = process.env["XDG_CACHE_HOME"];
  try {
    process.env["FONTCONFIG_FILE"] = fontconfig;
    process.env["XDG_CACHE_HOME"] = cacheDirectory;
    await capture();
  } finally {
    if (previousFontconfig === undefined) { delete process.env["FONTCONFIG_FILE"]; } else { process.env["FONTCONFIG_FILE"] = previousFontconfig; }
    if (previousCache === undefined) { delete process.env["XDG_CACHE_HOME"]; } else { process.env["XDG_CACHE_HOME"] = previousCache; }
  }
}
