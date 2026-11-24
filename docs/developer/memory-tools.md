---
layout: page
title: "Memory Tools"
permalink: /developer/memory-tools
description: "The memory tool schemas, the fields a memory holds, thread scoping, the memory block an agent sees at the start of a turn, and where memories are stored."
---

**Navigation**: [Docs index](../index.md) | [Memory](../memory.md) → **Memory Tools**

This page is for engineers and agent authors. For reviewing and deleting memories in the app, see [Memory](../memory.md). The per-run store is described in [Agent Memory System](../agent-memory.md).

An agent saves a memory with `memory_save` and reads it back in later conversations:

```jsonc
// memory_save arguments
{ "kind": "decision", "title": "Logo palette", "content": "Use the teal and off-white palette for all brand assets.",
  "resources": [{ "type": "asset", "id": "<asset_id>" }] }
```

---

## What a memory holds

Each memory is one row with these fields.

| Field | What it holds |
|-------|---------------|
| Kind | `note`, `fact`, `preference`, `decision`, or `resource`. An unknown value is saved as `note`. |
| Title | Optional. |
| Content | The note itself, required |
| Resources | Optional typed references. |
| Thread | The conversation the memory was saved in. Empty when it was saved outside a chat. |

A resource reference has a `type` and an `id`, plus an optional `uri` and `label`. Known types are `asset`, `workflow`, `collection`, `node`, `job`, `timeline`, `script`, `storyboard`, `image_document`, `thread`, `url`, and `other`. Any other type string is also accepted.

Asset references are checked against your asset library. NodeTool fills in the `asset://` URI and the asset name, and drops any reference to an asset it cannot find. The tool result reports the dropped references. Other types are stored as given.

## How agents save and recall

Agents use six tools. They are always part of the built-in tool set, so you do not turn them on.

| Tool | What it does |
|------|--------------|
| `memory_save` | Saves a new memory. Takes `content` (required), `title`, `kind`, and `resources`. Returns the new `memory_id`. |
| `memory_get` | Reads one memory back by `title` (the newest memory with that title, ignoring case) or by `memory_id`. Inside `execute_code` it is `nodetool.memory.get(titleOrId)`. |
| `memory_list` | Lists memories, newest first. Takes `limit` (default 100, maximum 200), `thread`, and `kinds`. |
| `memory_search` | Finds memories by keyword. A memory matches only when every word in `query` appears in its title or content, ignoring case. Takes `limit` (default 25, maximum 200), `thread`, and `kinds`. |
| `memory_update` | Changes a memory by `memory_id`. Only the fields passed change. Passing `resources` replaces the whole list. |
| `memory_delete` | Deletes a memory by `memory_id`. |

For `memory_list` and `memory_search`, `thread` is either `all` (the default) or `current`. `all` reads every memory in your account. `current` narrows the result to the conversation the agent is running in. Each result item includes `from_current_thread`, so the agent can tell where a note came from.

Every tool needs a signed-in user. Without one the call returns "No user context; cannot access memory."

### What the agent sees at the start of a turn

At the start of each chat turn, NodeTool adds a `<memory>` block to the message. It contains the memories saved in the current conversation, up to 100, with their resource references. For memories saved in other conversations, it adds only a count and a hint to use `memory_search` or `memory_list`. The block is built from your 400 newest memories, so an older memory may not be counted. The agent reaches older or cross-conversation notes by calling the tools.

The block is marked as user data. The agent is told to use it as reference and not to follow instructions written inside a note.

The block is added for chat turns that belong to a thread. A memory saved by a run with no thread has an empty thread field, so it does not appear in any conversation's block. The agent can still find it with `memory_list` or `memory_search`.

## Scope and storage

Memory belongs to your user account, not to a conversation. A memory saved in one chat is readable from every other chat. Other accounts never see it. The thread field records where a note came from and works as a filter only.

Memories are rows in the NodeTool database. Deleting a chat thread also deletes the memories that were saved in it. Memories with no thread are not affected.
