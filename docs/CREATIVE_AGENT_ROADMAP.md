---
layout: page
title: "Creative Agent Roadmap"
permalink: /creative-agent-roadmap
description: "What NodeTool needs to compete as a full script-to-render creative agent: market snapshot, capability audit, and a P0–P2 plan."
---

# Creative Agent Roadmap

> Snapshot: July 2026. Market facts below carry dates; re-verify before building on them.

What has to happen for NodeTool to be the strongest creative agent available: an agent that takes a brief and delivers a finished multi-shot video, with the plan inspectable and editable at every step. This doc records the market context, audits what the codebase already has, and lays out the work in priority order. For the user-facing walkthrough of the shipped workflow, see [Creative Agent]({{ '/creative-agent' | relative_url }}).

The first deliverable already exists: the P0 pipeline is shipped as the **Script to Screen** template (`packages/base-nodes/nodetool/examples/nodetool-base/Script to Screen.json`), built entirely from existing nodes. Everything in P0 hardens that pipeline into product features; P1 and P2 extend it.

## Market snapshot (mid-2026)

The video-generation market moved in three phases: single-clip models (2024 to early 2025), pipeline products with storyboards and reference consistency (late 2025), and agents that plan and drive production (2026). Every major player now ships a named agent:

- **Google Flow + Flow Agent** (I/O, May 2026): Gemini-powered agent with whole-project memory; brainstorms, edits, batch-operates, and recommends plot and dialogue. Scene builder and "ingredients" (reference images for character/object consistency) were already in place. "Flow Tools" lets users vibe-code creative tools inside Flow.
- **Kling 3.0 Director Mode** (Feb 2026): the model generates up to 6 shots / 15 s in one call with characters, lighting, and palette carried across shots; camera angles, durations, and pacing are dictated per shot. The model absorbed part of the assembly job.
- **ByteDance Seedance 2.0 / 2.5** (Feb / Jun 2026): multi-shot output with native stereo audio (music, ambience, synced dialogue); 2.5 does 30 s in one generation. Both on fal.
- **LTX Studio**: script → storyboard → shots → render, with "Elements" — every character, location, and object in the script becomes a reusable entity with a persistent profile enforced across shots.
- **OpenAI Sora 2**: storyboards (plan scenes/keyframes before generating), cameos, and the Disney licensing deal (Dec 2025) for 200+ characters.
- **Adobe**: Project Graph (node-based workflows across Creative Cloud, Nov 2025) plus the Firefly AI Assistant (Apr 2026), a conversational agent orchestrating Photoshop, Premiere, and the rest.
- **Comfy MCP** (Jun 2026): the ComfyUI engine exposed over MCP so external agents search models, build workflows, and execute them. **Krea Node Agent**: a sentence in, the agent reads the existing canvas, plans, wires nodes, and runs. **Figma** acquired Weavy (Oct 2025).
- One-click agents (**HeyGen Video Agent**, **InVideo Agent One**, **Vidu Agent**, **Hailuo Video Agent**): brief in, finished video out. MiniMax markets Hailuo explicitly *against* node-based workflows.

Three conclusions:

1. **A node canvas is table stakes.** Adobe, Figma, Krea, Freepik, and Runway all have one. The canvas alone no longer differentiates.
2. **The differentiator is the agent that reads and writes the canvas.** Krea Node Agent and Comfy MCP set the bar. NodeTool's graph agent mode and `ui_*` tools already match the shape; the gap is the production layer above them.
3. **Users' loudest complaints about the one-click agents are NodeTool's opening**: character drift across shots, credit burn on failed generations (users coined "CPUS" — cost per usable second), and no way to fix shot 3 without regenerating everything. An open, multi-provider tool with an inspectable plan answers all three.

## What NodeTool already has

Audited July 2026:

- **Models**: 400+ video endpoints across fal, replicate, kie, together, and atlascloud manifests (`packages/*/src/*-manifest.json`) — Veo, Kling, Sora, Seedance, Wan, LTX, Hunyuan, Luma, plus lip sync, TTS (ElevenLabs, MiniMax, OpenAI), and music (Suno via kie, MusicGen, MiniMax).
- **Generation nodes**: provider-routed `nodetool.video.TextToVideo` / `ImageToVideo` / `VideoToVideo` / `LipSync`, `nodetool.image.TextToImage` / `ImageToImage`, `nodetool.audio.TextToSpeech` / `TextToMusic` (`packages/video-nodes`, `packages/image-nodes`, `packages/audio-nodes`).
- **Editing**: ffmpeg-backed Concat, Trim, Overlay, Transition, AddSubtitles, AddAudio, ChromaKey, color tools (`packages/video-nodes/src/nodes/video.ts`); a full audio effects rack.
- **Timeline**: a real NLE — data model in `packages/timeline/`, render nodes in `packages/video-nodes/src/nodes/timeline.ts`, editor UI in `web/src/components/timeline/`, and agent tools (`ui_timeline_generate_clip`, split/trim/move/bind) in `web/src/lib/tools/builtin/timeline.ts`.
- **Agent system**: GraphPlanner authors runnable workflow graphs from an objective (`packages/agents/src/graph-planner.ts`); media tools (`generate_video`, `animate_image`, `generate_speech` in `packages/agents/src/tools/media-tools.ts`); `debug_workflow` and `validate_workflow` for self-correction; the chat agent edits the live canvas through `ui_*` tools.
- **Cost data**: per-call cost in OTel spans (`gen_ai.usage.cost_usd`), a spend dashboard (`web/src/components/costs/`), and per-node pre-run pricing for fal and kie (`FalPricingFooter`, `KieCreditsFooter`).

Confirmed absent: a storyboard/shot-list surface, a character-entity system, a direction layer, shot-continuity chaining, whole-pipeline cost estimates, live cost in chat, and (until the Script to Screen template) a shipped script-to-render example.

## P0 — the production spine

**Status: shipped (July 2026).** All four P0 features and the three P1 items landed as product code on branch `claude/nodetool-creative-agent-j96pji`. Delivered artifacts and known limits are listed under each item. P2 remains planned.

### 1. Direction layer

Shipped: `Screenplay`/`Shot`/`CameraDirection`/`ShotStatus` types in `packages/protocol/src/creative.ts`; three nodes in `packages/llm-nodes/src/nodes/director.ts` (registered via `base-nodes`): `nodetool.creative.Director` (brief → typed Screenplay + narration + music prompt), `nodetool.creative.ScreenplayShots` (streams each shot + a composed per-shot prompt), `nodetool.creative.ApplyEntities` (injects entity descriptors + reference images).

A structured screenplay artifact — scenes and shots with duration, camera, motion, dialogue, characters, and style references — produced by a Director agent from a brief, and consumed by everything downstream.

- Define `ShotList` / `Screenplay` types in `packages/protocol` (peer of the timeline types in `packages/timeline/src/types.ts`).
- A `Director` node (or agent tool) that turns a brief into that artifact. The Script to Screen template prototypes this with `nodetool.agents.Agent` + `nodetool.generators.StructuredOutputGenerator`; the product version makes the artifact typed instead of free text.
- Nodes that consume it: shot-list → per-shot generation params; shot-list → timeline clips.

### 2. Entities ("ingredients")

Reusable Character / Location / Style objects: name, reference images, voice id, optional LoRA. Stored as assets, referenced by shots in the direction artifact, auto-injected into every generation call that names them. The model layer already takes reference images and LoRAs (hundreds of manifest endpoints expose `reference_image`, `first_frame`/`last_frame`, `lora`); what's missing is the abstraction, storage, and UI. This is the single most-complained-about gap in competing products.

Shipped: `Entity`/`EntityRef` types in protocol; entities persist as assets tagged with a `nodetool_entity` metadata marker (no migration) — `web/src/serverState/useEntities.ts`; an Entity library page (`web/src/components/entities/`, opened from the rail menu); `ui_entity_list`/`ui_entity_apply` agent tools; and the `ApplyEntities` node for graph-level injection. Injection is opt-in (wire the node, or call `ui_entity_apply`); automatic injection into every generation call that names an entity is still open.

### 3. Storyboard surface

A workspace tab (peer of Timeline/Sketch in `web/src/components/workspace/`) that renders the direction artifact as shot cards: script text, style frame, generated still, then generated clip, with per-shot status, cost, and approve/regenerate. This is the plan-approve-spend gate: stills are cents, clips are dollars. Agent tools (`ui_storyboard_*`) mirror the existing timeline bridge.

Shipped: `"storyboard"` workspace tab (`web/src/components/workspace/StoryboardSurface.tsx`, `web/src/components/storyboard/`), `StoryboardStore`/`StoryboardGenerationStore`, `useGenerateShot` (keyframe via TextToImage, clip via ImageToVideo through the workflow runner), a Direct button that runs the Director node from the board (`useDirectScreenplay`), a `storyboardAgentBridge`, and nine `ui_storyboard_*` tools (get_state, set_screenplay, add/update_shot, generate_keyframe, generate_clip, revise_shot, assemble_timeline, select_shot). The original approve_shot gate was later replaced by still selection: picking a still is the go-ahead for video spend. Opened from the "New storyboard" menu item. Boards are in-memory (no persistence yet), and the per-shot cost chip has no data source until estimates land per shot.

Shipped, the timeline handoff: "Assemble timeline" (`useAssembleTimeline` + `buildTimelineDocument`) turns the board's rendered shots into a persisted timeline sequence — asset-backed clips laid end to end, plus draft narration/music text-to-audio clips — and opens the editor. Each clip carries `storyboardBoardId`/`storyboardShotId` (typed on `TimelineClip` and the protocol schema), and a shot revision round-trips into the cut via `syncShotClipToTimeline`. Verified live end to end (assemble click → persisted document → revise → clip asset swapped).

### 4. Cost governance

- Pre-run estimate for a whole workflow or timeline render, aggregated from the existing per-node pricing data (`fal-node-type-pricing.json`, `kie-node-type-pricing.json`, `cost-calculator.ts`).
- A budget parameter the agent must respect when planning generation.
- Draft mode: route to cheap/low-res models first, final render on approval.
- Live cost ticker in Global Chat (the data already flows through OTel; it stops short of the chat UI).

Shipped: `estimateWorkflowCost`/`withinBudget` in `packages/node-sdk/src/cost-estimate.ts` (aggregates fal/kie unit pricing across a graph, surfaces unpriced nodes as "unknown"); `WorkflowCostEstimatePanel` in the right panel and a `CostTicker` in Global Chat; a persisted `BudgetStore` (cap, currency, draft mode) with over-budget warnings; `useWorkflowCostEstimate`/`useLiveRunCost` hooks.

Known limits, still open: the estimate counts each node once (fan-out is not multiplied in); the draft-mode toggle stores intent but does not yet route to cheaper models; `spent` is not yet fed from run completions, so budget remaining compares against zero; the ticker reads costs from editor-runner jobs, not chat-initiated ones; and the budget is a UI warning, not an agent-side constraint.

## P1 — close the loop

5. **Flagship pipeline hardening**: evolve the Script to Screen template from Concat assembly to timeline assembly (`nodetool.timeline.AddClips` → `RenderTimeline`), add a `ShotBatch` node (structured shot list in, N parallel generations out) and a `ShotChain` node (auto last-frame → first-frame continuity between clips).

   Shipped: `nodetool.creative.ShotBatch` and `ShotChain` (`packages/llm-nodes/src/nodes/shots.ts` — sequential clips with ffmpeg last-frame extraction seeding the next shot), plus a new `Directed Film to Timeline` example that assembles onto the timeline via `AddClips` → `RenderTimeline`. Script to Screen keeps its Concat cut (both assembly styles ship as examples), and no shipped example exercises ShotChain yet.

6. **Shot-level revision**: "fix shot 3" as an agent flow — locate the clip via `ui_timeline_get_state`, regenerate through video-to-video endpoints (Aleph-class and Ray3-Modify-class models are already in the fal manifest), swap in place.

   Shipped for the storyboard: `ui_storyboard_revise_shot` + a Revise button on the shot card regenerate a shot's clip via `nodetool.video.VideoToVideo` and swap it in place — and when the board has been assembled, the revision also lands in the persisted timeline clip (`syncShotClipToTimeline`). Revising a timeline clip that has no storyboard link is still open.

7. **NodeTool MCP server**: expose the existing internal tools (`list_nodes`, `create_workflow`, `run_workflow`, `debug_workflow`, media tools) over MCP so external agents (Claude Code, ChatGPT) can drive NodeTool. Comfy MCP and vidu-skills show distribution now flows through general agents.

   Shipped: 18 workflow/creative tools bridged into the existing MCP server (`packages/websocket/src/mcp-agent-tools.ts`) and a `nodetool mcp` CLI (`serve` over stdio; `install`/`uninstall`/`status` for Claude Code, Codex, and OpenCode).

## P2 — polish and differentiation

8. **Per-shot model routing**: extend `find_model` into a router that picks the model per shot from task, budget, and style (multi-shot models for dialogue scenes, cheap models for B-roll).
9. **Semantic timeline editing**: "make the intro punchier" — the agent inspects the sequence and adjusts cuts, music, and transitions through existing `ui_timeline_*` tools; add a beat-detection → auto-cut node for music videos.
10. **Production status panel**: shots done/pending/failed, spend against budget, approve/retry — replacing chat scrollback as the record of a long production. Project-level agent memory of entities and decisions.

## Positioning

NodeTool's claim against Flow, Adobe, and Krea: the open, local-first, multi-provider creative agent where the plan is inspectable. The agent writes a graph and a timeline the user can see, edit, and re-run, with real cost control, across every model vendor instead of one. That is exactly the complaint profile (consistency, cost, editability) users voice about the closed one-click agents.
