---
name: sandbox-jmespath
description: Query a JSON document with JMESPath inside a Code node or CodeAct action
---

# JMESPath in the sandbox

Specifier: `@nodetool-ai/sandbox-jmespath`. One module, the `jmespath`
root export. Declare it in the node's `packages` property and import it at
the top of the body.

## search — pick values out of JSON

```js
import jmespath from "@nodetool-ai/sandbox-jmespath";

const names = jmespath.search(inputs.data, "items[*].name");
const total = jmespath.search(inputs.data, "sum(items[*].amount)");
return { names, total };
```

## Gotchas

- **Default export.** `import jmespath from "@nodetool-ai/sandbox-jmespath"`.
- **Missing paths return `null`**, they do not throw.
- **The expression is a string.** Build it carefully; do not interpolate
  untrusted input into it.
