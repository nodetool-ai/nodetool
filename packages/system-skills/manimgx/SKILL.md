---
name: manimgx
description: "Write, inspect and render ManimGX scenes: math and 3D animations in Manim Community Edition's Python API, run by the nodetool.manimgx nodes. Use for equations, proofs, plots, geometry, 3D surfaces and explainer animations."
---

# Animate with ManimGX

ManimGX renders animations written in Manim Community Edition's Python API on a
Rust GPU engine. A scene is a Python module; the `nodetool.manimgx` nodes run
it on the machine NodeTool runs on. They need `manimgx` installed there
(`uv tool install manimgx`, Python 3.13 or newer) and are absent from the
hosted cloud, because a scene is a program.

| Node | Takes | Gives |
| :--- | :--- | :--- |
| `nodetool.manimgx.InspectScene` | `code`, `scene_name`, `times` | `ok`, `problems`, `report`, `storyboard`, `duration` |
| `nodetool.manimgx.RenderScene` | `code`, `scene_name`, `width`, `height`, `fps`, `preset`, `crf` | `video`, `storyboard`, `report`, `subtitles`, `duration` |
| `nodetool.manimgx.GenerateScene` | `prompt`, `model`, `max_attempts` | `video`, `code`, `storyboard`, `report`, `attempts` |

`GenerateScene` runs the whole loop below inside one node with a language
model. Write the scene yourself when you can see the storyboard and fix it.

## The loop

1. **Write** the module. Start from the template under
   [Authoring](#authoring).
2. **Inspect** it with `InspectScene`. `ok: false` means the scene failed:
   `report` holds the traceback trimmed to the scene's lines and a "did you
   mean" hint. `problems: true` means it ran but the 2D layout checks found
   clipped content, overlapping text or labels too small to read. Each problem
   is numbered in `report` and outlined on the storyboard. Look at the
   storyboard pictures, not only the report. 3D scenes get pictures and a
   timeline without layout checks.
3. **Fix and inspect again** until `ok` is true and `problems` is false. To
   check particular moments, pass `times: "1.5,end"`.
4. **Render** with `RenderScene` at the size and frame rate asked for. Drafts
   at 1280x720 and 30 fps render in seconds. The default is 1920x1080 at 30 fps.
5. **Deliver** the video and the scene's code. Save the code where the person
   can edit it, such as the `code` of a `RenderScene` node in their workflow.

From a code action or a Code node, call the nodes as functions:

```js
import "@nodetool-ai/sandbox-nodetool/flow";
import { inspectScene, renderScene } from "@nodetool-ai/sandbox-flow/nodetool.manimgx";

const check = await inspectScene({ code, title: "Circle area" });
if (check.ok && !check.problems) {
  const film = await renderScene({ code, width: 1280, height: 720, fps: 30, title: "Circle area" });
}
```

Extra keys such as `title` above are the node's dynamic inputs.

## Inputs from the workflow

Every node takes dynamic inputs. Their values reach the scene as a dict:

```python
from nodetool_inputs import inputs
```

Numbers, strings, lists and dicts arrive as JSON. Image, audio and video
inputs arrive as file paths: `m.ImageMobject(inputs["logo"])` for an image,
`self.add_sound(inputs["voice"])` for audio. A scene reads no other files and
reaches no network.

## Authoring

```python
import manimgx as m
from nodetool_inputs import inputs


class CircleArea(m.Scene):
    def construct(self) -> None:
        circle = m.Circle(radius=1, color=m.BLUE, fill_opacity=0.3)
        formula = m.MathTex(r"A = \pi r^2").next_to(circle, m.RIGHT, buff=0.6)
        m.VGroup(circle, formula).center()
        self.play(m.Create(circle), m.Write(formula))
        self.wait(1)
```

- Import `manimgx as m`. Put the animation in a `Scene` subclass's
  `construct`. With more than one scene in the module, set `scene_name`.
- Time advances only through `self.play(...)` and `self.wait(...)`.
  `self.add(...)` adds without animating.
- Compose placement with `VGroup`, `arrange`, `next_to`, `to_edge` and
  `center`, so labels follow their subjects. The frame is about 14.2 units wide
  and 8 tall, centred on the origin.
- `Text` for prose. `MathTex` with raw strings for LaTeX mathematics, or Typst.
  No LaTeX installation is needed.
- For changing values, animate a `ValueTracker` and derive geometry from it.
  An updater uses elapsed time or current state, never a frame count, so the
  motion keeps its timing at any `fps`.
- For 3D, derive from `m.ThreeDScene`: `self.set_camera_orientation(phi=65 *
  m.DEGREES, theta=-45 * m.DEGREES)`, `Surface`, `Sphere`, `Cube`,
  `ThreeDAxes`, `self.begin_ambient_camera_rotation(rate=0.5)`.
- `self.next_section("name")` splits a film into sections. Subcaptions and
  `self.say(...)` produce subtitles, which `RenderScene` returns as SubRip text.

ManimGX's own reference lists every class and keyword:
[manimgx.academa.ai/reference](https://manimgx.academa.ai/reference/), and
[llms.txt](https://manimgx.academa.ai/llms.txt) links the guides as Markdown.
Where ManimGX and Manim CE differ, ManimGX's page is right.

## Where the result goes next

`video` is an inline video ref. Save it as an asset, or place it on a timeline
like any generated clip. A narrated explainer keeps its timing from the voice:
write the script first (`script-video`), then size each scene's waits to its
line.
