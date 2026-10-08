---
layout: page
title: "Data Types and Connections"
description: "What each handle color means, which connections the editor accepts, and how streamed values and running edges look on the canvas."
---

Every handle on a node has a **data type**. The editor uses it to color the handle, to decide whether two nodes can connect, and to label what flows along a line. For the canvas itself, see the [Workflow Editor]({{ '/workflow-editor' | relative_url }}). For the ideas behind nodes and connections, see [Key Concepts]({{ '/key-concepts' | relative_url }}).

---

## Data types

The table groups types that share a handle color. Hover a handle to see its type name and description.

| Type | What it holds | Handle color | Example nodes |
|---|---|---|---|
| **Text** (`str`, `text`) | Labels, prompts, and multi-line text | amber `#FFA808` | String Input, String |
| **Message**, **Thread** | A chat message with a role, or a conversation thread | amber `#FFA808` | Create Thread |
| **Integer** (`int`) | A whole number | `#0891B2` | Integer Input, Integer |
| **Float** (`float`) | A decimal number | cyan `#18E0F8` | Float Input, Float |
| **Boolean** (`bool`) | True or false | emerald `#0DD49A` | Boolean Input, Bool |
| **Image** | A picture (PNG, JPEG, WebP, and others) | fuchsia `#E838FF` | Image Input, Image |
| **Audio** | Sound for playback, processing, or generation | sky `#08B8FF` | Audio Input, Audio |
| **Video** | A clip (MP4, WebM, and others) | violet `#9460FF` | Video Input, Video |
| **Model 3D** | A 3D model (GLB or glTF) | blue `#3888FF` | Model 3D Input, Model 3D, Transform 3D |
| **Document** | Text content with metadata, such as a PDF or DOCX | blue `#3888FF` | Document Input, Document |
| **List** | An ordered collection of items | yellow `#FFD612` | Text List Input, List, Collect |
| **Dictionary** (`dict`), **Object**, **JSON** | Key-value data and nested structures | yellow `#FFD612` | Dict |
| **Dataframe** | A table of rows and columns | yellow `#FFD612` | Dataframe Input, Data Frame, For Each Row |
| **Chunk** | One piece of a streaming response | yellow `#FFD612` | Summarizer |
| **CV** | A control-voltage stream for audio synthesis | rose `#FF3060` | LFO |
| **Any** | Accepts or produces any type | slate `#6880A0` | For Each |

The color names come from the palette comments in the source. The Integer color has no name there.

Other types follow the same scheme. Asset, file, folder, bytes, font, and model references (language, embedding, image, video, and so on) are blue `#3888FF`. A sketch is lime `#B0F030`, a timeline and storyboard are violet `#9460FF`, a script is sky `#08B8FF`, and an entity is fuchsia `#E838FF`. The full list is in `web/src/config/data_types.ts`.

A type the editor does not know gets a color derived from its name. A handle with no declared type uses grey `#A7B1BF`.

> **Tip:** Hold the pointer over a handle to see its type and a short description. When two ends have different colors, the line between them blends from the source color to the target color.
{: .callout-tip}

---

## Making connections

To connect two nodes, drag from an **output** handle on the right of a node to an **input** handle on the left of another. Release on the handle to connect. The [Workflow Editor]({{ '/workflow-editor#connections' | relative_url }}) covers releasing on empty canvas, which opens a menu of nodes that match the type you dragged.

One output can feed many inputs. An input takes one line, so connecting a second line to the same input replaces the first.

### Collect inputs

An input typed `list[T]` is a **collect** input. It accepts several lines at once, as long as each source produces `T` (or a `list[T]`). Use it to gather several images into one image list, for example. The exception is `list[any]`, which takes a single line.

### Which connections are accepted

The editor checks every connection against these rules. A connection that fails does not attach.

1. **Same type connects.** An `image` output connects to an `image` input.
2. **Any connects to anything.** A handle of type `any` on either end is always accepted.
3. **int and float are separate types.** There is no automatic conversion between them, so an integer output does not connect to a float input.
4. **A single value connects to a list of that type.** An `image` output connects to a `list[image]` input. Typed lists connect when their element types are compatible. Lists with no stated element type connect without a check.
5. **A list does not connect to a single value.** To turn a list into items, use For Each.
6. **Dictionaries compare keys and values.** `dict` connects to `dict` when both the key type and the value type are compatible.
7. **Unions match any member.** A union source connects if any of its members fits the target, and a union target accepts any source that fits one of its members.
8. **Text and enum.** Text connects to an enum input and an enum connects to a text input. Two enums connect only when they are the same enum.
9. **Object accepts structured types.** An `object` input takes any source except text, numbers, booleans, null, enums, lists, dictionaries, unions, and tuples.
10. **CV and chunk interchange.** A `cv` output connects to a `chunk` input and the reverse, so an LFO can drive a streaming audio input. CV does not connect to audio or float directly.

The editor also refuses a connection that would form a cycle, and it refuses an exact duplicate of an existing line. The one exception is the feedback input of a `Loop` node. See the [Loop node reference]({{ '/nodes/nodetool/control/loop' | relative_url }}).

> **Note:** A node whose type metadata is not loaded, such as a placeholder for a missing node pack, accepts connections without a type check.
{: .callout-note}

---

## Streaming

Some nodes produce their output in pieces. A text model emits **chunks** as it generates, and **For Each** emits one list item at a time. The node keeps running while the pieces travel down the line, so downstream nodes can start before the upstream node finishes.

How a downstream node reacts depends on the node:

- **Per-item nodes** run once for each value that arrives. Everything between For Each and the end of its branch runs once per item.
- **Streaming-input nodes** read values as they arrive instead of waiting for all of them. The LFO is one.
- **Collect** waits for the stream to end and returns every item as one list.

Use For Each to split a list into items, and Collect to join them back. To repeat a step until a condition is met, use the [Loop node]({{ '/nodes/nodetool/control/loop' | relative_url }}).

---

## Edge states

While a workflow runs, the editor shows what each line is doing.

- **Moving dashes:** a line animates with flowing dashes while its source node is starting or running, and while a message is crossing it.
- **Item count:** when more than one value has crossed a line, a small badge shows the count. Hover it to see how many items streamed.
- **Selected:** a selected line gets a thicker stroke and a soft glow in the source type color.

Control lines, which let an agent trigger other nodes, are drawn with a separate style.

---

## Next steps

<div class="card-grid">
  <a class="doc-card" href="{{ '/workflow-editor' | relative_url }}"><strong>Workflow Editor</strong><span>Place, connect, and run nodes on the canvas.</span></a>
  <a class="doc-card" href="{{ '/first-workflow' | relative_url }}"><strong>Your First Workflow</strong><span>Build a four-node workflow from an empty canvas.</span></a>
  <a class="doc-card" href="{{ '/nodes/nodetool/control/' | relative_url }}"><strong>Control Nodes</strong><span>Loop, For Each, Collect, If, and the other flow nodes.</span></a>
  <a class="doc-card" href="{{ '/key-concepts' | relative_url }}"><strong>Key Concepts</strong><span>The ideas behind nodes, workflows, and assets.</span></a>
</div>
