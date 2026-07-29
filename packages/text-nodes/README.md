# @nodetool-ai/text-nodes

Text-processing nodes for [NodeTool](https://nodetool.ai).

A pack of text nodes for NodeTool workflows: manipulate and template strings,
match and replace with regex, tokenize and embed, run NLP (tokenizing, stemming,
sentiment, entity extraction), parse HTML and Markdown, and build SVG.

## Install

```bash
npm install @nodetool-ai/text-nodes
```

## Nodes

### Manipulation

- `nodetool.text.Concat`, `nodetool.text.Join`, `nodetool.text.Split`, `nodetool.text.Slice`, `nodetool.text.Replace`
- `nodetool.text.Template`, `nodetool.text.Prompt`, `nodetool.text.PadText`, `nodetool.text.SurroundWith`, `nodetool.text.TruncateText`
- `nodetool.text.CollapseWhitespace`, `nodetool.text.TrimWhitespace`, `nodetool.text.RemovePunctuation`, `nodetool.text.Slugify`, `nodetool.text.StripAccents`
- Case: `nodetool.text.ToLowercase`, `nodetool.text.ToUppercase`, `nodetool.text.ToTitlecase`, `nodetool.text.CapitalizeText`, `nodetool.text.ToString`

### Compare and predicates

- `nodetool.text.Compare`, `nodetool.text.Equals`, `nodetool.text.Contains`, `nodetool.text.StartsWith`, `nodetool.text.EndsWith`
- `nodetool.text.IsEmpty`, `nodetool.text.HasLength`, `nodetool.text.IndexOf`, `nodetool.text.Length`

### Regex

- `nodetool.text.RegexMatch`, `nodetool.text.RegexReplace`, `nodetool.text.RegexSplit`, `nodetool.text.RegexValidate`
- `nodetool.text.FindAllRegex`, `nodetool.text.ExtractRegex`, `nodetool.text.FilterRegexString`, `nodetool.text.FilterString`

### Extract and parse

- `nodetool.text.Extract`, `nodetool.text.ExtractJSON`, `nodetool.text.ParseJSON`, `nodetool.text.Chunk`, `nodetool.text.Collect`

### Tokens and embeddings

- `nodetool.text.CountTokens`, `nodetool.text.Embedding`
- `nodetool.text.AutomaticSpeechRecognition`

### I/O

- `nodetool.text.LoadTextAssets`, `nodetool.text.LoadTextFolder`, `nodetool.text.SaveText`, `nodetool.text.SaveTextFile`

### NLP

`lib.nlp.Tokenize`, `lib.nlp.Stem`, `lib.nlp.ClassifyText`, `lib.nlp.ExtractEntities`,
`lib.nlp.SentimentAnalysis`, `lib.nlp.TfIdf`, `lib.nlp.PhoneticMatch`.

### Markdown

`lib.markdown.ExtractHeaders`, `lib.markdown.ExtractLinks`, `lib.markdown.ExtractBulletLists`,
`lib.markdown.ExtractNumberedLists`, `lib.markdown.ExtractCodeBlocks`, `lib.markdown.ExtractTables`.

### HTML

`lib.html.HTMLToText`, `lib.html.WebsiteContentExtractor`, `lib.html.ExtractLinks`,
`lib.html.ExtractImages`, `lib.html.ExtractVideos`, `lib.html.ExtractAudio`,
`lib.html.ExtractMetadata`, `lib.html.BaseUrl`. Also `nodetool.text.HtmlToText`.

### SVG

`lib.svg.Document`, `lib.svg.Rect`, `lib.svg.Circle`, `lib.svg.Ellipse`, `lib.svg.Line`,
`lib.svg.Path`, `lib.svg.Polygon`, `lib.svg.Text`, `lib.svg.Gradient`, `lib.svg.Transform`,
`lib.svg.ClipPath`, `lib.svg.DropShadow`, `lib.svg.GaussianBlur`, `lib.svg.SVGToImage`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
