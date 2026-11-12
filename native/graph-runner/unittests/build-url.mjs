import { build } from "esbuild";
import { fileURLToPath as nodeFileURLToPath, pathToFileURL as nodePathToFileURL } from "node:url";
import { urlCases } from "./url-cases.mjs";
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
// This corpus uses POSIX paths, including when the reference runs on Windows.
const fileURLToPath = value => nodeFileURLToPath(value, { windows: false });
const pathToFileURL = value => nodePathToFileURL(value, { windows: false });
const expected = urlCases.map(expression => String(eval(expression)));
await build({
  stdin: {
    contents: `import { URL, URLSearchParams, fileURLToPath, pathToFileURL } from './guest/host/url.mjs';
      const actual=[${urlCases.map(expression => `String(${expression})`).join(",")}], expected=${JSON.stringify(expected)};
      actual.forEach((value,i) => {
        if(value!==expected[i]) throw new Error(${JSON.stringify(urlCases)}[i]+': expected '+JSON.stringify(expected[i])+', got '+JSON.stringify(value)); });
      globalThis.result=actual.length+' URL/encoding checks passed';`,
    resolveDir: nodeFileURLToPath(new URL("../", import.meta.url)),
  },
  bundle: true, format: "iife", platform: "browser", target: "es2022",
  banner: {js:textEncodingBanner}, outfile:process.argv[2],
});
