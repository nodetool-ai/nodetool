---
layout: page
title: "Color Boost Video"
---

## Overview

Extracts frames from a video, amplifies color intensity, and reassembles them into a modified video.

1. **Video Input** - A video is loaded.
2. **Frame Iteration** - Frames 0 to 2 are extracted.
3. **Color Enhancement** - Each frame's color is amplified 3x using Pillow's Enhance module.
4. **Reassembly** - Enhanced frames are recompiled into a new video stream.

## Tags

video, start

## Workflow Diagram

{% mermaid %}
graph TD
  video_7074f1["Video"]
  foreachframe_abb8ee["ForEachFrame"]
  color_b14f76["Color"]
  frametovideo_4ca887["FrameToVideo"]
  video_7074f1 --> foreachframe_abb8ee
  foreachframe_abb8ee --> color_b14f76
  color_b14f76 --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
  foreachframe_abb8ee --> frametovideo_4ca887
{% endmermaid %}
