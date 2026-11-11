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

- **Mission.** Give creators and developers an agent that builds real creative
  work on their own models and keys, and hands back a project they can open,
  change, and run again.
- **Primary tagline.** Open-source agent-first creative workspace.
- **Intro.** Create images, video, audio, and text with agents that work
  alongside you. Describe what you want, let the agent build it, then take over
  whenever you like.
- **Agent-first.** Use this in supporting copy to explain that agents operate
  the same editable workflows and documents as the creator. Keep AI in the
  primary category label.
- **The contrast.** A one-shot generation: you pay for a roll and get back a
  flat file you cannot edit. NodeTool returns a project instead, with the
  storyboard, the takes, the voice lines, and the multi-track cut still open.
  Name the contrast as a category ("most AI video apps", "hosted AI apps"),
  never as a product.
- **For agent builders.** NodeTool is the open-source creative harness: the
  tools, editors, models, keys, and step record an agent works inside. It
  serves the built-in agent and Claude Code, Codex, or Cursor over MCP.

The pitch above is the general-purpose one — README, docs, conference blurb,
app store listing. The marketing homepage uses the same tagline, and its `<h1>`
reads: "Create with AI. Make it your own."
[marketing/NARRATIVE.md](../marketing/NARRATIVE.md) owns the page narrative,
the [shared lines](../marketing/NARRATIVE.md#shared-copy) and where each one
appears, and [where "creative harness" belongs](../marketing/NARRATIVE.md#the-harness-line).

## 2. Voice

NodeTool speaks like a senior technical director: capable, practical,
transparent, unpretentious.

- **Pragmatic, not hyperbolic.** No "magic", "wizardry", "mind-blowing". We
  talk about the brief, the board, the takes, and the cut. The efficiency is
  the story.
- **Direct.** Active voice, second person, the reader in the director's chair.
  "You hold the keys. You own the project."
- **Transparent.** Costs, API limits, and model tradeoffs are stated, not
  buried. A limit goes in the same paragraph as the claim it limits.
- **Plain contrast.** A contrast a reader can check ("a flat MP4 you can't
  edit") is fine. A coined label is not: no "model sovereignty", "arbitrage",
  "bidirectional harness", "entity bibles", or "wrapper tax".

## 3. Messaging pillars

Every claim advances one of these four. A sentence that advances none is cut.
[NARRATIVE.md § Message hierarchy](../marketing/NARRATIVE.md#message-hierarchy)
sets their order on the homepage.

### Pillar 1 — Outcome before mechanism

People come to make a product video, a trailer, or an ad they will run again,
not to play with nodes. Lead with the finished asset. Show the editors and the
graph that made it second.

> "One sentence becomes a short film" (outcome) → "The agent writes the
> script, boards the shots, and cuts a multi-track timeline" (mechanism).

### Pillar 2 — An editable project

The agent's work comes back as a project, not a file. The storyboard, script,
timeline, sketch, 3D scene, game, and workflow stay open, and the agent works
in the same documents when you send it back with a note. The project holds the
brief, the references, and the takes across sessions, so nobody re-types a
brand brief on the fourth variant.

Vocabulary: project, take, re-voice, re-render one shot, reopen, rerun only
what changed.

### Pillar 3 — Your plan, your keys

The reader owns the accounts the work runs on. The agent runs on a ChatGPT,
Claude, or Gemini plan they already pay for. Other models run on their own
provider keys at the provider's list price, or locally through Ollama, MLX, or
llama.cpp. The source is AGPL-3.0.

Vocabulary: your plan, your keys, provider list price, open source, local
models.

### Pillar 4 — Built to integrate

NodeTool is the open-source creative harness inside someone's stack, not a
destination that holds them. The same tools the built-in agent uses are on the
MCP server, the CLI, and the API.

Vocabulary: creative harness, MCP server, headless execution, API endpoints,
CLI.

## 4. Dos and don'ts

| Do | Don't | Why |
|---|---|---|
| "The agent builds the board and cuts the timeline." | "Chat with our AI." | Chatbot implies text in, text out. The agent edits the documents. |
| "Your keys, at the provider's list price." | "500 credits / month." | Studio sells no credits. Provider list price is the product. |
| "Run the agent on the $20 plan you already pay for." | "Free AI video." | Plan runs count against the plan's limits, and video needs Gemini. |
| "Local models and cloud providers." | "The web app." | Ollama, MLX, and llama.cpp support matters to privacy-bound teams. |
| "Repeatable workflows." | "Generate a video." | Anyone generates one video. NodeTool builds the system that generates a hundred. |
| "Connect the models you want." | "Powered by AI." | Name the models (Flux, Veo, Kling, Claude, Gemini) to show we are model-agnostic. |
| "A Seedream 5 Lite still that costs $0.03 on Kie.ai costs $0.03 here." | "No markup." | Concrete beats categorical. Read prices from the calculator catalog. |
| "Most AI video apps hand back a flat MP4." | A competitor's name in body copy. | Compare categories. Named comparisons live on `/alternatives/*`. |

## 5. Lexicon

**Use.**

| Term | Means |
|---|---|
| Workspace | The product category: shared project context, agents, and editors. |
| Studio | The desktop edition of NodeTool. |
| Cloud | The browser edition, in alpha. Say "alpha" wherever it is offered. |
| Canvas | The node editor surface inside the workspace. |
| Project | The editable result: board, script, timeline, and the files behind them. |
| Take | One generated version of a shot or voice line. |
| Orchestrate / wire | Connecting models and steps. |
| Pipeline / workflow | One repeatable graph the user builds. Not the whole project. |
| Agent | The built-in assistant that builds and edits the project. |
| Creative harness | What an external agent works inside: tools, editors, models, keys, and a step record. Agent-builder copy only. |
| Plan / subscription | A ChatGPT, Claude, or Gemini consumer plan the agent can run on. |
| Open-weight / local | Models running on the user's own Mac or NVIDIA machine. |
| Provider rates | What the user pays. No middleman. |
| Brief / context | The input a creator supplies. |

**Avoid.**

| Term | Instead |
|---|---|
| Prompt engineering | brief, context, direction |
| Magic box / black box | name the mechanism |
| Credits / gems / coins / tokens (as billing, in Studio copy) | provider rates, list price, your plan |
| Chatbot (for the agent) | agent |
| Powered by AI | name the models |
| Users (in creator-facing copy) | creators, directors, filmmakers, teams, developers |
| Closed AI studio (as an enemy) | most AI video apps, hosted AI apps (as a category) |
| Radical, sovereign, arbitrage | state the fact the word stands in for |

The banned words in [WRITING_STYLE.md § Forbidden expressions](WRITING_STYLE.md#forbidden-expressions)
apply on top of this table.

## 6. Feature to benefit

Ship the benefit. The feature is the evidence.

| Feature | Benefit |
|---|---|
| Editors the agent works in (storyboard, script, timeline, sketch, 3D, game, nodes) | The agent's work comes back as a project you can change by hand. |
| Video-to-video revision on one shot | Fix one shot without paying to regenerate the film. |
| Sign in with ChatGPT or Claude | Run the agent on the plan you already pay for, not a metered API bill. |
| Bring your own API keys | Pay each provider its own list price, through your own account. |
| Cost estimate in the workflow editor | See what a run should cost before you start it. |
| MCP server | Give Claude Code, Codex, or Cursor the same editors and tools. |
| Local model support (MLX, Ollama, llama.cpp) | Work that never leaves the machine, and costs nothing after the download. |
| Headless CLI and API | Run the same pipeline in CI that you built on the canvas. |

## 7. Checklist

Before shipping copy:

- [ ] The lead is an outcome, not a mechanism.
- [ ] Every capability claim traces to code, a generated catalog, or a doc
      that cites code. See [NARRATIVE.md § Claims need code](../marketing/NARRATIVE.md#claims-need-code).
- [ ] No term from the avoid table, and none from the forbidden list.
- [ ] Cost and ownership stated as fact, with the limit beside the claim.
- [ ] Contrast names a category, never a product, outside `/alternatives/*`.
- [ ] Model and provider names where a reader is checking for a specific one.
- [ ] A shared line changed in one place is changed in all of them.

## Related

- [WRITING_STYLE.md](WRITING_STYLE.md) — prose mechanics and the forbidden-expressions list
- [marketing/NARRATIVE.md](../marketing/NARRATIVE.md) — what nodetool.ai says, in what order
- [marketing/PRODUCT.md](../marketing/PRODUCT.md) — users, brand personality, design principles
- [marketing/POSITIONING_PLAN.md](../marketing/POSITIONING_PLAN.md) — competitive positioning and launch plan
- [DEVELOPMENT_STANDARDS §19](DEVELOPMENT_STANDARDS.md#19-documentation--comments) — documentation rules
