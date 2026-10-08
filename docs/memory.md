---
layout: page
title: "Memory"
permalink: /memory
description: "Durable notes an agent saves about your projects and the assets it makes, how it recalls them, and how to review and delete them on the Memory page."
---

Memory is a store of short notes that an agent writes for itself and reads back in later conversations. An agent saves a project fact, a decision you approved, or a reference to an asset it generated. The next time you chat, it can find that note again without you repeating yourself.

> **Quick Access:** Open the app menu in the sidebar and choose **Memory** to see everything the agent has saved.

---

## What a memory holds

Each memory is one row with these fields.

| Field | What it holds |
|-------|---------------|
| Kind | `note`, `fact`, `preference`, `decision`, or `resource`. An unknown value is saved as `note`. |
| Title | An optional short label |
| Content | The note itself, required |
| Resources | Optional typed references to things the note is about |
| Thread | The conversation the memory was saved in. Empty when it was saved outside a chat. |
| Created and updated times | Set by the store |

A resource reference has a `type` and an `id`, plus an optional `uri` and `label`. Known types are `asset`, `workflow`, `collection`, `node`, `job`, `timeline`, `script`, `storyboard`, `image_document`, `thread`, `url`, and `other`. Any other type string is also accepted.

Asset references are checked against your asset library. NodeTool fills in the `asset://` URI and the asset name, and drops any reference to an asset it cannot find. The tool result reports the dropped references. Other types are stored as given.

## How agents save and recall

Agents use five tools. They are always part of the built-in tool set, so you do not turn them on.

| Tool | What it does |
|------|--------------|
| `memory_save` | Saves a new memory. Takes `content` (required), `title`, `kind`, and `resources`. Returns the new `memory_id`. |
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

## The Memory page

Open the app menu in the sidebar and choose **Memory**. The page opens as a tab titled Memory.

- **List.** Each memory is a card with its kind, title, creation time, content, and resources. Image assets show as thumbnails. Other resources show as chips such as `workflow: <id>`. The page loads up to 200 memories.
- **Search.** The **Search memories** box runs the same keyword match as `memory_search`. Every word you type must appear in the memory.
- **Filter.** When the results hold more than one kind, chips appear above the list. Select a kind to narrow the list, or **All** to reset.
- **Open the source conversation.** Hover over a card and click the conversation icon (**Open the conversation this came from**).
- **Delete.** Hover over a card, click the delete icon, and confirm in the **Delete memory** dialog. Deleting cannot be undone.

The page does not edit memories. To change a note, ask the agent to update it, and it calls `memory_update`.

An empty page reads "Nothing remembered yet." Memories appear as agents save them while they work.

## Scope and storage

Memory belongs to your user account, not to a conversation. A memory saved in one chat is readable from every other chat. Other accounts never see it. The thread field records where a note came from and works as a filter only.

Memories are rows in the NodeTool database. Deleting a chat thread also deletes the memories that were saved in it. Memories with no thread are not affected.

## How it differs from run memory

NodeTool has a second, unrelated store also called memory. [Agent Memory System](agent-memory.md) describes `context.memory`, a scratch space shared by the steps of one workflow run through the `list_shared`, `read_shared`, and `share_result` tools. It is cleared when the run ends and is never shown on the Memory page.

| | Durable memory (this page) | Run memory |
|---|---|---|
| Lifetime | Until deleted | One run |
| Scope | Your account, all conversations | One run and its steps |
| Tools | `memory_save`, `memory_list`, `memory_search`, `memory_update`, `memory_delete` | `list_shared`, `read_shared`, `share_result` |
| Visible to you | Memory page | Not shown |

## Related

- [Agent Memory System](agent-memory.md)
- [Chat & Agents](global-chat-agents.md)
- [Skills](skills.md)
