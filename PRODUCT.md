# Product

## Register

product

## Users

### Primary: Prosumer / Creator

> When I create AI-generated images, videos, audio, stories, thumbnails, brand assets, or other media across multiple tools and providers, I want to wire models and editing steps into one reusable canvas, so I can produce better creative work faster without juggling tabs, exports, credits, or provider lock-in.

Visual-first. Comfortable with node-based tools (After Effects, TouchDesigner, Blender geometry nodes, Unreal Blueprints) but not necessarily fluent in a terminal or a Python REPL. They live inside the canvas for long sessions, often on a second monitor, iterating on a single workflow for hours. They expect NodeTool to disappear into the work the way Figma or Ableton does.

### Secondary: Technical Builder

> When I build AI workflows, agents, RAG flows, document pipelines, or custom nodes, I want a visual graph that mixes local models, cloud APIs, tools, and code-level extensibility, so I can prototype and operationalize AI workflows without rebuilding orchestration from scratch.

Comfortable in code. Reaches for NodeTool because the graph removes orchestration boilerplate, not because they are avoiding code. Wants to drop down to Python or a custom node when needed. Cares about reproducibility, version control, and running the same workflow locally and on a server.

The two personas share the canvas. We don't bifurcate the UI for them. Creators benefit from the builder's rigor (the graph really runs); builders benefit from the creator's polish (the result is a usable artifact, not a JSON dump).

## Product Purpose

NodeTool is a visual platform for composing and running AI workflows. It exists so that the people who actually make things with AI have a real tool that respects their craft. Success looks like a user shipping a generative pipeline they couldn't have built any other way, and coming back the next day to extend it.

## Brand Personality

Powerful, playful, expressive, generative. Confident enough to put a large canvas at the center of the app and trust the user to drive it; alive enough that running a workflow feels like making something, not configuring something. Voice in UI copy is direct and specific, closer to a creative tool ("Render", "Generate", "Preview") than to enterprise software ("Submit job", "Execute pipeline").

## Design Choices

Some positive commitments that shape every screen:

- **Substance over decoration.** Visual choices serve the work on the canvas, not the chrome around it.
- **Distinct identity.** NodeTool looks and feels like itself, not like a default starter template.
- **Earned density.** A professional tool may show a lot at once when the user needs it; spacing and hierarchy carry the rhythm so it never reads as clutter.
- **Craft visible at every level.** From the canvas down to a tooltip, components are considered and consistent.

## Design Principles

When we disagree, we check which principle is in tension. The first five are the decision-makers; the last two are the product commitments those decisions exist to protect. Visual principles (canvas-is-hero, tonal layering, two accents) live in `DESIGN.md`.

1. **The graph is the source of truth for computation.** Interfaces may own presentation state, but they must not hide computation from the graph. A chat panel, an inspector, or a custom UI on top of a workflow does not get to do real work invisibly. If it computes, it's a node.

2. **Optimize for the second session.** A user should be able to reopen a workflow after seven days and understand what it does, where to change it, and whether it is stale. Node names, group labels, comments, and the visual layout of the graph are not optional; they are the documentation. Auto-layout, freshness indicators, and readable defaults all serve this.

3. **Power should be visible before it is abstracted.** NodeTool's value is not "AI does everything for you." Users should see and control the workflow before we simplify it. Wizards, templates, and one-click flows are valid, but they sit on top of an inspectable graph, never instead of one.

4. **Defaults over options.** Every toggle is a permanent product tax. Add options only when both modes are common, valuable, and incompatible. A growing settings panel is a sign we have not decided yet.

5. **Make the hard thing possible before making the easy thing pretty.** Polish matters, but not when it hides missing capability. Ship the rough version of a capability that unlocks a real workflow before the elegant version of one that does not.

6. **Generative output deserves drama.** When a workflow produces an image, a video, or audio, the UI gets out of the way and lets the artifact land big, rich, and properly framed. Previews are not thumbnails crammed into a side panel; they are the moment the tool exists for.

7. **Keyboard-first, mouse-friendly.** Every primary action is reachable by keyboard, and shortcuts are surfaced in the UI rather than hidden in a settings page. The mouse and trackpad work fluidly on the canvas, but a power user, the second-session user, never needs to leave the keyboard to navigate, search, or execute.

## Canon Workflows

The reference workflows we design and test against. Every product decision should make at least one of these clearly better; no decision should make any of them worse without explicit reason. These are the surfaces where NodeTool earns or loses trust.

1. **YouTube Thumbnail.** Generate character, generate prop or vehicle, composite, add slogan, final thumbnail.
2. **Complex Movement Sequence.** Multi-step motion choreography (martial arts, dance, sports).
3. **Welcome Workflow.** A composite of TextToImage + 3D Model + Outpaint. The default first-run workflow that demonstrates multi-modality.
4. **Image Editing.** Inpaint, mask, restyle, upscale: the core single-image creative loop.
5. **Image to Video.** Animate a still; the most-asked-for upgrade path from image work.
6. **Face Replace.** Identity-preserving swap or restyle.
7. **Consistent Character.** Maintain a character across many generations and shots.
8. **Shot List to Full Story.** Shot-list-driven narrative generation.
9. **AI 2D Animation.** Frame-based 2D motion.
10. **Smartshot.** Composed cinematic shot generation.

When evaluating a design, the question is not "is this nice" but "does this make canon workflow N faster, clearer, or more reliable?".

## Accessibility & Inclusion

Target: **WCAG 2.2 AA** across the application.

- Text contrast ≥ 4.5:1 for body, ≥ 3:1 for large text and meaningful UI.
- Visible focus rings on every interactive element.
- Full keyboard navigation including the canvas (node selection, wiring, panning, zooming).
- Respect `prefers-reduced-motion` for canvas animations, transitions, and any generative motion in the UI itself.
- Color is never the sole carrier of meaning (node types, status, validation). Pair color with shape, icon, or label.
- Screen reader labels on icon-only controls.
