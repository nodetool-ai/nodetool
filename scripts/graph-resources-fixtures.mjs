#!/usr/bin/env node
/**
 * Fake-mode runner for the graph-resources example graphs
 * (docs/graph-resources/design.md §5, §7).
 *
 * The shipped examples under
 * `packages/base-nodes/nodetool/examples/nodetool-base/` spend real money and
 * read documents a director approved by hand, so nothing in CI can run them.
 * The fixtures in `packages/cli/fixtures/graph-resources/` are the same graphs
 * with the generators swapped for `nodetool.fake.*` and the render nodes
 * pointed at the `fake` provider. This script gives them the world they read —
 * a template board with a Product entity and a style entity, the approved cut
 * behind it, and a 16:9 launch cut, all with fixed ids — in a scratch database,
 * runs each one through `nodetool debug`, and checks the claims a green run
 * would otherwise not make:
 *
 *   E1  the filled `{{name}} — {{price}}` overlay is on the exported sequence,
 *       so the template's cut survived recast, render and assembly;
 *   E3  every slot the platformer manifest declares reaches the exported
 *       project, with nothing pointing at a resource that is not there;
 *   E4  every clip of the source cut keeps its start and duration on both
 *       retargets, so retargeting moved the frame and not the edit.
 *
 * E2 (`Localized Explainer`) has no fixture: `nodetool.script.*` needs the
 * `getScript` model interface, which is wired in the websocket session and not
 * in the `documentModelInterfaces()` the CLI installs, so every script node
 * fails under `nodetool debug`. See docs/graph-resources/tasks.md § Phase 5
 * deviations.
 *
 * Nothing here needs a key or a network. Run it with `npm run fixtures:graph-resources`.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(repoRoot, "packages/cli/fixtures/graph-resources");

/** The seeded ids the fixture graphs name. Change one, change both sides. */
const IDS = {
  user: "1",
  project: "default",
  productEntity: "gr-e1-product",
  styleEntity: "gr-e1-style",
  board: "gr-e1-board",
  boardCut: "gr-e1-board-cut",
  launchCut: "gr-e4-cut"
};

const OVERLAY_TEMPLATE = "{{name}} — {{price}}";

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const iso = (offsetMs = 0) => new Date(1767225600000 + offsetMs).toISOString();

/** An image asset row carrying an entity marker: how the library stores one. */
function entityAsset(id, marker) {
  return {
    id,
    user_id: IDS.user,
    project_id: IDS.project,
    name: `${marker.name}.png`,
    content_type: "image/png",
    size: 1,
    metadata: { nodetool_entity: marker },
    created_at: iso(),
    updated_at: iso()
  };
}

const shot = (id, index, slug, action) => ({
  type: "shot",
  id,
  index,
  slug,
  action,
  status: "planned",
  duration: 3
});

function boardDocument() {
  return {
    screenplay: null,
    shots: [
      shot("shot-1", 0, "hero", "Product turns slowly on a white cyclorama"),
      shot("shot-2", 1, "texture", "A close pass over brushed metal, no product")
    ],
    brief: "One hero turn and one texture frame, 9:16",
    style: "Studio Noon",
    entityIds: [IDS.productEntity, IDS.styleEntity],
    aspectRatio: "9:16",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: { type: "image_model", provider: "fake", id: "fake-image" },
    videoModel: { type: "video_model", provider: "fake", id: "fake-video" }
  };
}

const track = (id, name, type, index) => ({
  id,
  name,
  type,
  index,
  visible: true,
  locked: false
});

const clip = (over) => ({
  name: "",
  startMs: 0,
  durationMs: 3000,
  mediaType: "video",
  sourceType: "generated",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

/**
 * The approved cut: two shot clips owned by the template board, plus a text
 * overlay on its own track. The overlay is what a recast copy inherits and
 * `FillTimelineText` fills, so it must be foreign to the board — a clip
 * carrying no `storyboardBoardId` — or re-assembly would rebuild it away.
 */
function boardCutSequence() {
  return {
    id: IDS.boardCut,
    projectId: IDS.project,
    name: "Hero 9:16 cut",
    fps: 30,
    width: 1080,
    height: 1920,
    durationMs: 6000,
    tracks: [track("t-shots", "Shots", "video", 0), track("t-text", "Overlay", "video", 1)],
    clips: [
      clip({
        id: "cut-shot-1",
        trackId: "t-shots",
        name: "hero",
        startMs: 0,
        storyboardBoardId: IDS.board,
        storyboardShotId: "shot-1"
      }),
      clip({
        id: "cut-shot-2",
        trackId: "t-shots",
        name: "texture",
        startMs: 3000,
        storyboardBoardId: IDS.board,
        storyboardShotId: "shot-2"
      }),
      clip({
        id: "cut-overlay",
        trackId: "t-text",
        name: "Name and price",
        startMs: 500,
        durationMs: 5000,
        mediaType: "text",
        textStyle: {
          text: OVERLAY_TEMPLATE,
          fontSizePx: 72,
          color: "#ffffff",
          align: "center"
        }
      })
    ],
    markers: [],
    createdAt: iso(),
    updatedAt: iso()
  };
}

/** E4's template: an approved 16:9 cut whose placements must survive a retarget. */
function launchCutSequence() {
  return {
    id: IDS.launchCut,
    projectId: IDS.project,
    name: "Launch film 16:9 cut",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 9000,
    tracks: [track("t-film", "Film", "video", 0)],
    clips: [
      clip({ id: "film-1", trackId: "t-film", name: "Open", startMs: 0, durationMs: 2500 }),
      clip({ id: "film-2", trackId: "t-film", name: "Middle", startMs: 2500, durationMs: 4000 }),
      clip({ id: "film-3", trackId: "t-film", name: "Close", startMs: 6500, durationMs: 2500 })
    ],
    markers: [],
    createdAt: iso(),
    updatedAt: iso()
  };
}

async function seed() {
  const { initDb, Asset, Storyboard, TimelineSequence } = await import(
    "@nodetool-ai/models"
  );
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  initDb(getDefaultDbPath());

  await new Asset(
    entityAsset(IDS.productEntity, {
      kind: "prop",
      name: "Product",
      descriptor: "the hero product, three-quarter view, no packaging"
    })
  ).save();
  await new Asset(
    entityAsset(IDS.styleEntity, {
      kind: "style",
      name: "Studio Noon",
      descriptor: "soft daylight, seamless white cyclorama, no props"
    })
  ).save();

  const board = new Storyboard({
    id: IDS.board,
    user_id: IDS.user,
    project_id: IDS.project,
    name: "Hero 9:16",
    document: JSON.stringify(boardDocument()),
    timeline_id: IDS.boardCut
  });
  await board.save();

  for (const sequence of [boardCutSequence(), launchCutSequence()]) {
    const row = TimelineSequence.fromTimelineSequence(IDS.user, sequence);
    row.id = sequence.id;
    row.user_id = IDS.user;
    await row.save();
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const FIXTURES = [
  { id: "e1", file: "per-sku-ad-factory.fake.json", title: "E1 Per-SKU Ad Factory" },
  { id: "e3", file: "platformer-asset-pack.fake.json", title: "E3 Platformer Asset Pack" },
  { id: "e4", file: "three-ratios.fake.json", title: "E4 Three Ratios" }
];

/**
 * One fixture through `nodetool debug`, with the verdict read from the bundle
 * rather than trusted from the exit code.
 *
 * `nodetool debug` on a graph carrying a sandboxed `nodetool.code.Code` node
 * has been seen to exit 0 and write no bundle after a node failed, so an
 * exit-code-only check reports a broken run as clean. The bundle must exist and
 * its verdict must say the run passed, or this is a failure whatever the
 * process returned.
 */
function runDebug(fixture, env, outRoot) {
  const file = join(fixturesDir, fixture.file);
  const out = join(outRoot, fixture.id);
  const result = spawnSync(
    "npm",
    ["run", "--silent", "dev:nodetool", "--", "debug", file, "--out", out],
    { cwd: repoRoot, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.stderr) process.stderr.write(result.stderr);
  let report;
  try {
    report = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
  } catch {
    return {
      problem: `nodetool debug wrote no report (exit ${result.status}); see ${out}`,
      report: null
    };
  }
  if (result.status !== 0) {
    return { problem: `nodetool debug exited ${result.status}`, report };
  }
  if (report.verdict?.ok !== true || report.server?.status !== "completed") {
    return {
      problem: `the run did not complete: ${nodeErrors(report) || report.server?.error || "no reason given"}`,
      report
    };
  }
  return { problem: null, report };
}

/** Every node error the run recorded, one per line. */
function nodeErrors(report) {
  return (report?.server?.summary?.nodes ?? [])
    .filter((node) => node.error)
    .map((node) => `${node.nodeId}: ${node.error}`)
    .join("\n");
}

/** Every `{outputName, value}` a node emitted, by node id. */
function outputsOf(report, nodeId) {
  const node = (report?.server?.summary?.nodes ?? []).find(
    (entry) => entry.nodeId === nodeId
  );
  const bag = {};
  for (const output of node?.outputs ?? []) {
    bag[output.outputName] = output.value;
  }
  return bag;
}

async function loadSequence(id) {
  const { TimelineSequence } = await import("@nodetool-ai/models");
  const row = await TimelineSequence.findById(id);
  return row ? row.toTimelineSequence() : null;
}

const placements = (sequence) =>
  sequence.clips
    .map((c) => `${c.name}@${c.startMs}+${c.durationMs}`)
    .sort()
    .join(", ");

/**
 * E1: the exported sequence carries the overlay with both placeholders
 * replaced. Checking the node's `filled` list alone would pass on a cut that
 * lost the overlay clip, so the assertion reads the saved sequence.
 */
async function assertE1(report) {
  const problems = [];
  const filled = outputsOf(report, "fill");
  const timeline = filled["timeline"];
  if (!timeline?.id) {
    return ["E1: FillTimelineText emitted no sequence"];
  }
  const sequence = await loadSequence(timeline.id);
  if (!sequence) return [`E1: sequence ${timeline.id} was not saved`];
  const texts = sequence.clips
    .map((c) => c.textStyle?.text)
    .filter((text) => typeof text === "string");
  if (texts.length === 0) {
    problems.push("E1: the exported sequence carries no text clip at all");
  }
  const overlay = texts.find((text) => text.includes("—"));
  if (!overlay) {
    problems.push(`E1: no overlay clip on the exported sequence (texts: ${JSON.stringify(texts)})`);
  } else if (overlay.includes("{{")) {
    problems.push(`E1: the overlay is still a template: ${JSON.stringify(overlay)}`);
  } else if (!/^\S.* — \S/.test(overlay)) {
    problems.push(`E1: the overlay did not fill both sides: ${JSON.stringify(overlay)}`);
  }
  return problems;
}

/**
 * E4: both retargets are new rows whose clips keep the source's names, starts
 * and durations. A retarget that rebuilt the cut, or wrote the source, fails
 * here rather than looking like a clean run.
 */
async function assertE4(report) {
  const problems = [];
  const source = await loadSequence(IDS.launchCut);
  if (!source) return ["E4: the source cut is gone"];
  const expected = placements(source);
  for (const nodeId of ["vertical", "square"]) {
    const timeline = outputsOf(report, nodeId)["timeline"];
    if (!timeline?.id) {
      problems.push(`E4: ${nodeId} emitted no sequence`);
      continue;
    }
    if (timeline.id === IDS.launchCut) {
      problems.push(`E4: ${nodeId} wrote the source cut instead of deriving a row`);
      continue;
    }
    const derived = await loadSequence(timeline.id);
    if (!derived) {
      problems.push(`E4: ${nodeId} sequence ${timeline.id} was not saved`);
      continue;
    }
    if (derived.templateId !== IDS.launchCut) {
      problems.push(
        `E4: ${nodeId} sequence does not name the source as its template (templateId=${derived.templateId})`
      );
    }
    const got = placements(derived);
    if (got !== expected) {
      problems.push(`E4: ${nodeId} moved the cut.\n  expected ${expected}\n  got      ${got}`);
    }
  }
  return problems;
}

/**
 * Every slot the platformer manifest declares, as the file the writer lays it
 * out at. Named here rather than counted, so a slot that silently lost its
 * asset fails instead of being covered by another slot's file.
 */
const PLATFORMER_SLOT_FILES = [
  "assets/sprites/player.png",
  "assets/sprites/enemy_walker.png",
  "assets/tiles/tiles_ground.png",
  "assets/images/bg_far.png",
  "assets/images/title.png",
  "assets/audio/sfx_jump.wav",
  "assets/audio/sfx_hurt.wav",
  "assets/audio/music_level.wav"
];

/**
 * E3: the export wrote a project, not just a directory name — every slot's
 * asset is in the file list and nothing in it points at a resource that is not
 * there. `verified` stays false because no Godot binary is installed; the
 * skipped-verification note is the export saying so, not a failure.
 */
async function assertE3(report) {
  const problems = [];
  const out = outputsOf(report, "export");
  if (!out["directory"]) {
    return ["E3: the export named no directory"];
  }
  const files = new Set((Array.isArray(out["files"]) ? out["files"] : []).map(String));
  for (const file of PLATFORMER_SLOT_FILES) {
    if (!files.has(file)) {
      problems.push(`E3: ${file} is not in the exported file list`);
    }
  }
  const dangling = (Array.isArray(out["errors"]) ? out["errors"] : [])
    .map(String)
    .filter((error) => error.includes("dangling"));
  if (dangling.length > 0) {
    problems.push(`E3: the exported project points at missing resources: ${dangling.join("; ")}`);
  }
  return problems;
}

const ASSERTIONS = { e1: assertE1, e3: assertE3, e4: assertE4 };

async function main() {
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const scratch = mkdtempSync(join(tmpdir(), "nodetool-graph-resources-"));
  const keep = process.argv.includes("--keep");
  mkdirSync(join(scratch, "assets"), { recursive: true });

  process.env["DB_PATH"] = join(scratch, "nodetool.sqlite3");
  process.env["ASSET_FOLDER"] = join(scratch, "assets");
  process.env["NODETOOL_ENABLE_FAKE_PROVIDER"] = "1";
  const env = { ...process.env };

  console.log(`Scratch install: ${scratch}`);
  await seed();
  console.log("Seeded the template board, its cut, the entity library and the launch cut.\n");

  const failures = [];
  for (const fixture of FIXTURES) {
    if (only.length > 0 && !only.includes(fixture.id)) continue;
    console.log(`=== ${fixture.title} ===`);
    const { problem, report } = runDebug(fixture, env, join(scratch, "debug"));
    if (problem) {
      const detail = nodeErrors(report);
      failures.push(`${fixture.title}: ${problem}${detail ? `\n${detail}` : ""}`);
      console.log(`  FAIL ${problem}\n${detail}\n`);
      continue;
    }
    const assertion = ASSERTIONS[fixture.id];
    const problems = assertion ? await assertion(report) : [];
    if (problems.length > 0) {
      failures.push(...problems);
      for (const problem of problems) console.log(`  FAIL ${problem}`);
    } else {
      console.log("  ok\n");
    }
  }

  if (!keep) rmSync(scratch, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`\n${failures.length} fixture check(s) failed:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nAll graph-resources fixtures ran clean.");
}

await main();
