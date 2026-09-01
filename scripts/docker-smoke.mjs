#!/usr/bin/env node
// Loads the web app served by a running NodeTool container and fails if it
// does not come up clean. Pairs with .github/workflows/docker-smoke.yml, which
// builds the image and starts the container before calling this.
//
// The container must be reachable on loopback — run it with `--network host`.
// In `local` auth mode the server only trusts requests whose source is
// loopback *inside* the container, so a published port (-p 7777:7777) arrives
// from the bridge gateway and every API call answers 401.
//
// Run locally against any server:
//   node scripts/docker-smoke.mjs http://localhost:7777

import { chromium } from "playwright";

function report() {
  if (failures.length > 0) {
    console.error(`\nDocker smoke failed with ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Docker smoke passed — ${baseUrl} served the app with no errors.`);
  process.exit(0);
}

const baseUrl = process.argv[2] ?? "http://localhost:7777";
const failures = [];

// The app's own console output is verbose (tRPC logs every query with multi-line
// CSS formatting), so a failing run has to stay readable: one line each, deduped.
const summarize = (text) => {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 180 ? `${oneLine.slice(0, 180)}…` : oneLine;
};

const get = async (path) => {
  try {
    return await fetch(new URL(path, baseUrl));
  } catch (cause) {
    failures.push(`GET ${path} — no response from ${baseUrl} (${cause.message})`);
    return null;
  }
};

const postJson = async (path, body) => {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = summarize(await res.text());
    throw new Error(`POST ${path} -> ${res.status} ${detail}`);
  }
  return res.json();
};

/** One tRPC mutation, unwrapped to the procedure's own result. */
const trpc = async (procedure, input) =>
  (await postJson(`/trpc/${procedure}`, input)).result.data;

/**
 * Render a two-clip timeline — a text clip over a solid shape — through
 * `nodetool.timeline.RenderTimeline` and assert the job composited it.
 *
 * This is the check that proves the image renders the picture the editor
 * previews. The node falls back to an ffmpeg concatenation when it cannot
 * acquire a WebGPU device, and that fallback is silent apart from a job log:
 * the run still succeeds and still returns an mp4. `render_mode` is what
 * separates the two, so an image that shipped without Dawn — or without the
 * lavapipe Vulkan driver it reaches the CPU through — fails here instead of
 * quietly serving flat cuts in production.
 */
async function checkTimelineRender() {
  const stamp = Date.now();
  try {
    const project = await trpc("projects.create", {
      name: `docker-smoke-${stamp}`,
      kind: "",
    });
    const timeline = await trpc("timeline.create", {
      name: `docker-smoke-${stamp}`,
      projectId: project.id,
      fps: 10,
      width: 320,
      height: 180,
    });
    await trpc("timeline.update", {
      id: timeline.id,
      document: {
        tracks: [
          {
            id: "t-text",
            name: "Text",
            type: "overlay",
            index: 0,
            visible: true,
            locked: false,
          },
          {
            id: "t-shape",
            name: "Shape",
            type: "video",
            index: 1,
            visible: true,
            locked: false,
          },
        ],
        clips: [
          {
            id: "clip-text",
            trackId: "t-text",
            name: "Title",
            startMs: 0,
            durationMs: 500,
            mediaType: "text",
            sourceType: "generated",
            status: "generated",
            locked: false,
            versions: [],
            textStyle: { text: "Smoke", fontSizePx: 32, color: "#ffffff" },
          },
          {
            id: "clip-shape",
            trackId: "t-shape",
            name: "Card",
            startMs: 0,
            durationMs: 500,
            mediaType: "shape",
            sourceType: "generated",
            status: "generated",
            locked: false,
            versions: [],
            shapeStyle: {
              kind: "rect",
              fill: "#1e3a8a",
              x: 0.1,
              y: 0.1,
              width: 0.8,
              height: 0.8,
            },
          },
        ],
        markers: [],
      },
    });

    const workflow = await trpc("workflows.create", {
      name: `docker-smoke-render-${stamp}`,
      description: "RenderTimeline smoke",
      access: "private",
      graph: {
        nodes: [
          {
            id: "render",
            type: "nodetool.timeline.RenderTimeline",
            data: {
              timeline: { type: "timeline", id: timeline.id, data: null },
              include_audio: false,
            },
          },
          {
            id: "out",
            type: "nodetool.output.Output",
            data: { name: "video" },
          },
        ],
        edges: [
          {
            id: "e1",
            source: "render",
            sourceHandle: "output",
            target: "out",
            targetHandle: "value",
            ui_properties: null,
          },
        ],
      },
    });

    const run = await postJson(`/api/workflows/${workflow.id}/run`, {});
    if (run.status !== "completed") {
      failures.push(
        `RenderTimeline run -> ${run.status} (${run.error ?? "no error"}). ` +
          "A text-and-shape timeline gives the rough-cut fallback nothing to " +
          "concatenate, so a failure here usually means the same thing a " +
          '"rough_cut" verdict does: no WebGPU device in the container.'
      );
      return;
    }
    // An output slot collects every value the node emitted, so it arrives as
    // an array even for a single-shot node.
    const video = [run.outputs?.video].flat()[0];
    const mode = video?.metadata?.render_mode;
    if (mode !== "composited") {
      failures.push(
        `RenderTimeline rendered in "${mode ?? "unknown"}" mode, expected ` +
          `"composited" — the container has no WebGPU device, so the node fell ` +
          `back to an ffmpeg concatenation. Check that bundle-backend.mjs ` +
          `staged webgpu and that mesa-vulkan-drivers is installed.`
      );
    }
  } catch (cause) {
    failures.push(`RenderTimeline smoke — ${cause.message}`);
  }
}

const config = await get("/api/config");
if (config && !config.ok) {
  failures.push(`GET /api/config -> ${config.status}`);
}

// The app renders fine from an empty library, so an authenticated read is what
// separates "server up" from "server up and answering".
const workflows = await get("/api/workflows");
if (workflows && !workflows.ok) {
  failures.push(
    `GET /api/workflows -> ${workflows.status} (401 means the request did ` +
      `not reach the server over loopback — run the container with --network host)`
  );
}

// Nothing below can succeed if the server never answered.
if (failures.length > 0) {
  report();
}

await checkTimelineRender();

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`uncaught: ${err.message}`));
page.on("requestfailed", (req) => {
  failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
});

const response = await page.goto(baseUrl, {
  waitUntil: "networkidle",
  timeout: 90_000,
});

if (response?.status() !== 200) {
  failures.push(`GET / -> ${response?.status()}`);
}

// index.html ships a #boot-spinner inside #root that React replaces on mount,
// so its removal is the signal that the bundle ran rather than merely loaded.
await page
  .waitForSelector("#boot-spinner", { state: "detached", timeout: 60_000 })
  .catch(() => failures.push("#boot-spinner never cleared — the app did not mount"));

const rootMarkup = await page.locator("#root").innerHTML();
if (rootMarkup.length < 500) {
  failures.push(`#root rendered only ${rootMarkup.length} chars of markup`);
}

for (const error of new Set(consoleErrors.map(summarize))) {
  failures.push(`console: ${error}`);
}
for (const request of new Set(failedRequests.map(summarize))) {
  failures.push(`request failed: ${request}`);
}

await page.screenshot({ path: "docker-smoke.png" }).catch(() => {});
await browser.close();

report();
