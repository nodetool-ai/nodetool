---
layout: page
title: "Brand & Verbal Guidelines"
permalink: /brand
description: "NodeTool brand and verbal guidelines — positioning, voice, messaging pillars, lexicon, and feature-to-benefit framing."
---

# NodeTool Brand & Verbal Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [Writing Style](WRITING_STYLE.md) → **Brand & Verbal Guidelines**

What NodeTool says about itself, and in whose voice. [WRITING_STYLE.md](WRITING_STYLE.md)
governs prose mechanics — the words that are banned and the sentences that get
cut. This file governs the message: positioning, pillars, lexicon, and how a
feature becomes a benefit. Both apply to the marketing site, product copy,
docs, release notes, node and workflow descriptions, and social posts.

When copy and this file disagree, one of them is wrong. Fix both in the same
change.

## 1. Identity and positioning

- **Mission.** Give creators and developers control over multi-modal AI
  orchestration without platform lock-in, credit markups, or lost context.
- **Elevator pitch.** NodeTool is the open canvas for multi-modal AI. It
  connects image, video, audio, and language models into repeatable workflows
  that run in the cloud, locally on your own hardware, or headless over MCP.
- **What we are against.** The closed AI studio: a model list they picked,
  priced in their credits, saved in a project only their app opens. Five
  browser tabs, lost context and markups are symptoms of it, not the enemy.

The pitch above is the general-purpose one — README, docs, conference blurb,
app store listing. The marketing homepage runs a narrower, filmmaker-first
line; [marketing/NARRATIVE.md](../marketing/NARRATIVE.md) owns that hero and
wins on nodetool.ai. The two must not contradict each other: both say the
creator directs and keeps the project file.

## 2. Voice

NodeTool speaks like a senior technical director: capable, practical,
transparent, unpretentious.

- **Pragmatic, not hyperbolic.** No "magic", "wizardry", "mind-blowing". We
  talk about orchestration, pipelines, and execution. The efficiency is the
  story.
- **Direct.** Active voice, second person, the user in the director's chair.
  "You hold the keys. You own the canvas."
- **Transparent.** Costs, API limits, and model tradeoffs are stated, not
  buried. Complexity is tamed in the open, never hidden.

## 3. Messaging pillars

Every claim advances one of these four. A sentence that advances none is cut.

### Pillar 1 — Outcome before mechanism

People come to build a product video, a trailer, or an ad pipeline, not to play
with nodes. Lead with the finished asset; reveal the canvas that made it second.

> "Turn one product brief into a finished campaign" (outcome) → "One canvas to
> write, generate, and edit" (mechanism).

### Pillar 2 — Radical ownership

The user owns the data, the keys, and the infrastructure. This is the position
closed platforms cannot copy.

Vocabulary: your keys, at cost, open source, local-first, MLX / Ollama /
llama.cpp, no markups.

### Pillar 3 — Persistent context

Chat interfaces forget. The canvas is a workspace that holds the brief, the
references, and the takes across sessions, so nobody re-types a brand brief on
the fourth variant.

Vocabulary: stateful, global references, persistent context, repeatable.

### Pillar 4 — Built to integrate

NodeTool is an engine inside someone's stack, not a destination that holds them.
Developer interoperability is a headline feature, not a footer link.

Vocabulary: MCP server, headless execution, API endpoints, CLI, spec-driven.

## 4. Dos and don'ts

| Do | Don't | Why |
|---|---|---|
| "The agent wires the studio." | "Chat with our AI." | Chatbot implies text in, text out. The agent edits the canvas and connects nodes. |
| "Your keys, at cost." | "500 credits / month." | Credits imply a markup and lock-in. Provider list price is the product. |
| "Local-first and cloud." | "The web app." | MLX, Ollama, and llama.cpp support is the differentiator for privacy-bound users. |
| "Repeatable workflows." | "Generate a video." | Anyone generates one video. NodeTool builds the system that generates a hundred. |
| "Connect the models you want." | "Powered by AI." | Name the models — Flux, Veo, Kling, Claude, Gemini — to show we are model-agnostic. |
| "A Seedance run that costs $0.18 on KIE costs $0.18 here." | "No markup." | Concrete beats categorical. |

## 5. Lexicon

**Use.**

| Term | Means |
|---|---|
| Studio | The product. Not "workspace", "platform", or "tool". |
| Canvas | The surface where the work happens, inside the studio. |
| Orchestrate / wire | Connecting models and steps. |
| Pipeline / workflow | The repeatable system the user builds. |
| Agent | The built-in assistant that configures the canvas. |
| Open-weight / local-first | Models running on the user's own MacBook or NVIDIA box. |
| Provider rates | What the user pays. No middleman. |
| Brief / context | The input a creator supplies. |

**Avoid.**

| Term | Instead |
|---|---|
| Prompt engineering | brief, context, direction |
| Magic box / black box | name the mechanism |
| Credits / gems / coins / tokens (as billing) | provider rates, at cost, list price |
| Chatbot (for the agent) | agent |
| Powered by AI | name the models |
| Users (in creator-facing copy) | creators, directors, filmmakers, developers |

The banned words in [WRITING_STYLE.md § Forbidden expressions](WRITING_STYLE.md#forbidden-expressions)
apply on top of this table.

## 6. Feature to benefit

Ship the benefit; the feature is the evidence.

| Feature | Benefit |
|---|---|
| Multi-modal node graph | Stop juggling five browser tabs to make one video. |
| Bring your own API keys | Never pay a marked-up credit subscription again. |
| MCP server export | Call your NodeTool pipelines from Cursor or Claude Code. |
| Cost-aware agent rendering | See what a generation costs across four providers before you click run. |
| Local model support (MLX, Ollama, llama.cpp) | Work that never leaves the machine, and costs nothing after the download. |
| Headless CLI and API | Run the same pipeline in CI that you built on the canvas. |

## 7. Checklist

Before shipping copy:

- [ ] The lead is an outcome, not a mechanism.
- [ ] No term from the avoid table, and none from the forbidden list.
- [ ] Cost and ownership stated as fact, not as a pitch.
- [ ] Model and provider names where a reader is checking for a specific one.
- [ ] Claims are concrete: a number, a model name, a price, a path.

## Related

- [WRITING_STYLE.md](WRITING_STYLE.md) — prose mechanics and the forbidden-expressions list
- [marketing/NARRATIVE.md](../marketing/NARRATIVE.md) — what nodetool.ai says, in what order
- [marketing/PRODUCT.md](../marketing/PRODUCT.md) — users, brand personality, design principles
- [marketing/POSITIONING_PLAN.md](../marketing/POSITIONING_PLAN.md) — competitive positioning and launch plan
- [DEVELOPMENT_STANDARDS §19](DEVELOPMENT_STANDARDS.md#19-documentation--comments) — documentation rules
