import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

declare global {
  interface Window { audioRetry: { peak: number; failures: string[]; voices: () => number } }
}

it.each(["gesture", "reset"])("retries failed decoding after %s and produces real Web Audio samples", async (mode) => {
  const tone = await readFile(new URL("./fixtures/export-tone.mp3", import.meta.url));
  const digest = createHash("sha256").update(tone).digest("hex");
  const script = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "audio-retry-control.ts", contents: `
    import { GameAudioPlayer } from './src/audio.ts';
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const gain = context.createGain.bind(context);
    context.createGain = () => { const node = gain(); node.connect(analyser); return node; };
    window.audioRetry = { peak: 0, failures: [], voices: () => audio.mixerState().buses.sfx.activeVoices };
    const audio = new GameAudioPlayer({ context, tickRate: 60,
      assets: { tone: {assetId:'tone',digest:${JSON.stringify(digest)},mediaKind:'audio',required:true} },
      resolveAsset: async () => './tone.mp3', status: message => window.audioRetry.failures.push(message) });
    audio.preload();
    document.querySelector('button').onclick = async () => {
      if (${JSON.stringify(mode)} === 'reset') { await context.resume(); audio.reset({tick:0,music:null,sceneId:'room'}); }
      else { await audio.unlock(); }
      audio.handle({ kind:'audio',action:'start',voiceId:'tone:1',assetId:'tone',loop:true,volume:1,fadeInTicks:0,fadeOutTicks:0 });
    };
    const samples = new Float32Array(analyser.fftSize);
    function measure() { analyser.getFloatTimeDomainData(samples); let peak = 0;
      for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); }
      window.audioRetry.peak = Math.max(window.audioRetry.peak, peak); requestAnimationFrame(measure); }
    requestAnimationFrame(measure);
    window.addEventListener('beforeunload', () => audio.dispose(), {once:true});
  ` }, bundle: true, platform: "browser", format: "esm", conditions: ["nodetool-dev"], write: false, logLevel: "silent" });
  const javascript = script.outputFiles?.[0]?.contents;
  if (!javascript) { throw new Error("The real audio control did not bundle"); }
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/tone.mp3") {
      requests += 1;
      response.writeHead(requests === 1 ? 503 : 200, { "content-type": "audio/mpeg" });
      response.end(requests === 1 ? "temporarily unavailable" : tone);
    } else if (request.url === "/audio.js") { response.writeHead(200, { "content-type": "text/javascript" }); response.end(javascript); }
    else { response.writeHead(200, { "content-type": "text/html" }); response.end('<button>Play</button><script type="module" src="/audio.js"></script>'); }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") { throw new Error("Audio control server did not bind"); }
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(3_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => window.audioRetry?.failures.some((message) => message.includes("503")))
      .catch(async (cause: unknown) => { throw new Error(`Audio preload control failed: ${JSON.stringify({ requests, errors, state: await page.evaluate(() => window.audioRetry) })}`, { cause }); });
    expect(requests).toBe(1);
    expect(await page.evaluate(() => window.audioRetry.peak)).toBe(0);
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => window.audioRetry.peak > 0.001 && window.audioRetry.voices() === 1)
      .catch(async (cause: unknown) => { throw new Error(`Audio output control failed: ${JSON.stringify({ requests, errors, state: await page.evaluate(() => ({peak:window.audioRetry.peak, failures:window.audioRetry.failures,voices:window.audioRetry.voices()})) })}`, { cause }); });
    expect(requests).toBe(2);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
