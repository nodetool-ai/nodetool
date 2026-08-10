---
name: sandbox-yaml
description: Read and write YAML inside a Code node or CodeAct action, with js-yaml running in the guest
---

# YAML in the sandbox

Specifier: `@nodetool-ai/sandbox-yaml`. One module, the js-yaml root export.
Declare it in the node's `packages` property and import it at the top of the
body.

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
- **`data.parseYaml` is still there** and is the shorter route when you only
  need to parse: it runs js-yaml on the host, caps input at 5 M characters, and
  costs you no guest heap. Import this pack when you need `dump`, `loadAll`,
  schemas, or the parse result inside a larger computation the guest is already
  doing.
