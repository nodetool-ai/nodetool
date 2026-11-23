import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  createEditor,
  type LexicalEditor
} from "lexical";
import {
  identifyBlocks,
  serializeMarkdownBlocks,
  splitMarkdownBlocks,
  type MarkdownBlockDocument
} from "@nodetool-ai/protocol";

import {
  DOCUMENT_NODES,
  MarkdownDocumentBinding
} from "../markdownBlockCodec";

const idCounter = () => {
  let next = 0;
  return () => `b${++next}`;
};

const toDocument = (source: string): MarkdownBlockDocument => {
  const split = splitMarkdownBlocks(source);
  return {
    leading: split.leading,
    blocks: identifyBlocks([], split.blocks, idCounter())
  };
};

const open = (source: string) => {
  const editor: LexicalEditor = createEditor({
    namespace: "test",
    nodes: [...DOCUMENT_NODES],
    onError: (error) => {
      throw error;
    }
  });
  const binding = new MarkdownDocumentBinding(idCounter());
  const document = toDocument(source);
  binding.load(editor, document);
  binding.attach(editor);
  const save = () =>
    serializeMarkdownBlocks(binding.serialize(editor.getEditorState()));
  return { editor, binding, document, save };
};

/** Replace the content of top-level node `index` with plain `text`. */
const setText = (editor: LexicalEditor, index: number, text: string) => {
  editor.update(
    () => {
      const top = $getRoot().getChildren()[index];
      if ($isElementNode(top)) {
        top.clear();
        top.append($createTextNode(text));
      }
    },
    { discrete: true }
  );
};

const SAMPLE = [
  "---",
  "title: Launch notes",
  "---",
  "",
  "# Launch   notes",
  "Intro with *emphasis* and __strong__ text.",
  "",
  "* first",
  "* second",
  "",
  "1) one",
  "2) two",
  "",
  "- [ ] open task",
  "- [x] done task",
  "",
  "| Name | Value |",
  "|:-----|------:|",
  "| a    | 1     |",
  "",
  "```ts",
  "const x = 1;",
  "",
  "const y = 2;",
  "```",
  "",
  "> quoted",
  "> lines",
  "",
  "***",
  "",
  "![Diagram](assets/diagram.png \"Flow\")",
  "",
  "<details>",
  "<summary>More</summary>",
  "</details>",
  "",
  "[ref]: https://example.com",
  "",
  "Last paragraph",
  ""
].join("\n");

describe("MarkdownDocumentBinding", () => {
  it("writes an unedited document back byte for byte", () => {
    const { save } = open(SAMPLE);
    expect(save()).toBe(SAMPLE);
  });

  it("writes every Markdown file in the repository docs back unchanged", () => {
    const root = resolve(__dirname, "../../../../../docs");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".md")) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    // Every tenth file keeps the suite fast; the protocol suite splits all.
    for (const file of files.sort().filter((_, index) => index % 10 === 0)) {
      const source = readFileSync(file, "utf8");
      expect(open(source).save()).toBe(source);
    }
  });

  it("rewrites only the block an edit touched", () => {
    const { editor, save } = open(SAMPLE);
    // Top-level 0 is the front matter, 1 the heading, 2 the intro paragraph.
    setText(editor, 2, "A new intro.");
    const saved = save();
    expect(saved).toBe(
      SAMPLE.replace("Intro with *emphasis* and __strong__ text.", "A new intro.")
    );
  });

  it("keeps the source bytes when an edit is reverted", () => {
    const { editor, save } = open(SAMPLE);
    setText(editor, 1, "Changed");
    setText(editor, 1, "Launch   notes");
    expect(save()).toBe(SAMPLE);
  });

  it("separates an inserted paragraph by a blank line and keeps its id", () => {
    const { editor, binding, save } = open("# Title\n\nBody\n");
    editor.update(
      () => {
        const paragraph = $createParagraphNode().append($createTextNode("Inserted"));
        $getRoot().getChildren()[0].insertAfter(paragraph);
      },
      { discrete: true }
    );
    expect(save()).toBe("# Title\n\nInserted\n\nBody\n");
    const first = binding.serialize(editor.getEditorState()).blocks[1].id;
    const second = binding.serialize(editor.getEditorState()).blocks[1].id;
    expect(first).toBe(second);
  });

  it("ends a new document with a newline and keeps block ids", () => {
    const { editor, binding, document, save } = open("");
    expect(document.blocks).toEqual([]);
    editor.update(
      () => {
        const paragraph = $getRoot().getFirstChild();
        if ($isElementNode(paragraph)) paragraph.append($createTextNode("Hello"));
      },
      { discrete: true }
    );
    expect(save()).toBe("Hello\n");
    const ids = binding.serialize(editor.getEditorState()).blocks.map((b) => b.id);
    expect(ids).toHaveLength(1);
  });

  it("keeps the ids of untouched blocks across edits", () => {
    const { editor, binding, document } = open("one\n\ntwo\n\nthree\n");
    setText(editor, 1, "TWO");
    const after = binding.serialize(editor.getEditorState());
    expect(after.blocks.map((block) => block.id)).toEqual(
      document.blocks.map((block) => block.id)
    );
    expect(after.blocks[1].text).toBe("TWO");
  });
});
