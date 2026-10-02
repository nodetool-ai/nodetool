---
layout: page
title: "Image Enhance"
---

## Overview

A photo-editing chain of four filters. Each filter exposes numeric properties that the mini app binds to sliders. The template uses no model and no API key.

**The pipeline:**
1. **Image Input** (`nodetool.input.ImageInput`, named `image`) - Your photo. The template ships with a demo image so Run works at once.
2. **Denoise** (`lib.image.filter.GaussianBlur`) - Radius and sigma start at 0, so it changes nothing until you raise them.
3. **Brightness and Contrast** (`lib.image.color.BrightnessContrast`) - Brightness 0.05, contrast 1.15.
4. **Saturation** (`lib.image.color.HSB`) - Hue 0, saturation 1.2, brightness 1.
5. **Sharpen** (`lib.image.filter.UnsharpMask`) - Amount 1, threshold 0.02.
6. **Output** - The `enhanced_image` result.

Reorder the filters or add another from the `lib.image` namespace, and the app picks up the new controls.

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/image-enhancement.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/image-enhancement.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

image, start, example

## Workflow Diagram

{% mermaid %}
graph TD
  image["ImageInput (image)"]
  denoise["GaussianBlur (Denoise)"]
  tone["BrightnessContrast"]
  color["HSB (Saturation)"]
  sharpen["UnsharpMask"]
  enhanced["Output (enhanced_image)"]
  image --> denoise --> tone --> color --> sharpen --> enhanced
{% endmermaid %}

## How to Use

1. Open NodeTool, click **Examples** in the app menu, and load "Image Enhance"
2. Click the Image Input node and upload a photo
3. Adjust the filter properties on each node
4. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run

**Tips:**
- Raise Denoise before Sharpen on a noisy photo
- More sharpness isn't always better

## Next Steps

- [Movie Posters](movie-posters.md) - Combine enhancement with AI generation
- [Color Boost Video](color-boost-video.md) - Apply similar enhancements to video
