---
name: sandbox-supabase
description: Read and write Supabase tables from a Code node or CodeAct action, with NodeTool's PostgREST request builder running on the host
---

# Supabase in the sandbox

Specifier: `@nodetool-ai/sandbox-supabase`. Import it at the top of the body.

Supabase's REST surface is PostgREST: the whole query lives in the URL and the
write semantics live in a `Prefer` header. Both are easy to get subtly wrong —
an upsert without `resolution=merge-duplicates` is just a failed insert — so
this pack does the encoding.

**Nothing here sends a request.** Both exports build one; the guest's own
`fetch` sends it, under the run's fetch cap and SSRF guard.

## from — one table

```js
import { from } from "@nodetool-ai/sandbox-supabase";

const url = await nodetool.secrets.get("SUPABASE_URL");
const key = await nodetool.secrets.get("SUPABASE_KEY");

const req = await from({
  url, key,
  table: "issues",
  select: "id,title,status",
  filters: { status: "eq.open" },
  order: "created_at.desc",
  limit: 20
});
const res = await fetch(req.url, req);
if (!res.ok) throw new Error(`Supabase select failed: ${res.status}`);
return { rows: res.json };
```

`method` picks the operation:

| method | operation |
|---|---|
| `GET` (default) | select |
| `POST` | insert, or upsert with `onConflict` |
| `PATCH` | update the rows the filters match |
| `DELETE` | delete the rows the filters match |

Options: `url` and `key` (required), `table` (required), `method`, `select`,
`filters`, `order`, `limit`, `offset`, `body`, `onConflict`, `count`,
`returning`, `query`.

**Filters** take either form:

```js
filters: { status: "eq.open", priority: "in.(high,urgent)" }   // raw PostgREST
filters: { age: { gte: 18, lt: 65 } }                          // operator object
```

**Insert**

```js
const req = await from({ url, key, table: "events", method: "POST", body: inputs.rows });
```

**Update the matching rows**

```js
const req = await from({
  url, key, table: "issues", method: "PATCH",
  filters: { id: `eq.${inputs.id}` },
  body: { status: "closed" }
});
```

**Upsert** — `onConflict` names the unique column and turns the insert into a
merge:

```js
const req = await from({
  url, key, table: "users", method: "POST",
  onConflict: "email", body: inputs.users
});
```

A write returns the affected rows. Pass `returning: "minimal"` when you do not
want them back.

## rpc — a Postgres function

```js
import { rpc } from "@nodetool-ai/sandbox-supabase";

const req = await rpc({ url, key, fn: "search_issues", args: { term: inputs.term } });
return { rows: (await fetch(req.url, req)).json };
```

## Gotchas

- **Every export is async.** A host call is a round trip.
- **A `DELETE` or `PATCH` with no filters hits every row.** PostgREST does not
  refuse it. Pass the filters.
- **The anon key obeys row-level security.** A select that returns `[]` against
  a table with rows usually means RLS, not an empty table. The service-role key
  bypasses it — and bypasses it for every row, so keep it out of anything a
  user's prompt can steer.
- **Errors arrive as JSON with a non-2xx status.** Check `res.ok` and read
  `res.json.message`; PostgREST says exactly what it disliked.
- **Supabase caps a page at 1000 rows.** Page with `limit` and `offset`.
