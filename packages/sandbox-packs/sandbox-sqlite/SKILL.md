---
name: sandbox-sqlite
description: Query and update a SQLite database in a Code node or CodeAct action, with better-sqlite3 running on the host
---

# SQLite in the sandbox

Specifier: `@nodetool-ai/sandbox-sqlite`. Declare it in the node's `packages`
property and import it at the top of the body.

better-sqlite3 is a native addon, so it will never be a guest module. This pack
is a **host module**: the import resolves to a generated facade over NodeTool's
own implementation.

**A database is bytes here, never a path.** You read it from the workspace, work
on it, and write it back. That is the whole file API — nothing in this pack
opens a file, so a database can only live where `workspace.*` already lets you
put one.

## query — read rows

```js
import { query } from "@nodetool-ai/sandbox-sqlite";

const db = await workspace.readBytes("cards.db");
const due = await query(db, "SELECT front, back FROM cards WHERE box = ?", [1]);
return { due };
```

Params are positional with an array (`?`), or named with an object
(`{ box: 1 }` for `:box`). `query` refuses a statement that writes — nothing
would carry the change back out.

## run — create, insert, update, in one call

```js
import { run } from "@nodetool-ai/sandbox-sqlite";

const before = await workspace.stat("cards.db");
const { database, results } = await run(before.exists ? await workspace.readBytes("cards.db") : null, [
  { sql: "CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, front TEXT, back TEXT, box INTEGER)" },
  { sql: "INSERT INTO cards (front, back, box) VALUES (?, ?, ?)", params: [inputs.front, inputs.back, 1] },
  { sql: "SELECT COUNT(*) AS total FROM cards" }
]);
await workspace.writeBytes("cards.db", database);
return { id: results[1].lastInsertRowid, total: results[2].rows[0].total };
```

Pass `null` for the database to start an empty one. A reading statement
contributes `{rows}` to `results`, a writing one
`{changes, lastInsertRowid}` — in the order you gave them.

The batch is atomic by construction: the database is deserialized for the call
and serialized back at the end, so a statement that throws leaves you holding
the bytes you started with.

## Gotchas

- **Both exports are async.**
- **Nothing is saved for you.** `run` hands back `database`; if you do not
  `workspace.writeBytes` it, the work is gone when the run ends.
- **10 MB per database.** Larger input is refused by name.
- **10 000 rows per statement.** Add a `LIMIT`.
- **500 statements per `run`.**
- **Booleans become 0/1 and objects become JSON strings** on the way in —
  SQLite has no type for either. They come back as what you stored.
- **A blob comes back as a `Uint8Array`**, and a large integer that cannot be a
  JavaScript number comes back as a decimal string.
