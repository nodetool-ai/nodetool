---
layout: page
title: "Reve: Add Models & Nodes"
description: "Runbook for adding new Reve image API endpoints and model versions to NodeTool."
---

**Navigation**: [docs/developer/index.md](../index.md) → **Reve provider guide**

> **Audience**: coding agents and contributors adding new Reve image nodes or model version strings to the `@nodetool-ai/reve-nodes` package.

## TL;DR

1. Add a new `class` in `packages/reve-nodes/src/nodes/` extending `BaseNode`.
2. Export it from `packages/reve-nodes/src/index.ts` and push the class into `REVE_NODES`.
3. Call `reveGenerate` from `reve-base.ts` with one of the three API endpoints: `"create"`, `"edit"`, or `"remix"`.
4. `npm run build:packages` — compiles from `src/` to `dist/` (the package loads from `dist/`).
5. `npm run typecheck && npm run lint` — must pass before committing.

---

## Where things live

| What | Path |
|---|---|
| Shared API utilities | `packages/reve-nodes/src/reve-base.ts` |
| Create Image node | `packages/reve-nodes/src/nodes/create-image.ts` |
| Edit Image node | `packages/reve-nodes/src/nodes/edit-image.ts` |
| Remix Image node | `packages/reve-nodes/src/nodes/remix-image.ts` |
| Package entry point | `packages/reve-nodes/src/index.ts` |
| Runtime provider (generic image picker) | `packages/runtime/src/providers/reve-provider.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 221 |
| `PROVIDER_IDS.REVE` | `packages/protocol/src/api-types.ts` line 887 |
| Unit tests | `packages/reve-nodes/tests/nodes.test.ts` |
| Registration test | `packages/reve-nodes/tests/registration.test.ts` |

---

## How Reve models and nodes are defined

Reve exposes three POST endpoints, each mapping to one TypeScript class:

| Endpoint | Class | Node type |
|---|---|---|
| `POST /v1/image/create` | `CreateImageNode` | `reve.CreateImage` |
| `POST /v1/image/edit` | `EditImageNode` | `reve.EditImage` |
| `POST /v1/image/remix` | `RemixImageNode` | `reve.RemixImage` |

There is no manifest or code-generation script. Each node is a hand-written `BaseNode` subclass in its own file under `packages/reve-nodes/src/nodes/`. Fields are declared with the `@prop` decorator from `@nodetool-ai/node-sdk`.

**Shared utilities in `reve-base.ts`:**

- `REVE_ASPECT_RATIOS` — the seven aspect ratios all endpoints accept.
- `REVE_POSTPROCESSING` — optional post-generation operations (`upscale`, `remove_background`, `fit_image`, `effect`).
- `getReveApiKey(secrets)` — reads `REVE_API_KEY` from `this._secrets` then `process.env`, throws if absent.
- `reveGenerate(apiKey, endpoint, body)` — POSTs to `https://api.reve.com/v1/image/{endpoint}` with `Authorization: Bearer`, returns the parsed `ReveImageResponse`.
- `refToBase64(ref, context)` — converts an `ImageRef`-like value to a base64 string; handles inline data, data URIs, `asset://`, `file://`, and remote URLs.
- `reveImageToRef(base64)` — wraps the response `image` field into a NodeTool `ImageRef` object; attaches dimensions via `sharp` when available.

The runtime provider (`reve-provider.ts`) separately implements `textToImage` and `imageToImage` for the generic image-generation picker in the UI (the two hardcoded model ids `reve-create` and `reve-edit`). This is a thinner path — new Reve API endpoints should be added as full nodes in `reve-nodes`, not as branches in the provider.

---

## Add a new model version

To add a new dated model version pin (e.g. `reve-create@20260101`), open the relevant node file and extend the `version` prop's `values` array:

```typescript
// packages/reve-nodes/src/nodes/create-image.ts
@prop({
  type: "enum",
  default: "latest",
  title: "Version",
  description: "Model version to use.",
  values: ["latest", "reve-create@20250915", "reve-create@20260101"]  // ← add here
})
declare version: any;
```

That is the entire change. Rebuild and verify (see [Verify](#verify) below).

---

## Add a new node

Use this pattern when Reve releases a new endpoint (or a sufficiently different variant that warrants its own node type).

**Step 1.** Create `packages/reve-nodes/src/nodes/your-endpoint.ts`:

```typescript
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getReveApiKey,
  postprocessingArray,
  reveGenerate,
  reveImageToRef,
  REVE_ASPECT_RATIOS,
  REVE_POSTPROCESSING
} from "../reve-base.js";

export class YourEndpointNode extends BaseNode {
  static readonly nodeType = "reve.YourEndpoint";
  static readonly body = "content_card";
  static readonly title = "Your Endpoint";
  static readonly description =
    "One-line description of what this node does.\n" +
    "image, reve, keyword1, keyword2\n\n" +
    "Use cases:\n" +
    "- First use case\n" +
    "- Second use case";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly inlineFields: string[] = ["prompt"];
  static readonly requiredSettings = ["REVE_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt (max 2560 chars)."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "3:2",
    title: "Aspect Ratio",
    description: "Proportions of the generated image.",
    values: [...REVE_ASPECT_RATIOS]
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "latest",
    title: "Version",
    description: "Model version to use.",
    values: ["latest"]
  })
  declare version: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Postprocessing",
    description: "Optional postprocessing operation applied to the result.",
    values: [...REVE_POSTPROCESSING]
  })
  declare postprocessing: any;

  @prop({
    type: "int",
    default: 1,
    title: "Test Time Scaling",
    description: "Effort multiplier for quality (1-15). Higher costs more.",
    min: 1,
    max: 15
  })
  declare test_time_scaling: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReveApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const result = await reveGenerate(apiKey, "create", {   // ← swap endpoint name
      prompt,
      aspect_ratio: String(this.aspect_ratio ?? "3:2"),
      version: String(this.version ?? "latest"),
      postprocessing: postprocessingArray(this.postprocessing),
      test_time_scaling: Number(this.test_time_scaling ?? 1)
    });

    return { output: await reveImageToRef(result.image) };
  }
}

export const YOUR_ENDPOINT_NODES: readonly NodeClass[] = [YourEndpointNode];
```

Nodes that accept a reference image (like `EditImageNode`) must take a `context` argument in `process` and pass it to `refToBase64`:

```typescript
async process(
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  const referenceImage = await refToBase64(this.image, context);
  // ...
}
```

**Step 2.** Wire the new class into `packages/reve-nodes/src/index.ts`:

```typescript
import { YOUR_ENDPOINT_NODES } from "./nodes/your-endpoint.js";
export { YourEndpointNode } from "./nodes/your-endpoint.js";

export const REVE_NODES: readonly NodeClass[] = [
  ...CREATE_IMAGE_NODES,
  ...EDIT_IMAGE_NODES,
  ...REMIX_IMAGE_NODES,
  ...YOUR_ENDPOINT_NODES    // ← add here
];
```

No other files need to change. The node automatically appears in the registry because `registerReveNodes` iterates `REVE_NODES`.

**Step 3.** Add tests in `packages/reve-nodes/tests/nodes.test.ts`. Follow the existing pattern: stub `fetch`, construct the node with props, call `process()`, assert the fetch URL and body fields.

---

## Verify

Run these commands in order after any change:

```bash
# 1. Compile src/ → dist/ (required — the package loads from dist/)
npm run build:packages

# 2. Type-check the whole repo
npm run typecheck

# 3. Lint
npm run lint

# 4. Run the reve-nodes unit tests
npm run test --workspace=packages/reve-nodes

# 5. Confirm the new node type resolves in the CLI registry
#    Expected: a REVE_API_KEY error, not "unknown node type"
npm run dev:nodetool -- node run reve.YourEndpoint \
  --props '{"prompt":"a red fox"}' \
  --no-secrets

# 6. Static validation (no API key required)
npm run dev:nodetool -- validate workflow.json
```

A `REVE_API_KEY is not configured` error from step 5 means the node registered correctly — it loaded from `dist/` and resolved the type. An `unknown node type` error means the build or export wiring is broken.

---

## How past commits did it

The Reve node package and runtime provider were introduced together in commit `d1491abf` ("add claude agent package"). That commit added:

```
packages/runtime/src/providers/reve-provider.ts
packages/reve-nodes/src/reve-base.ts
packages/reve-nodes/src/nodes/create-image.ts
packages/reve-nodes/src/nodes/edit-image.ts
packages/reve-nodes/src/nodes/remix-image.ts
packages/reve-nodes/src/index.ts
packages/reve-nodes/tests/nodes.test.ts
packages/reve-nodes/tests/registration.test.ts
```

The three endpoints (`create`, `edit`, `remix`) map to three node classes with no factory or manifest layer. For reference, XAI image/video support was added in PR #3951 (commit `69dd6f88`) by extending `getAvailableImageModels` and `getAvailableVideoModels` in the existing provider — that pattern applies when the provider's generic image picker (not a standalone node pack) is the target.

---

## Contributing

Source: <https://github.com/nodetool-ai/nodetool>  
Discord: <https://discord.gg/WmQTWZRcYE>

Before opening a PR, run `npm run check` (typecheck + lint + tests). Add a test for every new node; the existing `nodes.test.ts` stubs `fetch` globally, so new test cases fit cleanly in the same file.
