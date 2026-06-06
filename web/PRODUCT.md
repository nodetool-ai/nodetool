# Product

## Register

product

## Users

NodeTool is built for **creative artists**: designers, illustrators, photographers, video editors, motion artists, audio producers, and the growing community of independent creators working with generative AI.

> When I create AI-generated images, videos, audio, stories, thumbnails, brand assets, or other media across multiple tools and providers, I want to wire models and editing steps into one reusable canvas, so I can produce better creative work faster without juggling tabs, exports, credits, or provider lock-in.

Visual-first. Comfortable with node-based tools (After Effects, TouchDesigner, Blender geometry nodes, Unreal Blueprints) but not necessarily fluent in a terminal or a Python REPL. They live inside the canvas for long sessions, often on a second monitor, iterating on a single workflow for hours. They expect NodeTool to disappear into the work the way Figma or Ableton does.

Their job-to-be-done is creative output, not infrastructure. The graph is a means to an end, and the end is a finished image, video, audio piece, or campaign asset they are proud of.

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

When we disagree, we check which principle is in tension. The first five are the decision-makers; the last is the product commitment those decisions exist to protect. Visual principles (canvas-is-hero, tonal layering, two accents) live in `DESIGN.md`.

1. **The graph is the source of truth for computation.** Interfaces may own presentation state, but they must not hide computation from the graph. A chat panel, an inspector, or a custom UI on top of a workflow does not get to do real work invisibly. If it computes, it's a node.

2. **Optimize for the second session.** A user should be able to reopen a workflow after seven days and understand what it does, where to change it, and whether it is stale. Node names, group labels, comments, and the visual layout of the graph are not optional; they are the documentation. Auto-layout, freshness indicators, and readable defaults all serve this.

3. **Power should be visible before it is abstracted.** NodeTool's value is not "AI does everything for you." Users should see and control the workflow before we simplify it. Wizards, templates, and one-click flows are valid, but they sit on top of an inspectable graph, never instead of one.

4. **Defaults over options.** Every toggle is a permanent product tax. Add options only when both modes are common, valuable, and incompatible. A growing settings panel is a sign we have not decided yet.

5. **Make the hard thing possible before making the easy thing pretty.** Polish matters, but not when it hides missing capability. Ship the rough version of a capability that unlocks a real workflow before the elegant version of one that does not.

6. **Generative output deserves drama.** When a workflow produces an image, a video, or audio, the UI gets out of the way and lets the artifact land big, rich, and properly framed. Previews are not thumbnails crammed into a side panel; they are the moment the tool exists for.

## Accessibility & Inclusion

Target: **WCAG 2.2 AA** across the application.

- Text contrast ≥ 4.5:1 for body, ≥ 3:1 for large text and meaningful UI.
- Visible focus rings on every interactive element.
- Full keyboard navigation including the canvas (node selection, wiring, panning, zooming).
- Respect `prefers-reduced-motion` for canvas animations, transitions, and any generative motion in the UI itself.
- Color is never the sole carrier of meaning (node types, status, validation). Pair color with shape, icon, or label.
- Screen reader labels on icon-only controls.
