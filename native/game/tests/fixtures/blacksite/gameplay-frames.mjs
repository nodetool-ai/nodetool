import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { nativeGame3dDocument, nativeFrame3D } from "@nodetool-ai/protocol/native-game";
import { NativeGameWorker, nativeCppFrameDigest } from "@nodetool-ai/game-runtime/native";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) { throw new Error(`Required option: ${name}`); } return resolve(args[index + 1]); };
const documentPath = option("--document"), executable = option("--worker"), output = option("--out");
const rawDocument = await readFile(documentPath);
const game = nativeGame3dDocument.parse(JSON.parse(rawDocument));
const routeBytes = await readFile(new URL("completion.inputs.json", import.meta.url));
const route = JSON.parse(routeBytes);
const assertions = JSON.parse(await readFile(new URL("completion.assertions.json", import.meta.url), "utf8"));
if (route.length !== 583) { throw new Error("BLACKSITE gameplay evidence requires the complete route"); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(output, { recursive: true });
const worker = new NativeGameWorker({ executable });
const signal = AbortSignal.timeout(120000);
const frames = [], hashes = [], observedAssertions = [];
const sessionId = "blacksite-gameplay";
const started = performance.now();
let saved;
const observe = async (frame) => {
  for (const assertion of assertions.filter((entry) => entry.tick === frame.tick)) {
    const actual = assertion.path.reduce((value, key) => value?.[key], frame);
    if (!isDeepStrictEqual(actual, assertion.equals)) { throw new Error(`Gameplay assertion failed at ${frame.tick}: ${assertion.path.join(".")}`); }
    observedAssertions.push({ ...assertion, actual });
  }
  if ([0, 5, 24, 70, 120, 583].includes(frame.tick)) {
    const bytes = JSON.stringify(frame, null, 2) + "\n";
    const name = `native-gameplay-${frame.tick}.json`;
    await writeFile(resolve(output, name), bytes, { flag: "wx" });
    const provenance = { mode: "actual-native-cpp-gameplay-frame", sourceDocumentDigest: sha256(rawDocument), routeDigest: sha256(routeBytes), seed: 1, tick: frame.tick, resolution: { width: 1280, height: 720 }, nativeFrameDigest: sha256(bytes), nativeAssets: game.assets.map(({ id, digest }) => ({ id, digest })) };
    await writeFile(resolve(output, `native-gameplay-${frame.tick}-probe.json`), JSON.stringify(provenance, null, 2) + "\n", { flag: "wx" });
    frames.push({ tick: frame.tick, file: name, sourceFrameDigest: sha256(bytes), particles: frame.particles.length, score: frame.score });
  }
};
try {
  const capabilities = await worker.request("hello", {}, { signal });
  await worker.request("open", { sessionId, document: game }, { signal });
  await observe(nativeFrame3D.parse(await worker.request("start", { sessionId, seed: 1 }, { signal })));
  for (let tick = 0; tick < route.length; tick++) {
    const frame = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] }, { signal }));
    if (frame.hostRequests.length) { throw new Error("Gameplay collector does not implement a save host"); }
    await observe(frame);
    if (frame.tick === 291) { saved = await worker.request("snapshot", { sessionId }, { signal }); }
    if (frame.tick > 291) { hashes.push(nativeCppFrameDigest(frame)); }
  }
  if (observedAssertions.length !== assertions.length) { throw new Error("Gameplay collector did not inspect every assertion"); }
  await worker.request("restore", { sessionId, snapshot: saved }, { signal });
  for (let tick = 291; tick < route.length; tick++) {
    const frame = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] }, { signal }));
    if (nativeCppFrameDigest(frame) !== hashes[tick - 291]) { throw new Error(`Native replay differs at ${tick + 1}`); }
  }
  const report = { mode: "actual-native-cpp-gameplay", executable, workerDigest: sha256(await readFile(executable)), sourceDocumentDigest: sha256(rawDocument), routeDigest: sha256(routeBytes), seed: 1, ticks: route.length, capabilities, observedAssertions, replayVerified: true, replayTicks: hashes.length, elapsedMs: performance.now() - started, frames };
  await writeFile(resolve(output, "gameplay-evidence.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify(report) + "\n");
} finally {
  worker.close();
}
