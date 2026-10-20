#!/usr/bin/env python3
"""Builds the RIDGELINE island: textured terrain tiles, forests and river.

Run from the repository root:

    python3 packages/game-runtime/samples/ridgeline/tools/build_terrain.py OUT_DIR

Writes `terrain-<i>.glb` (four 5 km tiles with 2048 px albedo and normal maps, meshed
adaptively down to the 4.9 m height grid),
`forest-<i>.glb` (three-tier conifers per tile), `river.glb`, `heights.npy` (the height
grid that plan_course.py and build_collider.py read) and `layout.json` (runway
and canyon path for the game document builder). The output is deterministic.
"""
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import landscape as L  # noqa: E402

GRID = 2033            # base height samples across the island (4.92 m)
TEXTURE = 4096         # global texel count across the island (2.44 m)
MESH_TOLERANCE = 2.0   # metres a terrain mesh cell may deviate from the height grid
TILE_TRIANGLES = 240000  # under the renderer's 250k triangles per model
FOREST_BLOCK = 1250.0  # metres per forest mesh, the unit the renderer culls
CHUNK_VERTS = 60000    # vertices per terrain mesh primitive (uint16 indices)


def box_blur(a, radius):
    """Separable box blur with edge clamping, radius in samples."""
    if radius < 1:
        return a
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius + 1, radius)
        padded = np.pad(out, pad, mode="edge")
        c = np.cumsum(padded, axis=axis, dtype=np.float64)
        if axis == 0:
            out = (c[2 * radius + 1:] - c[:-2 * radius - 1]) / (2 * radius + 1)
        else:
            out = (c[:, 2 * radius + 1:] - c[:, :-2 * radius - 1]) / (2 * radius + 1)
    return out


def upsample(a, size):
    """Bilinear resample of a square grid to size x size (corner aligned)."""
    n = a.shape[0]
    t = np.linspace(0, n - 1, size)
    i0 = np.clip(np.floor(t).astype(int), 0, n - 2)
    f = t - i0
    rows = a[i0] * (1 - f)[:, None] + a[i0 + 1] * f[:, None]
    return rows[:, i0] * (1 - f)[None, :] + rows[:, i0 + 1] * f[None, :]


def normals_from_heights(h, spacing):
    dzdx = np.gradient(h, spacing, axis=1)
    dzdz = np.gradient(h, spacing, axis=0)
    n = np.dstack([-dzdx, np.ones_like(h), -dzdz])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def srgb(hex_color):
    v = int(hex_color[1:], 16)
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], float) / 255


def mix(a, b, t):
    t = np.asarray(t)[..., None]
    return a * (1 - t) + b * t


def field_pattern(x, z, rng):
    """Farmland patchwork: rotated cells with per-cell crop colours and hedges."""
    angle = np.radians(14)
    u = x * np.cos(angle) - z * np.sin(angle)
    v = x * np.sin(angle) + z * np.cos(angle)
    cw, ch = 210.0, 140.0
    iu = np.floor(u / cw).astype(np.int64)
    # Offset alternate strips so the layout does not read as a grid.
    v2 = v + (iu % 3) * 47.0
    iv = np.floor(v2 / ch).astype(np.int64)
    key = (iu * 73856093) ^ (iv * 19349663)
    palette = np.array([srgb(c) for c in ("#717a45", "#8e8a55", "#a39463", "#647040", "#7c6a4c", "#5b6a3c", "#9a8c5c", "#6e7746")])
    choice = palette[(key % len(palette) + len(palette)) % len(palette)]
    fu = u / cw - np.floor(u / cw)
    fv = v2 / ch - np.floor(v2 / ch)
    edge = np.minimum(np.minimum(fu, 1 - fu) * cw, np.minimum(fv, 1 - fv) * ch)
    hedge = np.clip(1 - (edge - 2.0) / 3.0, 0, 1)
    # Ploughed furrows along each cell's long axis.
    furrow = 0.5 + 0.5 * np.sin(v2 * (2 * np.pi / 9.0) + (key % 7))
    return choice, hedge, furrow


def build_maps(h_base, texture=TEXTURE):
    """Albedo, tangent-space normals, tree density and masks at TEXTURE resolution."""
    spacing = L.SIZE / (texture - 1)
    h = upsample(h_base, texture)
    xs = np.linspace(-L.HALF, L.HALF, texture)
    x, z = np.meshgrid(xs, xs)
    # High-frequency relief only on slopes and rock, so meadows stay smooth.
    coarse_n = normals_from_heights(h, spacing)
    slope = 1 - coarse_n[..., 1]
    detail = L.Noise(23, 60, 4).fbm(x, z) - 0.5
    grit = L.Noise(29, 12, 2).fbm(x, z) - 0.5
    rocky = np.clip((slope - 0.12) * 4, 0, 1)
    h_fine = h + detail * (2.0 + 9.0 * rocky) + grit * (0.4 + 1.6 * rocky)
    fine_n = normals_from_heights(h_fine, spacing)

    # The terrain mesh takes its vertex normals from the full height grid, so the same field defines the tangent frame.
    mesh_n = normals_from_heights(h_base, L.SIZE / (GRID - 1))
    mesh_n = np.dstack([upsample(mesh_n[..., i], texture) for i in range(3)])
    mesh_n /= np.linalg.norm(mesh_n, axis=2, keepdims=True)
    tangent = np.dstack([np.ones_like(h), np.zeros_like(h), np.zeros_like(h)])
    tangent -= mesh_n * np.sum(tangent * mesh_n, axis=2, keepdims=True)
    tangent /= np.linalg.norm(tangent, axis=2, keepdims=True)
    bitangent = np.cross(mesh_n, tangent)  # points toward +z, which is +v in our UVs
    tn = np.dstack([np.sum(fine_n * tangent, axis=2), np.sum(fine_n * bitangent, axis=2), np.sum(fine_n * mesh_n, axis=2)])
    # glTF tangent space: +Y follows the bitangent. The UV v axis runs along -z in
    # world space after flipping (see tile UVs), so flip green to match.
    tn[..., 1] *= -1
    normal_rgb = ((tn * 0.5 + 0.5) * 255).round().clip(0, 255).astype(np.uint8)

    slope = 1 - coarse_n[..., 1]
    cavity = h - box_blur(h, max(1, int(30 / spacing)))
    macro = L.Noise(31, 900, 4).fbm(x, z)
    micro = L.Noise(37, 40, 3).fbm(x, z)
    moisture = L.Noise(41, 1400, 4).fbm(x, z)

    grass_a, grass_b, grass_dry = srgb("#4f5f34"), srgb("#6b7442"), srgb("#8c855a")
    forest_floor = srgb("#26381d")
    rock_a, rock_b, rock_dark = srgb("#65584b"), srgb("#7d7064"), srgb("#3a332c")
    scree = srgb("#7a6e60")
    snow = srgb("#eef2f7")
    sand = srgb("#c8b285")
    seabed = srgb("#5f6b58")

    grass = mix(grass_a, grass_b, np.clip(macro * 1.6 - 0.3, 0, 1))
    grass = mix(grass, grass_dry, np.clip((0.55 - moisture) * 3 + (h - 300) / 900, 0, 0.75))
    grass = grass * (0.88 + 0.24 * micro[..., None])

    rng = np.random.default_rng(5)
    crops, hedge, furrow = field_pattern(x, z, rng)
    crops = crops * (0.9 + 0.12 * furrow[..., None]) * (0.92 + 0.16 * micro[..., None])
    farmland = np.clip(L.smoothstep(150, 420, z) + L.smoothstep(-200, 300, z) * L.smoothstep(900, 1600, np.abs(x)) * 0.0, 0, 1)
    farmland *= L.smoothstep(230, 120, h) * L.smoothstep(0.1, 0.04, slope)
    farmland *= L.smoothstep(380, 520, np.hypot(np.maximum(np.abs(x) - 170, 0), np.maximum(np.abs(z) - 1080, 0)))
    farmland *= (L.Noise(43, 700, 3).fbm(x, z) > 0.38)
    farmland = box_blur(farmland.astype(float), 2)
    albedo = mix(grass, crops, farmland)
    albedo = mix(albedo, srgb("#33452a"), hedge * farmland * 0.85)

    # Forest density, also used to place tree meshes.
    forest_noise = L.Noise(47, 420, 5).fbm(x, z)
    density = np.clip((forest_noise - 0.47) * 6, 0, 1)
    density *= L.smoothstep(L.WATER_LEVEL + 6, L.WATER_LEVEL + 25, h) * L.smoothstep(1150, 850, h)
    density *= L.smoothstep(0.42, 0.25, slope) * (1 - farmland)
    clear = np.hypot(np.maximum(np.abs(x) - 230, 0), np.maximum(np.abs(z) - 1180, 0))
    density *= L.smoothstep(150, 420, clear)
    albedo = mix(albedo, forest_floor * (0.85 + 0.3 * micro[..., None]), np.clip(density * 1.3, 0, 1))

    strata = 0.5 + 0.5 * np.sin(h / 11.0 + macro * 16 + micro * 4)
    rock = mix(rock_a, rock_b, 0.3 + 0.25 * strata + 0.3 * (micro - 0.5)) * (0.85 + 0.3 * micro[..., None])
    rock = mix(rock, rock_dark, np.clip(-cavity / 18, 0, 0.7))
    rock_weight = L.smoothstep(0.24, 0.4, slope + (micro - 0.5) * 0.1 + (macro - 0.5) * 0.12)
    albedo = mix(albedo, scree, L.smoothstep(0.12, 0.22, slope) * (1 - rock_weight) * L.smoothstep(350, 700, h) * 0.8)
    albedo = mix(albedo, rock, rock_weight)

    snow_line = 1180 + (macro - 0.5) * 260
    snow_weight = L.smoothstep(snow_line - 40, snow_line + 60, h) * L.smoothstep(0.55, 0.32, slope + (micro - 0.5) * 0.2)
    snow_col = mix(snow, srgb("#b9c6d8"), np.clip(-cavity / 25, 0, 0.6))
    albedo = mix(albedo, snow_col, snow_weight)

    beach = L.smoothstep(L.WATER_LEVEL + 7, L.WATER_LEVEL + 2, h)
    albedo = mix(albedo, sand, beach)
    albedo = mix(albedo, seabed, L.smoothstep(L.WATER_LEVEL, L.WATER_LEVEL - 6, h))

    # Canyon river gravel along the bed.
    path = L.canyon_path_smooth()
    d, bed = L.distance_to_path(x, z, path)
    albedo = mix(albedo, srgb("#8a8574") * (0.9 + 0.2 * micro[..., None]), L.smoothstep(60, 30, d) * L.smoothstep(bed + 12, bed + 2, h))

    # Airfield: apron, taxiway and mown strip around the runway.
    apron = (np.abs(x - 150) < 95) & (np.abs(z - 250) < 230)
    taxi = (np.abs(x - 62) < 10) & (np.abs(z) < 860)
    link = (np.abs(z - 250) < 12) & (x > 0) & (x < 150)
    paved = (apron | taxi | link).astype(float)
    paved = box_blur(paved, 1)
    concrete = srgb("#8f8d86") * (0.9 + 0.14 * micro[..., None])
    strip = (np.abs(x) < 75) & (np.abs(z) < 980)
    albedo = mix(albedo, mix(albedo, srgb("#5f7a35"), 0.6), strip.astype(float))
    albedo = mix(albedo, concrete, paved)

    # Ambient occlusion from local cavities, and a slight sun-independent relief.
    ao = np.clip(1 + cavity / 60, 0.6, 1.05)
    albedo = albedo * ao[..., None]
    albedo_rgb = (np.clip(albedo, 0, 1) ** (1 / 1.0) * 255).round().astype(np.uint8)
    return albedo_rgb, normal_rgb, density, h


def jpeg(rgb, quality):
    buffer = io.BytesIO()
    Image.fromarray(rgb).save(buffer, format="JPEG", quality=quality, optimize=True, subsampling=0 if quality >= 92 else 2)
    return buffer.getvalue()


class GLB:
    def __init__(self, generator):
        self.buffer = bytearray()
        self.accessors, self.views, self.meshes, self.nodes = [], [], [], []
        self.materials, self.textures, self.images, self.samplers = [], [], [], []
        self.generator = generator
        self.extensions = set()

    def view(self, data, target=None):
        while len(self.buffer) % 4:
            self.buffer.append(0)
        entry = {"buffer": 0, "byteOffset": len(self.buffer), "byteLength": len(data)}
        if target:
            entry["target"] = target
        self.buffer.extend(data)
        self.views.append(entry)
        return len(self.views) - 1

    def accessor(self, array, kind, component, target, minmax=False, normalized=False):
        view = self.view(array.tobytes(), target)
        entry = {"bufferView": view, "componentType": component, "count": len(array), "type": kind}
        if normalized:
            entry["normalized"] = True
        if minmax:
            entry["min"] = array.min(0).tolist()
            entry["max"] = array.max(0).tolist()
        self.accessors.append(entry)
        return len(self.accessors) - 1

    def image(self, data, mime):
        view = self.view(data)
        self.images.append({"bufferView": view, "mimeType": mime})
        if not self.samplers:
            self.samplers.append({"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071})
        self.textures.append({"source": len(self.images) - 1, "sampler": 0})
        return len(self.textures) - 1

    def interleaved(self, columns, count):
        """Writes per-vertex columns (byte arrays of equal row count) into one strided buffer view."""
        stride = sum(c.shape[1] for c in columns)
        data = np.concatenate(columns, axis=1)
        assert data.shape == (count, stride) and stride % 4 == 0
        while len(self.buffer) % 4:
            self.buffer.append(0)
        view = {"buffer": 0, "byteOffset": len(self.buffer), "byteLength": int(data.size), "byteStride": stride, "target": 34962}
        self.buffer.extend(data.tobytes())
        self.views.append(view)
        return len(self.views) - 1

    def mesh(self, name, positions, normals, indices, material, uvs=None, colors=None):
        """Adds a KHR_mesh_quantization mesh: int16 positions under a dequantizing node, int8 normals."""
        positions = np.asarray(positions, np.float64)
        count = len(positions)
        lo, hi = positions.min(0), positions.max(0)
        centre = (lo + hi) / 2
        scale = np.maximum((hi - lo) / 2, 1e-6) / 32767
        q_pos = np.round((positions - centre) / scale).astype(np.int16)
        q_nrm = np.round(np.clip(np.asarray(normals, float), -1, 1) * 127).astype(np.int8)
        columns = [q_pos.view(np.uint8).reshape(count, 6), np.zeros((count, 2), np.uint8),
                   q_nrm.view(np.uint8).reshape(count, 3), np.zeros((count, 1), np.uint8)]
        offsets = {"POSITION": 0, "NORMAL": 8}
        cursor = 12
        if uvs is not None:
            q_uv = np.round(np.clip(np.asarray(uvs, float), 0, 1) * 65535).astype(np.uint16)
            columns.append(q_uv.view(np.uint8).reshape(count, 4))
            offsets["TEXCOORD_0"] = cursor
            cursor += 4
        if colors is not None:
            columns.append(np.asarray(colors, np.uint8).reshape(count, 4))
            offsets["COLOR_0"] = cursor
            cursor += 4
        view = self.interleaved(columns, count)
        attributes = {}
        specs = {"POSITION": ("VEC3", 5122, False), "NORMAL": ("VEC3", 5120, True), "TEXCOORD_0": ("VEC2", 5123, True), "COLOR_0": ("VEC4", 5121, True)}
        for key, offset in offsets.items():
            kind, component, normalized = specs[key]
            entry = {"bufferView": view, "byteOffset": offset, "componentType": component, "count": count, "type": kind}
            if normalized:
                entry["normalized"] = True
            if key == "POSITION":
                entry["min"] = q_pos.min(0).astype(int).tolist()
                entry["max"] = q_pos.max(0).astype(int).tolist()
            self.accessors.append(entry)
            attributes[key] = len(self.accessors) - 1
        index_type = (np.uint16, 5123) if count < 65536 else (np.uint32, 5125)
        index = self.accessor(np.asarray(indices).astype(index_type[0]).reshape(-1), "SCALAR", index_type[1], 34963)
        self.meshes.append({"name": name, "primitives": [{"attributes": attributes, "indices": index, "material": material}]})
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1, "translation": centre.tolist(), "scale": scale.tolist()})

    def material(self, definition):
        self.extensions |= set(definition.get("extensions", {}))
        self.materials.append(definition)
        return len(self.materials) - 1

    def bytes(self):
        root = {"name": self.generator, "children": list(range(len(self.nodes)))}
        nodes = self.nodes + [root]
        document = {"asset": {"version": "2.0", "generator": self.generator}, "scene": 0,
                    "extensionsUsed": sorted(self.extensions | {"KHR_mesh_quantization"}), "extensionsRequired": ["KHR_mesh_quantization"],
                    "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": self.meshes,
                    "materials": self.materials, "accessors": self.accessors, "bufferViews": self.views,
                    "buffers": [{"byteLength": len(self.buffer)}]}
        if self.images:
            document.update(images=self.images, textures=self.textures, samplers=self.samplers)
        json_bytes = json.dumps(document, separators=(",", ":")).encode()
        json_bytes += b" " * (-len(json_bytes) % 4)
        while len(self.buffer) % 4:
            self.buffer.append(0)
        total = 12 + 8 + len(json_bytes) + 8 + len(self.buffer)
        return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
                + struct.pack("<II", len(self.buffer), 0x004E4942) + bytes(self.buffer))


def mesh_cells(h, tolerance):
    """Quadtree cells of the height grid, split until bilinear interpolation stays within the quadrant's tolerance.

    Cells never cross the centre lines, so each of the four texture quadrants gets whole cells. Cells entirely
    under the sea stop at 64 samples, because the sea plane covers them.
    """
    n = h.shape[0] - 1
    half = n // 2
    found = []
    stack = [(0, 0, n, n)]
    while stack:
        i0, j0, i1, j1 = stack.pop()
        block = h[j0:j1 + 1, i0:i1 + 1]
        ti = np.linspace(0, 1, i1 - i0 + 1)[None, :]
        tj = np.linspace(0, 1, j1 - j0 + 1)[:, None]
        bilinear = (block[0, 0] * (1 - ti) + block[0, -1] * ti) * (1 - tj) + (block[-1, 0] * (1 - ti) + block[-1, -1] * ti) * tj
        size = max(i1 - i0, j1 - j0)
        if size <= 64 and block.max() < L.WATER_LEVEL - 6:
            found.append((i0, j0, i1, j1))
            continue
        if size > 64 or (size > 1 and np.abs(block - bilinear).max() > tolerance[(j0 >= half) * 2 + (i0 >= half)]):
            im, jm = (i0 + i1) // 2, (j0 + j1) // 2
            for box in ((im, jm, i1, j1), (i0, jm, im, j1), (im, j0, i1, jm), (i0, j0, im, jm)):
                if box[2] > box[0] and box[3] > box[1]:
                    stack.append(box)
            continue
        found.append((i0, j0, i1, j1))
    return found


def terrain_tiles(h_base, albedo, normal, out):
    """Four 5 km tiles. Tile (i, j) covers x column i and z row j.

    Each cell is fanned from its centre through every cell corner on its edges, so cells of different sizes
    share edges without cracks. Vertex normals come from the full height grid.
    """
    n = GRID - 1
    half = n // 2
    half_tex = TEXTURE // 2
    spacing = L.SIZE / n
    field = normals_from_heights(h_base, spacing)
    # Steep quadrants coarsen in 0.25 m steps until each tile fits the renderer's triangle budget.
    tolerance = [MESH_TOLERANCE] * 4
    while True:
        cells = mesh_cells(h_base, tolerance)
        corners = set()
        for i0, j0, i1, j1 in cells:
            corners.update(((i0, j0), (i1, j0), (i0, j1), (i1, j1)))
        counts = [0] * 4
        for i0, j0, i1, j1 in cells:
            edge = sum((c, j0) in corners or (c, j1) in corners for c in range(i0 + 1, i1)) + \
                sum((i0, r) in corners or (i1, r) in corners for r in range(j0 + 1, j1))
            counts[(j0 >= half) * 2 + (i0 >= half)] += 2 if edge == 0 else 4 + edge
        over = [k for k in range(4) if counts[k] > TILE_TRIANGLES]
        if not over:
            break
        for k in over:
            tolerance[k] += 0.25

    def sample(grid, i, j):
        fi, fj = min(int(i), n - 1), min(int(j), n - 1)
        ti, tj = i - fi, j - fj
        return (grid[fj, fi] * (1 - ti) + grid[fj, fi + 1] * ti) * (1 - tj) + (grid[fj + 1, fi] * (1 - ti) + grid[fj + 1, fi + 1] * ti) * tj

    tiles = []
    triangles = 0
    for j in range(2):
        for i in range(2):
            own = [c for c in cells if c[0] >= i * half and c[2] <= (i + 1) * half and c[1] >= j * half and c[3] <= (j + 1) * half]
            glb = GLB("RIDGELINE build_terrain.py")
            ta = glb.image(jpeg(albedo[j * half_tex:(j + 1) * half_tex, i * half_tex:(i + 1) * half_tex], 88), "image/jpeg")
            tn = glb.image(jpeg(normal[j * half_tex:(j + 1) * half_tex, i * half_tex:(i + 1) * half_tex], 92), "image/jpeg")
            material = glb.material({"name": "Terrain", "pbrMetallicRoughness": {"baseColorTexture": {"index": ta}, "metallicFactor": 0, "roughnessFactor": 0.95},
                                     "normalTexture": {"index": tn, "scale": 1.0}})
            chunk = []

            def flush():
                nonlocal triangles
                if not chunk:
                    return
                index, positions, normals, uvs, indices = {}, [], [], [], []
                for ring, centre in chunk:
                    ids = []
                    for key in ring + ([centre] if centre else []):
                        if key not in index:
                            ci, cj = key
                            index[key] = len(positions)
                            positions.append((-L.HALF + ci * spacing, sample(h_base, ci, cj), -L.HALF + cj * spacing))
                            nrm = sample(field, ci, cj)
                            normals.append(nrm / np.linalg.norm(nrm))
                            uvs.append(((ci - i * half) / half, (cj - j * half) / half))
                        ids.append(index[key])
                    if centre is None:
                        a, b, c, d = ids
                        indices += [(a, d, b), (b, d, c)]
                    else:
                        middle, edge = ids[-1], ids[:-1]
                        indices += [(middle, edge[(k + 1) % len(edge)], edge[k]) for k in range(len(edge))]
                uv = np.array(uvs) * (1 - 1 / half_tex) + 0.5 / half_tex
                glb.mesh(f"Terrain {i}{j}.{len(glb.meshes)}", np.array(positions), np.array(normals), np.array(indices), material, uvs=uv)
                triangles += len(indices)
                chunk.clear()

            used = 0
            for i0, j0, i1, j1 in own:
                # Boundary corners counter-clockwise seen from above (+Y), starting at (i0, j0).
                ring = [(c, j0) for c in range(i0, i1) if (c, j0) in corners]
                ring += [(i1, r) for r in range(j0, j1) if (i1, r) in corners]
                ring += [(c, j1) for c in range(i1, i0, -1) if (c, j1) in corners]
                ring += [(i0, r) for r in range(j1, j0, -1) if (i0, r) in corners]
                centre = None if len(ring) == 4 else ((i0 + i1) / 2, (j0 + j1) / 2)
                if used + len(ring) + 1 > CHUNK_VERTS:
                    flush()
                    used = 0
                chunk.append((ring, centre))
                used += len(ring) + 1
            flush()
            name = f"terrain-{j * 2 + i}.glb"
            (out / name).write_bytes(glb.bytes())
            tiles.append({"file": name, "x": [-L.HALF + i * half * spacing, -L.HALF + (i + 1) * half * spacing],
                          "z": [-L.HALF + j * half * spacing, -L.HALF + (j + 1) * half * spacing]})
    print(json.dumps({"terrainCells": len(cells), "terrainTriangles": triangles, "meshTolerance": tolerance}))
    return tiles


TIERS = ((0.12, 0.55, 1.0), (0.36, 0.8, 0.74), (0.6, 1.0, 0.46))


def conifer(rng, base, height, radius, color):
    """Three stacked open cones, darker underneath, with linear vertex colours: 18 triangles."""
    positions, normals, colors, indices = [], [], [], []
    sides = sides_per_tree()
    turn = rng.random() * np.pi
    color = color ** 2.2
    for tier, (bottom, top, r) in enumerate(TIERS):
        apex = base + np.array([0, height * top, 0])
        ring_y = base[1] + height * bottom
        start = len(positions)
        positions.append(apex)
        normals.append(np.array([0, 1, 0]))
        shade = 0.8 + 0.12 * tier
        colors.append(np.append(np.clip(color * (shade + 0.35), 0, 1), 1))
        for s in range(sides):
            a = turn + s * 2 * np.pi / sides
            p = np.array([base[0] + np.cos(a) * radius * r, ring_y, base[2] + np.sin(a) * radius * r])
            positions.append(p)
            nrm = np.array([np.cos(a), 0.55, np.sin(a)])
            normals.append(nrm / np.linalg.norm(nrm))
            colors.append(np.append(np.clip(color * shade * 0.55, 0, 1), 1))
        for s in range(sides):
            indices.append([start, start + 1 + (s + 1) % sides, start + 1 + s])
    return positions, normals, colors, indices


def sides_per_tree():
    return 6


def forests(density, h_hi, out):
    """Places conifers by jittered grid sampling against the forest density."""
    rng = np.random.default_rng(9)
    spacing = 21.0
    count = int(L.SIZE / spacing)
    tex_spacing = L.SIZE / (TEXTURE - 1)
    tiles = [{} for _ in range(4)]
    palette = np.array([srgb(c) for c in ("#26402a", "#2f4a2c", "#223826", "#3a4f2c", "#2c4532", "#45512e")])
    totals = 0
    for gz in range(count):
        for gx in range(count):
            x = -L.HALF + (gx + rng.random()) * spacing
            z = -L.HALF + (gz + rng.random()) * spacing
            col = int(round((x + L.HALF) / tex_spacing))
            row = int(round((z + L.HALF) / tex_spacing))
            if col < 0 or row < 0 or col >= TEXTURE or row >= TEXTURE:
                continue
            if rng.random() > density[row, col] * 0.85:
                continue
            y = h_hi[row, col] - 0.6
            tree_h = 11 + rng.random() * 13
            radius = tree_h * (0.26 + rng.random() * 0.08)
            color = palette[rng.integers(len(palette))] * (0.85 + rng.random() * 0.3)
            p, n, c, i = conifer(rng, np.array([x, y, z]), tree_h, radius, color)
            block = (int((x + L.HALF) // FOREST_BLOCK), int((z + L.HALF) // FOREST_BLOCK))
            tiles[(1 if z > 0 else 0) * 2 + (1 if x > 0 else 0)].setdefault(block, []).append((p, n, c, i))
            totals += 1
    files = []
    trees_per_chunk = 65535 // (len(TIERS) * (sides_per_tree() + 1))
    for index, blocks in enumerate(tiles):
        glb = GLB("RIDGELINE build_terrain.py")
        # Linear needle colours are dark, so the vertex colours store four times the value for 8-bit precision.
        material = glb.material({"name": "Conifer", "pbrMetallicRoughness": {"baseColorFactor": [0.25, 0.25, 0.25, 1], "metallicFactor": 0, "roughnessFactor": 0.9}})
        tree_count = 0
        # One mesh per block, so the camera and every shadow cascade cull the forest block by block.
        for key in sorted(blocks):
            trees = blocks[key]
            tree_count += len(trees)
            for start in range(0, len(trees), trees_per_chunk):
                p, n, c, i = [], [], [], []
                for tp, tn, tc, ti in trees[start:start + trees_per_chunk]:
                    i.extend((np.array(ti) + len(p)).tolist())
                    p.extend(tp)
                    n.extend(tn)
                    c.extend(tc)
                c = (np.clip(np.array(c) * [4, 4, 4, 1], 0, 1) * 255).round()
                glb.mesh(f"Forest {index}.{len(glb.meshes)}", np.array(p), np.array(n), np.array(i), material, colors=c)
        name = f"forest-{index}.glb"
        (out / name).write_bytes(glb.bytes())
        files.append({"file": name, "trees": tree_count})
    return files, totals


def river(out):
    """A water ribbon along the canyon bed, 1.2 m above the gravel, as wide as the bed between its banks."""
    path = L.canyon_path_smooth(24)
    left, right = [], []
    for k in range(len(path)):
        a = path[max(k - 1, 0)]
        b = path[min(k + 1, len(path) - 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = np.hypot(dx, dz)
        nx, nz = -dz / length, dx / length
        y = path[k][2] + 1.2
        # Each bank ends 4 m past the point where the ground rises 2 m above the water, so it tucks under the bank.
        for side, edge in ((1, left), (-1, right)):
            reach = np.arange(2.0, 40.0, 1.0)
            ground = L.height(path[k][0] + side * nx * reach, path[k][1] + side * nz * reach)
            dry = np.nonzero(ground > y + 2)[0]
            width = min(reach[dry[0]] + 4 if len(dry) else 40.0, 40.0)
            edge.append([path[k][0] + side * nx * width, y, path[k][1] + side * nz * width])
    positions = np.array([v for pair in zip(left, right) for v in pair])
    normals = np.tile([0, 1, 0], (len(positions), 1))
    # U runs across the ribbon and V along it, so the game document can tile the water normal map along the flow.
    along = np.concatenate([[0], np.cumsum(np.hypot(np.diff(path[:, 0]), np.diff(path[:, 1])))])
    uvs = np.array([(u, t) for t in along / along[-1] for u in (0, 1)])
    indices = []
    for k in range(len(path) - 1):
        a, b, c, d = 2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3
        indices += [[a, c, b], [b, c, d]]
    glb = GLB("RIDGELINE build_terrain.py")
    material = glb.material({"name": "River", "pbrMetallicRoughness": {"baseColorFactor": [0.05, 0.13, 0.15, 1], "metallicFactor": 0.0, "roughnessFactor": 0.06}})
    glb.mesh("River", positions, normals, np.array(indices), material, uvs=uvs)
    (out / "river.glb").write_bytes(glb.bytes())


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_terrain.py OUT_DIR")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    xs = np.linspace(-L.HALF, L.HALF, GRID)
    x, z = np.meshgrid(xs, xs)
    h_base = L.height(x, z)
    np.save(out / "heights.npy", h_base.astype(np.float32))
    albedo, normal, density, h_hi = build_maps(h_base)
    Image.fromarray(albedo).resize((1024, 1024), Image.LANCZOS).save(out / "albedo-preview.png")
    tiles = terrain_tiles(h_base, albedo, normal, out)
    forest_files, trees = forests(density, h_hi, out)
    river(out)
    layout = {"waterLevel": L.WATER_LEVEL, "airfieldHeight": L.AIRFIELD_HEIGHT, "runway": L.RUNWAY,
              "canyon": L.canyon_path_smooth(4).round(1).tolist(), "tiles": tiles, "forests": forest_files,
              "trees": trees, "gridSpacing": L.SIZE / (GRID - 1)}
    (out / "layout.json").write_text(json.dumps(layout, indent=1))
    print(json.dumps({k: v for k, v in layout.items() if k != "canyon"}, indent=1))


if __name__ == "__main__":
    main()
