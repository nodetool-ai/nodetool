import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await copyFile(new URL("./data/index.json", import.meta.url), new URL("./dist/index.json", import.meta.url));
await writeFile(new URL("./dist/nodes.ndjson.gz", import.meta.url), gzipSync(
  await readFile(new URL("./data/nodes.ndjson", import.meta.url)), { level: 9 }
));
