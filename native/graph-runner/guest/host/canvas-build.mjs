// Timeline fonts are guest resources rather than build-machine file paths.
// The render-page module still needs its original file-relative base.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { addBundleAsset, bundleAssetsEnabled } from "../bundle-assets-build.mjs";
const registration = fileURLToPath(
  new URL("./canvas-fonts.mjs", import.meta.url)
);
const wrapper = fileURLToPath(new URL("./canvas.mjs", import.meta.url));
export function canvasPlugins() {
  return [
    {
      name: "canvas-resources",
      setup(build) {
        build.onLoad(
          {
            filter:
              /[\\/]timeline[\\/](?:src|dist)[\\/]fonts[\\/]register-node\.[jt]s$/
          },
          async (args) => {
            const extension = args.path.endsWith(".ts") ? "ts" : "js";
            const catalogPath = join(
              dirname(args.path),
              `catalog.${extension}`
            );
            const { BUNDLED_FONTS } = await import(
              pathToFileURL(catalogPath).href
            );
            if (
              !Array.isArray(BUNDLED_FONTS) ||
              !BUNDLED_FONTS.length ||
              BUNDLED_FONTS.length > 64
            ) {
              throw new Error(
                "canvas: bundled font catalog is empty or over budget"
              );
            }
            const directory = join(dirname(args.path), "../../fonts");
            const resources = [],
              watchFiles = [catalogPath];
            let size = 0;
            for (const face of BUNDLED_FONTS) {
              if (
                !/^[\w.-]+\.ttf$/.test(face.file) ||
                !/^OFL-[\w.-]+\.txt$/.test(face.license)
              ) {
                throw new Error("canvas: invalid bundled font catalog path");
              }
              const file = join(directory, face.file),
                license = join(directory, face.license),
                bytes = readFileSync(file);
              size += bytes.length;
              if (
                !bytes.length ||
                bytes.length > 16 * 1024 * 1024 ||
                size > 64 * 1024 * 1024
              ) {
                throw new Error(
                  "canvas: bundled font resource budget exceeded"
                );
              }
              resources.push({
                file: face.file,
                family: face.family,
                sha256: createHash("sha256").update(bytes).digest("hex"),
                licenseText: readFileSync(license, "utf8"),
                ...(bundleAssetsEnabled()
                  ? { asset: addBundleAsset(`fonts/${face.file}`, bytes) }
                  : { bytes: bytes.toString("base64") })
              });
              watchFiles.push(file, license);
            }
            return {
              contents: `
import { GlobalFonts } from ${JSON.stringify(wrapper)};
import { embeddedFontRegistration } from ${JSON.stringify(registration)};
import { BUNDLED_FONTS } from ${JSON.stringify(catalogPath)};
export function bundledFontsDir() { return null; }
export const registerBundledFonts=embeddedFontRegistration(GlobalFonts,BUNDLED_FONTS,${JSON.stringify(resources)});
`,
              loader: "js",
              resolveDir: dirname(args.path),
              watchFiles
            };
          }
        );
        build.onLoad(
          {
            filter:
              /[\\/]video-nodes[\\/](?:src|dist)[\\/]nodes[\\/]timeline[\\/]renderPage\.[jt]s$/
          },
          (args) => ({
            contents: readFileSync(args.path, "utf8").replace(
              /\bimport\.meta\.url\b/g,
              JSON.stringify(pathToFileURL(args.path).href)
            ),
            loader: args.path.endsWith(".ts") ? "ts" : "js",
            resolveDir: dirname(args.path)
          })
        );
      }
    }
  ];
}
