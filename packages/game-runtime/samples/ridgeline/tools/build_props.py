#!/usr/bin/env python3
"""Builds the RIDGELINE airfield, gate ring and water normal map.

Run from the repository root after build_terrain.py:

    python3 packages/game-runtime/samples/ridgeline/tools/build_props.py OUT_DIR

Writes `airfield.glb` (runway with painted markings, edge and approach lights,
hangars, tower and fuel tanks in world coordinates), `gate.glb` (a glowing ring
22 m across the opening, centred on its origin, facing -Z) and `water-normal.png`
(a tileable ripple normal map). Runway text uses Bebas Neue from the BLACKSITE
sample. The output is deterministic.
"""
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import landscape as L  # noqa: E402
from build_terrain import GLB  # noqa: E402

ROOT = Path(__file__).resolve().parents[5]
DISPLAY_FONT = ROOT / "packages/game-runtime/samples/blacksite/assets/08e4623805102d819f58601e46e34564.ttf"
GATE_RADIUS = 18.0

Y0 = L.AIRFIELD_HEIGHT


class Mesh:
    def __init__(self):
        self.p, self.n, self.uv, self.i = [], [], [], []

    def quad(self, a, b, c, d, normal=None, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
        a, b, c, d = (np.asarray(v, float) for v in (a, b, c, d))
        n = np.cross(b - a, d - a) if normal is None else np.asarray(normal, float)
        n = n / (np.linalg.norm(n) + 1e-12)
        base = len(self.p)
        for v, t in zip((a, b, c, d), uv):
            self.p.append(v)
            self.n.append(n)
            self.uv.append(t)
        self.i += [[base, base + 2, base + 1], [base, base + 3, base + 2]]

    def box(self, center, size, yaw=0.0):
        cx, cy, cz = center
        hx, hy, hz = (s / 2 for s in size)
        c, s = math.cos(yaw), math.sin(yaw)

        def P(x, y, z):
            return (cx + x * c + z * s, cy + y, cz - x * s + z * c)
        corners = {(sx, sy, sz): P(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)}
        faces = [((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)), ((-1, -1, 1), (1, -1, 1), (1, -1, -1), (-1, -1, -1)),
                 ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1)), ((1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, -1)),
                 ((1, -1, 1), (1, 1, 1), (1, 1, -1), (1, -1, -1)), ((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1))]
        for face in faces:
            pts = [corners[k] for k in face]
            centre = np.mean(pts, axis=0)
            normal = np.cross(np.subtract(pts[1], pts[0]), np.subtract(pts[3], pts[0]))
            if np.dot(normal, centre - np.asarray(center)) < 0:
                pts = pts[::-1]
            self.quad(*pts)

    def cylinder(self, center, radius, height, segments=20, cap=True):
        cx, cy, cz = center
        for k in range(segments):
            a0 = 2 * math.pi * k / segments
            a1 = 2 * math.pi * (k + 1) / segments
            p0 = (cx + radius * math.cos(a0), cz + radius * math.sin(a0))
            p1 = (cx + radius * math.cos(a1), cz + radius * math.sin(a1))
            base = len(self.p)
            for (x, z), y, a in ((p0, cy, a0), (p1, cy, a1), (p1, cy + height, a1), (p0, cy + height, a0)):
                self.p.append(np.array([x, y, z]))
                self.n.append(np.array([math.cos(a), 0, math.sin(a)]))
                self.uv.append((0, 0))
            self.i += [[base, base + 2, base + 1], [base, base + 3, base + 2]]
            if cap:
                base = len(self.p)
                for v in ((cx, cy + height, cz), (p1[0], cy + height, p1[1]), (p0[0], cy + height, p0[1])):
                    self.p.append(np.array(v))
                    self.n.append(np.array([0, 1, 0]))
                    self.uv.append((0, 0))
                self.i += [[base, base + 1, base + 2]]

    def arrays(self):
        return np.array(self.p), np.array(self.n), np.array(self.i), np.array(self.uv, float)


def runway_texture():
    """Asphalt with markings, 256 x 4096, u west to east and the image top at the north end."""
    width_m = L.RUNWAY["width"]
    length_m = L.RUNWAY["z_max"] - L.RUNWAY["z_min"]
    w, h = 256, 4096
    ppm_x = w / width_m
    ppm_z = h / length_m
    rng = np.random.default_rng(3)
    base = 0.2 + 0.03 * rng.standard_normal((h, w))
    streak = np.repeat(0.02 * rng.standard_normal((1, w)), h, axis=0)
    rubber = np.zeros((h, w))
    for at in (220, length_m - 220):
        zz = (np.arange(h) / ppm_z - at)
        rubber += np.exp(-(zz / 160) ** 2)[:, None] * np.exp(-((np.arange(w) - w / 2) / (w * 0.2)) ** 2)[None, :]
    asphalt = np.clip(base + streak - 0.08 * rubber, 0, 1)
    img = Image.fromarray((np.dstack([asphalt * 0.98, asphalt, asphalt * 1.02]) * 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    paint = (232, 232, 226)

    def rect(x0, z0, x1, z1):
        # z measured in metres from the south end, drawn with v up = image row from the bottom.
        draw.rectangle([x0 * ppm_x + w / 2, h - z1 * ppm_z, x1 * ppm_x + w / 2, h - z0 * ppm_z], fill=paint)

    half = width_m / 2
    rect(-half + 0.6, 0, -half + 1.5, length_m)
    rect(half - 1.5, 0, half - 0.6, length_m)
    z = 120
    while z < length_m - 120:
        rect(-0.45, z, 0.45, z + 30)
        z += 50
    for end in (0, 1):
        for k in range(8):
            x = -half + 3 + k * 2.6 + (4 if k >= 4 else 0)
            z0, z1 = (6, 36) if end == 0 else (length_m - 36, length_m - 6)
            rect(x, z0, x + 1.8, z1)
        z0 = 300 if end == 0 else length_m - 345
        rect(-9, z0, -5, z0 + 45)
        rect(5, z0, 9, z0 + 45)
        for k in range(3):
            zt = (150 + k * 150) if end == 0 else length_m - 150 - k * 150 - 22
            if k != 1:
                rect(-11, zt, -9.5, zt + 22)
                rect(9.5, zt, 11, zt + 22)
    font = ImageFont.truetype(str(DISPLAY_FONT), int(30 * ppm_z * 0.62))
    for text, z_centre, flip in (("36", 70, False), ("18", length_m - 70, True)):
        layer = Image.new("L", (w, int(40 * ppm_z)), 0)
        ImageDraw.Draw(layer).text((w / 2, layer.height / 2), text, font=font, fill=255, anchor="mm")
        layer = layer.resize((w, layer.height))
        if flip:
            layer = layer.rotate(180)
        top = int(h - z_centre * ppm_z - layer.height / 2)
        img.paste(Image.new("RGB", layer.size, paint), (0, top), layer)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def airfield(out):
    glb = GLB("RIDGELINE build_props.py")
    runway_tex = glb.image(runway_texture(), "image/jpeg")
    mats = {
        "Runway": glb.material({"name": "Runway", "pbrMetallicRoughness": {"baseColorTexture": {"index": runway_tex}, "metallicFactor": 0, "roughnessFactor": 0.88}}),
        "Concrete": glb.material({"name": "Concrete", "pbrMetallicRoughness": {"baseColorFactor": [0.62, 0.61, 0.58, 1], "metallicFactor": 0, "roughnessFactor": 0.85}}),
        "Cladding": glb.material({"name": "Cladding", "pbrMetallicRoughness": {"baseColorFactor": [0.33, 0.38, 0.4, 1], "metallicFactor": 0.55, "roughnessFactor": 0.45}}),
        "Roof": glb.material({"name": "Roof", "pbrMetallicRoughness": {"baseColorFactor": [0.55, 0.22, 0.15, 1], "metallicFactor": 0.4, "roughnessFactor": 0.5}}),
        "Door": glb.material({"name": "Door", "pbrMetallicRoughness": {"baseColorFactor": [0.12, 0.13, 0.14, 1], "metallicFactor": 0.3, "roughnessFactor": 0.6}}),
        "White": glb.material({"name": "White", "pbrMetallicRoughness": {"baseColorFactor": [0.86, 0.86, 0.84, 1], "metallicFactor": 0.1, "roughnessFactor": 0.4}}),
        "Glass": glb.material({"name": "Glass", "pbrMetallicRoughness": {"baseColorFactor": [0.25, 0.4, 0.45, 1], "metallicFactor": 0.9, "roughnessFactor": 0.06},
                               "emissiveFactor": [1.0, 0.75, 0.45], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 0.6}}}),
        "Edge light": glb.material({"name": "Edge light", "pbrMetallicRoughness": {"baseColorFactor": [1, 0.9, 0.6, 1], "metallicFactor": 0, "roughnessFactor": 0.4},
                                    "emissiveFactor": [1, 0.82, 0.5], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 14}}}),
        "Threshold light": glb.material({"name": "Threshold light", "pbrMetallicRoughness": {"baseColorFactor": [0.2, 1, 0.3, 1], "metallicFactor": 0, "roughnessFactor": 0.4},
                                         "emissiveFactor": [0.15, 1, 0.3], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 14}}}),
        "Approach light": glb.material({"name": "Approach light", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.4},
                                        "emissiveFactor": [1, 0.95, 0.85], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 18}}}),
        "Warning": glb.material({"name": "Warning", "pbrMetallicRoughness": {"baseColorFactor": [1, 0.05, 0.02, 1], "metallicFactor": 0, "roughnessFactor": 0.4},
                                 "emissiveFactor": [1, 0.04, 0.02], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 12}}}),
        "Tank": glb.material({"name": "Tank", "pbrMetallicRoughness": {"baseColorFactor": [0.52, 0.53, 0.5, 1], "metallicFactor": 0.25, "roughnessFactor": 0.55}}),
    }
    parts = {name: Mesh() for name in mats}
    hw = L.RUNWAY["width"] / 2
    z0, z1 = L.RUNWAY["z_min"], L.RUNWAY["z_max"]
    y = Y0 + 0.08
    # Mesh.quad winds a, c, b, so the corners go clockwise seen from above for an upward face.
    parts["Runway"].quad((-hw, y, z0), (hw, y, z0), (hw, y, z1), (-hw, y, z1), normal=(0, 1, 0), uv=((0, 0), (1, 0), (1, 1), (0, 1)))
    # Edge lights every 60 m, threshold bars at both ends, approach lights to the south.
    z = z0 + 10
    while z <= z1 - 10:
        for side in (-1, 1):
            parts["Edge light"].box((side * (hw + 1.5), Y0 + 0.35, z), (0.45, 0.6, 0.45))
        z += 60
    for zz in (z1 + 1.5, z0 - 1.5):
        for k in range(-9, 10):
            parts["Threshold light"].box((k * 2.4, Y0 + 0.3, zz), (0.5, 0.5, 0.5))
    for row in range(1, 10):
        zz = z1 + row * 30
        bar = 6 if row % 3 else 12
        for k in range(-bar, bar + 1, 2):
            parts["Approach light"].box((k * 0.9, Y0 + 1.2, zz), (0.4, 0.4, 0.4))
        parts["Concrete"].box((0, Y0 + 0.5, zz), (bar * 1.9, 0.3, 0.3))
    # Hangars along the apron east of the runway, doors facing west.
    for k, zc in enumerate((90, 175, 260, 345)):
        width, depth, height = 62, 70, 18
        xc = 225
        parts["Cladding"].box((xc, Y0 + height / 2, zc), (depth, height, width - 6))
        parts["Roof"].box((xc, Y0 + height + 1.2, zc), (depth + 2, 2.4, width - 4))
        parts["Door"].box((xc - depth / 2 - 0.1, Y0 + height * 0.42, zc), (0.4, height * 0.84, width - 14))
        parts["Warning"].box((xc - depth / 2, Y0 + height + 2.8, zc - width / 2 + 3), (0.6, 0.6, 0.6))
    # Control tower with a lit glass cab.
    tx, tz = 140, 520
    parts["White"].cylinder((tx, Y0, tz), 4.2, 26, segments=16)
    parts["Glass"].cylinder((tx, Y0 + 26, tz), 6.2, 4.5, segments=16, cap=False)
    parts["Roof"].cylinder((tx, Y0 + 30.5, tz), 6.8, 1.0, segments=16)
    parts["Warning"].box((tx, Y0 + 33, tz), (0.7, 0.7, 0.7))
    parts["White"].box((tx + 18, Y0 + 5, tz), (24, 10, 16))
    parts["Glass"].box((tx + 18, Y0 + 6, tz - 8.05), (20, 2.2, 0.2))
    # Fuel farm.
    for k in range(4):
        parts["Tank"].cylinder((200 + (k % 2) * 16, Y0, 610 + (k // 2) * 16), 6, 9, segments=20)
    # Windsock mast at the north end.
    parts["White"].cylinder((-40, Y0, z0 + 120), 0.2, 8, segments=8)
    parts["Warning"].box((-40, Y0 + 8.4, z0 + 121.5), (0.6, 0.6, 3.2))

    for name, mesh in parts.items():
        if not mesh.p:
            continue
        p, n, i, uv = mesh.arrays()
        glb.mesh(name, p, n, i, mats[name], uvs=uv if name == "Runway" else None)
    (out / "airfield.glb").write_bytes(glb.bytes())


def gate(out):
    """A torus ring in the XY plane with an emissive core and dark housing segments."""
    glb = GLB("RIDGELINE build_props.py")
    core = glb.material({"name": "Gate light", "pbrMetallicRoughness": {"baseColorFactor": [1, 0.62, 0.2, 1], "metallicFactor": 0, "roughnessFactor": 0.3},
                         "emissiveFactor": [1, 0.55, 0.16], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 9}}})
    housing = glb.material({"name": "Gate housing", "pbrMetallicRoughness": {"baseColorFactor": [0.1, 0.11, 0.13, 1], "metallicFactor": 0.8, "roughnessFactor": 0.35}})

    def torus(radius, tube, segments, sides, arc=(0, 2 * math.pi), offset_z=0.0):
        p, n, idx = [], [], []
        a0, a1 = arc
        for s in range(segments + 1):
            a = a0 + (a1 - a0) * s / segments
            centre = np.array([radius * math.cos(a), radius * math.sin(a), offset_z])
            for k in range(sides):
                b = 2 * math.pi * k / sides
                normal = np.array([math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)])
                p.append(centre + tube * normal)
                n.append(normal)
        for s in range(segments):
            for k in range(sides):
                a = s * sides + k
                b = s * sides + (k + 1) % sides
                c = (s + 1) * sides + k
                d = (s + 1) * sides + (k + 1) % sides
                idx += [[a, b, c], [b, d, c]]
        return np.array(p), np.array(n), np.array(idx)

    p, n, i = torus(GATE_RADIUS, 0.8, 128, 12)
    glb.mesh("Gate core", p, n, i, core)
    shells = [torus(GATE_RADIUS, 1.35, 10, 12, arc=(k * math.pi / 4 + 0.12, k * math.pi / 4 + 0.55)) for k in range(8)]
    sp = np.vstack([s[0] for s in shells])
    sn = np.vstack([s[1] for s in shells])
    offsets = np.cumsum([0] + [len(s[0]) for s in shells[:-1]])
    si = np.vstack([s[2] + o for s, o in zip(shells, offsets)])
    glb.mesh("Gate housing", sp, sn, si, housing)
    (out / "gate.glb").write_bytes(glb.bytes())


def water_normal(out):
    """Tileable ripple normals from a sum of periodic waves, 512 x 512."""
    size = 512
    u, v = np.meshgrid(np.arange(size) / size, np.arange(size) / size)
    rng = np.random.default_rng(17)
    height = np.zeros((size, size))
    for _ in range(40):
        kx, ky = rng.integers(-14, 15, 2)
        if kx == 0 and ky == 0:
            continue
        amplitude = 1 / (kx * kx + ky * ky) ** 0.6
        height += amplitude * np.sin(2 * np.pi * (kx * u + ky * v) + rng.uniform(0, 6.3))
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * size / 2
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * size / 2
    strength = 0.004
    normal = np.dstack([-gx * strength, -gy * strength, np.ones_like(height)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    Image.fromarray(((normal * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out / "water-normal.png", optimize=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_props.py OUT_DIR")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    airfield(out)
    gate(out)
    water_normal(out)
    print(json.dumps({"airfield": (out / "airfield.glb").stat().st_size, "gate": (out / "gate.glb").stat().st_size}))


if __name__ == "__main__":
    main()
