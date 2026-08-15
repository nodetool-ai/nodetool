---
layout: page
title: "lib.image.warp Nodes"
---

This namespace contains 8 node(s).

## Available Nodes

- **[Affine](affine.md)** - Apply an inverse 2×3 affine matrix. Each output UV maps to source (m00·u + m0...
- **[Corner Pin](cornerpin.md)** - Perspective warp via an inverse 3×3 homography (H22 fixed at 1).
- **[Displace](displace.md)** - Per-pixel UV offset driven by a displacement map (R+G channels). Useful for r...
- **[Offset](offset.md)** - Translate the image by (dx, dy) UV units with selectable wrap.
- **[Pad](pad.md)** - Pad with empty / coloured space on each side. Output enlarges to fit.
- **[Polar Remap](polarremap.md)** - Convert between rectangular and polar UV space. 0 rect→polar / 1 polar→rect.
- **[Spherize](spherize.md)** - Fisheye lens distortion centred on the source. Positive bulges out, negative ...
- **[Tile](tile.md)** - Tile the source N × M times across the same-sized canvas.
