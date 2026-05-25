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

7. **Keyboard-first, mouse-friendly.** Every primary action is reachable by keyboard, and shortcuts are surfaced (in the UI, not hidden in a settings page). The mouse and trackpad work fluidly on the canvas, but a power user — the second-session user, the marathon user — never needs to leave the keyboard to navigate, search, or execute.

## Canon Workflows

The reference workflows we design and test against. Every product decision should make at least one of these clearly better; no decision should make any of them worse without explicit reason. These are the surfaces where NodeTool earns or loses trust.

1. **YouTube Thumbnail.** Generate character → generate prop/vehicle → composite → add slogan → final thumbnail. Reference: [weavy.ai/flow/P8czUrNcuwRsH1pOl01Cv9](https://app.weavy.ai/flow/P8czUrNcuwRsH1pOl01Cv9).
2. **Complex Movement Sequence.** Multi-step martial arts (or comparable) motion choreography. Reference: [@Ror_Fly on X](https://x.com/Ror_Fly/status/2049580394052227085).
3. **Welcome Workflow.** Composite of TextToImage + 3D Model + Outpaint. The default first-run workflow that demonstrates multi-modality.
4. **Image Editing.** Inpaint, mask, restyle, upscale; the core single-image creative loop.
5. **Image → Video.** Animate a still; the most-asked-for upgrade path from image work.
6. **Face Replace.** Identity-preserving swap or restyle.
7. **Consistent Character.** Maintain a character across many generations and shots.
8. **Seedance 2.0 Shot List to Full Story.** Shot-list-driven narrative generation. Reference: [@EHuanglu on X](https://x.com/EHuanglu/status/2054932133349883962).
9. **AI 2D Animation.** Frame-based 2D motion. Reference: [@techhalla on X](https://x.com/techhalla/status/2051273931907010815).
10. **Smartshot.** Reference: [@johnAGI168 on X](https://x.com/johnAGI168/status/2050190239398781120).

When evaluating a design (`/impeccable critique`, `/impeccable shape`, etc.), the question is not "is this nice" but "does this make canon workflow N faster, clearer, or more reliable?".

## Accessibility & Inclusion

Target: **WCAG 2.2 AA** across the application. Specifically:

- Text contrast ≥ 4.5:1 for body, ≥ 3:1 for large text and meaningful UI.
- Visible focus rings on every interactive element — never `outline: none` without a replacement.
- Full keyboard navigation including the canvas (node selection, wiring, panning, zooming).
- Respect `prefers-reduced-motion` for canvas animations, transitions, and any generative motion in the UI itself.
- Color is never the sole carrier of meaning (node types, status, validation). Pair color with shape, icon, or label.
- Screen reader labels on icon-only controls — common throughout the canvas chrome.
