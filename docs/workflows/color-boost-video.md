---
layout: page
title: "Color Boost Video"
---

## Overview

Splits a video into frames, grades each frame, and reassembles the frames into a new video. A Grading Intensity input drives the saturation pass, so you can bind it to a slider in the app view.

1. **Video Input** (`nodetool.input.VideoInput`, named `source_video`) - The clip to grade. The template ships with a short demo clip.
2. **Frame Iteration** (`nodetool.video.ForEachFrame`) - Extracts frames with ffmpeg and emits `frame`, `index`, and `fps`. **Start** and **End** are frame numbers and End is inclusive. The template sets End to 2, so only three frames are graded. Set End to `-1` to grade the whole clip.
3. **Exposure** (`lib.image.color_grading.Exposure`) - Applies exposure 0.2, contrast 0.1, highlights -0.1, and shadows 0.1.
4. **Saturation and Vibrance** (`lib.image.color_grading.SaturationVibrance`) - Vibrance is 0.4. Its `saturation` property comes from the Grading Intensity input (`nodetool.input.FloatInput`, range -1 to 1, default 0.5).
5. **Reassembly** (`nodetool.video.FrameToVideo`) - Recompiles the graded frames at the `fps` that `ForEachFrame` reports, and sends the result to the `graded_video` output.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/color-boost-video.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/color-boost-video.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

video, start

## Workflow Diagram

{% mermaid %}
graph TD
  video["VideoInput (source_video)"]
  intensity["FloatInput (grading_intensity)"]
  frames["ForEachFrame"]
  exposure["Exposure"]
  saturation["SaturationVibrance"]
  assemble["FrameToVideo"]
  out["Output (graded_video)"]
  video --> frames
  frames -->|frame| exposure
  exposure --> saturation
  intensity -->|saturation| saturation
  saturation --> assemble
  frames -->|fps| assemble
  assemble --> out
{% endmermaid %}
