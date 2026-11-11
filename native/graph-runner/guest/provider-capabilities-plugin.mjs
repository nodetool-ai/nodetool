import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sandboxBootstrapSource } from "./sandbox-bootstrap-source.mjs";
const require = createRequire(import.meta.url);
const subtitleRoot = join(dirname(require.resolve("subtitle")), "..", "src");
const avSource = fileURLToPath(
  new URL("../../../packages/agents/src/sandbox-av-media.ts", import.meta.url)
);
const avNative = fileURLToPath(
  new URL("./host/sandbox-av-native.mjs", import.meta.url)
);
const adapter = fileURLToPath(
  new URL("./host/provider-video.mjs", import.meta.url)
);
export function providerCapabilitiesPlugin() {
  return {
    name: "native-provider-capabilities",
    setup(build) {
      build.onResolve({ filter: /^\.\/sandbox-av-media\.js$/ }, (args) =>
        /[/\\]agents[/\\](src|dist)[/\\]/.test(args.importer)
          ? { path: avNative }
          : undefined
      );
      build.onResolve({ filter: /^nodetool:code-audio-dsp$/ }, () => ({
        path: "code-audio-dsp",
        namespace: "native-audio-dsp"
      }));
      build.onLoad({ filter: /.*/, namespace: "native-audio-dsp" }, () => {
        const source = readFileSync(avSource, "utf8");
        const start = source.indexOf("async function wavData(");
        const a = source.indexOf("  const wav = await convert(", start),
          b = source.indexOf("  return parseWav(wav, maxBytes, signal);", a);
        if (start < 0 || a < 0 || b < 0)
          throw new Error("Canonical Code audio decode anchors are missing");
        return {
          contents:
            `import {nativeAudioData} from ${JSON.stringify(avNative)};\n` +
            source.slice(0, a) +
            "  return nativeAudioData(bytes, signal, maxBytes);" +
            source.slice(
              b + "  return parseWav(wav, maxBytes, signal);".length
            ) +
            "\nexport {encodeWav as encodeNativeWav};",
          loader: "ts",
          resolveDir: dirname(avSource)
        };
      });
      // The host contract uses subtitle's synchronous leaf functions. Its package
      // barrel also eagerly loads Node stream adapters that these calls never use.
      build.onResolve({ filter: /^(subtitle|\.)$/ }, (args) =>
        args.path === "subtitle" ||
        /[/\\]subtitle[/\\]src[/\\]/.test(args.importer)
          ? { path: "subtitle-core", namespace: "native-subtitle" }
          : undefined
      );
      build.onLoad({ filter: /.*/, namespace: "native-subtitle" }, () => ({
        contents: [
          "parseSync",
          "stringifySync",
          "parseTimestamp",
          "parseTimestamps",
          "formatTimestamp"
        ]
          .map(
            (name) =>
              `export * from ${JSON.stringify(join(subtitleRoot, name + ".ts"))};`
          )
          .join("\n"),
        loader: "js",
        resolveDir: subtitleRoot
      }));
      build.onLoad({ filter: /[/\\]exifr[/\\]dist[/\\].*\.mjs$/ }, (args) => ({
        contents: "const self=globalThis;\n" + readFileSync(args.path, "utf8"),
        loader: "js"
      }));
      // These browser builds otherwise mistake the virtual process for Node.
      build.onLoad(
        {
          filter:
            /[/\\](pdfjs-dist[/\\]legacy[/\\]build[/\\]pdf(\.worker)?\.mjs|pdf-parse[/\\]dist[/\\]pdf-parse[/\\]web[/\\]pdf-parse\.es\.js)$/
        },
        (args) => ({
          contents:
            'const process=undefined;const navigator={platform:"",userAgent:"",language:"en-US",...globalThis.navigator};\n' +
            readFileSync(args.path, "utf8"),
          loader: "js"
        })
      );
      build.onResolve({ filter: /^\.\/epub\.js$/ }, (args) =>
        /[/\\]agents[/\\](src|dist)[/\\]host-modules[/\\]/.test(args.importer)
          ? {
              path: fileURLToPath(
                new URL("./host/sandbox-epub.mjs", import.meta.url)
              )
            }
          : undefined
      );
      build.onResolve({ filter: /^nodetool:sandbox-bootstrap$/ }, () => ({
        path: "sandbox-bootstrap",
        namespace: "native-sandbox-bootstrap"
      }));
      build.onLoad(
        { filter: /.*/, namespace: "native-sandbox-bootstrap" },
        () => ({
          contents: `export default ${JSON.stringify(sandboxBootstrapSource)};`,
          loader: "js"
        })
      );
      build.onResolve({ filter: /^\.\/video-frames\.js$/ }, (args) =>
        /[/\\]runtime[/\\]dist[/\\]providers[/\\]/.test(args.importer)
          ? { path: adapter }
          : undefined
      );
    }
  };
}
