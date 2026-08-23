---
name: sandbox-notion
description: Call the Notion API from a Code node or CodeAct action, with NodeTool's request builder and rich-text/block readers running on the host
---

# Notion in the sandbox

Specifier: `@nodetool-ai/sandbox-notion`. Import it at the top of the body.

Notion is an ordinary HTTPS API and `fetch` reaches it. What costs a script its
first three attempts is everything around the call — the `Notion-Version`
header, the rich-text arrays every piece of text is wrapped in, and the block
tree a page's content comes back as. Those three are this pack.

**Nothing here sends a request.** `request` builds one; the guest's own `fetch`
sends it, under the run's fetch cap and SSRF guard.

## request — an authenticated Notion request

```js
import { request } from "@nodetool-ai/sandbox-notion";

const token = await nodetool.secrets.get("NOTION_API_KEY");
const req = await request({
  token,
  path: "search",
  method: "POST",
  body: { query: inputs.query, page_size: 10 }
});
const res = await fetch(req.url, req);
if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
return { results: res.json.results };
```

Options: `token` (required), `path` (required — relative to `/v1` unless it
starts with `/`), `method` (default `GET`), `body` (JSON-encoded when present),
`query` (query-string bag), `version` (default `2022-06-28`).

Returns `{url, method, headers, body?}`, which `fetch(req.url, req)` takes
whole.

## plainText — a rich-text array as a string

```js
import { plainText } from "@nodetool-ai/sandbox-notion";

const title = await plainText(page.properties.Name.title);
```

Takes the array Notion puts under every `title`, `rich_text` and heading.
Anything else gives `""`.

## toMarkdown — a page's blocks as markdown

```js
import { request, toMarkdown } from "@nodetool-ai/sandbox-notion";

const req = await request({ token, path: `blocks/${inputs.page_id}/children`, query: { page_size: 100 } });
const blocks = (await fetch(req.url, req)).json.results;
return { markdown: await toMarkdown(blocks) };
```

Handles paragraphs, the three heading levels, bulleted and numbered items,
to-dos, quotes, code fences and dividers. A block markdown has no form for —
a database, an embed, a synced block — contributes nothing rather than a
placeholder, so the result is text a model or a file can take as-is.

## Common flows

**Create a page in a database**

```js
const req = await request({
  token, path: "pages", method: "POST",
  body: {
    parent: { database_id: inputs.database_id },
    properties: { Name: { title: [{ text: { content: inputs.title } }] } }
  }
});
const page = (await fetch(req.url, req)).json;
```

**Query a database**

```js
const req = await request({
  token, path: `databases/${inputs.database_id}/query`, method: "POST",
  body: { filter: { property: "Status", select: { equals: "Open" } }, page_size: 50 }
});
```

## Gotchas

- **Every export is async.** A host call is a round trip.
- **Nested blocks are not fetched.** `toMarkdown` is pure over the blocks you
  hand it. A block with `has_children` needs its own
  `blocks/{id}/children` call.
- **Notion paginates at 100.** Follow `next_cursor` with
  `query: { start_cursor }` and watch the run's fetch cap.
- **The integration needs access.** A page shared with nobody returns 404 even
  with a valid token — share it with the integration in Notion first.
