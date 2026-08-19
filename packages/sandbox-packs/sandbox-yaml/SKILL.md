---
name: sandbox-yaml
description: Read and write YAML inside a Code node or CodeAct action, with js-yaml running in the guest
---

# YAML in the sandbox

Specifier: `@nodetool-ai/sandbox-yaml`. One module, the js-yaml root export.
Import it at the top of the body.

## load — YAML text to a value

```js
import yaml from "@nodetool-ai/sandbox-yaml";

const config = yaml.load(inputs.text);
return { name: config.name, replicas: config.replicas };
```

`load` reads one document and throws a `YAMLException` with a line and column
on malformed input. Multi-document files go through `loadAll`, which returns an
array.

## dump — a value to YAML text

```js
import yaml from "@nodetool-ai/sandbox-yaml";

return { text: yaml.dump({ name: inputs.name, tags: inputs.tags }, { indent: 2 }) };
```

`dump` throws on a cyclic structure unless you pass `{ noRefs: false }`, and on
a value it cannot represent (a function, a symbol).

## Gotchas

- **Everything runs in the guest.** The 64 MB guest heap holds your input text,
  the parse tree, and the returned value at once. A file of a few megabytes is
  fine; a hundred megabytes is not.
- **No timers, no I/O.** The guest has no `setTimeout`, no filesystem, and no
  Node builtins. js-yaml needs none of them — that is why it is admitted — but
  code you write around it must not reach for them either.
- **The safe schema is not the default.** `yaml.load` uses `DEFAULT_SCHEMA`,
  which resolves tags such as `!!timestamp`. For input from a stranger, pass
  `{ schema: yaml.FAILSAFE_SCHEMA }` and get strings, arrays, and objects only.
- **This pack is the only route to YAML.** There is no `data.parseYaml` global
  any more; every library the sandbox offers is an importable module, and this
  is the one for YAML. A node that needs it declares it.
