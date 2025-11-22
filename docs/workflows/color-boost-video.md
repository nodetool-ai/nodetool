---
layout: page
title: "Color Boost Video"
---

## Overview



🎨 **Color Boost Video**

This workflow processes a short segment of a video by extracting individual frames, enhancing their color intensity, and reassembling them into a modified video. Specifically:

1.	**Video Input: **A video is loaded.

2.	**Frame Iteration: **Only frames 0 to 2 are extracted.

3.	**Color Enhancement: **Each frame’s color is amplified using a factor of 3.0 with Pillow’s Enhance module.

4.	**Reassembly: **Enhanced frames are recompiled into a new video stream.

5.	**Preview: **The resulting video is displayed in a preview window.

## Tags

video, start

## Workflow Diagram

{% mermaid %}
graph TD
  video_7074f1["Video"]
  frameiterator_abb8ee["FrameIterator"]
  color_b14f76["Color"]
  frametovideo_4ca887["FrameToVideo"]
  video_7074f1 --> frameiterator_abb8ee
  frameiterator_abb8ee --> color_b14f76
  color_b14f76 --> frametovideo_4ca887
  frameiterator_abb8ee --> frametovideo_4ca887
  frameiterator_abb8ee --> frametovideo_4ca887
  frameiterator_abb8ee --> frametovideo_4ca887
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
