/**
 * Builds the read-only timeline editor demo (timeline-embed.html) as a static
 * page for the marketing site: `npm run build:timeline-embed`.
 *
 * Output goes to marketing/public/embed/timeline/, served at
 * /embed/timeline/. The app's own config supplies resolution, stubs and
 * plugins. This file changes the entry, the base path and the output folder,
 * and three things the marketing site needs:
 *
 * - Typefaces load from next to the page, because the app reads them from
 *   the API server. Only the faces the demo films use are copied.
 * - The interface is English only. The app bundles every UI language.
 * - Chunks the demo never loads are not written. The timeline modules import
 *   most of the app (node editor, code editor, charts, 3D), so a full build
 *   is over 60 MB. The demo loads the entry, its static imports, the film it
 *   shows and the WebGPU compositor. Any other lazy import fails in the demo,
 *   and the demo offers no control that reaches one.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ConfigEnv, type Plugin, type UserConfig } from "vite";

import appConfig from "./vite.config";
import { englishOnlyPlugin, pruneUnusedChunksPlugin } from "./vite.embed-plugins";

const configDir = dirname(fileURLToPath(import.meta.url));
const BASE = "/embed/timeline/";
const OUT_DIR = resolve(configDir, "../marketing/public/embed/timeline");
const FONT_SOURCE = resolve(configDir, "../packages/timeline/fonts");
const APP_FONT_PATH = "/api/assets/packages/timeline/fonts/";

/** The faces Kite, Serein and Cadence set text in, with their licenses. */
const EMBED_FONTS = [
  "Inter-Variable.ttf",
  "Inter-SemiBold.ttf",
  "Inter-ExtraBold.ttf",
  "SpaceGrotesk-Variable.ttf",
  "JetBrainsMono-Variable.ttf",
  "Lora-Variable.ttf",
  "Lora-Italic-Variable.ttf",
  "OFL-Inter.txt",
  "OFL-SpaceGrotesk.txt",
  "OFL-JetBrainsMono.txt",
  "OFL-Lora.txt"
] as const;

/** Lazy chunks the demo loads, by the module they start from. */
const RUNTIME_LAZY_MODULES = [
  /examples\/timelines\/[\w-]+\.timeline\.json$/,
  /components\/timeline\/preview\/gpu\/compositor\.ts$/
];

/**
 * Point fonts.css at fonts copied next to the page, drop the faces the demo
 * films do not use, and copy the rest.
 */
function embedFontsPlugin(): Plugin {
  return {
    name: "timeline-embed-fonts",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("components/timeline/fonts.css")) {
        return null;
      }
      const faces = code.split(/(?=@font-face)/);
      return faces
        .filter((face) => {
          const file = /packages\/timeline\/fonts\/([^"]+)"/.exec(face)?.[1];
          return file === undefined || (EMBED_FONTS as readonly string[]).includes(file);
        })
        .join("")
        .replaceAll(APP_FONT_PATH, `${BASE}fonts/`);
    },
    writeBundle() {
      const target = resolve(OUT_DIR, "fonts");
      mkdirSync(target, { recursive: true });
      for (const file of EMBED_FONTS) {
        copyFileSync(resolve(FONT_SOURCE, file), resolve(target, file));
      }
    }
  };
}

export default defineConfig(async (env: ConfigEnv) => {
  const resolved = (await (typeof appConfig === "function" ? appConfig(env) : appConfig)) as UserConfig;
  const build = resolved.build ?? {};
  return {
    ...resolved,
    base: BASE,
    publicDir: false,
    plugins: [
      embedFontsPlugin(),
      englishOnlyPlugin(),
      ...(resolved.plugins ?? []),
      pruneUnusedChunksPlugin(RUNTIME_LAZY_MODULES)
    ],
    build: {
      ...build,
      outDir: OUT_DIR,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        ...build.rollupOptions,
        input: resolve(configDir, "timeline-embed.html")
      }
    }
  } satisfies UserConfig;
});
