#!/usr/bin/env python3
"""Builds the RIDGELINE RJ-7 Kestrel jet as a binary glTF (GLB).

Run from the repository root:

    python3 packages/game-runtime/samples/ridgeline/tools/build_jet.py OUT.glb

The jet is modelled in metres with +X right, +Y up and -Z forward, with the
origin at the centre of mass. Control surfaces and landing gear are separate
nodes pivoted on their hinge lines. Pose clips (two identical keys each) let
an animation graph blend the surfaces from stick input, and a gear clip
retracts the undercarriage. The output is deterministic.
"""
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

MATERIALS = {
    # Two-tone air superiority grey, semi-matte, so the airframe reads against sky and snow.
    "Paint": {"pbrMetallicRoughness": {"baseColorFactor": [0.085, 0.095, 0.11, 1], "metallicFactor": 0.15, "roughnessFactor": 0.5},
              "extensions": {"KHR_materials_clearcoat": {"clearcoatFactor": 0.35, "clearcoatRoughnessFactor": 0.2}}},
    "Accent": {"pbrMetallicRoughness": {"baseColorFactor": [0.93, 0.27, 0.05, 1], "metallicFactor": 0.05, "roughnessFactor": 0.3},
               "extensions": {"KHR_materials_clearcoat": {"clearcoatFactor": 0.8, "clearcoatRoughnessFactor": 0.08}}},
    "Graphite": {"pbrMetallicRoughness": {"baseColorFactor": [0.07, 0.075, 0.085, 1], "metallicFactor": 0.2, "roughnessFactor": 0.45}},
    "Canopy": {"alphaMode": "BLEND", "pbrMetallicRoughness": {"baseColorFactor": [0.42, 0.3, 0.1, 0.55], "metallicFactor": 0.95, "roughnessFactor": 0.04}},
    "Frame": {"pbrMetallicRoughness": {"baseColorFactor": [0.18, 0.19, 0.2, 1], "metallicFactor": 0.6, "roughnessFactor": 0.35}},
    "Nozzle": {"pbrMetallicRoughness": {"baseColorFactor": [0.36, 0.33, 0.3, 1], "metallicFactor": 1.0, "roughnessFactor": 0.32}},
    "Heat": {"pbrMetallicRoughness": {"baseColorFactor": [0.22, 0.17, 0.14, 1], "metallicFactor": 0.6, "roughnessFactor": 0.45},
             "emissiveFactor": [1.0, 0.42, 0.12], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 1.2}}},
    "Intake": {"pbrMetallicRoughness": {"baseColorFactor": [0.01, 0.01, 0.012, 1], "metallicFactor": 0.0, "roughnessFactor": 0.9}},
    "Tyre": {"pbrMetallicRoughness": {"baseColorFactor": [0.03, 0.03, 0.03, 1], "metallicFactor": 0.0, "roughnessFactor": 0.8}},
    "Strut": {"pbrMetallicRoughness": {"baseColorFactor": [0.55, 0.56, 0.58, 1], "metallicFactor": 0.9, "roughnessFactor": 0.3}},
    "Nav red": {"pbrMetallicRoughness": {"baseColorFactor": [1, 0.05, 0.03, 1], "metallicFactor": 0, "roughnessFactor": 0.3},
                "emissiveFactor": [1, 0.04, 0.02], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 8}}},
    "Nav green": {"pbrMetallicRoughness": {"baseColorFactor": [0.05, 1, 0.3, 1], "metallicFactor": 0, "roughnessFactor": 0.3},
                  "emissiveFactor": [0.04, 1, 0.25], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 8}}},
    "Nav white": {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.3},
                  "emissiveFactor": [1, 0.95, 0.9], "extensions": {"KHR_materials_emissive_strength": {"emissiveStrength": 8}}},
}


class Mesh:
    def __init__(self):
        self.positions = []
        self.normals = []
        self.indices = []

    def grid(self, rings, closed=True, flip=False, smooth=True):
        """Triangulates rings (stations x points) and adds smooth normals."""
        rings = np.asarray(rings, float)
        stations, count = rings.shape[:2]
        base = len(self.positions)
        columns = count if closed else count - 1
        faces = []
        for s in range(stations - 1):
            for k in range(columns):
                a = s * count + k
                b = s * count + (k + 1) % count
                c = (s + 1) * count + k
                d = (s + 1) * count + (k + 1) % count
                faces += [(a, c, b), (b, c, d)] if not flip else [(a, b, c), (b, d, c)]
        flat = rings.reshape(-1, 3)
        if smooth:
            normals = np.zeros_like(flat)
            for a, b, c in faces:
                n = np.cross(flat[b] - flat[a], flat[c] - flat[a])
                normals[a] += n
                normals[b] += n
                normals[c] += n
            normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
            self.positions += list(flat)
            self.normals += list(normals)
            self.indices += [base + i for face in faces for i in face]
        else:
            for a, b, c in faces:
                n = np.cross(flat[b] - flat[a], flat[c] - flat[a])
                n /= np.linalg.norm(n) + 1e-12
                start = len(self.positions)
                for v in (a, b, c):
                    self.positions.append(flat[v])
                    self.normals.append(n)
                self.indices += [start, start + 1, start + 2]

    def fan(self, center, ring, normal):
        """Closes a ring with a fan facing `normal`."""
        normal = np.asarray(normal, float)
        base = len(self.positions)
        self.positions.append(np.asarray(center, float))
        self.normals.append(normal)
        for p in ring:
            self.positions.append(np.asarray(p, float))
            self.normals.append(normal)
        n = len(ring)
        for k in range(n):
            a, b = base + 1 + k, base + 1 + (k + 1) % n
            tri = [base, a, b]
            face = np.cross(self.positions[a] - self.positions[base], self.positions[b] - self.positions[base])
            if np.dot(face, normal) < 0:
                tri = [base, b, a]
            self.indices += tri

    def offset(self, delta):
        """Returns a copy translated by -delta, used to express parts relative to a pivot."""
        copy = Mesh()
        copy.positions = [np.asarray(p) - np.asarray(delta) for p in self.positions]
        copy.normals = list(self.normals)
        copy.indices = list(self.indices)
        return copy


def interp(table, z):
    zs = [row[0] for row in table]
    return [float(np.interp(z, zs, [row[i] for row in table])) for i in range(1, len(table[0]))]


# Fuselage stations: z, half width, top height, bottom depth, centre-line height.
FUSELAGE = [
    (-7.4, 0.02, 0.02, 0.02, -0.18), (-7.1, 0.16, 0.15, 0.13, -0.16), (-6.6, 0.3, 0.28, 0.24, -0.13),
    (-5.8, 0.45, 0.43, 0.36, -0.08), (-4.9, 0.57, 0.56, 0.45, -0.03), (-4.0, 0.64, 0.64, 0.52, 0.0),
    (-3.0, 0.7, 0.66, 0.58, 0.02), (-2.1, 0.9, 0.62, 0.62, 0.02), (-1.0, 1.0, 0.58, 0.63, 0.0),
    (0.5, 1.02, 0.55, 0.62, 0.0), (2.0, 0.97, 0.53, 0.57, 0.02), (3.5, 0.86, 0.5, 0.5, 0.05),
    (4.8, 0.7, 0.46, 0.45, 0.08), (5.7, 0.58, 0.44, 0.42, 0.1), (6.1, 0.55, 0.43, 0.41, 0.1),
]


def section(half_width, top, bottom, centre, z, count=28, exponent=2.5):
    points = []
    for k in range(count):
        a = 2 * math.pi * k / count
        c, s = math.cos(a), math.sin(a)
        x = half_width * math.copysign(abs(c) ** (2 / exponent), c)
        y = (top if s > 0 else bottom) * math.copysign(abs(s) ** (2 / exponent), s)
        points.append((x, centre + y, z))
    return points


def fuselage():
    body, nose = Mesh(), Mesh()
    zs = np.concatenate([np.linspace(-7.4, -6.0, 6), np.linspace(-5.8, 6.1, 34)])
    rings = [section(*interp(FUSELAGE, z), z) for z in zs]
    split = 6
    nose.grid(rings[:split + 1])
    nose.fan((0, rings[0][0][1], -7.42), rings[0], (0, 0, -1))
    body.grid(rings[split:])
    return body, nose, rings[-1]


def canopy():
    glass, frame = Mesh(), Mesh()
    rings = []
    for z in np.linspace(-4.6, -1.5, 18):
        t = (z + 4.6) / 3.1
        rise = 0.62 * math.sin(math.pi * min(1, t * 1.15)) ** 0.55 if t < 0.87 else 0.62 * (1 - (t - 0.87) / 0.13) ** 0.8 * 0.55
        half_width, top, _, centre = interp(FUSELAGE, z)
        width = min(half_width * 0.74, 0.5)
        base_y = centre + top * 0.86
        ring = []
        for k in range(17):
            a = math.pi * k / 16
            ring.append((width * math.cos(a), base_y + (rise + 0.02) * math.sin(a) ** 0.85, z))
        rings.append(ring)
    glass.grid(rings, closed=False)
    # Canopy bow frame at the windscreen joint.
    z = -3.65
    ring_index = int(round((z + 4.6) / 3.1 * 17))
    bow = np.asarray(rings[ring_index])
    frame_rings = [bow + [0, 0.012, -0.05], bow * [1.02, 1, 1] + [0, 0.03, 0], bow + [0, 0.012, 0.05]]
    frame.grid(frame_rings, closed=False)
    return glass, frame


def airfoil(chord, thickness, count=14):
    """Symmetric NACA-like section, upper then lower surface, leading edge first."""
    xs = (1 - np.cos(np.linspace(0, math.pi, count))) / 2
    t = 5 * thickness * (0.2969 * np.sqrt(xs) - 0.126 * xs - 0.3516 * xs ** 2 + 0.2843 * xs ** 3 - 0.1036 * xs ** 4)
    upper = [(x * chord, y * chord) for x, y in zip(xs, t)]
    lower = [(x * chord, -y * chord) for x, y in zip(xs[::-1][1:-1], t[::-1][1:-1])]
    return upper + lower


def lifting_surface(root, tip, thickness, chord_range=(0.0, 1.0), axis="x", count=14):
    """Lofts between two sections, each (span, leading-edge z, chord, height).

    `axis` "x" spans along +X (wings and stabilators), "y" spans along +Y (fin).
    `chord_range` cuts the section to a fraction of the chord, for control surfaces.
    """
    mesh = Mesh()
    rings = []
    for span, lead, chord, height in (root, tip):
        c0, c1 = chord_range
        section_points = []
        for x, y in airfoil(chord, thickness, count):
            f = x / chord
            if f < c0 - 1e-9 or f > c1 + 1e-9:
                continue
            section_points.append((x, y))
        if c0 > 0:
            section_points = [(c0 * chord, 0.0)] + section_points
        ring = []
        for x, y in section_points:
            if axis == "x":
                ring.append((span, height + y, lead + x))
            else:
                ring.append((y, span, lead + x))
        rings.append(ring)
    n = min(len(r) for r in rings)
    rings = [r[:n] for r in rings]
    mesh.grid(rings, closed=True)
    for ring in rings:
        centre = np.mean(np.asarray(ring), axis=0)
        mesh.fan(centre, ring, (1, 0, 0) if axis == "x" else (0, 1, 0))
    return mesh, rings


def mirror(mesh):
    out = Mesh()
    out.positions = [np.asarray(p) * [-1, 1, 1] for p in mesh.positions]
    out.normals = [np.asarray(n) * [-1, 1, 1] for n in mesh.normals]
    for k in range(0, len(mesh.indices), 3):
        a, b, c = mesh.indices[k:k + 3]
        out.indices += [a, c, b]
    return out


def cylinder(center, radius, length, axis, segments=20, caps=True):
    mesh = Mesh()
    center = np.asarray(center, float)
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    helper = np.array([0, 1, 0]) if abs(axis[1]) < 0.9 else np.array([1, 0, 0])
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    rings = []
    for end in (-0.5, 0.5):
        rings.append([center + axis * length * end + (u * math.cos(a) + v * math.sin(a)) * radius
                      for a in np.linspace(0, 2 * math.pi, segments, endpoint=False)])
    mesh.grid(rings, flip=True)
    if caps:
        mesh.fan(center - axis * length / 2, rings[0], -axis)
        mesh.fan(center + axis * length / 2, rings[1], axis)
    return mesh


def sphere(center, radius, segments=10):
    mesh = Mesh()
    rings = []
    for lat in np.linspace(-math.pi / 2 + 0.2, math.pi / 2 - 0.2, segments):
        rings.append([np.asarray(center) + radius * np.array([math.cos(lat) * math.cos(a), math.sin(lat), math.cos(lat) * math.sin(a)])
                      for a in np.linspace(0, 2 * math.pi, segments, endpoint=False)])
    mesh.grid(rings, flip=True)
    mesh.fan(np.asarray(center) + [0, -radius, 0], rings[0], (0, -1, 0))
    mesh.fan(np.asarray(center) + [0, radius, 0], rings[-1], (0, 1, 0))
    return mesh


def merge(*meshes):
    out = Mesh()
    for mesh in meshes:
        base = len(out.positions)
        out.positions += list(mesh.positions)
        out.normals += list(mesh.normals)
        out.indices += [base + i for i in mesh.indices]
    return out


def quat_axis(axis, angle):
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    s = math.sin(angle / 2)
    return [float(axis[0] * s), float(axis[1] * s), float(axis[2] * s), float(math.cos(angle / 2))]


def build():
    """Returns nodes: name -> (parent, translation, {material: Mesh}), plus surface hinge data."""
    nodes = {}
    body, nose, tail_ring = fuselage()
    glass, frame = canopy()

    # Wings: root at the fuselage side, an inner panel, an outer panel and an aileron.
    wing_root = (0.9, -1.6, 4.4, -0.12)
    wing_break = (3.1, 0.25, 2.55, -0.2)
    wing_tip = (5.05, 1.6, 1.25, -0.27)
    inner, _ = lifting_surface(wing_root, wing_break, 0.055)
    outer, _ = lifting_surface(wing_break, wing_tip, 0.05, chord_range=(0.0, 0.74))
    aileron, _ = lifting_surface(wing_break, wing_tip, 0.05, chord_range=(0.74, 1.0))
    hinge_a = np.array([wing_break[0], wing_break[3], wing_break[1] + wing_break[2] * 0.74])
    hinge_b = np.array([wing_tip[0], wing_tip[3], wing_tip[1] + wing_tip[2] * 0.74])
    aileron_axis = (hinge_b - hinge_a) / np.linalg.norm(hinge_b - hinge_a)
    tip_cap = cylinder((5.07, -0.27, 2.0), 0.07, 1.2, (0, 0, 1), segments=10)

    # All-moving stabilators pivot about a spanwise axis at their quarter chord.
    stab_root = (0.5, 4.15, 2.0, 0.12)
    stab_tip = (2.75, 5.35, 0.95, 0.06)
    stab, _ = lifting_surface(stab_root, stab_tip, 0.05)
    stab_pivot = np.array([0.0, 0.11, 4.15 + 2.0 * 0.35])

    # Fin and rudder.
    fin_root = (0.45, 3.3, 2.6, 0)
    fin_tip = (2.65, 5.25, 1.15, 0)
    fin, _ = lifting_surface(fin_root, fin_tip, 0.06, chord_range=(0.0, 0.7), axis="y")
    fin_top, _ = lifting_surface((2.3, 4.95 + 0.0, 1.32, 0), fin_tip, 0.06, chord_range=(0.0, 0.7), axis="y")
    rudder, _ = lifting_surface(fin_root, fin_tip, 0.06, chord_range=(0.7, 1.0), axis="y")
    rudder_a = np.array([0, fin_root[0], fin_root[1] + fin_root[2] * 0.7])
    rudder_b = np.array([0, fin_tip[0], fin_tip[1] + fin_tip[2] * 0.7])
    rudder_axis = (rudder_b - rudder_a) / np.linalg.norm(rudder_b - rudder_a)

    # Nozzle with a glowing turbine face.
    nozzle = cylinder((0, 0.1, 6.35), 0.5, 0.55, (0, 0, 1), segments=28, caps=False)
    nozzle_inner = cylinder((0, 0.1, 6.35), 0.44, 0.56, (0, 0, 1), segments=28, caps=False)
    nozzle_inner = mirror(mirror(nozzle_inner))
    heat = Mesh()
    ring = [(0.43 * math.cos(a), 0.1 + 0.43 * math.sin(a), 6.25) for a in np.linspace(0, 2 * math.pi, 28, endpoint=False)]
    heat.fan((0, 0.1, 6.2), ring, (0, 0, 1))

    # Side intakes as dark recesses, with a painted lip.
    intake_l = Mesh()
    lip = Mesh()
    for side in (-1, 1):
        rings = []
        for z, scale in ((-2.6, 1.0), (-2.3, 0.92), (-1.6, 0.8)):
            rings.append([(side * (0.82 + 0.26 * math.cos(a) * scale), -0.05 + 0.33 * math.sin(a) * scale, z)
                          for a in np.linspace(0, 2 * math.pi, 18, endpoint=False)])
        part = Mesh()
        part.grid(rings[:2], flip=side < 0)
        lip = merge(lip, part)
        dark = Mesh()
        dark.fan((side * 0.82, -0.05, -2.25), rings[1], (0, 0, -1))
        intake_l = merge(intake_l, dark)

    # Landing gear: struts, wheels and doors as separate retracting nodes.
    def gear_leg(top, length, wheel_radius, width, sideways):
        strut = cylinder(np.asarray(top) + [0, -length / 2, 0], 0.07, length, (0, 1, 0), segments=10)
        wheel_center = np.asarray(top) + [sideways * 0.12, -length, 0]
        tyre = cylinder(wheel_center, wheel_radius, width, (1, 0, 0), segments=18)
        hub = cylinder(wheel_center + [sideways * width * 0.05, 0, 0], wheel_radius * 0.55, width * 1.02, (1, 0, 0), segments=12)
        return strut, tyre, hub, wheel_center

    nose_top = (0, -0.42, -4.7)
    main_top_r = (1.25, -0.5, 1.15)
    n_strut, n_tyre, n_hub, n_wheel = gear_leg(nose_top, 1.18, 0.26, 0.18, 0)
    m_strut, m_tyre, m_hub, m_wheel = gear_leg(main_top_r, 1.12, 0.36, 0.24, 1)

    nav_l = sphere((-5.07, -0.27, 1.4), 0.07)
    nav_r = sphere((5.07, -0.27, 1.4), 0.07)
    nav_t = sphere((0, 2.66, 6.25), 0.06)

    paint = merge(body, inner, mirror(inner), outer, mirror(outer), fin, lip)
    accent = merge(nose, tip_cap, mirror(tip_cap), fin_top)
    nodes["Airframe"] = (None, (0, 0, 0), {"Paint": paint, "Accent": accent, "Intake": intake_l, "Nozzle": merge(nozzle, nozzle_inner),
                                         "Heat": heat, "Nav red": nav_l, "Nav green": nav_r, "Nav white": nav_t})
    nodes["Canopy"] = (None, (0, 0, 0), {"Canopy": glass, "Frame": frame})
    nodes["Aileron L"] = (None, tuple(hinge_a * [-1, 1, 1]), {"Paint": mirror(aileron).offset(hinge_a * [-1, 1, 1])})
    nodes["Aileron R"] = (None, tuple(hinge_a), {"Paint": aileron.offset(hinge_a)})
    nodes["Stabilator L"] = (None, tuple(stab_pivot), {"Paint": mirror(stab).offset(stab_pivot)})
    nodes["Stabilator R"] = (None, tuple(stab_pivot), {"Paint": stab.offset(stab_pivot)})
    nodes["Rudder"] = (None, tuple(rudder_a), {"Accent": rudder.offset(rudder_a)})
    nodes["Nose gear"] = (None, nose_top, {"Strut": n_strut.offset(nose_top), "Tyre": n_tyre.offset(nose_top), "Graphite": n_hub.offset(nose_top)})
    main_top_l = (-main_top_r[0], main_top_r[1], main_top_r[2])
    nodes["Main gear R"] = (None, main_top_r, {"Strut": m_strut.offset(main_top_r), "Tyre": m_tyre.offset(main_top_r), "Graphite": m_hub.offset(main_top_r)})
    nodes["Main gear L"] = (None, main_top_l, {"Strut": mirror(m_strut).offset(main_top_l), "Tyre": mirror(m_tyre).offset(main_top_l),
                                               "Graphite": mirror(m_hub).offset(main_top_l)})
    axes = {"aileron": aileron_axis, "rudder": rudder_axis}
    return nodes, axes


def glb(nodes, axes):
    buffer = bytearray()
    accessors, views, meshes, gltf_nodes = [], [], [], []
    material_names = list(MATERIALS)

    def add_view(data, target=None):
        while len(buffer) % 4:
            buffer.append(0)
        entry = {"buffer": 0, "byteOffset": len(buffer), "byteLength": len(data)}
        if target:
            entry["target"] = target
        buffer.extend(data)
        views.append(entry)
        return len(views) - 1

    def add_accessor(array, kind, component, target=None, minmax=False):
        view = add_view(array.tobytes(), target)
        entry = {"bufferView": view, "componentType": component, "count": len(array), "type": kind}
        if minmax:
            entry["min"] = np.asarray(array).min(0).tolist() if array.ndim > 1 else [float(array.min())]
            entry["max"] = np.asarray(array).max(0).tolist() if array.ndim > 1 else [float(array.max())]
        accessors.append(entry)
        return len(accessors) - 1

    names = list(nodes)
    for name in names:
        _, translation, parts = nodes[name]
        primitives = []
        for material, mesh in parts.items():
            positions = np.asarray(mesh.positions, np.float32)
            normals = np.asarray(mesh.normals, np.float32)
            indices = np.asarray(mesh.indices, np.uint32)
            primitives.append({"attributes": {"POSITION": add_accessor(positions, "VEC3", 5126, 34962, True),
                                              "NORMAL": add_accessor(normals, "VEC3", 5126, 34962)},
                               "indices": add_accessor(indices, "SCALAR", 5125, 34963), "material": material_names.index(material)})
        meshes.append({"name": name, "primitives": primitives})
        gltf_nodes.append({"name": name, "mesh": len(meshes) - 1, "translation": [float(v) for v in translation]})
    root = len(gltf_nodes)
    gltf_nodes.append({"name": "RJ-7 Kestrel", "children": list(range(root))})

    # Pose clips: each holds a surface deflection as two identical keys one second apart.
    times = np.array([0.0, 1.0], np.float32)
    time_accessor = add_accessor(times, "SCALAR", 5126, minmax=True)
    animations = []

    def pose(name, rotations):
        samplers, channels = [], []
        for node_name, quaternion in rotations.items():
            values = np.array([quaternion, quaternion], np.float32)
            output = add_accessor(values, "VEC4", 5126)
            samplers.append({"input": time_accessor, "output": output, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": names.index(node_name), "path": "rotation"}})
        animations.append({"name": name, "samplers": samplers, "channels": channels})

    aileron = np.radians(22)
    stab = np.radians(16)
    rudder = np.radians(24)
    left_axis = axes["aileron"] * [-1, 1, 1]
    identity = [0.0, 0.0, 0.0, 1.0]
    # Positive roll (right stick) raises the right aileron and lowers the left one.
    pose("Neutral", {"Aileron L": identity, "Aileron R": identity, "Stabilator L": identity, "Stabilator R": identity, "Rudder": identity})
    pose("Roll right", {"Aileron R": quat_axis(axes["aileron"], -aileron), "Aileron L": quat_axis(left_axis, -aileron)})
    pose("Roll left", {"Aileron R": quat_axis(axes["aileron"], aileron), "Aileron L": quat_axis(left_axis, aileron)})
    # Pitch up (stick back) raises the stabilator leading edges... trailing edge up.
    pose("Pitch up", {"Stabilator L": quat_axis((1, 0, 0), -stab), "Stabilator R": quat_axis((1, 0, 0), -stab)})
    pose("Pitch down", {"Stabilator L": quat_axis((1, 0, 0), stab), "Stabilator R": quat_axis((1, 0, 0), stab)})
    pose("Yaw right", {"Rudder": quat_axis(axes["rudder"], rudder)})
    pose("Yaw left", {"Rudder": quat_axis(axes["rudder"], -rudder)})

    # Gear retraction: legs fold forward (nose) and inward (mains) over 1.6 seconds.
    retract_times = np.array([0.0, 1.6], np.float32)
    retract_accessor = add_accessor(retract_times, "SCALAR", 5126, minmax=True)
    for clip, folded in (("Gear down", False), ("Gear up", True)):
        samplers, channels = [], []
        for node_name, axis, angle in (("Nose gear", (1, 0, 0), math.radians(-96)), ("Main gear L", (0, 0, 1), math.radians(-92)),
                                       ("Main gear R", (0, 0, 1), math.radians(92))):
            start = quat_axis(axis, 0 if folded else angle)
            end = quat_axis(axis, angle if folded else 0)
            values = np.array([start, end], np.float32)
            samplers.append({"input": retract_accessor, "output": add_accessor(values, "VEC4", 5126), "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": names.index(node_name), "path": "rotation"}})
            scale_values = np.array([[1, 1, 1], [1, 1, 1]] if not folded else [[1, 1, 1], [0.001, 0.001, 0.001]], np.float32)
            samplers.append({"input": retract_accessor, "output": add_accessor(scale_values, "VEC3", 5126), "interpolation": "STEP"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": names.index(node_name), "path": "scale"}})
        animations.append({"name": clip, "samplers": samplers, "channels": channels})

    used = sorted({ext for m in MATERIALS.values() for ext in m.get("extensions", {})})
    document = {
        "asset": {"version": "2.0", "generator": "RIDGELINE build_jet.py"}, "extensionsUsed": used,
        "scene": 0, "scenes": [{"nodes": [root]}], "nodes": gltf_nodes, "meshes": meshes,
        "materials": [{"name": name, **definition} for name, definition in MATERIALS.items()],
        "animations": animations, "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(buffer)}],
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
        raise SystemExit("usage: build_jet.py OUT.glb")
    nodes, axes = build()
    Path(sys.argv[1]).write_bytes(glb(nodes, axes))


if __name__ == "__main__":
    main()
