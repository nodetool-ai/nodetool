---
name: api-memory
description: "Call nodetool.memory, nodetool.shared or nodetool.threads from a code action: save and recall durable notes and resources across conversations, pass results between steps and sub-agents in one run, and read past chat threads. Load before the first call into these namespaces."
---

# nodetool.memory, nodetool.shared, nodetool.threads

Nothing carries over between code actions except what a tool saved. These
three namespaces are where state lives, at three lifetimes:

| Namespace | Lifetime | Use it for |
| :--- | :--- | :--- |
| `nodetool.memory` | Every conversation, until deleted | Facts, decisions, preferences, and the assets and documents you made |
| `nodetool.shared` | This run only | Handing results between steps, tasks and sub-agents |
| `nodetool.threads` | Read-only chat history | "What did we decide last time?" |

## nodetool.memory

| Call | Does |
| :--- | :--- |
| `save(content, {title, kind, resources})` | Saves a note. |
| `search(query, {limit, thread, kinds})` | Finds notes by keyword. Every word must appear in the title or the content, so fewer words find more. `limit` defaults to 25. |
| `list({limit, thread, kinds})` | Lists notes, newest first. `limit` defaults to 100, max 200. |
| `update(memoryId, {content, title, kind, resources})` | Changes the fields you pass. `resources` replaces the list. |
| `remove(memoryId)` | Deletes one note. |

- `kind` is `note` (default), `fact`, `preference`, `decision` or `resource`.
- `thread` is `"all"` (default) or `"current"`.
- `resources` is a list of `{type, id, uri?, label?}`. `type` is `asset`,
  `workflow`, `collection`, `node`, `job`, `timeline`, `script`, `storyboard`,
  `image_document`, `thread`, `url` or `other`. Asset references are checked
  and come back with a live `asset://` uri.
- The notes of the current conversation are shown to you at the start of each
  turn. Search for the rest.

Record what you make in the same action that makes it:

```js
const shot = await nodetool.media.generateImage(prompt, model);
await nodetool.memory.save("Hero still for the launch film", {
  title: "Hero still",
  kind: "resource",
  resources: [{ type: "asset", id: shot.asset_id }]
});
```

Before you generate, search memory for a result that already exists. Never
generate again what a note already records.

## nodetool.shared

The scratchpad of this run. It is gone when the run ends.

| Call | Does |
| :--- | :--- |
| `list({kind, key_prefix, sources})` | Metadata only: keys, titles, kinds, sizes. `kind` filters to `task_result`, `step_result`, `input` or `shared`. |
| `read(keys)` | Full values for the keys you name. Misses come back in `missing`. A key with no `<namespace>:` prefix is also looked up under `shared:`. |
| `publish(key, value, {title, description})` | Stores any JSON value under `shared:<key>`. |

The results of earlier steps and tasks land here. Read them instead of asking
for them again. List first, then read only the keys you need.

## nodetool.threads

| Call | Does |
| :--- | :--- |
| `list({limit, workflow_id, cursor, preview})` | Past conversations, newest first, each with its last message unless `preview: false`. `limit` defaults to 20. |
| `get(threadId, {limit, newest_first, cursor, max_chars})` | A page of messages, oldest first. Text is cut at `max_chars` (default 2000, `0` for no cut). |
| `last(threadId)` | The newest message, or `undefined` |
| `message(messageId)` | One message in full: every tool call with its arguments, files, cost |

Page with the `next` cursor of the previous answer.
