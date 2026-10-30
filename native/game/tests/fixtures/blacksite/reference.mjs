import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gameDocument3D, gameInputFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D } from "@nodetool-ai/game-runtime";
import { GameParticles3D, gameParticleSamples3D, gameParticleFieldFromSamples3D } from "@nodetool-ai/game-renderer";
import { nativeFrame } from "@nodetool-ai/protocol/native-game";
import { controlledNativeFrame } from "./probe-frame.mjs";

const sourceRoot = new URL("../../../../../packages/game-runtime/samples/blacksite/", import.meta.url);
const digest = (value) => createHash("sha256").update(typeof value === "string" || value instanceof Uint8Array ? value : JSON.stringify(value)).digest("hex");
const jsonBytes = (value) => JSON.stringify(value, null, 2) + "\n";
const arguments_ = process.argv.slice(2);
const option = (name) => {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};
const nativeDocumentPath = option("--native-document"), outputPath = option("--out");
if (!nativeDocumentPath || !outputPath) {
  throw new Error("Usage: node reference.mjs --native-document <prepared-game.json> --out <empty-directory> [--damage] [--capture-reference]");
}
const output = resolve(outputPath);
await mkdir(output, { recursive: true });
const sourceBytes = await readFile(new URL("game.json", sourceRoot));
const game = gameDocument3D.parse(JSON.parse(sourceBytes.toString("utf8")));
const document = JSON.parse(await readFile(nativeDocumentPath, "utf8"));
const comparison = JSON.parse(await readFile(new URL("comparison.json", import.meta.url), "utf8"));
const damage = arguments_.includes("--damage");
const routeBytes = await readFile(new URL(damage ? "damage.inputs.json" : "completion.inputs.json", import.meta.url));
const inputs = gameInputFrame3D.array().parse(JSON.parse(routeBytes.toString("utf8")));
const views = damage ? comparison.transientProbes.filter((probe) => probe.route === "damage.inputs.json") : [...comparison.views, ...comparison.transientProbes.filter((probe) => probe.route === "completion.inputs.json")];
const lastTick = Math.max(...views.map((view) => view.tick));
if (!Number.isInteger(lastTick) || lastTick < 0 || lastTick > inputs.length || lastTick > 1000 || views.length === 0) {
  throw new Error("BLACKSITE reference must use a bounded nonempty capture inventory");
}
const renderingOnly = arguments_.includes("--render-reference-only");
let captures = [];
if (renderingOnly) {
  captures = JSON.parse(await readFile(resolve(output, "capture-inventory.json"), "utf8"));
} else {
const reuseReference = option("--reuse-reference");
const session = reuseReference ? undefined : await createGameSession3D(game, comparison.seed);
const particles = reuseReference ? undefined : new GameParticles3D(game.tickRate);
try {
  const capture = async (frame, savedSamples) => {
    for (const view of views.filter((view) => view.tick === frame.tick)) {
      if (view.requireObservedDamageBeforeAcceptingFrame) {
        const armor = frame.ui?.nodes.find((node) => node.id === "hp-value");
        if (!armor || !Number.isFinite(Number(armor.text)) || Number(armor.text) >= 100) {
          throw new Error(`Damage reference tick ${frame.tick} has no observed armor loss`);
        }
      }
      const samples = savedSamples ?? gameParticleSamples3D(particles, 1);
      const native = nativeFrame.parse(controlledNativeFrame(frame, document, samples));
      const probe = {
        mode: "controlled-presentation-reference",
        gameplayAuthority: "legacy reference only; native gameplay must be validated independently",
        sourceDocumentDigest: digest(sourceBytes), routeDigest: digest(routeBytes), seed: comparison.seed, tick: frame.tick,
        resolution: comparison.resolution, cameraSource: "actual resolved legacy reference quaternion including recoil/roll",
        camera: native.camera, entityWorldTransforms: native.worldTransforms, particles: native.particles,
        environment: native.environment, ui: native.ui,
        legacyFrameDigest: digest(jsonBytes(frame)), legacyParticleSamplesDigest: digest(jsonBytes(samples)), nativeFrameDigest: digest(jsonBytes(native)), nativeAssets: document.assets.map(({ id, digest }) => ({ id, digest }))
      };
      const prefix = resolve(output, view.name);
      for (const [suffix, value] of [["legacy-frame.json", frame], ["legacy-particles.json", samples], ["native-frame.json", native], ["shared-probe.json", probe]]) {
        await writeFile(`${prefix}-${suffix}`, jsonBytes(value), { flag: "wx" });
      }
      captures.push({ name: view.name, tick: frame.tick, sharedProbeDigest: digest(jsonBytes(probe)), particles: samples.length });
    }
  };
  if (reuseReference) {
    for (const view of views) {
      const prefix = resolve(reuseReference, view.name);
      const frame = JSON.parse(await readFile(`${prefix}-legacy-frame.json`, "utf8"));
      const samples = JSON.parse(await readFile(`${prefix}-legacy-particles.json`, "utf8"));
      if (frame.tick !== view.tick) {
        throw new Error("Saved reference tick differs from capture inventory");
      }
      await capture(frame, samples);
    }
  } else {
  await capture(session.frame());
  for (let tick = 0; tick < lastTick; tick++) {
    const step = session.step(inputs[tick]);
    particles.tick(step.frame, session.takePresentationEvents());
    await capture(step.frame);
  }
  }
} finally {
  session?.dispose();
}
}

if (arguments_.includes("--capture-reference") || renderingOnly) {
  const { captureGameFrame3D } = await import("@nodetool-ai/game-renderer/node3d");
  const files = await readdir(new URL("assets/", sourceRoot));
  const selectedNames = option("--view")?.split(",");
  const selected = captures.filter((capture) => !selectedNames || selectedNames.includes(capture.name));
  if (selectedNames?.some((name) => !selected.some((capture) => capture.name === name))) {
    throw new Error("Reference selection contains an unknown capture name");
  }
  if (selected.length === 0) {
    throw new Error("Reference capture selection inspected no views");
  }
  for (const capture of selected) {
    const prefix = resolve(output, capture.name);
    const frame = JSON.parse(await readFile(`${prefix}-legacy-frame.json`, "utf8"));
    const samples = JSON.parse(await readFile(`${prefix}-legacy-particles.json`, "utf8"));
    const rendered = await captureGameFrame3D(frame, {
      width: comparison.resolution.width, height: comparison.resolution.height, interpolation: 1,
      particles: gameParticleFieldFromSamples3D(samples, frame), timeoutMs: 120000,
      resolveAsset: async (slot) => {
        const binding = game.assets[slot];
        const matches = binding ? files.filter((name) => name.startsWith(`${binding.assetId}.`)) : [];
        if (!binding || matches.length !== 1) {
          throw new Error(`Missing owned BLACKSITE reference asset: ${slot}`);
        }
        return { bytes: await readFile(new URL(`assets/${matches[0]}`, sourceRoot)), digest: binding.digest };
      }
    });
    await writeFile(`${prefix}-legacy.png`, rendered.png, { flag: "wx" });
    await writeFile(`${prefix}-legacy-report.json`, JSON.stringify({ renderer: "legacy-reference", sharedProbeDigest: capture.sharedProbeDigest, sourceFrameDigest: digest(await readFile(`${prefix}-legacy-frame.json`)), tick: capture.tick, width: comparison.resolution.width, height: comparison.resolution.height, stats: rendered.stats, capabilities: rendered.capabilities }, null, 2) + "\n", { flag: "wx" });
  }
}
if (!renderingOnly) {
  await writeFile(resolve(output, "capture-inventory.json"), JSON.stringify(captures, null, 2) + "\n", { flag: "wx" });
}
process.stdout.write(JSON.stringify({ output, mode: "legacy reference / controlled renderer probe only", captures }) + "\n");
