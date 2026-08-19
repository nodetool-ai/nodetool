---
name: sandbox-stats
description: Mean, median, quantiles, and linear regression inside a Code node or CodeAct action, with simple-statistics running in the guest
---

# Statistics in the sandbox

Specifier: `@nodetool-ai/sandbox-stats`. One module, simple-statistics.
Import it at the top of the body.

## Column summaries

```js
import { mean, median, standardDeviation, quantile } from "@nodetool-ai/sandbox-stats";

const xs = inputs.values;
return {
  mean: mean(xs),
  median: median(xs),
  sd: standardDeviation(xs),
  p90: quantile(xs, 0.9)
};
```

## Linear regression

```js
import { linearRegression, linearRegressionLine } from "@nodetool-ai/sandbox-stats";

const fit = linearRegression(inputs.points);
const line = linearRegressionLine(fit);
return { m: fit.m, b: fit.b, at10: line(10) };
```

`inputs.points` is `[[x, y], ...]`.

## Gotchas

- **Named imports.** Import only the functions you use.
- **Empty arrays throw.** Guard before `mean([])`.
- **This is not TFJS.** Classification and embeddings stay on
  `@nodetool-ai/sandbox-tfjs`.
