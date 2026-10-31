import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const [moduleFile, directory, reportFile] = process.argv.slice(2);
if (!moduleFile || !directory) {
  throw new Error(
    "Usage: wasm-model-assets-test.mjs <native-game.mjs> <closed-asset-directory> [report.json]"
  );
}
const factory = (await import(pathToFileURL(resolve(moduleFile)))).default;
const module = await factory({
  wasmBinary: await readFile(resolve(dirname(moduleFile), "native-game.wasm"))
});
const manifest = JSON.parse(
  await readFile(resolve(directory, "native-assets.json"), "utf8")
);
const byId = new Map(manifest.map((asset) => [asset.id, asset])),
  verified = new Map();
if (byId.size !== manifest.length) throw Error("Duplicate closed manifest IDs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
module.FS.mkdir("/assets");
module.FS.mkdir("/assets/assets");
for (const asset of manifest) {
  if (
    asset.path.startsWith("/") ||
    asset.path.includes(":") ||
    asset.path.includes(String.fromCharCode(92)) ||
    asset.path.split("/").some((part) => part === ".." || part === ".")
  )
    throw Error("Invalid closed source path");
  const bytes = await readFile(resolve(directory, asset.path));
  if (
    bytes.length !== asset.size ||
    bytes.length > 8388608 ||
    hash(bytes) !== asset.digest
  )
    throw Error("Source size, cap or digest mismatch " + asset.id);
  verified.set(asset.id, bytes);
  module.FS.mkdirTree("/assets/" + dirname(asset.path));
  module.FS.writeFile("/assets/" + asset.path, bytes);
}
const context = module._ng_create(),
  results = [];
const models = manifest.filter((asset) => asset.kind === "model");
if (models.length === 0) throw Error("Closed fixture has no models");
for (const asset of models) {
  const closure = new Set(),
    pending = [asset.id];
  while (pending.length) {
    const id = pending.pop();
    if (closure.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) throw Error("Unknown closure asset " + id);
    closure.add(id);
    pending.push(...(entry.dependencies || []));
  }
  const closureBytes = [...closure].reduce(
    (sum, id) => sum + byId.get(id).size,
    0
  );
  if (closureBytes > 16777216)
    throw Error("Model dependency closure exceeds16MiB");
  const text = JSON.stringify({
    protocolVersion: 1,
    requestId: asset.id,
    operation: "prepareModel",
    sessionId: "material-proof",
    manifest,
    id: asset.id
  });
  const bytes = new TextEncoder().encode(text),
    pointer = module._malloc(bytes.length);
  module.HEAPU8.set(bytes, pointer);
  const at = performance.now();
  const code = module._ng_dispatch(context, pointer, bytes.length);
  module._free(pointer);
  const length = module._ng_response_length(context);
  if (length < 1 || length > 16777216)
    throw Error("Response violates16MiB cap");
  const response = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      module.HEAPU8.slice(
        module._ng_response_pointer(context),
        module._ng_response_pointer(context) + length
      )
    )
  );
  let sourceBytes = 0;
  if (response.status === "ok") {
    for (const image of response.result.images) {
      if ("bytes" in image || !image.source)
        throw Error("Image descriptor-only contract failed");
      const source = image.source;
      if (!closure.has(source.assetId))
        throw Error("Image outside selected model closure");
      const data = verified.get(source.assetId);
      if (
        !Number.isSafeInteger(source.offset) ||
        !Number.isSafeInteger(source.length) ||
        source.offset < 0 ||
        source.length < 1 ||
        source.offset + source.length > data.length ||
        source.offset + source.length > 8388608
      )
        throw Error("Image range out of bounds");
      const encoded = data.subarray(
        source.offset,
        source.offset + source.length
      );
      if (hash(encoded) !== source.digest)
        throw Error("Image range digest mismatch");
      if (
        image.mimeType === "image/png" &&
        !encoded
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw Error("PNG signature mismatch");
      if (
        image.mimeType === "image/jpeg" &&
        !(encoded[0] === 255 && encoded[1] === 216 && encoded[2] === 255)
      )
        throw Error("JPEG signature mismatch");
      if (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg")
        throw Error("Unsupported image MIME");
      sourceBytes += source.length;
    }
  }
  results.push({
    id: asset.id,
    fileBytes: asset.size,
    closureBytes,
    code,
    status: response.status,
    error: response.error,
    responseBytes: length,
    preparedModelDigest: response.status === "ok" ? hash(JSON.stringify(response.result)) : null,
    elapsedMs: performance.now() - at,
    images: response.result?.images?.length,
    verifiedImageBytes: sourceBytes,
    heapExtent: module.HEAPU8.byteLength
  });
}
module._ng_destroy(context);
if (reportFile)
  await writeFile(resolve(reportFile), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
if (results.some((result) => result.status !== "ok")) process.exitCode = 1;
