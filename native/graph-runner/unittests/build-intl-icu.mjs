import { build } from "esbuild";
import { fileURLToPath } from "node:url";
await build({ entryPoints:[fileURLToPath(new URL("./intl-icu.test.mjs",import.meta.url))], outfile:process.argv[2], bundle:true,format:"esm",platform:"browser",target:"es2022" });
