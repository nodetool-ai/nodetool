---
layout: page
title: "3D Editor"
description: "Block out a set with shapes and lights by hand or by asking the agent, and render it as a shot reference."
---

Build a rough 3D set from boxes, spheres, planes, cylinders, tori, and lights. Move things by hand or ask the agent to do it, then render the scene as a reference image for a shot.

> **Quick access:** Click the **+** button in the workspace tab bar and choose **New 3D model**, or open a `.glb` or `.gltf` asset and switch its tab to edit mode.

---

## What a 3D model is

A 3D model in NodeTool is a glTF asset. The editor reads and writes `.glb` and `.gltf` files only. A new model is a `.glb`, and **Save** always writes binary glTF back over the same asset. The asset id does not change, so anything that points at it keeps working.

| File | Opens in the editor | Notes |
|---|---|---|
| `.glb`, `.gltf` | Yes | Editable and saveable |
| `.obj`, `.fbx`, `.stl`, `.ply`, `.usdz` | No | The tab opens, but the viewer reports that the format is not supported. Supported formats are `.glb` and `.gltf` |

When a model is not editable, or the tab is in view mode, you get the viewer instead. The viewer orbits, zooms, and toggles the grid, axes, and wireframe. See [Asset Management](asset-management.md#asset-viewers).

---

## Creating or opening a model

There are four ways in.

1. **New model.** Click **+** in the workspace tab bar and choose **New 3D model**. NodeTool creates an asset in the current project that holds a single box named "Box", and opens it in edit mode.
2. **From an asset.** Open a `.glb` or `.gltf` in the asset viewer and click **Edit in 3D Editor**. This button appears for assets in your library.
3. **From the examples.** On the Examples page, open the **3D models** tab. It lists low-poly game models in six packs: Adventure, Dungeon, Platformer, Seaside, Sci-fi, and Sci-fi outpost. **Open model** copies the model into the current project and opens the copy in edit mode, so the original stays untouched.
4. **From the agent.** Ask the agent to create a model, as described under [Asking the agent](#asking-the-agent).

---

## Layout

The editor has a toolbar across the top and three panels under it.

- **Scene** on the left is the outliner.
- The viewport is in the middle.
- **Properties** is on the right.
- **Assistant** is an optional chat panel on the far right. You can resize it.

The viewport starts with the camera at a three-quarter view, shows a ground grid, and lights the scene with a studio environment. That lighting is for editing only. It is not saved into the model and does not count as a light in the scene.

### Toolbar

| Control | What it does |
|---|---|
| Translate, rotate, scale toggle | Sets the gizmo mode. Shortcuts: `G`, `R`, `S` |
| **Add** | Adds a shape or light. See [Adding and deleting objects](#adding-and-deleting-objects) |
| Delete | Removes the selected object and its children. Shortcut: `Delete` or `Backspace` |
| Frame scene | Fits the camera to everything in the scene |
| Toggle grid | Shows or hides the grid |
| Assistant | Shows or hides the chat panel. NodeTool remembers whether you left it open |
| **Save** | Writes the scene back to the asset. Shortcut: `Ctrl+S` or `Cmd+S` |
| Close | Returns the tab to view mode |

The shortcuts work only while this editor is the visible tab.

---

## The outliner

The **Scene** panel lists every object in the scene as a tree, with children indented under their parent. Each row shows an icon for the object type (mesh, light, camera, or group), its name, and an eye button that hides or shows the object. An empty scene shows "Scene is empty".

Click a row to select the object. Click empty space in the viewport to clear the selection.

---

## Adding and deleting objects

**Add** opens a menu with seven entries:

| Entry | Starts as |
|---|---|
| Box | 1 x 1 x 1 |
| Sphere | Radius 0.5 |
| Plane | 2 x 2, laid flat |
| Cylinder | Radius 0.5, height 1 |
| Torus | Radius 0.5, tube 0.2 |
| Directional Light | White, intensity 1, placed at 2, 3, 2 and aimed at the origin |
| Point Light | White, intensity 1, placed at 0, 2, 0 |

New shapes get a light grey material with low metalness and high roughness. Each new object gets a unique name, so you can address it later by name.

There is no entry for cameras or spot lights. A camera or spot light that comes in with an imported model shows up in the outliner.

---

## Transforms and the gizmo

Select an object and a gizmo appears on it. Drag the gizmo handles to move, rotate, or scale the object. Switch modes with the toolbar toggle or the `G`, `R`, and `S` keys.

For exact values, use the **Object** tab in the Properties panel. **Position**, **Rotation**, and **Scale** each have X, Y, and Z fields. Rotation is in degrees. The numbers update while you drag the gizmo.

Children move with their parent, because transforms are relative to the parent in the tree.

---

## Properties

The Properties panel has up to three tabs. Which ones appear depends on what you selected.

### Object

Every object has the **Object** tab:

- **Name**, **Visible**, **Frustum Cull**, and **Render Ord**
- **Cast Shadow** and **Recv Shadow** for meshes
- A **Transform** section with Position, Rotation, and Scale
- A **Light** section for lights, described next

### Lights

A light has **Color** and **Intensity**. A point light also has **Distance** and **Decay**.

A directional light shines down its own forward axis. Use the rotate gizmo to aim it. Lights are written into the file with the glTF `KHR_lights_punctual` extension, so other glTF tools read them.

### Geometry

Shapes you added from the **Add** menu get a **Geometry** tab. It edits the size and segment counts of that shape and rebuilds the mesh live. A box has width, height, depth, and segments. A sphere has radius, segments, and angle ranges. The plane, cylinder, and torus have their own sets.

Meshes that arrive inside an imported model have no editable geometry parameters, so they have no **Geometry** tab.

### Material

Meshes get a **Material** tab. It has:

- Colors: **Color**, **Emissive**, and a few specialty colors
- Sliders: **Metalness**, **Roughness**, **Emissive** intensity, **Opacity**, and the physical-material set (**Clearcoat**, **Sheen**, **Transmission**, **Iridescence**, **IOR**, and others)
- Toggles: **Transparent**, **Wireframe**, **Flat Shading**, **Depth Test**, **Depth Write**, and others
- **Side**, with Front, Back, and Double

For a blockout, **Color**, **Roughness**, and **Metalness** are usually enough.

---

## Asking the agent

Click the sparkle button in the toolbar to open the **Assistant** panel. It is labeled "3D Assistant" and suggests prompts such as "add a red box and a sphere above it", "make the floor blue", and "list everything in the scene".

While the editor is the visible tab, the agent works on the live scene, and you see each change as it happens. It can:

- List the scene and read the selection
- Add shapes and lights, and select, rename, show, hide, or delete objects
- Set position, rotation (degrees), and scale
- Set a mesh's material color
- Frame the scene and capture a screenshot of the viewport, which it can look at to check its own work

Objects are addressed by id or by name, and names are matched without regard to case. Duplicate names make that ambiguous, so give objects distinct names.

The agent changes the open scene. Changes are not on the asset until you press **Save**.

Outside the editor, the agent can also work on a model by asset id with no editor open. It can list models, create a model (optionally building the whole scene in the same call), read the scene with its bounds, apply up to 60 edit operations in one call, and validate the glTF. These edits save straight to the asset, and an open editor reloads it. See the [nodetool-3d-scene skill](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/nodetool-3d-scene/SKILL.md) for the operation list.

A few things need an open editor with a working WebGL context: framing the scene and capturing the viewport.

---

## Rendering a shot reference

The editor viewport is a quick preview. For a rendered image, the agent has a `render_model3d` tool that renders a saved model through headless Blender and store the result as a PNG image asset.

The editor has no **Render** button. You ask the agent for the render in chat, for example "render the set from a low angle at 1920 by 1080". The render takes these settings:

| Setting | Default | Notes |
|---|---|---|
| Camera | Scene camera if the model has one, otherwise an orbit camera | Orbit cameras take azimuth (45 degrees), elevation (25 degrees), field of view (35 degrees), and a zoom multiplier |
| Size | 1024 x 1024 | Plus a resolution percentage |
| Lighting | `studio` | Presets are `studio`, `soft`, and `flat`. Used only when the scene has no lights of its own |
| Light intensity | 1 | Multiplies the preset lights |
| Background | `#808080` | Or transparent |
| Engine | `eevee` | `cycles` is slower and higher quality |
| Samples | 16 | Denoise is on by default and applies to Cycles |

Requirements and behavior:

- **Blender 5.2 or newer** must be installed on the machine that runs the NodeTool server. NodeTool looks at `BLENDER_PATH` first, then `blender` on `PATH`, then the usual install locations. Set `BLENDER_PATH` to the executable if it is not found.
- Rendering is off on cloud deployments. It is available on the desktop app, a local server, and a self-hosted install. A server without Blender answers with an error that names the missing install.
- The render reads the **saved** asset. Press **Save** before you ask for a render, or the image will not show your latest edits.
- A render can run in the background. The agent gets a generation id and collects the finished image later.
- The result is an image asset in your library, so you can use it anywhere an image goes.

If you prefer a graph, the Blender nodes (`nodetool.blender.RenderImage`, `RenderAnimation`, `RenderPasses`, `PrepareForEngine`, and `ExportModel`) use the same Blender install.

---

## Exporting

**Save** is the export. It serializes the scene to a `.glb` and updates the asset, then shows "Saved" with the asset name. Animations that came with an imported model are kept. Open the asset in the Asset Explorer to download or reuse the file like any other asset. See [Asset Management](asset-management.md).

---

## Using a model elsewhere

- **Workflows.** Drag the asset from the Asset Explorer onto the canvas to add a `nodetool.constant.Model3D` node.
- **Timelines.** The timeline add menu has a **3D model** entry that lists the glTF assets in your library and places the one you pick as a clip on a video or overlay track. You can also drag the asset onto a track. See [Video Editor](video-editor.md).
- **Image references.** A rendered PNG is an ordinary image asset, so you can drop it into a sketch or use it as a reference in an image workflow.

The editor has no direct link to the storyboard surface. Use a rendered image asset to bring a set into one.

---

## Limits

- Only `.glb` and `.gltf` files open in the editor.
- You cannot add cameras or spot lights from the **Add** menu, and you cannot add new materials or textures. You can change existing material values.
- The viewport camera is not saved. It is for looking around, not for authoring a shot.
- The editor has no render button. Rendering goes through the agent and needs Blender 5.2 or newer on the server, and it is unavailable on cloud deployments.
- The agent can work on the live scene only while the editor is the visible tab.
- A render uses the saved asset. Unsaved edits do not appear in it.
- One `edit_model3d` call applies at most 60 operations.

---

## Related

- [Asset Management](asset-management.md)
- [Video Editor](video-editor.md)
- [Sketch Editor](sketch-editor.md)
- [Game Editor](game-editor.md), where a 3D game binds glTF models to its entities
