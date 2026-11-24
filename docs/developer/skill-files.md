---
layout: page
title: "Skill Files and Tools"
permalink: /developer/skill-files
description: "The SKILL.md format, where NodeTool loads system skills from, how the agent finds and loads skills, and the api-* reference skills."
---

**Navigation**: [Docs index](../index.md) | [Skills](../skills.md) → **Skill Files and Tools**

This page is for engineers who add or change system skills. For using and writing skills in the app, see [Skills](../skills.md).

System skills are files. Each lives in `packages/system-skills/<name>/SKILL.md`, and the directory name is the skill name. This is the start of `packages/system-skills/logo-reveal/SKILL.md`:

```markdown
---
name: logo-reveal
description: Animate a brand mark on a NodeTool timeline — stroke draw-on, mask wipe, staggered build, wordmark type, an idle loop, and landing the settle on a sound logo. Use for an intro sting, a sign-off, an end card, a splash, or a loader loop. Not for designing the mark itself.
---

# Logo Reveal → the sting

One idea per logo. Draw it, build it, or wipe it — never all three. The whole
reveal runs 800–2500ms and ends on the clean mark, held.
```

---

## The SKILL.md format

A `SKILL.md` has front matter between two `---` lines, then the body.

### Front matter fields

| Field | Required | Meaning |
|---|---|---|
| `name` | Yes | The skill name. Lowercase letters, digits, and hyphens, up to 64 characters, without `anthropic` or `claude`. It must equal the directory name or the skill is skipped. |
| `description` | Yes | One line saying when the skill applies. Up to 1024 characters, no `<tag>` markup. |
| `featured` | No | `true` lists a system skill in the agent's always-on catalog. Any other value, or no field, leaves it out. |

The parser reads `key: value` lines, not full YAML. Keep each value on one line. A value wrapped in a matching pair of single or double quotes has the quotes removed. Other front matter keys are ignored.

A `SKILL.md` is skipped, without an error, when any of these hold:

- The first line is not `---`, or the closing `---` line is missing.
- `name` or `description` is missing, invalid, or empty.
- The body after the front matter is empty.
- `name` differs from the directory name.

The body is everything after the closing `---`. It is plain Markdown. `load_skill` returns it in one piece, so a skill is a single `SKILL.md` and nothing beside it is read.

A user skill has the same three parts, edited as the **Name** and **Description** fields and the Markdown editor.

---

## Where NodeTool looks for system skills

On startup the agent loads system skills from the first of these that exists:

1. The directory in `NODETOOL_SYSTEM_SKILLS_DIR`, if you set it. If that directory does not exist, there are no system skills and the loader does not fall back to the other locations. See [Configuration](../configuration.md).
2. A `_skills` directory beside the bundled server, which is how the desktop app and the Docker image ship them.
3. `packages/system-skills` in a source checkout.

The files are read once per process.

---

## How the agent finds and loads skills

Every chat turn carries a catalog: the name and description of each of your skills, plus system skills marked `featured: true`. The remaining system skills are not listed, and the agent finds them with `list_skills`. Five tools reach skills:

| Tool | What it does |
|---|---|
| `list_skills` | Lists skills with name, description, and whether each is a system skill. An optional `query` matches word by word against name and description, and returns the best matches first. |
| `load_skill` | Returns one skill's full instructions by name. The agent calls it before acting on a skill the catalog only summarizes. |
| `create_skill` | Creates a user skill from `name`, `description`, and `content`. All three are required. |
| `update_skill` | Changes a user skill's `description`, `content`, or name (through `new_name`). Only the fields passed change. |
| `delete_skill` | Deletes a user skill permanently. The agent should ask first unless you asked for the deletion. |

Both `list_skills` and `load_skill` read system and user skills. The three authoring tools refuse a system skill's name. Names are matched in lowercase and a leading slash is ignored, so `/Release-Notes` and `release-notes` are the same skill. A user skill with the same name as a system skill hides the system skill in both tools.

---

## API skills

The `api-*` skills document the `nodetool` object model that code actions call. The agent loads one before its first call into that area. They are not in the always-on catalog, so the agent finds them with `list_skills`.

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
