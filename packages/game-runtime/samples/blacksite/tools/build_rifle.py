#!/usr/bin/env python3
"""Builds the BLACKSITE AR-09 pulse rifle as a binary glTF (GLB).

Run from the repository root:

    python3 packages/game-runtime/samples/blacksite/tools/build_rifle.py OUT.glb

The rifle is modelled in camera space: the first-person camera sits at the
origin looking down -Z, so the weapon is placed low and to the right. Parts are
chamfered boxes and cylinders with PBR materials. The output is deterministic.
"""
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

MATERIALS = {
    "Gunmetal": {"pbrMetallicRoughness": {"baseColorFactor": [0.15, 0.16, 0.17, 1], "metallicFactor": 0.8, "roughnessFactor": 0.36}},
    "Polymer": {"pbrMetallicRoughness": {"baseColorFactor": [0.045, 0.048, 0.052, 1], "metallicFactor": 0.0, "roughnessFactor": 0.5}},
    "Sand enamel": {"pbrMetallicRoughness": {"baseColorFactor": [0.46, 0.38, 0.26, 1], "metallicFactor": 0.15, "roughnessFactor": 0.55}},
    "Bare steel": {"pbrMetallicRoughness": {"baseColorFactor": [0.42, 0.44, 0.46, 1], "metallicFactor": 1.0, "roughnessFactor": 0.26}},
    "Recess": {"pbrMetallicRoughness": {"baseColorFactor": [0.004, 0.005, 0.006, 1], "metallicFactor": 0.0, "roughnessFactor": 0.9}},
    "Cyan display": {"pbrMetallicRoughness": {"baseColorFactor": [0.05, 0.6, 0.62, 1], "metallicFactor": 0.0, "roughnessFactor": 0.3},
                     "emissiveFactor": [0.12, 1.0, 0.95]},
    "Heat glow": {"pbrMetallicRoughness": {"baseColorFactor": [1, 0.35, 0.06, 1], "metallicFactor": 0.0, "roughnessFactor": 0.4},
                  "emissiveFactor": [1.0, 0.32, 0.04]},
    "Reticle": {"pbrMetallicRoughness": {"baseColorFactor": [1, 0.1, 0.06, 1], "metallicFactor": 0.0, "roughnessFactor": 0.3},
                "emissiveFactor": [1.0, 0.08, 0.04]},
    "Optic glass": {"alphaMode": "BLEND", "pbrMetallicRoughness": {"baseColorFactor": [0.25, 0.75, 0.8, 0.16], "metallicFactor": 0.0, "roughnessFactor": 0.05}},
}


class Mesh:
    def __init__(self):
        self.positions = []
        self.normals = []
        self.indices = []

    def triangle(self, a, b, c, inside, normals=None):
        """Adds a triangle wound counter-clockwise when seen from outside `inside`."""
        a, b, c = (np.asarray(v, float) for v in (a, b, c))
        n = np.cross(b - a, c - a)
        n = n / (np.linalg.norm(n) + 1e-12)
        if np.dot(n, (a + b + c) / 3 - np.asarray(inside, float)) < 0:
            b, c = c, b
            n = -n
            if normals is not None:
                normals = (normals[0], normals[2], normals[1])
        base = len(self.positions)
        for index, v in enumerate((a, b, c)):
            self.positions.append(v)
            self.normals.append(n if normals is None else normals[index] / (np.linalg.norm(normals[index]) + 1e-12))
        self.indices += [base, base + 1, base + 2]

    def polygon(self, points, inside):
        for index in range(1, len(points) - 1):
            self.triangle(points[0], points[index], points[index + 1], inside)


def transform(points, center, rotation):
    rx, ry, rz = (math.radians(a) for a in rotation)
    mx = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
    my = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
    mz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    return [mz @ my @ mx @ np.asarray(p, float) + np.asarray(center, float) for p in points]


def chamfer_box(mesh, center, size, bevel=0.004, rotation=(0, 0, 0)):
    """Box with 45-degree chamfered edges and corners: 6 faces, 12 bevels, 8 corners."""
    hx, hy, hz = (s / 2 for s in size)
    b = min(bevel, hx * 0.45, hy * 0.45, hz * 0.45)

    def corner(sx, sy, sz):
        return {
            "x": (sx * hx, sy * (hy - b), sz * (hz - b)),
            "y": (sx * (hx - b), sy * hy, sz * (hz - b)),
            "z": (sx * (hx - b), sy * (hy - b), sz * hz),
        }

    def emit(points):
        mesh.polygon(transform(points, center, rotation), center)

    signs = (-1, 1)
    for s in signs:
        emit([corner(s, y, z)["x"] for y, z in ((-1, -1), (1, -1), (1, 1), (-1, 1))][:: -s])
        emit([corner(x, s, z)["y"] for x, z in ((-1, -1), (-1, 1), (1, 1), (1, -1))][:: -s])
        emit([corner(x, y, s)["z"] for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))][:: s])
    for sy in signs:
        for sz in signs:
            quad = [corner(-1, sy, sz)["y"], corner(1, sy, sz)["y"], corner(1, sy, sz)["z"], corner(-1, sy, sz)["z"]]
            emit(quad if sy * sz > 0 else quad[::-1])
    for sx in signs:
        for sz in signs:
            quad = [corner(sx, -1, sz)["x"], corner(sx, 1, sz)["x"], corner(sx, 1, sz)["z"], corner(sx, -1, sz)["z"]]
            emit(quad[::-1] if sx * sz > 0 else quad)
    for sx in signs:
        for sy in signs:
            quad = [corner(sx, sy, -1)["x"], corner(sx, sy, 1)["x"], corner(sx, sy, 1)["y"], corner(sx, sy, -1)["y"]]
            emit(quad if sx * sy > 0 else quad[::-1])
    for sx in signs:
        for sy in signs:
            for sz in signs:
                tri = [corner(sx, sy, sz)["x"], corner(sx, sy, sz)["y"], corner(sx, sy, sz)["z"]]
                emit(tri if sx * sy * sz > 0 else tri[::-1])


def cylinder(mesh, center, radius, length, segments=20, axis="z", rotation=(0, 0, 0)):
    """Cylinder along local Z with smooth sides and flat caps."""
    ring = [(radius * math.cos(2 * math.pi * i / segments), radius * math.sin(2 * math.pi * i / segments)) for i in range(segments)]
    base = {"z": (0, 0, 0), "x": (0, 90, 0), "y": (90, 0, 0)}[axis]
    rot = tuple(a + b for a, b in zip(base, rotation))
    front = [(x, y, -length / 2) for x, y in ring]
    back = [(x, y, length / 2) for x, y in ring]
    f = transform(front, center, rot)
    k = transform(back, center, rot)
    normals = transform([(x, y, 0) for x, y in ring], (0, 0, 0), rot)
    for i in range(segments):
        j = (i + 1) % segments
        mesh.triangle(f[i], f[j], k[j], center, (normals[i], normals[j], normals[j]))
        mesh.triangle(f[i], k[j], k[i], center, (normals[i], normals[j], normals[i]))
    mesh.polygon(f, center)
    mesh.polygon(k, center)


def sphere(mesh, center, radius, rings=8, segments=12):
    for r in range(rings):
        t0, t1 = math.pi * r / rings, math.pi * (r + 1) / rings
        for s in range(segments):
            p0, p1 = 2 * math.pi * s / segments, 2 * math.pi * (s + 1) / segments

            def point(t, p):
                return np.array(center) + radius * np.array([math.sin(t) * math.cos(p), math.cos(t), math.sin(t) * math.sin(p)])
            quad = [point(t0, p0), point(t0, p1), point(t1, p1), point(t1, p0)]
            mesh.polygon(quad, center)


def build():
    parts = {}

    def part(name, material):
        key = (name, material)
        if key not in parts:
            parts[key] = Mesh()
        return parts[key]

    x = 0.3
    # Upper receiver and its sand two-tone side plates.
    chamfer_box(part("Upper receiver", "Gunmetal"), (x, -0.225, -0.56), (0.084, 0.086, 0.38), 0.01)
    for side in (-1, 1):
        chamfer_box(part("Receiver plate", "Sand enamel"), (x + side * 0.0425, -0.232, -0.61), (0.005, 0.052, 0.2), 0.002)
        for i in range(4):
            chamfer_box(part("Receiver bolts", "Bare steel"), (x + side * 0.0455, -0.215, -0.53 - i * 0.05), (0.004, 0.007, 0.007), 0.0012)
    # Lower receiver, magazine well, trigger guard and grip.
    chamfer_box(part("Lower receiver", "Polymer"), (x, -0.292, -0.55), (0.07, 0.056, 0.26), 0.01)
    chamfer_box(part("Magazine well", "Polymer"), (x, -0.335, -0.65), (0.06, 0.05, 0.09), 0.008)
    chamfer_box(part("Magazine", "Polymer"), (x, -0.41, -0.675), (0.05, 0.16, 0.078), 0.01, (-14, 0, 0))
    chamfer_box(part("Magazine cell", "Cyan display"), (x - 0.0258, -0.4, -0.675), (0.003, 0.08, 0.01), 0.001, (-14, 0, 0))
    chamfer_box(part("Grip", "Polymer"), (x, -0.38, -0.465), (0.04, 0.13, 0.055), 0.012, (20, 0, 0))
    chamfer_box(part("Trigger guard", "Gunmetal"), (x, -0.33, -0.53), (0.014, 0.008, 0.08), 0.002)
    # Top rail with cross slots.
    chamfer_box(part("Top rail", "Gunmetal"), (x, -0.176, -0.63), (0.034, 0.014, 0.44), 0.002)
    for i in range(19):
        chamfer_box(part("Rail teeth", "Gunmetal"), (x, -0.167, -0.43 - i * 0.022), (0.038, 0.007, 0.01), 0.0015)
    # Reflex optic: mount, square frame, tinted glass and a red reticle dot.
    chamfer_box(part("Optic mount", "Gunmetal"), (x, -0.156, -0.5), (0.04, 0.018, 0.075), 0.003)
    frame = part("Optic frame", "Polymer")
    chamfer_box(frame, (x, -0.092, -0.5), (0.07, 0.012, 0.055), 0.004)
    chamfer_box(frame, (x - 0.031, -0.12, -0.5), (0.009, 0.066, 0.055), 0.003)
    chamfer_box(frame, (x + 0.031, -0.12, -0.5), (0.009, 0.066, 0.055), 0.003)
    chamfer_box(part("Optic glass", "Optic glass"), (x, -0.122, -0.49), (0.053, 0.054, 0.002), 0.0005)
    sphere(part("Reticle", "Reticle"), (x, -0.122, -0.492), 0.0016)
    # Side display facing the player and the charging handle.
    chamfer_box(part("Ammo display bezel", "Polymer"), (x - 0.0435, -0.212, -0.47), (0.004, 0.03, 0.075), 0.0015)
    chamfer_box(part("Ammo display", "Cyan display"), (x - 0.0458, -0.212, -0.47), (0.0012, 0.018, 0.06), 0.0004)
    chamfer_box(part("Charging handle", "Bare steel"), (x + 0.05, -0.21, -0.43), (0.02, 0.014, 0.032), 0.003)
    # Handguard with vent slots and heat strips.
    chamfer_box(part("Handguard", "Gunmetal"), (x, -0.228, -0.88), (0.078, 0.078, 0.28), 0.012)
    chamfer_box(part("Handguard rail", "Polymer"), (x, -0.272, -0.88), (0.046, 0.014, 0.26), 0.003)
    for side in (-1, 1):
        for i in range(6):
            chamfer_box(part("Vent slots", "Recess"), (x + side * 0.0392, -0.222, -0.79 - i * 0.032), (0.002, 0.036, 0.016), 0.0005)
            chamfer_box(part("Heat strips", "Heat glow"), (x + side * 0.0388, -0.222, -0.79 - i * 0.032), (0.0012, 0.026, 0.006), 0.0003)
    # Barrel, gas block and muzzle brake.
    cylinder(part("Barrel", "Bare steel"), (x, -0.222, -1.07), 0.013, 0.12, 18)
    chamfer_box(part("Gas block", "Gunmetal"), (x, -0.212, -1.03), (0.034, 0.04, 0.03), 0.004)
    cylinder(part("Muzzle brake", "Gunmetal"), (x, -0.222, -1.155), 0.022, 0.075, 20)
    for i in range(3):
        cylinder(part("Brake ports", "Recess"), (x, -0.222, -1.135 - i * 0.02), 0.0225, 0.006, 20)
    # Rear stock stub.
    chamfer_box(part("Stock", "Polymer"), (x, -0.25, -0.33), (0.06, 0.07, 0.12), 0.012)
    return parts


def glb(parts):
    buffer = bytearray()
    accessors, views, meshes, nodes = [], [], [], []
    material_names = list(MATERIALS)

    def add_view(data, target):
        while len(buffer) % 4:
            buffer.append(0)
        offset = len(buffer)
        buffer.extend(data)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(views) - 1

    grouped = {}
    for (name, material), mesh in parts.items():
        grouped.setdefault(name, []).append((material, mesh))
    for name, entries in grouped.items():
        primitives = []
        for material, mesh in entries:
            positions = np.asarray(mesh.positions, np.float32)
            normals = np.asarray(mesh.normals, np.float32)
            indices = np.asarray(mesh.indices, np.uint32)
            position_view = add_view(positions.tobytes(), 34962)
            accessors.append({"bufferView": position_view, "componentType": 5126, "count": len(positions), "type": "VEC3",
                              "min": positions.min(0).tolist(), "max": positions.max(0).tolist()})
            normal_view = add_view(normals.tobytes(), 34962)
            accessors.append({"bufferView": normal_view, "componentType": 5126, "count": len(normals), "type": "VEC3"})
            index_view = add_view(indices.tobytes(), 34963)
            accessors.append({"bufferView": index_view, "componentType": 5125, "count": len(indices), "type": "SCALAR"})
            primitives.append({"attributes": {"POSITION": len(accessors) - 3, "NORMAL": len(accessors) - 2},
                               "indices": len(accessors) - 1, "material": material_names.index(material)})
        meshes.append({"name": name, "primitives": primitives})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
    nodes.append({"name": "AR-09 pulse rifle", "children": list(range(len(nodes)))})
    document = {
        "asset": {"version": "2.0", "generator": "BLACKSITE build_rifle.py"},
        "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": meshes,
        "materials": [{"name": name, **definition} for name, definition in MATERIALS.items()],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(buffer)}],
    }
    json_bytes = json.dumps(document, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    while len(buffer) % 4:
        buffer.append(0)
    total = 12 + 8 + len(json_bytes) + 8 + len(buffer)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
            + struct.pack("<II", len(buffer), 0x004E4942) + bytes(buffer))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_rifle.py OUT.glb")
    Path(sys.argv[1]).write_bytes(glb(build()))


if __name__ == "__main__":
    main()
