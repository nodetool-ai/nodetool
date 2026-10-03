/**
 * Prism core, exposed as the global its language files read.
 *
 * Every `prismjs/components/prism-*` file refers to a bare global `Prism`.
 * Import order is evaluation order, but an assignment in the importing
 * module's body runs after all of that module's imports. Set the global here,
 * in a module of its own, and import it before any language file.
 */
import Prism from "prismjs";

const globalWithPrism = globalThis;
if (typeof globalWithPrism.Prism === "undefined") {
  globalWithPrism.Prism = Prism;
}

export default Prism;
