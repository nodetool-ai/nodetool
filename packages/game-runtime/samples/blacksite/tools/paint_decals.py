#!/usr/bin/env python3
"""Paints the BLACKSITE decal images with Pillow and NumPy.

Run from the repository root:

    python3 packages/game-runtime/samples/blacksite/tools/paint_decals.py OUT_DIR

Writes RGBA PNGs for the floor stencils, hazard stripes, grime and scorch
marks. Fonts come from packages/timeline/fonts (SIL Open Font License).
Every generator uses a fixed seed, so the output is reproducible.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(__file__).resolve().parents[4] / "timeline" / "fonts"


def grunge(width, height, seed, octaves=5, base=4):
    """Multi-octave value noise in 0..1."""
    rng = np.random.default_rng(seed)
    out = np.zeros((height, width))
    weight = 1.0
    total = 0.0
    for octave in range(octaves):
        cells = base * 2 ** octave
        grid = rng.random((cells + 1, cells + 1))
        layer = Image.fromarray((grid * 255).astype(np.uint8)).resize((width, height), Image.BICUBIC)
        out += np.asarray(layer, dtype=float) / 255 * weight
        total += weight
        weight *= 0.55
    return out / total


def wear(alpha, seed, amount=0.22, speckle=0.05):
    """Removes paint where grunge noise is low and adds fine chips."""
    height, width = alpha.shape
    mask = grunge(width, height, seed)
    mask = np.clip((mask - amount) / 0.25, 0, 1)
    chips = np.random.default_rng(seed + 1).random((height, width)) > speckle
    return alpha * mask * chips


def save(path, rgb, alpha):
    height, width = alpha.shape
    image = np.zeros((height, width, 4), dtype=np.uint8)
    image[..., :3] = rgb
    image[..., 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    Image.fromarray(image, "RGBA").save(path, optimize=True)


def stencil(text, size, font_file, font_size, color, seed, tracking=0):
    width, height = size
    canvas = Image.new("L", size, 0)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(str(FONTS / font_file), font_size)
    total = sum(draw.textlength(char, font=font) + tracking for char in text) - tracking
    x = (width - total) / 2
    for char in text:
        draw.text((x, height / 2), char, font=font, fill=255, anchor="lm")
        x += draw.textlength(char, font=font) + tracking
    alpha = np.asarray(canvas.filter(ImageFilter.GaussianBlur(1.2)), dtype=float) / 255
    return np.array(color, dtype=np.uint8), wear(alpha, seed) * 0.9


def hazard(size, seed):
    width, height = size
    y, x = np.mgrid[0:height, 0:width]
    stripes = ((x + y) // (height * 0.75)) % 2 == 0
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[stripes] = (232, 168, 34)
    rgb[~stripes] = (22, 22, 24)
    border = (y < height * 0.06) | (y > height * 0.94)
    rgb[border] = (232, 168, 34)
    return rgb, wear(np.ones((height, width)), seed, 0.2, 0.03) * 0.92


def stain(size, seed, color, strength, softness):
    width, height = size
    y, x = np.mgrid[0:height, 0:width]
    radius = np.hypot((x - width / 2) / (width / 2), (y - height / 2) / (height / 2))
    shape = grunge(width, height, seed, 6, 3)
    alpha = np.clip((shape * 1.4 - radius * 0.9 - 0.15) / softness, 0, 1) * strength
    tone = (grunge(width, height, seed + 9, 4, 6)[..., None] * 0.6 + 0.7)
    rgb = np.clip(np.array(color)[None, None, :] * tone, 0, 255).astype(np.uint8)
    return rgb, alpha


def scorch(size, seed):
    width, height = size
    y, x = np.mgrid[0:height, 0:width]
    angle = np.arctan2(y - height / 2, x - width / 2)
    radius = np.hypot((x - width / 2) / (width / 2), (y - height / 2) / (height / 2))
    rng = np.random.default_rng(seed)
    rays = 0.7 + sum(rng.uniform(0.03, 0.09) * np.sin(angle * k + rng.uniform(0, 6.3)) for k in (3, 5, 7, 13, 17, 23))
    shape = grunge(width, height, seed, 6, 4)
    alpha = np.clip(1 - radius / (rays * (0.55 + 0.6 * shape)), 0, 1) ** 0.8
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[...] = (14, 12, 10)
    core = np.clip(1 - radius * 3.2, 0, 1)
    rgb[..., 0] = np.clip(14 + core * 40, 0, 255)
    rgb[..., 1] = np.clip(12 + core * 22, 0, 255)
    return rgb, alpha * 0.92


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: paint_decals.py OUT_DIR")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    save(out / "stencil-reactor.png", *stencil("REACTOR 09  //  AUTHORIZED ONLY", (2048, 256), "BebasNeue-Regular.ttf", 150, (226, 184, 72), 1, 10))
    save(out / "stencil-sector.png", *stencil("SECTOR 7", (1024, 256), "BebasNeue-Regular.ttf", 220, (210, 220, 224), 2, 18))
    save(out / "stencil-exit.png", *stencil("EXTRACTION  >>>", (1536, 256), "BebasNeue-Regular.ttf", 200, (92, 236, 240), 3, 12))
    save(out / "hazard.png", *hazard((1024, 128), 4))
    save(out / "oil.png", *stain((512, 512), 5, (10, 12, 14), 0.85, 0.35))
    save(out / "grime.png", *stain((512, 512), 6, (46, 38, 30), 0.6, 0.6))
    save(out / "scorch.png", *scorch((512, 512), 7))


if __name__ == "__main__":
    main()
