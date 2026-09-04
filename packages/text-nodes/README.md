# @nodetool-ai/text-nodes

Text-processing nodes for [NodeTool](https://nodetool.ai).

A pack of text nodes for NodeTool workflows: concatenate and template strings,
filter streams, embed and transcribe, and assemble SVG documents. HTML and
Markdown parsing moved to the `@nodetool-ai/sandbox-html` and
`@nodetool-ai/sandbox-markdown` sandbox packs, importable from a Code node.

The string-manipulation, comparison, regex, parsing, and token-counting node
classes were removed: `nodetool.code.Code` covers that ground in three lines of
JavaScript. Saved workflows keep working — `NODE_TYPE_MIGRATIONS` in
`packages/protocol/src/graph.ts` rewrites each removed type to a Code node with
the equivalent body prefilled.

## Install

```bash
npm install @nodetool-ai/text-nodes
```

## Nodes

### Composition

- `nodetool.text.Concat`, `nodetool.text.Template`, `nodetool.text.Prompt`, `nodetool.text.Collect`

### Stream filters

- `nodetool.text.FilterString`, `nodetool.text.FilterRegexString`

### Embeddings and speech

- `nodetool.text.Embedding`, `nodetool.text.AutomaticSpeechRecognition`

### I/O

- `nodetool.text.LoadTextAssets`, `nodetool.text.LoadTextFolder`, `nodetool.text.SaveText`, `nodetool.text.SaveTextFile`

### SVG

`lib.svg.Document` assembles an element list into a document; `lib.svg.SVGToImage`
rasterizes one through the native `sharp` addon. The 12 element builders (`Rect`,
`Circle`, `Text`, `Gradient`, …) were removed — an `svg_element` is a plain
object, so a Code node builds the whole list in one place, where the array order
is the paint order. The editor ships them as the `svg-*` snippets.

The `lib.nlp.*` nodes (tokenize, stem, classify, entities, sentiment, TF-IDF,
phonetic match) were removed with their 2,766 lines of vendored algorithms. No
replacement pack ships yet.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
