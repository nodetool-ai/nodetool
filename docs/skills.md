---
layout: page
title: "Skills"
description: "Saved instructions the NodeTool agent loads for a kind of work: your own skills, the built-in ones, the SKILL.md format, and the slash command."
---

A skill is a saved set of instructions for one kind of work. It has a name, a one-line description of when it applies, and a Markdown body. The agent reads the name and description on every turn. It reads the body only when it needs it, or when you name the skill with `/` in chat.

> **Quick Access:** Click **+** in the workspace tab bar and choose **New skill**, or open the **Skills** panel from the left panel's **More** menu. In chat, type `/` to pick a skill.

---

## Two kinds of skill

| | User skill | System skill |
|---|---|---|
| Who wrote it | You, or the agent for you | NodeTool ships it |
| Where it lives | Your database | A `SKILL.md` file in the install |
| Editable | Yes | No. It opens read-only |
| Shown in the panel as | A skill with a sparkle icon | A skill with a lock icon and the label **Built in** |
| Available to the agent | Yes | Yes, on every install |

System skills cannot be renamed, edited, or deleted from the app or by the agent. Their names are reserved: you cannot create a skill with the name of a system skill. A user skill that already had such a name before the system skill shipped keeps working and wins over the system one.

---

## Create and edit a skill

1. Click **+** in the workspace tab bar and choose **New skill**. A new skill opens in a tab with a generated name such as `skill-m3x9k2`, a placeholder description, and a short starter body. The **+** button at the top of the Skills panel does the same.
2. Set the **Name**. Use lowercase letters, digits, and hyphens, up to 64 characters. The name cannot contain `anthropic` or `claude`.
3. Set the **Description**. Write it as when to use the skill, for example "Use when writing release notes from a changelog." It is the only part the agent always sees. It can be up to 1024 characters and cannot contain markup such as `<tag>`.
4. Write the instructions in the Markdown editor below the two fields.

The editor saves on its own about three-quarters of a second after you stop typing. **Save** saves immediately, and a dot beside it shows unsaved changes. The tab title follows the skill name.

In the Skills panel, right-click a skill for **Rename** and **Delete**, and for **Duplicate**, which creates a copy named `<name>-copy`. Built-in skills open as a read-only view and have no rename or delete action.

You can also ask the agent to do this in chat, for example "Save these steps as a skill called weekly-report." See [How the agent finds and loads skills](#how-the-agent-finds-and-loads-skills) below.

### What makes a good skill

- Write the description as a trigger. "Use when the user asks for a changelog summary" lets the agent decide from one line whether to load the skill.
- Keep one skill to one kind of work. Several narrow skills load faster and conflict less than one large one.
- Put the steps, defaults, and checks in the body. The agent follows the body as instructions for the turn.

---

## The SKILL.md format

System skills are files. Each lives in its own directory, `packages/system-skills/<name>/SKILL.md`, and the directory name is the skill name. A `SKILL.md` has front matter between two `---` lines, then the body.

```markdown
---
name: release-notes
description: "Use when writing release notes from a changelog or a list of merged changes."
featured: true
---

# Release notes

1. Group the changes by user-visible area.
2. Lead each group with the change people will notice.
```

### Front matter fields

| Field | Required | Meaning |
|---|---|---|
| `name` | Yes | The skill name. Same rules as above, and it must equal the directory name or the skill is skipped. |
| `description` | Yes | One line saying when the skill applies. Up to 1024 characters, no `<tag>` markup. |
| `featured` | No | `true` lists a system skill in the agent's always-on catalog. Any other value, or no field, leaves it out. |

The parser reads `key: value` lines, not full YAML. Keep each value on one line. A value wrapped in a matching pair of single or double quotes has the quotes removed. Other front matter keys are ignored.

A `SKILL.md` is skipped, without an error, when any of these hold:

- The first line is not `---`, or the closing `---` line is missing.
- `name` or `description` is missing, invalid, or empty.
- The body after the front matter is empty.
- `name` differs from the directory name.

The body is everything after the closing `---`. It is plain Markdown. `load_skill` returns it in one piece, so a skill is a single `SKILL.md` and nothing beside it is read.

A user skill has the same three parts, but you edit them in the app as the **Name** and **Description** fields and the Markdown editor, so you never write front matter by hand.

### Where NodeTool looks for system skills

On startup the agent loads system skills from the first of these that exists:

1. The directory in `NODETOOL_SYSTEM_SKILLS_DIR`, if you set it. See [Configuration](configuration.md).
2. A `_skills` directory beside the bundled server, which is how the desktop app and the Docker image ship them.
3. `packages/system-skills` in a source checkout.

---

## How the agent finds and loads skills

Every chat turn carries a catalog of skills: the name and description of each of your own skills, plus the system skills marked `featured: true`. The remaining system skills are counted but not listed. That keeps the prompt short. The agent finds them by searching.

The agent reaches skills through five tools.

| Tool | What it does |
|---|---|
| `list_skills` | Lists skills with name, description, and whether each is a system skill. An optional `query` matches word by word against name and description, and returns the best matches first. |
| `load_skill` | Returns one skill's full instructions by name. The agent calls it before acting on a skill the catalog only summarizes. |
| `create_skill` | Creates a user skill from `name`, `description`, and `content`. All three are required. |
| `update_skill` | Changes a user skill's `description`, `content`, or name (through `new_name`). Only the fields passed change. |
| `delete_skill` | Deletes a user skill permanently. The agent should ask first unless you asked for the deletion. |

Both `list_skills` and `load_skill` read system and user skills. The three authoring tools refuse a system skill's name. Names are matched in lowercase and a leading slash is ignored, so `/Release-Notes` and `release-notes` are the same skill.

---

## The / slash command in chat

Type `/` at the start of a word in the chat composer to open a skill list. The list includes your skills and the built-in ones, and it filters by name and description as you type. Pick one and the composer inserts `/<skill-name> ` into your message.

When a message names a skill this way, the agent receives that skill's full instructions with the turn and follows them, with no `load_skill` round trip. A `/` inside a word, such as the path `src/utils`, does not count. The same picker appears in the prompt box on **New project**, where the chosen skill becomes the starter for the project. See [Global Chat](global-chat.md#slash-commands--for-skills) and [User Interface](user-interface.md).

---

## Shipped skills

The list below comes from the directories in `packages/system-skills`. Each skill is available to the agent on every install, and you can open any of them read-only from the Skills panel. Type `/` and the name to use one in chat.

### Video production

| Skill | Use it for |
|---|---|
| `storyboard-core` | Storyboards, entity casting, rendering, and timeline assembly, including the tool contracts the other video skills quote. |
| `product-commercial` | A polished product film or brand commercial. |
| `ugc-video` | Phone-shot creator videos, UGC ads, testimonials, and vlogs. |
| `script-video` | A video whose timing follows written voiceover, such as an explainer or narrated b-roll. |
| `short-film` | A narrative scene, short film, or trailer with characters, dialogue, and score. |
| `video-clone` | Analyzing a reference video and recreating its shot structure with a new product or cast. |
| `video-workflow` | A reusable video workflow for batches or repeated inputs. |
| `launch-kit` | A campaign with shared product and cast entities, stills, and several video cuts. |
| `launch-commercial` | A launch commercial built from a product page URL, delivered as an editable project with its real cost. |
| `motion-ad` | A short sound-off motion-graphics ad from a product's real screenshots and photos. |
| `commercial-beat-sheet` | A precisely timed commercial beat sheet stored as a storyboard. |
| `explainer-storyboard` | A 30 to 120 second explainer storyboard from a confirmed brief. |
| `music-video-treatment` | A beat-synced music-video treatment and storyboard from track metadata. |
| `trailer-template` | A trailer or teaser structured as eight audio-first beats. |
| `video-audio-continuity` | Keeping sound continuous across a multi-scene piece cut from generated video. |
| `nodetool-video-post` | Repairing or regenerating footage already on a timeline: cutouts, upscaling, outpainting, lip sync, and more. |

### Motion and timeline craft

| Skill | Use it for |
|---|---|
| `motion-graphics` | The entry point for building and reviewing a timeline piece. |
| `timeline-edit-ops` | Reference for editing an existing timeline with `edit_timeline` ops. |
| `motion-direction` | Setting one motion language for a piece and auditing a timeline against it. |
| `motion-principles` | Timing, easing, stagger, anticipation, and follow-through. |
| `motion-curves` | Animation curves written by hand or baked from a JavaScript body. |
| `frame-composition` | Grids, focal placement, safe areas, depth, and camera moves. |
| `beat-sync-editing` | Cutting to music and shaping pacing. |
| `color-motion` | Colour, gradients, grades, and 3D LUTs. |
| `caption-titles` | Titles, lower-thirds, captions, and end cards. |
| `logo-reveal` | Animating a brand mark for an intro sting or end card. |
| `motion-background` | Ambient backdrops and quiet loops. |

### Image, 3D, and games

| Skill | Use it for |
|---|---|
| `nodetool-sketch` | Building and editing sketches: layers, blend modes, placed images, version history. |
| `nodetool-3d-scene` | Building, editing, validating, and rendering 3D models. |
| `native-game` | Building or revising a playable game in NodeTool's built-in engine and preparing a web build. |
| `game-direction` | Setting game feel, level pacing, and art direction before building. |

### Workflows, apps, and code

| Skill | Use it for |
|---|---|
| `nodetool-workflow-builder` | Creating and editing workflow graphs, connections, and properties. |
| `nodetool-app-builder` | Building or repairing a mini app. |
| `nodetool-js-scripting` | JavaScript for the QuickJS sandbox: Code node bodies and saved JS scripts. |
| `nodetool-custom-node-developer` | New TypeScript node types and node packages. |
| `nodetool-rag-indexing` | Document ingestion, vector indexing, and retrieval pipelines. |
| `nodetool-browser-agent` | Browser automation agents for navigation, extraction, and forms. |
| `nodetool-troubleshooter` | Diagnosing a failing run on any surface, including stuck media generations. |
| `nodetool-skill-author` | Writing or revising a skill, yours or a shipped one. |

### Model prompting guides

Each guide covers how one model line reads a prompt: the structure it expects, the controls that matter, and common failures. NodeTool points the agent to the matching guide when it picks a model.

| Skill | Model line |
|---|---|
| `nano-banana-pro-prompting` | Google Nano Banana Pro (image) |
| `gpt-image-2-prompting` | OpenAI GPT Image 2 (image) |
| `flux-2-klein-prompting` | Black Forest Labs FLUX.2 [klein] (image) |
| `seedream-prompting` | ByteDance Seedream 4 and 5 (image) |
| `qwen-image-prompting` | Alibaba Qwen-Image (image, typography) |
| `veo-3-prompting` | Google Veo 3 (video) |
| `seedance-2-prompting` | ByteDance Seedance 2 (video) |
| `kling-video-prompting` | Kuaishou Kling 2.5-turbo and later (video) |
| `hailuo-prompting` | MiniMax Hailuo (video) |
| `minimax-h3-prompting` | MiniMax H3 (video) |
| `wan-2-6-prompting` | Alibaba Wan 2.6 (video) |
| `elevenlabs-audio-prompting` | ElevenLabs speech, dialogue, sound effects, and music |
| `stable-audio-prompting` | Stability Stable Audio (music and sound effects) |

### API and integration

| Skill | Use it for |
|---|---|
| `nodetool-api-reference` | Integrating over REST, tRPC, WebSocket, MCP, or the OpenAI-compatible chat API. |
| `nodetool-model-provider-config` | Providers, credentials, local models, and model selection. |
| `nodetool-chat-cli` | Chat CLI sessions, provider selection, and Global Chat features. |

The `api-*` skills document the `nodetool` object model that the agent calls from code actions. The agent loads one before its first call into that area.

| Skill | Covers |
|---|---|
| `api-workflows` | `nodetool.workflows`, `jobs`, `nodes` |
| `api-models` | `nodetool.models` |
| `api-media` | `nodetool.media`, `generations` |
| `api-assets` | `nodetool.assets`, `documents` |
| `api-web` | `nodetool.web`, `email` |
| `api-memory` | `nodetool.memory`, `shared`, `threads` |
| `api-agents` | `nodetool.agents` |
| `api-settings` | `nodetool.settings`, `secrets` |
| `api-collections` | `nodetool.collections` |
| `api-apps` | `nodetool.apps` |
| `api-timelines` | `nodetool.timelines` |
| `api-sketches` | `nodetool.sketches` |
| `api-scripts` | `nodetool.scripts` |
| `api-storyboards` | `nodetool.storyboards` |
| `api-games` | `nodetool.games` |

### Operations

| Skill | Use it for |
|---|---|
| `nodetool-deployment` | Deploying and operating servers and workers with Docker, SSH, Runpod, or cloud configuration. |

---

## Related pages

- [Global Chat](global-chat.md) for the composer and slash commands.
- [Editor Panels](editor-panels.md) for the **More** menu that holds **Skills**.
- [User Interface](user-interface.md) for starting a project from a skill.
- [Configuration](configuration.md) for `NODETOOL_SYSTEM_SKILLS_DIR`.
