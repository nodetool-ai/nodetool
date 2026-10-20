"""Deterministic height field for the RIDGELINE island.

The island spans 10 km on each side, centred on the origin, with +X east,
+Y up and -Z north. Heights are metres. The airfield runway runs north along
x = 0 between z = +900 and z = -900 on a plateau at AIRFIELD_HEIGHT. A canyon
follows CANYON_PATH from the lake north of the airfield, through the northern
range, and out to the eastern foothills. Sea and lake water share WATER_LEVEL.
"""
import numpy as np

SIZE = 10_000.0
HALF = SIZE / 2
WATER_LEVEL = 20.0
AIRFIELD_HEIGHT = 46.0
RUNWAY = {"x": 0.0, "z_min": -900.0, "z_max": 900.0, "width": 45.0}

# Canyon centreline in (x, z) metres, with the river bed height at each point.
CANYON_PATH = np.array([
    (-650, -1750, 30), (-900, -2350, 60), (-650, -2950, 90), (-50, -3350, 120),
    (700, -3450, 140), (1350, -3150, 150), (1800, -2550, 160), (2350, -2150, 170),
    (2800, -1550, 150), (2850, -800, 110), (2700, -150, 70),
], float)


def _lattice(rng, size):
    return rng.random((size, size), dtype=np.float64)


def _value_noise(lattice, x, y):
    """Smooth value noise sampled at lattice coordinates, periodic on the lattice."""
    size = lattice.shape[0]
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    x0 %= size
    y0 %= size
    x1 = (x0 + 1) % size
    y1 = (y0 + 1) % size
    a = lattice[y0, x0]
    b = lattice[y0, x1]
    c = lattice[y1, x0]
    d = lattice[y1, x1]
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


class Noise:
    """Fractal noise in world metres with fixed lattices per octave."""

    def __init__(self, seed, base_wavelength, octaves, lacunarity=2.0):
        rng = np.random.default_rng(seed)
        self.octaves = []
        wavelength = base_wavelength
        for _ in range(octaves):
            size = max(4, int(np.ceil(SIZE * 1.5 / wavelength)) + 2)
            self.octaves.append((wavelength, _lattice(rng, size), rng.random(2) * 1000))
            wavelength /= lacunarity

    def fbm(self, x, z, gain=0.5):
        total = np.zeros_like(x)
        amplitude = 1.0
        norm = 0.0
        for wavelength, lattice, offset in self.octaves:
            total += amplitude * _value_noise(lattice, (x + HALF) / wavelength + offset[0], (z + HALF) / wavelength + offset[1])
            norm += amplitude
            amplitude *= gain
        return total / norm

    def ridged(self, x, z, gain=0.5):
        total = np.zeros_like(x)
        amplitude = 1.0
        weight = np.ones_like(x)
        norm = 0.0
        for wavelength, lattice, offset in self.octaves:
            n = _value_noise(lattice, (x + HALF) / wavelength + offset[0], (z + HALF) / wavelength + offset[1])
            n = 1.0 - np.abs(n * 2 - 1)
            n = n * n * weight
            weight = np.clip(n * 1.6, 0, 1)
            total += amplitude * n
            norm += amplitude
            amplitude *= gain
        return total / norm


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def distance_to_path(x, z, path):
    """Distance to the polyline and the interpolated third column at the nearest point."""
    best = np.full_like(x, np.inf)
    value = np.zeros_like(x)
    for (ax, az, ah), (bx, bz, bh) in zip(path[:-1], path[1:]):
        dx, dz = bx - ax, bz - az
        t = np.clip(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1)
        px = ax + t * dx
        pz = az + t * dz
        d = np.hypot(x - px, z - pz)
        closer = d < best
        best = np.where(closer, d, best)
        value = np.where(closer, ah + t * (bh - ah), value)
    return best, value


def canyon_path_smooth(samples_per_segment=16):
    """Catmull-Rom resampling of CANYON_PATH, so the carved canyon curves smoothly."""
    points = CANYON_PATH
    padded = np.vstack([points[0] * 2 - points[1], points, points[-1] * 2 - points[-2]])
    out = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        for s in range(samples_per_segment):
            t = s / samples_per_segment
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(points[-1])
    return np.array(out)


def height(x, z):
    """Terrain height in metres for world coordinates (arrays of equal shape)."""
    warp = Noise(11, 2600, 4)
    wx = x + (warp.fbm(x, z) - 0.5) * 900
    wz = z + (warp.fbm(x + 7000, z - 3000) - 0.5) * 900

    # Island mask: land inside an irregular coastline about 4.2 km out.
    coast_noise = Noise(3, 3000, 5).fbm(x, z)
    radius = np.hypot(x / 1.0, (z + 600) / 1.08)
    coast = 4300 + (coast_noise - 0.5) * 1400
    land = smoothstep(coast + 250, coast - 700, radius)

    hills = Noise(5, 1500, 7).fbm(wx, wz)
    ridges = Noise(7, 2200, 8).ridged(wx, wz)
    # Mountains fill the north and the east, with foothills reaching the airfield.
    range_mask = np.clip(smoothstep(-200, -1900, z) + smoothstep(700, 2800, x) * 0.8 + smoothstep(-1500, -3600, x) * 0.6, 0, 1)
    mountain = ridges ** 1.25 * 2100 * range_mask
    # A massif rises on both sides of the canyon so its walls stay tall.
    path = canyon_path_smooth()
    d, bed = distance_to_path(x, z, path)
    massif_mask = np.maximum(smoothstep(-900, -1900, z), smoothstep(1700, 2500, x))
    massif = smoothstep(1900, 500, d) * (500 + ridges * 1100) * massif_mask
    mountain = np.maximum(mountain, massif)
    base = 30 + np.clip(hills - 0.25, 0, None) * 420 + mountain
    h = base * land + (WATER_LEVEL - 45) * (1 - land)

    # Canyon: a river bed along the path with steep walls that widen with height.
    floor_half = 80.0
    rough = Noise(17, 420, 4).fbm(x, z)
    dw = d + (rough - 0.5) * 160
    wall = np.clip((dw - floor_half) / 320.0, 0, 1)
    carved = bed + (h - bed) * wall ** 1.5
    canyon_weight = smoothstep(1000, 300, d)
    h = np.where(h > bed, h * (1 - canyon_weight) + carved * canyon_weight, h)

    # Fine detail on slopes.
    detail = Noise(13, 260, 5).fbm(x, z)
    h += (detail - 0.5) * 28 * land

    # Lake north-west of the airfield, below water level.
    lake_d = np.hypot((x + 1250) / 1.25, (z + 900) / 0.85)
    lake = smoothstep(820, 380, lake_d)
    h = h * (1 - lake) + (WATER_LEVEL - 14) * lake

    # Airfield plateau: flat runway strip, apron and a soft shoulder.
    ax = np.abs(x - RUNWAY["x"]) - 170
    az = np.abs(z) - 1080
    outside = np.hypot(np.maximum(ax, 0), np.maximum(az, 0)) + np.minimum(np.maximum(ax, az), 0)
    plateau = smoothstep(380, 0, outside)
    h = h * (1 - plateau) + AIRFIELD_HEIGHT * plateau
    return h
