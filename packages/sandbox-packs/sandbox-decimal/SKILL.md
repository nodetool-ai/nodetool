---
name: sandbox-decimal
description: Exact decimal arithmetic inside a Code node or CodeAct action, with decimal.js running in the guest
---

# Decimals in the sandbox

Specifier: `@nodetool-ai/sandbox-decimal`. One module, decimal.js. Declare it
in the node's `packages` property and import it at the top of the body.

## Exact sums

```js
import Decimal from "@nodetool-ai/sandbox-decimal";

const total = inputs.amounts
  .reduce((sum, n) => sum.plus(n), new Decimal(0));
return { total: total.toFixed(2) };
```

## Divide without float noise

```js
import Decimal from "@nodetool-ai/sandbox-decimal";

const share = new Decimal(inputs.cents).div(inputs.parts);
return { share: share.toFixed(2) };
```

## Gotchas

- **Default export.** `import Decimal from "@nodetool-ai/sandbox-decimal"`.
- **Pass strings or Decimals.** `new Decimal(0.1)` already lost precision;
  use `new Decimal("0.1")`.
- **The guest has no Intl.** Format with `toFixed` / `toString`, not
  `toLocaleString`.
