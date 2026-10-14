---
layout: page
title: "Generate ManimGX Scene"
node_type: "nodetool.manimgx.GenerateScene"
namespace: "nodetool.manimgx"
---

**Type:** `nodetool.manimgx.GenerateScene`

**Namespace:** `nodetool.manimgx`

## Description

Describe a math or 3D animation and get a video: a language model writes a ManimGX scene, ManimGX inspects it, and the model fixes errors and layout problems from the report and storyboard before the final render.
    manim, manimgx, animation, math, explainer, generate, llm, agent, 3d, video, python

    Use cases:
    - Explain a formula, theorem or algorithm as a short animation
    - Make a 3D visualization from a sentence
    - Draft a scene to refine in a RenderScene node

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model that writes the scene. A vision model also reads the storyboard. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | What to animate. Wired dynamic inputs reach the scene as `inputs`. | `` |
| max_attempts | `int` | Write-and-inspect rounds before rendering | `3` |
| send_storyboard | `bool` | Show the model the storyboard pictures with layout problems (needs a vision model) | `true` |
| width | `int` | Video width in pixels | `1920` |
| height | `int` | Video height in pixels | `1080` |
| fps | `int` | Frames per second | `30` |
| timeout | `int` | Maximum seconds for each ManimGX run | `300` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| code | `str` |  |
| storyboard | `list[image]` |  |
| report | `str` |  |
| attempts | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.manimgx](./) namespace.
