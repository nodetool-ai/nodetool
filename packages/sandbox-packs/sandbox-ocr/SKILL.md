---
name: sandbox-ocr
description: Read the text in an image from a Code node or CodeAct action, with tesseract.js running on the host
---

# OCR in the sandbox

Specifier: `@nodetool-ai/sandbox-ocr`. Import it at the top of the body.

tesseract.js runs a WASM engine, spawns workers, and downloads its language
data on first use — none of which the guest can do. This pack is a **host
module**: the import resolves to a generated facade over NodeTool's own
implementation.

## recognize — image bytes to text

```js
import { recognize } from "@nodetool-ai/sandbox-ocr";

const { text, confidence, words } = await recognize(
  await workspace.readBytes("receipt.png")
);
const total = words.find((w) => /^\d+[.,]\d{2}$/.test(w.text));
return { text, confidence, total: total?.text ?? null };
```

One call gives you all three readings:

- `text` — the whole page as one string.
- `confidence` — the page mean, 0–100.
- `words` — `{text, confidence, bbox: {x, y, width, height}}` per word, in
  reading order, with the box in image pixels.

Pass `{ language: "eng+deu" }` for anything other than English; the codes are
Tesseract's, `+`-joined. The data file for a language it has not seen before is
downloaded the first time you ask for it, so that call is slower.

Get the bytes from `workspace.readBytes`, from `await response.bytes()`, or
from an asset with `assetToSandbox`.

## Gotchas

- **`recognize` is async**, and the first call to it pays for engine startup.
- **10 MB per image.** Larger input is refused by name.
- **20 000 words per page.**
- **Straight, sharp scans read best.** Use `image.rotate` and `image.adjust` to
  deskew and raise contrast before you hand the bytes over.
