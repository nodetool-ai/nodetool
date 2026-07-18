---
layout: page
title: "Image Enhance"
---

## Overview

A simple image enhancement pipeline: sharpen for crisp details, then auto-contrast for better exposure balance.

**The Pipeline:**
1. **Image Input** (`nodetool.input.ImageInput`) - Your photo or artwork
2. **Unsharp Mask** (`lib.image.filter.UnsharpMask`) - Enhance edges and fine details
3. **Auto Contrast** (`lib.image.enhance.AutoContrast`) - Optimize brightness and contrast
4. **Image Output** - Your enhanced result

For more options: **Replicate.Image.Upscale** for AI upscaling, **Nodetool.Image.Transform** for color and brightness controls.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/image-enhancement.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/image-enhancement.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

image, start, photography, enhancement

## Workflow Diagram

{% mermaid %}
graph TD
  enhanced_97877["enhanced"]
  image_97879["image"]
  sharpen_9d8850["UnsharpMask"]
  autocontrast_4c9c6b["AutoContrast"]
  image_97879 --> sharpen_9d8850
  sharpen_9d8850 --> autocontrast_4c9c6b
  autocontrast_4c9c6b --> enhanced_97877
{% endmermaid %}

## How to Use

1. Open NodeTool and find "Image Enhance" in Templates
2. Click the Image Input node and upload a photo (JPG, PNG, WebP)
3. Optionally click Unsharp Mask to adjust intensity
4. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run

**Tips:**
- More sharpness isn't always better
- Works well on batches

## Next Steps

- [Movie Posters](movie-posters.md) - Combine enhancement with AI generation
- [Color Boost Video](color-boost-video.md) - Apply similar enhancements to video
