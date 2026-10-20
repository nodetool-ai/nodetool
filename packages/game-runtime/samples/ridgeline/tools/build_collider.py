#!/usr/bin/env python3
"""Builds the RIDGELINE terrain collider as an adaptive triangle mesh.

Run from the repository root after build_terrain.py:

    python3 packages/game-runtime/samples/ridgeline/tools/build_collider.py TERRAIN_DIR

Reads `heights.npy` and `course.json` and writes `terrain.collider.json`. The
runtime serializes the physics world every tick, so the tick cost grows with the
triangle count: the full render grid would cost about 25 ms a tick. A quadtree
keeps cells of about 40 m within 140 m of the racing line and over the airfield,
and about 310 m elsewhere, for about 14k triangles. Each leaf is fanned from its centre through
every neighbour corner on its edges, so leaves of different sizes share edges
without cracks. Leaves entirely under the sea are left out, because the jet
script handles water.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import landscape as L  # noqa: E402

FINE_CELLS = 8      # about 39 m
COARSE_CELLS = 64   # about 315 m
CORRIDOR_M = 140


def leaves(h, line):
    n = h.shape[0] - 1
    spacing = L.SIZE / n
    runway = L.RUNWAY

    def near(i0, j0, i1, j1):
        x0, x1 = -L.HALF + i0 * spacing, -L.HALF + i1 * spacing
        z0, z1 = -L.HALF + j0 * spacing, -L.HALF + j1 * spacing
        if x1 > -260 and x0 < 260 and z1 > runway["z_min"] - 300 and z0 < runway["z_max"] + 300:
            return True
        dx = np.maximum(np.maximum(x0 - line[:, 0], line[:, 0] - x1), 0)
        dz = np.maximum(np.maximum(z0 - line[:, 2], line[:, 2] - z1), 0)
        return bool((dx * dx + dz * dz).min() < CORRIDOR_M ** 2)

    found = []
    stack = [(0, 0, n, n)]
    while stack:
        i0, j0, i1, j1 = stack.pop()
        block = h[j0:j1 + 1, i0:i1 + 1]
        if block.max() < L.WATER_LEVEL - 4:
            continue
        size = max(i1 - i0, j1 - j0)
        if size > COARSE_CELLS or size > FINE_CELLS and near(i0, j0, i1, j1):
            im, jm = (i0 + i1) // 2, (j0 + j1) // 2
            for box in ((i0, j0, im, jm), (im, j0, i1, jm), (i0, jm, im, j1), (im, jm, i1, j1)):
                if box[2] > box[0] and box[3] > box[1]:
                    stack.append(box)
            continue
        found.append((i0, j0, i1, j1))
    return found


def mesh(h, cells):
    n = h.shape[0] - 1
    spacing = L.SIZE / n
    corners = set()
    for i0, j0, i1, j1 in cells:
        corners.update(((i0, j0), (i1, j0), (i0, j1), (i1, j1)))
    index = {}
    vertices = []

    def vertex(i, j):
        key = (i, j)
        if key not in index:
            if float(i).is_integer() and float(j).is_integer():
                y = h[int(j), int(i)]
            else:
                fi, fj = int(i), int(j)
                ti, tj = i - fi, j - fj
                y = (h[fj, fi] * (1 - ti) + h[fj, fi + 1] * ti) * (1 - tj) + (h[fj + 1, fi] * (1 - ti) + h[fj + 1, fi + 1] * ti) * tj
            index[key] = len(vertices)
            vertices.append((round(-L.HALF + i * spacing, 2), round(float(y), 2), round(-L.HALF + j * spacing, 2)))
        return index[key]

    triangles = []
    for i0, j0, i1, j1 in cells:
        # Boundary corners counter-clockwise seen from above (+Y), starting at (i0, j0).
        ring = [(i, j0) for i in range(i0, i1) if (i, j0) in corners]
        ring += [(i1, j) for j in range(j0, j1) if (i1, j) in corners]
        ring += [(i, j1) for i in range(i1, i0, -1) if (i, j1) in corners]
        ring += [(i0, j) for j in range(j1, j0, -1) if (i0, j) in corners]
        ids = [vertex(i, j) for i, j in ring]
        if len(ids) == 4:
            a, b, c, d = ids
            triangles += [(a, d, b), (b, d, c)]
            continue
        centre = vertex((i0 + i1) / 2, (j0 + j1) / 2)
        for k in range(len(ids)):
            triangles.append((centre, ids[(k + 1) % len(ids)], ids[k]))
    return vertices, triangles


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_collider.py TERRAIN_DIR")
    directory = Path(sys.argv[1])
    h = np.load(directory / "heights.npy").astype(np.float64)
    line = np.array(json.loads((directory / "course.json").read_text())["line"])
    cells = leaves(h, line)
    vertices, triangles = mesh(h, cells)
    payload = {"vertices": [v for p in vertices for v in p], "indices": [int(i) for t in triangles for i in t]}
    (directory / "terrain.collider.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(json.dumps({"leaves": len(cells), "vertices": len(vertices), "triangles": len(triangles)}))


if __name__ == "__main__":
    main()
