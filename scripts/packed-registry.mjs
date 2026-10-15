import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

export function artifactIntegrity(file) {
  return `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`;
}

export function publicRegistryUrl(requestTarget) {
  if (typeof requestTarget !== "string" || !requestTarget.startsWith("/") || requestTarget.startsWith("//") || requestTarget.includes("\\")) {
    throw new Error("Registry requests must use an origin-form path");
  }
  const target = new URL("https://registry.npmjs.org");
  const incoming = new URL(requestTarget, target);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

/** Serve original release bytes in a worker so synchronous CLI probes cannot block npm. */
export async function startPackedRegistry(tarballs) {
  const worker = new Worker(new URL(import.meta.url), { workerData: tarballs });
  const url = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", code => reject(new Error(`Packed registry exited ${code} before startup`)));
  });
  return { url, close: () => worker.terminate() };
}

if (!isMainThread) {
  const artifacts = new Map();
  for (const [name, file] of Object.entries(workerData)) {
    const result = spawnSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf8" });
    if (result.status !== 0) { throw new Error(`Cannot read artifact ${file}: ${result.stderr}`); }
    const manifest = JSON.parse(result.stdout);
    if (manifest.name !== name || !manifest.version) { throw new Error(`Artifact identity differs: ${name}`); }
    artifacts.set(name, { manifest, bytes: readFileSync(file), integrity: artifactIntegrity(file) });
  }
  if (!artifacts.size) { throw new Error("Packed registry inspected no artifacts"); }
  let origin;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET") { response.writeHead(405).end(); return; }
      const upstreamUrl = publicRegistryUrl(request.url);
      const path = decodeURIComponent(upstreamUrl.pathname);
      const tarball = path.startsWith("/tarballs/");
      const name = path.slice(tarball ? "/tarballs/".length : 1);
      const artifact = artifacts.get(name);
      if (artifact) {
        if (tarball) { response.end(artifact.bytes); return; }
        const { manifest, integrity } = artifact;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ name, "dist-tags": { latest: manifest.version, staging: manifest.version }, versions: {
          [manifest.version]: { ...manifest, dist: { integrity, tarball: `${origin}/tarballs/${encodeURIComponent(name)}` } }
        } }));
        return;
      }
      if (tarball || name.startsWith("@nodetool-ai/")) { response.writeHead(404).end("Missing original release artifact"); return; }
      const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(120_000), redirect: "error" });
      response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) { response.writeHead(500).end(String(error)); }
  });
  server.listen(0, "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    parentPort.postMessage(origin);
  });
}
