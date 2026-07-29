/** @jsxImportSource @emotion/react */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { registerCodeHighlighting } from "@lexical/code";

// Import Prism and attach to global scope so @lexical/code can access it.
import Prism from "prismjs";

const globalWithPrism = globalThis as typeof globalThis & { Prism?: typeof Prism };
if (typeof globalWithPrism.Prism === "undefined") {
  globalWithPrism.Prism = Prism;
}

// Load additional languages (tree-shaken by bundler if unused)
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";

import "prismjs/themes/prism-tomorrow.css";

export function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}
