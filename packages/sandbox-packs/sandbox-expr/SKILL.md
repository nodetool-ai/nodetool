---
name: sandbox-expr
description: Evaluate a math formula without eval in a Code node or CodeAct action, with expr-eval running on the host
---

# Formulas in the sandbox

Specifier: `@nodetool-ai/sandbox-expr`. Declare it in the node's `packages`
property and import it at the top of the body.

The published expr-eval bundle trips the guest scanner, so this pack is a
**host module**.

## evaluate — formula plus variables

```js
import { evaluate } from "@nodetool-ai/sandbox-expr";

const value = await evaluate(inputs.formula, inputs.vars);
return { value };
```

`inputs.formula` is a string such as `"2 * qty + fee"`. `inputs.vars` is
`{ qty: 3, fee: 1.5 }`.

## Gotchas

- **Not JavaScript.** `^` is power. Unknown names throw.
- **Do not use `eval`.** The guest deletes it. This pack is the formula path.
