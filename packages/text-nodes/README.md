# @nodetool-ai/text-nodes

Text-processing nodes for [NodeTool](https://nodetool.ai).

A pack of text nodes for NodeTool workflows: concatenate and template strings,
filter streams, embed and transcribe, run NLP (tokenizing, stemming,
sentiment, entity extraction), and build SVG. HTML and Markdown parsing moved
to the `@nodetool-ai/sandbox-html` and `@nodetool-ai/sandbox-markdown` sandbox
packs, importable from a Code node.

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

### NLP

`lib.nlp.Tokenize`, `lib.nlp.Stem`, `lib.nlp.ClassifyText`, `lib.nlp.ExtractEntities`,
`lib.nlp.SentimentAnalysis`, `lib.nlp.TfIdf`, `lib.nlp.PhoneticMatch`.

### SVG

`lib.svg.Document`, `lib.svg.Rect`, `lib.svg.Circle`, `lib.svg.Ellipse`, `lib.svg.Line`,
`lib.svg.Path`, `lib.svg.Polygon`, `lib.svg.Text`, `lib.svg.Gradient`, `lib.svg.Transform`,
`lib.svg.ClipPath`, `lib.svg.DropShadow`, `lib.svg.GaussianBlur`, `lib.svg.SVGToImage`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
