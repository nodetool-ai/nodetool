---
title: "NodeTool AI Image Editor"
description: "A layered AI image editor: generate one layer with Flux, GPT Image, or your own workflow, inpaint a selection, keep versions, and let an agent edit the stack."
canonical: https://nodetool.ai/ai-image-editor
markdown: https://nodetool.ai/ai-image-editor.md
product: NodeTool
---
# NodeTool AI Image Editor

NodeTool's sketch editor is an open-source AI image editor with layers. Each layer can be painted by hand or generated from a prompt or a workflow, so you regenerate one layer and leave the rest of the image alone. Select a region to inpaint it, cut objects out with the Segment tool, and keep every generation as a version on its layer. The built-in agent and coding agents over MCP edit the same document.

## Layers that know where they came from

- **Generated layers**: Generate a layer from a prompt, a reference image or a workflow with an image output. See the estimated cost before generating.
- **Regenerate one layer**: Each generation is a version on its layer. When you change a prompt or source layer, NodeTool marks the affected layers for regeneration. Use “Re-generate Stale” to update them in order. Locked layers are skipped.
- **Inpaint a selection**: Select a region and regenerate only that region from a prompt, with the selection as the mask.
- **Segment and cut out**: The Segment tool finds objects from a point or a box and turns them into mask layers or cutout layers.
- **Layers, masks and drawing tools**: Blend modes, opacity, lock, visibility, groups, a mask layer, and vector layers imported from SVG. Paint with brush, pencil, eraser, fill, gradient, blur, and clone stamp.
- **Versions of the whole image**: Save a version before making major changes. You can restore it later without losing your current work.

## The same product in every image

- A prop entity holds your product with a reference image and a fixed description. The agent passes the reference image to the image model, to help keep the product’s appearance consistent across images.
- Describe the changes you want and add reference images to guide the edit, such as an earlier result or an example of your brand’s style.

## Agent tools

- `create_sketch, edit_sketch`: Create a sketch and change its stack: add, remove, reorder, and rename layers, set blend mode and opacity, and place an image on a layer.
- `refine_image_brief`: Expand a one-line brief into subject, composition, lighting, style, and what to leave out, for you to review before anything renders.
- `generate_image, edit_image`: Render an image or edit one on the provider and model you name, then place the result on a layer.
- `list_sketch_versions, restore_sketch_version`: Read the document's snapshots and roll back to one.
- `critique_image`: Look at a result and say what to fix before the next pass.

## Good to know

- Generation calls your own provider accounts, such as fal, OpenAI, Replicate, or Gemini, at their list price. A local model needs a machine that can run it.
- Headless agent tools change the layer stack and place images. Painting on pixels needs the editor open.
- The editor keeps the last 30 undo steps. Use document versions for anything older.

## Questions

### Is there an open-source AI image editor with layers?

Yes. NodeTool's sketch editor is open source under AGPL-3.0. It has a layer stack with blend modes and masks, and any layer can be generated from a prompt or a workflow and regenerated on its own.

### Can I regenerate one part of an image without changing the rest?

Yes, in two ways. Put the part on its own generated layer and regenerate only that layer, or select a region and inpaint it with the selection as the mask.

### Which image models does it use?

The models your providers offer, such as Flux on fal or Replicate, GPT Image on OpenAI, and Gemini image models, plus local models you run yourself. You can also bind a layer to your own workflow.

### Can an AI agent edit a layered image?

Yes. The built-in agent, or Claude Code or Codex over the NodeTool MCP server, creates the sketch, adds and orders layers, generates images onto them, and restores versions. You open the same document in the editor and keep working.

### How do I keep a product the same across images?

Save the product as a prop entity with a reference image. The agent passes that reference to the image model each time, and edit_image can take more reference images to match.

## Read more

- [Sketch Editor guide](https://docs.nodetool.ai/sketch-editor)
- [AI video editor](https://nodetool.ai/ai-video-editor)
- [Storyboards made in NodeTool](https://nodetool.ai/storyboards)
- [AI for advertising](https://nodetool.ai/marketing)
- [MCP server for coding agents](https://nodetool.ai/mcp)
- [Every supported model](https://nodetool.ai/models)
