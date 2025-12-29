---
layout: page
title: "Image Enhance"
---

## What You'll Create

Enhance your images with AI-powered sharpening and contrast adjustments. Good for photographers, designers, and content creators who want to improve visual quality quickly.

**Time to complete:** 3 minutes  
**Difficulty:** Beginner

---

## Overview

A simple image enhancement pipeline using sharpening for crisp details and auto-contrast for better exposure balance.

**The Pipeline:**
1. **Image Input** - Your photo or artwork
2. **Sharpen** - Enhance edges and fine details
3. **Auto Contrast** - Optimize brightness and contrast
4. **Image Output** - Your enhanced result

---

## The Enhancement Process

**Input:** Load any image - portraits, landscapes, product photos, digital art.

**Sharpen:** Applies intelligent sharpening to make details crisp. Good for:
- Product photography
- Portraits
- Landscape photos
- Screenshots

**Auto Contrast:** Automatically adjusts contrast for better visual impact. Good for:
- Underexposed photos
- Backlit images
- Flat-looking images

**Output:** Your enhanced image, ready to save or share.

---

## Advanced Options

For more enhancement capabilities, explore these nodes:
- **Replicate.Image.Process** - More image processing options
- **Replicate.Image.Upscale** - AI upscaling for quality improvements
- **Nodetool.Image.Transform** - Additional color and brightness controls

---

## Tags

image, start, photography, enhancement

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

1. Open NodeTool and find "Image Enhance" in Templates
2. Load your image:
   - Click the Image Input node
   - Upload a photo (JPG, PNG, WebP)
3. Adjust settings (optional):
   - Click Sharpen node to control sharpness intensity
   - Auto Contrast works automatically
4. Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
5. View the enhanced result
6. Save or export the image

**Tips:**
- Try different sharpness levels - more isn't always better
- Works well with batches - process multiple images
- Chain with other workflows for more effects

---

## Next Steps

Related workflows:
- [Movie Posters](movie-posters.md) - Combine enhancement with AI generation
- [Color Boost Video](color-boost-video.md) - Apply similar enhancements to video
- [Story to Video](story-to-video-generator.md) - Create multimedia projects

Browse all [workflows](/workflows/) for more examples.
