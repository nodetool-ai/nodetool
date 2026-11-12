// Bundled fonts are immutable guest resources. Registration consumes only the
// approved corpus the build wrote to the bundle assets, never a runtime path
// or system font.
import { readBundleAsset } from "./bundle-assets.mjs";

export function embeddedFontRegistration(GlobalFonts, catalog, embedded) {
  let done = null;
  return function registerBundledFonts() {
    if (done) {
      return done;
    }
    const registered = [];
    for (const face of catalog) {
      const entry = embedded.find(
        (item) => item.file === face.file && item.family === face.family
      );
      if (
        !entry ||
        !entry.licenseText ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      ) {
        throw new Error(
          `canvas: bundled font resource is missing: ${face.file}`
        );
      }
      const bytes = entry.asset ? readBundleAsset(entry.asset) : decodeBase64(entry.bytes);
      // The intrinsic name table determines the family, as in register-node.
      if (!GlobalFonts.register(bytes)) {
        throw new Error(`canvas: bundled font rejected: ${face.file}`);
      }
      registered.push(face.file);
    }
    // There is no filesystem directory in an embedded corpus. In particular,
    // callers must not turn the resource marker into an authorized file path.
    done = Object.freeze({
      dir: null,
      registered: Object.freeze(registered),
      missing: Object.freeze([])
    });
    return done;
  };
}

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
