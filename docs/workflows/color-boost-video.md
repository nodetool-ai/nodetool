---
layout: page
title: "Color Boost Video"
---

## Overview

Extracts frames from a video, amplifies color intensity, and reassembles them into a modified video.

1. **Video Input** - A video is loaded.
2. **Frame Iteration** (`nodetool.video.ForEachFrame`) - Frames are extracted.
3. **Color Enhancement** - Each frame's exposure and saturation are amplified using `lib.image.color_grading.Exposure` and `lib.image.color_grading.SaturationVibrance`.
4. **Reassembly** (`nodetool.video.FrameToVideo`) - Enhanced frames are recompiled into a new video stream.

## Tags

video, start

## Workflow Diagram

{% mermaid %}
graph TD
  video_7074f1["Video"]
  foreachframe_abb8ee["ForEachFrame"]
  exposure_b14f76["Exposure"]
  saturation_b14f77["SaturationVibrance"]
  frametovideo_4ca887["FrameToVideo"]
  video_7074f1 --> foreachframe_abb8ee
  foreachframe_abb8ee --> exposure_b14f76
  exposure_b14f76 --> saturation_b14f77
  saturation_b14f77 --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
{% endmermaid %}
