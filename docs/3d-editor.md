---
layout: page
title: "3D Editor"
description: "Block out a set with shapes and lights by hand or by asking the agent, and render it as a shot reference."
---

Build a rough 3D set from boxes, spheres, planes, cylinders, cones, tori, and lights. Move things by hand or ask the agent to do it, then render the scene as a reference image for a shot.

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

The editor has a toolbar across the top, three panels under it, and a status bar along the bottom.

- **Scene** on the left is the outliner.
- The viewport is in the middle.
- **Inspector** is on the right.
- **Assistant** is an optional chat panel on the far right. You can resize it.
- The status bar names the selection, tells you what the mouse does in the current mode, and counts the objects, lights, vertices, and triangles in the scene.

The viewport starts with the camera framing the whole model, shows a ground grid with a red X axis and a blue Z axis, and lights the scene with a studio environment. That lighting is for editing only. It is not saved into the model and does not count as a light in the scene. It is built in, so it also works offline.

### Toolbar

| Control | What it does |
|---|---|
| Undo, redo | Steps back and forward through your edits. The tooltip names the step |
| Move, rotate, scale | Sets the gizmo mode |
| Transform space | Switches the gizmo between world axes and the object's own axes |
| Snapping | Turns snapping on or off: 0.25 units, 15 degrees, and 0.1 scale. Holding `Ctrl` while you drag inverts the setting |
| **Add** | Adds a shape, light, or empty group. See [Adding and deleting objects](#adding-and-deleting-objects) |
| Duplicate, delete | Act on the selected object and its children |
| Keyboard shortcuts | Lists every shortcut |
| Assistant | Shows or hides the chat panel. NodeTool remembers whether you left it open |
| **Save** | Writes the scene back to the asset. A dot next to the model name marks unsaved changes |
| Close | Returns the tab to view mode. With unsaved changes, it asks before discarding them |

### Viewport controls

The bar in the top-left corner of the viewport holds **View** (front, back, right, left, top, and bottom views), frame all, focus on the selection, and three display toggles: the grid, a wireframe overlay, and light icons. The display toggles are remembered between sessions. The axis widget in the bottom-right corner turns the camera to an axis when you click it.

Drag to orbit, right-drag to pan, and scroll to zoom. Camera moves from **View**, frame, and focus are animated, so you keep your bearings.

Each light has an icon in the viewport. Click it to select the light. Directional and spot lights also draw a dashed line in the direction they shine.

---

## Keyboard shortcuts

The shortcuts work only while this editor is the visible tab and no text field has focus. Press `?` to see them in the editor.

| Keys | Action |
|---|---|
| `Ctrl+Z`, `Ctrl+Shift+Z` or `Ctrl+Y` | Undo, redo |
| `Ctrl+S` | Save |
| `G` or `W`, `R` or `E`, `S` | Move, rotate, scale |
| `X` | Toggle world and local space |
| `J` | Toggle snapping |
| `Ctrl+D` or `Shift+D` | Duplicate |
| `Delete` or `Backspace` | Delete |
| `Esc` | Clear the selection |
| `H`, `Alt+H` | Hide or show the selection, show everything |
| `F` | Focus the selection |
| `Home` or `Shift+A` | Frame the whole scene |
| `1`, `3`, `7` | Front, right, and top views. Add `Ctrl` for back, left, and bottom |
| `Shift+G`, `Shift+W` | Toggle the grid, toggle the wireframe overlay |

On macOS, `Cmd` works in place of `Ctrl` for undo, redo, save, and duplicate.

---

## Undo and redo

Every edit can be undone: gizmo drags, Inspector values, adding, duplicating, deleting, renaming, hiding, and moving objects in the outliner. Edits the agent makes go into the same history, so you can undo them too. A slider drag or a run of typing in one field undoes as one step. History keeps the last 200 steps and is cleared when the model is reloaded.

---

## The outliner

The **Scene** panel lists every object in the scene as a tree, with children indented under their parent. Each row shows an icon for the object type (mesh, light, camera, or group), its name, and an eye button that appears on hover and hides or shows the object. Hidden objects and their children are dimmed.

- Click a row to select the object. Click empty space in the outliner or the viewport to clear the selection.
- Type in the filter box to show only matching objects and their parents.
- Click the arrow next to a parent to collapse or expand it.
- Double-click a name, or press `F2`, to rename it.
- Use the arrow keys to move through the list. Left and right collapse and expand.
- Drag a row onto another row to make it a child of that object. Drop it on empty space to move it back to the scene root. The object keeps its place in the world.
- Right-click a row for rename, duplicate, focus, hide, move to scene root, and delete.

---

## Adding and deleting objects

**Add** opens a menu in three groups:

| Entry | Starts as |
|---|---|
| Box | 1 x 1 x 1 |
| Sphere | Radius 0.5 |
| Plane | 2 x 2, laid flat |
| Cylinder | Radius 0.5, height 1 |
| Cone | Radius 0.5, height 1 |
| Torus | Radius 0.5, tube 0.2 |
| Directional Light | White, intensity 1, aimed at the view center |
| Point Light | White, intensity 1, 2 units above the view center |
| Spot Light | White, intensity 10, 30-degree cone, aimed at the view center |
| Empty | An empty group to organize other objects under |

New objects appear at the point the camera orbits around, and shapes rest on the ground. New shapes get a light grey material with low metalness and high roughness. Each new object gets a unique name, so you can address it later by name.

**Duplicate** copies the selection with its children, its own geometry, and its own materials, so editing the copy leaves the original alone. The copy gets the next free name, for example "Crate 3" after "Crate 2".

There is no entry for cameras. A camera that comes in with an imported model shows up in the outliner.

---

## Transforms and the gizmo

Select an object and a gizmo appears on it, with a box around its bounds. Drag the gizmo handles to move, rotate, or scale the object.

For exact values, use the **Transform** section of the Inspector. **Position**, **Rotation**, and **Scale** each have X, Y, and Z fields. Rotation is in degrees. The numbers update while you drag the gizmo. Drag an X, Y, or Z label left or right to scrub its value. Hold `Shift` for fine steps or `Ctrl` for coarse ones. The reset button next to each row sets it back to zero, or to one for scale.

Children move with their parent, because transforms are relative to the parent in the tree.

---

## Inspector

The Inspector shows the selected object's name and type, then collapsible sections. Which sections appear depends on what you selected.

### Transform

Position, rotation, and scale, as described above.

### Light

A light has **Color** and **Intensity**. A point or spot light also has **Range** and **Decay**, and a spot light has **Angle** and **Penumbra**.

Directional and spot lights shine down their own forward axis. Use the rotate gizmo to aim them. Lights are written into the file with the glTF `KHR_lights_punctual` extension, so other glTF tools read them.

### Geometry

Shapes you added from the **Add** menu get a **Geometry** section. It edits the size and segment counts of that shape and rebuilds the mesh live. A box has width, height, depth, and segments. A sphere has radius, segments, and angle ranges. The plane, cylinder, cone, and torus have their own sets.

Meshes that arrive inside an imported model have no editable geometry parameters, so they have no **Geometry** section.

### Material

Meshes get a **Material** section. A mesh with several materials shows a **Slot** picker first. The section has:

- Colors: **Base Color**, **Emissive**, and a few specialty colors
- Sliders: **Metalness**, **Roughness**, **Emission** intensity, **Opacity**, and the physical-material set (**Clearcoat**, **Sheen**, **Transmission**, **Iridescence**, **IOR**, and others)
- Toggles: **Transparent**, **Wireframe**, **Flat Shading**, **Depth Test**, **Depth Write**, and others
- **Side**, with Front, Back, and Double

Lowering **Opacity** turns on transparency. Raising it back to 1 turns transparency off again, unless the material was transparent before you changed it. For a blockout, **Base Color**, **Roughness**, and **Metalness** are usually enough.

### Rendering

**Visible**, **Cast Shadow** and **Recv Shadow** for meshes, **Frustum Cull**, and **Render Order**.

---

## Asking the agent

Click the sparkle button in the toolbar to open the **Assistant** panel. It is labeled "3D Assistant" and suggests prompts such as "add a red box and a sphere above it", "make the floor blue", and "list everything in the scene".

While the editor is the visible tab, the agent works on the live scene, and you see each change as it happens. It can:

- List the scene and read the selection
- Add shapes, lights, and empty groups, and select, rename, show, hide, or delete objects
- Set position, rotation (degrees), and scale
- Set a mesh's material color
- Frame the scene and capture a screenshot of the viewport, which it can look at to check its own work. The screenshot shows the model only, without the grid, gizmo, or light icons

Objects are addressed by id or by name, and names are matched without regard to case. Duplicate names make that ambiguous, so give objects distinct names.

The agent changes the open scene, and each change is a step you can undo. Changes are not on the asset until you press **Save**.

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

**Save** is the export. It serializes the scene to a `.glb` and updates the asset, then shows "Saved" with the asset name. Animations that came with an imported model are kept, also after you rename the animated object. Hidden objects are saved too, marked with a `nodetool_hidden` value in the node's `extras`, and come back hidden when the model is reopened. Other glTF tools ignore that value and show them. Names keep their spaces and punctuation. If saving fails, a banner over the viewport shows the error with a button to report it. Open the asset in the Asset Explorer to download or reuse the file like any other asset. See [Asset Management](asset-management.md).

---

## Using a model elsewhere

- **Workflows.** Drag the asset from the Asset Explorer onto the canvas to add a `nodetool.constant.Model3D` node.
- **Timelines.** The timeline add menu has a **3D model** entry that lists the glTF assets in your library and places the one you pick as a clip on a video or overlay track. You can also drag the asset onto a track. See [Video Editor](video-editor.md).
- **Image references.** A rendered PNG is an ordinary image asset, so you can drop it into a sketch or use it as a reference in an image workflow.

The editor has no direct link to the storyboard surface. Use a rendered image asset to bring a set into one.

---

## Limits

- Only `.glb` and `.gltf` files open in the editor.
- You cannot add cameras from the **Add** menu, and you cannot add new materials or textures. You can change existing material values.
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
