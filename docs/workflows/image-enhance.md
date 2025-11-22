---
layout: page
title: "Image Enhance"
---

## Overview

Improve image quality with basic enhancement tools like sharpening, contrast and color adjustment

The **Nodetool.Image.Enhance** namespace contains nodes for basic image enhancement.

1. **Image Input** - Load the source image

2. **Sharpen** - Apply sharpening filter to enhance edges and details

3. **Auto Contrast** - Automatically adjust contrast for optimal visibility

4. **Image Output** - Save the enhanced result

## Advanced Options:

Check the **Replicate.Image.Process** and **Replicate.Image.Upscale** namespaces for more advanced image enhancement nodes.

## Tags

image, start

## Workflow Diagram

{% mermaid %}
graph TD
  enhanced_97877["enhanced"]
  image_97879["image"]
  sharpen_9d8850["Sharpen"]
  autocontrast_4c9c6b["AutoContrast"]
  image_97879 --> sharpen_9d8850
  sharpen_9d8850 --> autocontrast_4c9c6b
  autocontrast_4c9c6b --> enhanced_97877
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
