#!/usr/bin/env node
// Runs parity scenarios against the Qt component host and the web parity
// page, compares what each side reports, and writes a report.
//
//   node native/parity/run.mjs [--scenario <id>] [--host <binary>] [--out <dir>] [--json]
//
// See native/parity/README.md.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../..");
const DEFAULT_HOST = join(ROOT, "native/node-editor/build-parity/parity-host/nodetool-parity-host");
const DEFAULT_PIXEL_THRESHOLD = 0.05;

const elapsed = (start) => Math.round(performance.now() - start);

function parseArgs(argv) {
  const options = { scenario: undefined, host: process.env.NODETOOL_PARITY_HOST ?? DEFAULT_HOST, out: join(ROOT, "native/parity/out"), json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${flag}`);
      }
      return next;
    };
    if (flag === "--scenario") {
      options.scenario = value();
    } else if (flag === "--host") {
      options.host = resolve(value());
    } else if (flag === "--out") {
      options.out = resolve(value());
    } else if (flag === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown flag ${flag}`);
    }
  }
  return options;
}

// The Qt host speaks one JSON object per line on stdin and stdout.
async function startQtHost(binary) {
  if (!existsSync(binary)) {
    throw new Error(`No Qt parity host at ${binary}. Build it first (native/parity/README.md) or pass --host.`);
  }
  const child = spawn(binary, [], {
    env: { ...process.env, QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM ?? "offscreen" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
  const waiting = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const reply = JSON.parse(line);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  });
  const exited = new Promise((resolveExit) => child.on("exit", resolveExit));
  const send = (command) => {
    const id = nextId++;
    return new Promise((resolveReply, reject) => {
      waiting.set(id, (reply) => (reply.ok ? resolveReply(reply) : reject(new Error(`Qt host: ${reply.error}`))));
      exited.then((code) => reject(new Error(`Qt host exited with ${code}: ${stderr.join("").slice(-2000)}`)));
      child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  };
  const hello = await send({ cmd: "hello" });
  return {
    hello,
    mount: (component, fixture, theme) => send({ cmd: "mount", component, fixture, theme }),
    act: (action) => send({ cmd: "act", action }),
    observe: (screenshot) => send({ cmd: "observe", screenshot }),
    close: async () => {
      await send({ cmd: "quit" }).catch(() => {});
      await exited;
    }
  };
}

// Web KeyboardEvent.key names with modifiers, as Playwright writes them.
const webKey = (action) =>
  [...(action.modifiers ?? []).map((name) => (name === "Mod" ? "Control" : name)), action.key].join("+");

async function startWebHost() {
  const [{ createServer }, { chromium }] = await Promise.all([import("vite"), import("playwright")]);
  const web = join(ROOT, "web");
  const [server, browser] = await Promise.all([
    createServer({ root: web, configFile: join(web, "vite.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } }).then(async (s) => {
      await s.listen();
      return s;
    }),
    chromium.launch({ headless: true, executablePath: process.env.NODETOOL_PARITY_CHROMIUM || undefined })
  ]);
  const url = new URL("parity.html", server.resolvedUrls.local[0]).href;
  let page = null;
  const errors = [];
  return {
    async mount(component, fixture, theme) {
      await page?.close();
      page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "en-US", colorScheme: theme, reducedMotion: "reduce" });
      // A module that fails to load leaves window.parity unset, so stop at
      // the first page error instead of waiting out the timeout.
      const failed = new Promise((_, reject) => page.on("pageerror", (error) => reject(new Error(`The parity page failed: ${error.message}`))));
      page.on("pageerror", (error) => errors.push(error.message));
      await Promise.race([
        page.goto(url, { waitUntil: "load", timeout: 120000 }).then(() => page.waitForFunction(() => Boolean(window.parity), null, { timeout: 120000 })),
        failed
      ]);
      const size = await Promise.race([page.evaluate(([c, f, t]) => window.parity.mount(c, f, t), [component, fixture, theme]), failed]);
      await page.evaluate(() => document.fonts.ready);
      await this.settle();
      await page.evaluate(() => window.parity.takeIntents());
      return size;
    },
    // Waits until the probe holds still for three animation frames, as the
    // Qt host does, so debounced searches have finished.
    async settle() {
      await page.evaluate(async () => {
        let last = "";
        let stable = 0;
        for (let i = 0; i < 200 && stable < 3; i++) {
          await new Promise((r) => setTimeout(r, 10));
          await new Promise(requestAnimationFrame);
          const now = JSON.stringify(window.parity.probe());
          stable = now === last ? stable + 1 : 0;
          last = now;
        }
      });
    },
    async act(action) {
      if (action.type === "key") {
        await page.keyboard.press(webKey(action));
      } else if (action.type === "type") {
        await page.keyboard.type(action.text);
      } else if (action.type === "click" || action.type === "hover") {
        const target = page.locator(action.webTarget ?? `[data-parity="${action.target}"]`).first();
        await (action.type === "click" ? target.click() : target.hover());
      } else {
        throw new Error(`Unknown action ${action.type}`);
      }
      await this.settle();
    },
    async observe(screenshot) {
      await this.settle();
      const [state, intents] = await page.evaluate(() => [window.parity.probe(), window.parity.takeIntents()]);
      if (screenshot) {
        const selector = await page.evaluate(() => window.parity.screenshotSelector());
        await page.locator(selector).first().screenshot({ path: screenshot, animations: "disabled" });
      }
      return { state, intents };
    },
    errors,
    async close() {
      await browser.close();
      await server.close();
    }
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Share of 10 by 10 pixel tiles whose mean grey level differs by more than
// 16 of 255, with the web screenshot scaled to the Qt one. Tiles average out
// antialiasing and font hinting; a moved, missing or recoloured element still
// changes whole tiles.
export async function pixelDelta(qtPath, webPath) {
  const { default: sharp } = await import("sharp");
  const { width, height } = await sharp(qtPath).metadata();
  const tiles = { width: Math.max(1, Math.round(width / 10)), height: Math.max(1, Math.round(height / 10)) };
  const load = (path) =>
    sharp(path).resize(width, height, { fit: "fill" }).resize(tiles.width, tiles.height, { kernel: "cubic" }).greyscale().raw().toBuffer();
  const [a, b] = await Promise.all([load(qtPath), load(webPath)]);
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 16) {
      differing++;
    }
  }
  return differing / a.length;
}

export function compareIntents(qt, web, map) {
  const translated = qt.map((entry) => ({ intent: map[entry.intent] ?? `unmapped:${entry.intent}`, args: entry.args }));
  return { match: same(translated, web), qt: translated, web };
}

async function runScenario(scenario, hosts, intentMap, outDir) {
  const fixture = JSON.parse(await readFile(join(HERE, "fixtures", `${scenario.fixture}.json`), "utf8"));
  const theme = scenario.theme ?? "dark";
  const checks = [];
  const started = performance.now();
  await Promise.all([hosts.qt.mount(scenario.component, fixture, theme), hosts.web.mount(scenario.component, fixture, theme)]);
  for (const step of scenario.steps) {
    if (step.act) {
      await Promise.all([hosts.qt.act(step.act), hosts.web.act(step.act)]);
      continue;
    }
    const { name, compare = [], screenshot = false, intents = false, pixelThreshold = DEFAULT_PIXEL_THRESHOLD } = step.observe;
    const shots = screenshot
      ? { qt: join(outDir, `${scenario.id}.${name}.qt.png`), web: join(outDir, `${scenario.id}.${name}.web.png`) }
      : null;
    const [qt, web] = await Promise.all([hosts.qt.observe(shots?.qt), hosts.web.observe(shots?.web)]);
    for (const field of compare) {
      checks.push({ step: name, layer: "state", field, match: same(qt.state[field], web.state[field]), qt: qt.state[field], web: web.state[field] });
    }
    if (intents) {
      checks.push({ step: name, layer: "intent", field: "intents", ...compareIntents(qt.intents, web.intents, intentMap) });
    }
    if (shots) {
      const delta = await pixelDelta(shots.qt, shots.web);
      checks.push({ step: name, layer: "pixels", field: "screenshot", match: delta <= pixelThreshold, delta: Number(delta.toFixed(4)), threshold: pixelThreshold, ...shots });
    }
  }
  const passed = checks.filter((check) => check.match).length;
  return { id: scenario.id, component: scenario.component, checks, passed, total: checks.length, ms: elapsed(started) };
}

// What to work on first: wrong intents break behaviour, wrong state shows the
// user something else, and pixel differences are cosmetic.
const LAYER_ORDER = ["intent", "state", "pixels"];

export function rankNext(results) {
  return results
    .flatMap((scenario) => scenario.checks.filter((check) => !check.match).map((check) => ({ scenario: scenario.id, component: scenario.component, ...check })))
    .sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
}

const show = (value) => {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

function formatReport(report) {
  const lines = [`Parity: ${report.passed}/${report.total} checks match (${report.percent}%)`, ""];
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.id} (${scenario.component}): ${scenario.passed}/${scenario.total}, ${scenario.ms} ms`);
    for (const check of scenario.checks.filter((c) => !c.match)) {
      if (check.layer === "pixels") {
        lines.push(`  differs  ${check.step} screenshot: delta ${check.delta} > ${check.threshold}`);
        lines.push(`           ${check.qt}`);
        lines.push(`           ${check.web}`);
      } else {
        lines.push(`  differs  ${check.step} ${check.field}`);
        lines.push(`           qt  ${show(check.qt)}`);
        lines.push(`           web ${show(check.web)}`);
      }
    }
  }
  lines.push("", `Timings: ${Object.entries(report.timings).map(([k, v]) => `${k} ${v} ms`).join(", ")}`);
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const scenarioFiles = (await readdir(join(HERE, "scenarios"))).filter((file) => file.endsWith(".json")).sort();
  const scenarios = [];
  for (const file of scenarioFiles) {
    scenarios.push(JSON.parse(await readFile(join(HERE, "scenarios", file), "utf8")));
  }
  const selected = options.scenario ? scenarios.filter((s) => s.id === options.scenario) : scenarios;
  if (selected.length === 0) {
    throw new Error(`No scenario ${options.scenario}. Known: ${scenarios.map((s) => s.id).join(", ")}`);
  }
  const intentMap = JSON.parse(await readFile(join(HERE, "intents.json"), "utf8")).intents;
  await mkdir(options.out, { recursive: true });

  const timings = {};
  const qtStart = performance.now();
  const webStart = performance.now();
  const [qt, web] = await Promise.all([
    startQtHost(options.host).then((host) => ((timings.qtStart = elapsed(qtStart)), host)),
    startWebHost().then((host) => ((timings.webStart = elapsed(webStart)), host))
  ]);
  const results = [];
  try {
    for (const scenario of selected) {
      results.push(await runScenario(scenario, { qt, web }, intentMap, options.out));
    }
  } finally {
    await Promise.all([qt.close(), web.close()]);
  }
  if (web.errors.length > 0) {
    throw new Error(`The web page reported errors:\n${web.errors.join("\n")}`);
  }
  timings.scenarios = results.reduce((sum, r) => sum + r.ms, 0);
  timings.total = elapsed(started);
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const report = { passed, total, percent: total ? Math.round((passed / total) * 1000) / 10 : 100, next: rankNext(results), scenarios: results, timings };
  await writeFile(join(options.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
