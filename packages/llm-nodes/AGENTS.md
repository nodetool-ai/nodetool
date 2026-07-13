# llm-nodes — LLM, Image, TTS & Agent Nodes

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **llm-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first — media-ref and output-contract rules apply. This overlay covers nodes that call provider REST endpoints directly and the agent/streaming nodes.

## Provider-direct nodes (Gemini Imagen/Veo, OpenAI images, TTS)

- **Mirror the request/response shape of the matching `packages/runtime`
  provider — never the vendor JS/Python SDK shape.** The SDK wraps a different
  wire envelope. Imagen uses `:predict`; Veo uses `:predictLongRunning` with
  `{ instances: [{ prompt, image: { inlineData: { data, mimeType } } }], parameters: {...} }`.
  Do not send the SDK's `{ prompt, config }` envelope.
- **Parse every documented response variant.** Try REST/Vertex
  `predictions[].bytesBase64Encoded` *and* SDK `generatedImages[].image.imageBytes`;
  handle large media (Veo video) delivered as a download **`uri`** in addition
  to inline bytes. Validate provider-supplied URIs with `safeFetch`; send the
  API key only to `generativelanguage.googleapis.com`.
- **Gate model-specific request params on the target model.** `gpt-image-1`
  rejects `response_format` (valid only for dall-e-2/3) and always returns base64.
  Don't send a param a newer model rejects.
- **Guard response array access and throw a descriptive error** — `data.data?.[0]`
  with an explicit `"No image data in response"`, never a bare `data.data[0]` that
  throws an opaque `undefined`.
- **Emit media output refs with `type` + raw base64** via the `imageRefFromB64` /
  `audioRefFromB64` helpers (the Gemini TTS ref once omitted `type: "audio"`, so
  auto-save skipped it). See [packages/AGENTS.md § Media refs](../AGENTS.md#media-refs-imageref--videoref--audioref--model3dref).

## Streaming & thinking blocks

- **A declared `chunk` output must be produced by `async *genProcess`** — the
  Summarizer node declared `chunk` but only returned `text` from `process()`, so
  the stream output was dead. Match `outputCorrelation` (`iteration` for chunks).
- **Keep the streaming thinking-tag splitter in sync with the non-streaming
  `extractThinkTags`.** Recognize the canonical `</redacted_thinking>` close tag;
  a string-concat typo once produced two identical `</think>` entries and never
  matched the real close tag.

## Agent output routing

- **`yield` an agent's structured results so the kernel routes them to dynamic
  output handles — don't `return` them from the generator** (`yield*` discards a
  `return` value). Plan mode must yield `agent.getResults()` when an `outputSchema`
  is present, mirroring loop mode, or dynamic outputs stay empty.
- **Every tool named in an agent's system prompt must be registered in its
  toolset, and every declared prop must be consumed or injected into the prompt.**
  A prompt referencing an unregistered tool, or a declared-but-unwired prop, is a
  silent no-op (see the `code-nodes` browser/http agent fix).
