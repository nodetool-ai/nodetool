import Prism from "prismjs";

// Attach Prism to global scope so libraries that expect global Prism can use it.
const globalWithPrism = globalThis as typeof globalThis & { Prism?: typeof Prism };
if (typeof globalWithPrism.Prism === "undefined") {
  globalWithPrism.Prism = Prism;
}

// Load common languages
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";

// ... rest of the file remains unchanged ...
