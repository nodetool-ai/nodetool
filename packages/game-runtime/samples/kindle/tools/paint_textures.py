#!/usr/bin/env python3
"""Paints Kindle's water, light shaft, vignette and HUD textures.

Run: python3 paint_textures.py <out-dir>
Every texture is procedural and seeded, so a rerun writes identical files.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def save(name, array):
    Image.fromarray(np.clip(array, 0, 255).astype(np.uint8)).save(OUT / name, optimize=True)


def water_sheet(frames=8, width=256, height=160, surface=22):
    """A tileable cursed-water strip: glowing surface line, caustics, depth falloff."""
    sheet = np.zeros((height, width * frames, 4), dtype=np.float32)
    xs = np.arange(width, dtype=np.float32)
    ys = np.arange(height, dtype=np.float32)[:, None]
    # Caustic noise built from integer-period sines so every frame tiles sideways.
    waves = [(1, 2.4, 0.0), (2, 1.6, 1.3), (3, 1.0, 2.1), (5, 0.6, 0.7)]
    caustic_terms = [(3, 4, 0.3), (5, 7, 1.7), (7, 3, 2.9), (4, 9, 0.9)]
    for f in range(frames):
        phase = 2 * math.pi * f / frames
        offset = np.zeros(width, dtype=np.float32)
        for period, amplitude, start in waves:
            offset += amplitude * np.sin(2 * math.pi * period * xs / width + start + phase * period)
        top = surface + offset  # surface row per column
        depth = ys - top[None, :]
        below = depth >= 0
        t = np.clip(depth / (height - surface), 0, 1)
        # Body colour: luminous teal under the surface fading to a deep blue-black.
        r = 16 + (6 - 16) * t
        g = 120 + (30 - 120) * t ** 0.7
        b = 132 + (48 - 132) * t ** 0.8
        alpha = 150 + 85 * t ** 0.6
        caustic = np.zeros((height, width), dtype=np.float32)
        for kx, ky, start in caustic_terms:
            caustic += np.sin(2 * math.pi * kx * xs[None, :] / width + ky * ys / 23.0 + start + phase * kx)
        caustic = np.clip((caustic / len(caustic_terms)) * 1.6, 0, 1) ** 3 * (1 - t) ** 1.5
        r = r + 60 * caustic
        g = g + 150 * caustic
        b = b + 140 * caustic
        # Surface rim and glints.
        rim = np.exp(-(depth / 1.6) ** 2)
        glint = (np.sin(2 * math.pi * 6 * xs / width + phase * 6 + 0.4) * 0.5 + 0.5) ** 6
        r = r * (1 - rim) + (190 + 60 * glint[None, :]) * rim
        g = g * (1 - rim) + (250) * rim
        b = b * (1 - rim) + (255) * rim
        alpha = np.where(below, np.maximum(alpha, 235 * rim), 0)
        # A soft glow just above the surface line.
        above = np.clip(-depth, 0, None)
        halo = np.where(~below, 70 * np.exp(-(above / 5.0) ** 2), 0)
        frame = np.zeros((height, width, 4), dtype=np.float32)
        frame[..., 0] = np.where(below, r, 120)
        frame[..., 1] = np.where(below, g, 240)
        frame[..., 2] = np.where(below, b, 245)
        frame[..., 3] = np.maximum(alpha, halo)
        sheet[:, f * width:(f + 1) * width] = frame
    image = Image.fromarray(np.clip(sheet, 0, 255).astype(np.uint8), "RGBA")
    # Bubbles drawn identically into every frame drift upward one step per frame.
    draw = ImageDraw.Draw(image)
    bubbles = [(rng.uniform(8, width - 8), rng.uniform(surface + 20, height - 10), rng.uniform(1.5, 3.2)) for _ in range(14)]
    for f in range(frames):
        for bx, by, radius in bubbles:
            y = surface + 10 + ((by - surface - 10 - f * 9) % (height - surface - 20))
            x = f * width + bx + 2 * math.sin(f + by)
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], outline=(180, 255, 250, 150), width=1)
    image.save(OUT / "water.png", optimize=True)


def light_shafts(width=512, height=1024):
    """Soft diagonal god rays on black, for additive sprites."""
    out = np.zeros((height, width, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    beams = [(0.30, 46, 1.0, (120, 210, 220)), (0.48, 28, 0.7, (150, 230, 225)), (0.62, 60, 0.85, (110, 180, 210)),
             (0.78, 22, 0.55, (210, 200, 170))]
    for center, spread, strength, color in beams:
        # Each beam leans right as it falls.
        cx = center * width + (yy / height) * 120
        falloff = np.exp(-((xx - cx) / spread) ** 2)
        fade = np.clip(yy / (height * 0.12), 0, 1) * np.clip((height - yy) / (height * 0.55), 0, 1) ** 1.4
        for channel in range(3):
            out[..., channel] += falloff * fade * strength * color[channel] * 0.55
    dust = rng.random((height, width)) > 0.9986
    out[dust] += 90
    image = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(1.2))
    image.save(OUT / "rays.png", optimize=True)


def vignette(width=1280, height=720):
    """Screen-fixed darkening with a hanging-root canopy along the top edge."""
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = (xx - width / 2) / (width / 2)
    ny = (yy - height / 2) / (height / 2)
    radial = np.clip((np.sqrt(nx ** 2 * 0.85 + ny ** 2) - 0.62) / 0.6, 0, 1) ** 1.6
    alpha = radial * 170
    canopy = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(canopy)
    for _ in range(46):
        x = rng.uniform(-20, width + 20)
        edge_bias = min(x, width - x) / (width / 2)
        length = rng.uniform(30, 150) * (1.4 - edge_bias)
        thickness = rng.uniform(3, 9)
        sway = rng.uniform(-18, 18)
        points = [(x + sway * math.sin(i / 6) * (i / 12), i * length / 12) for i in range(13)]
        draw.line(points, fill=235, width=int(thickness))
        draw.ellipse([points[-1][0] - thickness, points[-1][1] - thickness, points[-1][0] + thickness, points[-1][1] + thickness], fill=200)
    for x in range(0, width, 6):
        h = 10 + 14 * (math.sin(x / 37) * 0.5 + 0.5) + 30 * (1 - min(x, width - x) / (width / 2)) ** 2
        draw.rectangle([x, 0, x + 6, h], fill=245)
    canopy = canopy.filter(ImageFilter.GaussianBlur(2.2))
    alpha = np.maximum(alpha, np.asarray(canopy, dtype=np.float32))
    rgba = np.zeros((height, width, 4), dtype=np.float32)
    rgba[..., 0] = 4
    rgba[..., 1] = 5
    rgba[..., 2] = 12
    rgba[..., 3] = alpha
    save("vignette.png", rgba)


def soft_glow(size, color, name, power=2.2):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    a = np.clip(1 - d, 0, 1) ** power
    rgb = np.zeros((size, size, 3), dtype=np.float32)
    for channel in range(3):
        rgb[..., channel] = a * color[channel]
    save(name, rgb)


def ember_icon(size=96):
    """A teardrop ember with a hot core, for the HUD counter."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx, cy = size / 2, size * 0.6
    u = (xx - cx) / (size * 0.3)
    v = (yy - cy) / (size * 0.3)
    # Teardrop: a circle stretched into a point above it.
    drop = np.sqrt(u ** 2 * (1 + np.clip(-v, 0, None) * 1.1) ** 2 + np.clip(v, 0, None) ** 2 + (np.clip(-v, 0, None) * 0.55) ** 2)
    body = np.clip((1.08 - drop) / 0.12, 0, 1)
    core = np.clip(1 - drop / 0.7, 0, 1) ** 1.3
    glow = np.clip(1 - drop / 1.6, 0, 1) ** 2.5
    rgba = np.zeros((size, size, 4), dtype=np.float32)
    rgba[..., 0] = 255
    rgba[..., 1] = 110 + 140 * core
    rgba[..., 2] = 40 + 190 * core ** 2
    rgba[..., 3] = np.maximum(body * 255, glow * 150)
    save("icon-ember.png", rgba)


def brazier_pip(lit, size=64):
    """A small bowl: dark stone when cold, a flame above it when lit."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    bowl = (64, 74, 96, 255) if not lit else (120, 84, 62, 255)
    rim = (96, 108, 132, 255) if not lit else (230, 168, 96, 255)
    draw.polygon([(12, 36), (52, 36), (44, 50), (20, 50)], fill=bowl)
    draw.rectangle([27, 50, 37, 58], fill=bowl)
    draw.rectangle([18, 57, 46, 61], fill=bowl)
    draw.line([(12, 36), (52, 36)], fill=rim, width=3)
    if lit:
        flame = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fd = ImageDraw.Draw(flame)
        fd.ellipse([20, 14, 44, 38], fill=(255, 140, 50, 230))
        fd.polygon([(22, 26), (32, 2), (42, 26)], fill=(255, 140, 50, 230))
        fd.ellipse([25, 21, 39, 35], fill=(255, 230, 150, 255))
        flame = flame.filter(ImageFilter.GaussianBlur(1.4))
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([8, 4, 56, 48], fill=(255, 150, 60, 90))
        glow = glow.filter(ImageFilter.GaussianBlur(7))
        image = Image.alpha_composite(glow, image)
        image = Image.alpha_composite(image, flame)
    image.save(OUT / f"pip-{'lit' if lit else 'cold'}.png", optimize=True)


water_sheet()
light_shafts()
vignette()
soft_glow(256, (255, 170, 90), "title-glow.png", 2.6)
ember_icon()
brazier_pip(False)
brazier_pip(True)
print("painted", sorted(path.name for path in OUT.iterdir()))
