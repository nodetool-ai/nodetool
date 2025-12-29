---
layout: page
title: "Image Enhance"
---

## What You'll Create

**Polish your images with AI-powered enhancement**—sharpen details, boost contrast, and bring out the best in your photos. Perfect for photographers, designers, and anyone who wants to elevate their visual content quickly.

**Learning outcomes:**
- ✅ Chain multiple image transformations
- ✅ See how creative nodes connect in sequence
- ✅ Understand non-destructive editing workflows
- ✅ Learn to build reusable enhancement pipelines

**Time to complete:** 3 minutes  
**Difficulty:** Beginner (great second workflow)

---

## Why Creators Use This Workflow

**For photographers:** Quick polish before sharing or printing  
**For designers:** Enhance client images before incorporating into designs  
**For content creators:** Improve visual quality for social media posts  
**For agencies:** Create consistent enhancement pipelines for all projects  

---

## Overview

A simple but powerful image enhancement pipeline using basic but effective techniques: sharpening for crisp details, auto-contrast for perfect exposure balance.

**The Creative Pipeline:**

1. **Image Input** – Your original photo or artwork
2. **Sharpen** – Enhance edges and fine details (makes images pop)
3. **Auto Contrast** – Optimize brightness and contrast automatically
4. **Image Output** – Your polished result, ready to use

**Think of it like:** A Photoshop action or Lightroom preset, but you can see and modify each step.

---

## 🎨 The Enhancement Process

### Input
Load any image: portraits, landscapes, product photos, digital art—anything you want to enhance.

### Sharpen
Applies intelligent sharpening to make details crisp without over-processing. Perfect for:
- Product photography
- Portraits (subtle detail enhancement)
- Landscape photos
- Screenshots and graphics

### Auto Contrast
Automatically analyzes your image and adjusts contrast for maximum visual impact. Great for:
- Fixing underexposed photos
- Balancing backlit images
- Enhancing flat-looking images
- Quick corrections without manual tweaking

### Output
Your enhanced image, ready to save, share, or use in other creative projects.

---

## Advanced Enhancement Options

Want more power? Check out these node libraries for professional-grade enhancements:

- **Replicate.Image.Process** – Advanced AI-powered image processing
- **Replicate.Image.Upscale** – AI upscaling for dramatic quality improvements
- **Nodetool.Image.Transform** – More color, brightness, and effect controls

**Pro tip:** Add these nodes before or after the basic enhancement for even better results!

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

1. **Open NodeTool** and find "Image Enhance" in Templates or create manually
2. **Load your image:**
   - Click the Image Input node
   - Upload any photo (JPG, PNG, WebP)
   - Or drag an image directly onto the node
3. **Adjust settings** (optional):
   - Click Sharpen node to control sharpness intensity
   - Auto Contrast works automatically (no settings needed!)
4. **Run enhancement** – Press <kbd>Ctrl/⌘ + Enter</kbd> or click Run
5. **See before/after:**
   - Preview the enhanced result
   - Compare with your original
6. **Save or export:**
   - Right-click the output preview
   - Save to your asset library or export

**Creative tips:**
- Try different sharpness levels—more isn't always better!
- Works great in batch: connect multiple images through the same enhancement
- Save as a Mini-App for quick client photo processing
- Chain with other workflows: enhance → add text → create poster

---

## Real-World Creative Uses

**Product photography:** Polish product shots for e-commerce listings  
**Social media:** Quick enhancement before posting  
**Print preparation:** Ensure images look sharp in print  
**Client work:** Fast, consistent enhancement for photo batches  
**Portfolio work:** Give your best work that extra polish

---

## Level Up: Next Creative Workflows

1. **[Movie Posters](movie-posters.md)** – Combine enhancement with AI generation
2. **[Color Boost Video](color-boost-video.md)** – Apply similar enhancements to video
3. **[Story to Video](story-to-video-generator.md)** – Create complete multimedia projects

Browse all [creative workflows](/workflows/) for more inspiration.
