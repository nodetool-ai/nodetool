/** @jsxImportSource @emotion/react */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { registerCodeHighlighting } from "@lexical/code";

// Import Prism and attach to global scope so @lexical/code can access it.
import Prism from "prismjs";

if (typeof (globalThis as any).Prism === "undefined") {
  (globalThis as any).Prism = Prism;
}

// Load additional languages (tree-shaken by bundler if unused)
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";

// A simple Lexical plugin that enables code syntax highlighting.
// Code highlighting is always active while this plugin is mounted.
export function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}
