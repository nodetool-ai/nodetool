# Product

## Register

product

## Users

### Primary: Prosumer / Creator

> When I create AI-generated images, videos, audio, stories, thumbnails, brand assets, or other media across multiple tools and providers, I want to wire models and editing steps into one reusable canvas, so I can produce better creative work faster without juggling tabs, exports, credits, or provider lock-in.

Visual-first. Comfortable with node-based tools (After Effects, TouchDesigner, Blender geometry nodes, Unreal Blueprints, ComfyUI) but not necessarily fluent in a terminal or a Python REPL. They live inside the canvas for long sessions, often on a second monitor, iterating on a single workflow for hours. They expect NodeTool to disappear into the work the way Figma or Ableton does.

### Secondary: Technical Builder

> When I build AI workflows, agents, RAG flows, document pipelines, or custom nodes, I want a visual graph that mixes local models, cloud APIs, tools, and code-level extensibility, so I can prototype and operationalize AI workflows without rebuilding orchestration from scratch.

Comfortable in code; reaches for NodeTool because the graph removes the orchestration boilerplate, not because they're avoiding code. Wants to drop down to Python or a custom node when needed. Cares about reproducibility, version control, and running the same workflow locally and on a server.

The two personas share the canvas. We don't bifurcate the UI for them. Creators benefit from the builder's rigor (the graph really runs); builders benefit from the creator's polish (the result is a usable artifact, not a JSON dump).

## Product Purpose

NodeTool is a visual platform for composing and running AI workflows. It exists so that the people who actually make things with AI — not just prompt them — have a real tool that respects their craft. Success looks like a user shipping a generative pipeline they couldn't have built any other way, and coming back the next day to extend it.

## Brand Personality

Powerful, playful, expressive, generative. Confident enough to put a giant ReactFlow canvas at the center of the app and trust the user to drive it; alive enough that running a workflow feels like making something, not configuring something. Voice in UI copy is direct and specific — closer to a creative tool ("Render", "Generate", "Preview") than to enterprise software ("Submit job", "Execute pipeline"). No corporate hedging; no exclamation marks; no "Awesome!" toasts.

## Anti-references

**Generic SaaS dashboard.** No cream cards on cream backgrounds, no hero-metric tiles, no gradient CTAs, no identical card grids of "features". No Inter-on-slate, no rounded-2xl-on-everything Vercel-template look. If a screen could be reskinned and shipped as a CRM, redesign it.

Adjacent traps to avoid: enterprise no-code (n8n / Zapier marketing-y empty states), ComfyUI developer-raw (power without craft), and sterile Notion-minimal (too quiet for a creative tool). NodeTool sits in none of these lanes.

## Design Principles

When we disagree, we check which principle is in tension. The first five are the decision-makers (use them to break ties); the last two are the product commitments they exist to protect. Visual principles (canvas-is-hero, tonal layering, two accents) live in DESIGN.md.

1. **The graph is the source of truth for computation.** Interfaces may own presentation state, but they must not hide computation from the graph. A chat panel, an inspector, a custom UI on top of a workflow — none of them get to do real work invisibly. If it computes, it's a node.

2. **Optimize for the second session.** A user should be able to reopen a workflow after seven days and understand what it does, where to change it, and whether it is stale. Node names, group labels, comments, and the visual layout of the graph are not optional; they are the documentation. Auto-layout, freshness indicators, and readable defaults all serve this.

3. **Power should be visible before it is abstracted.** NodeTool's wedge is not "AI does everything for you." Users should see and control the workflow before we simplify it. Wizards, templates, and one-click flows are valid, but they sit on top of an inspectable graph, never instead of one.

4. **Defaults over options.** Every toggle is a permanent product tax. Add options only when both modes are common, valuable, and incompatible. Settings panels that grow unbounded are a failure to decide.

5. **Make the hard thing possible before making the easy thing pretty.** Polish matters, but not when it hides missing capability. Ship the rough version of a capability that unlocks a real workflow before the elegant version of one that doesn't.

6. **Generative output deserves drama.** When a workflow produces an image, a video, or audio, the UI gets out of the way and lets the artifact land big, rich, and properly framed. Previews are not thumbnails crammed into a side panel; they are the moment the tool exists for. A creator opens NodeTool to make something; the product should honor that something when it arrives.
