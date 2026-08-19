---
name: sandbox-tfjs
description: Classify and embed images, detect objects, and answer from a passage in a Code node or CodeAct action, with TensorFlow.js running on the host
---

# TensorFlow.js models in the sandbox

Specifier: `@nodetool-ai/sandbox-tfjs`. Import it at the top of the body.

The models are tens of megabytes of weights, fetched over the network and kept
between calls. The guest has neither the heap for them nor a way to keep
anything alive past a run, so this pack is a **host module**: the import
resolves to a generated facade over NodeTool's own implementation, and each
model loads once per process.

These models are small, local, and free — that is the whole reason to reach for
them. For anything a description or a caption would answer better, use a vision
model through `nodetool.media` instead.

## classify — ImageNet labels

```js
import { classify } from "@nodetool-ai/sandbox-tfjs";

const labels = await classify(await workspace.readBytes("photo.jpg"), { topK: 3 });
return { best: labels[0].className, probability: labels[0].probability };
```

MobileNet v2 over the 1000 ImageNet classes, most likely first. `topK` defaults
to 5.

## embed — a feature vector for an image

```js
import { embed } from "@nodetool-ai/sandbox-tfjs";

const vector = await embed(bytes);   // 1280 numbers
```

The MobileNet penultimate layer. Compare two vectors by cosine similarity for
near-duplicate detection or nearest-neighbour search.

## detect — objects with boxes

```js
import { detect } from "@nodetool-ai/sandbox-tfjs";

const objects = await detect(bytes, { maxBoxes: 10, minScore: 0.6 });
// [{ className: "person", score: 0.91, bbox: { x, y, width, height } }, …]
```

COCO-SSD over the 80 COCO classes. The box is in image pixels. `maxBoxes`
defaults to 20 and `minScore` to 0.5.

## answer — extractive question answering

```js
import { answer } from "@nodetool-ai/sandbox-tfjs";

const spans = await answer("When was it founded?", inputs.article);
return { answer: spans[0]?.text ?? null };
```

BERT QnA quotes the passage — it never writes prose. Each span carries a
`score` and its `startIndex`/`endIndex` in the passage.

## Gotchas

- **Every export is async**, and the first call to each model waits for its
  weights to download.
- **Images go in as encoded bytes** (PNG/JPEG/WebP), decoded through the
  sandbox's own `image` backend — so the same pixel caps `image.decode`
  enforces apply, and 10 MB is the input limit.
- **The models see pixels, nothing else.** `classify` on a screenshot of text
  answers with an ImageNet class, not with the text; that is
  `@nodetool-ai/sandbox-ocr`.
