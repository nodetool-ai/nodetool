# @nodetool-ai/node-sdk

The node authoring SDK: `BaseNode`, the `@prop` decorator, `NodeRegistry`, the
type system, and node metadata/validation.

## Responsibilities

- `BaseNode` — base class all workflow nodes extend.
- `@prop` decorator + metadata reflection for declaring typed node properties.
- `NodeRegistry` — registration and lookup; `createNodeValidator()` for pre-flight
  graph validation.

## Usage

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class MyNode extends BaseNode {
  static readonly nodeType = "my.Node";
  @prop({ type: "str", default: "" }) declare text: string;
  async process() { return { output: this.text }; }
}
```

> This package uses decorators and loads from `dist/`. After changing it, run
> `npm run build:packages` before `npm run dev`.

## Develop

```bash
npm run build --workspace=packages/node-sdk
npm run test  --workspace=packages/node-sdk
npm run lint  --workspace=packages/node-sdk
```
