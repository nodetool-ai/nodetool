#!/usr/bin/env python3
"""Adds a hover clip and a red sensor to the BLACKSITE drone model.

Run from the repository root:

    python3 packages/game-runtime/samples/blacksite/tools/prepare_drone.py IN.glb OUT.glb

The clip animates the node that holds the drone meshes: a two-beat vertical
bob with a slow yaw sweep and lean. It loops every 4 seconds, so an animator
can play it without a script. The sensor's warm fixture material turns red.
"""
import json
import math
import struct
import sys

PERIOD = 4.0
FPS = 30


def quat(yaw, pitch, roll):
    """Yaw about Y, then pitch about X, then roll about Z."""
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    cr, sr = math.cos(roll / 2), math.sin(roll / 2)
    qy = (0.0, sy, 0.0, cy)
    qp = (sp, 0.0, 0.0, cp)
    qr = (0.0, 0.0, sr, cr)

    def mul(a, b):
        return (a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
                a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
                a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
                a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2])
    return mul(mul(qy, qp), qr)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare_drone.py IN.glb OUT.glb")
    data = open(sys.argv[1], "rb").read()
    json_length = struct.unpack("<I", data[12:16])[0]
    document = json.loads(data[20:20 + json_length])
    bin_start = 20 + json_length
    bin_length = struct.unpack("<I", data[bin_start:bin_start + 4])[0]
    binary = bytearray(data[bin_start + 8:bin_start + 8 + bin_length])
    if document.get("animations"):
        raise SystemExit("model already has animations")
    target = next(index for index, node in enumerate(document["nodes"])
                  if "mesh" not in node and "matrix" not in node and node.get("children"))

    sensor = next(material for material in document["materials"] if material.get("name") == "Warm fixture")
    sensor["pbrMetallicRoughness"]["baseColorFactor"] = [0.3, 0.02, 0.01, 1]
    sensor["emissiveFactor"] = [1, 0.08, 0.03]

    frames = int(PERIOD * FPS) + 1
    times, translations, rotations = [], [], []
    for frame in range(frames):
        t = frame / FPS
        phase = 2 * math.pi * t / PERIOD
        times.append(t)
        translations.append((0.0, 0.11 * math.sin(2 * phase), 0.0))
        rotations.append(quat(0.16 * math.sin(phase), 0.05 * math.sin(2 * phase + 0.6), 0.07 * math.sin(phase + 1.1)))

    def append(values, component_count, kind, with_bounds):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        flat = [component for value in values for component in (value if isinstance(value, tuple) else (value,))]
        binary.extend(struct.pack(f"<{len(flat)}f", *flat))
        document["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(flat) * 4})
        accessor = {"bufferView": len(document["bufferViews"]) - 1, "componentType": 5126, "count": len(values), "type": kind}
        if with_bounds:
            accessor["min"] = [min(times)]
            accessor["max"] = [max(times)]
        document["accessors"].append(accessor)
        return len(document["accessors"]) - 1

    time_accessor = append(times, 1, "SCALAR", True)
    translation_accessor = append(translations, 3, "VEC3", False)
    rotation_accessor = append(rotations, 4, "VEC4", False)
    document["animations"] = [{
        "name": "hover",
        "samplers": [
            {"input": time_accessor, "output": translation_accessor, "interpolation": "LINEAR"},
            {"input": time_accessor, "output": rotation_accessor, "interpolation": "LINEAR"},
        ],
        "channels": [
            {"sampler": 0, "target": {"node": target, "path": "translation"}},
            {"sampler": 1, "target": {"node": target, "path": "rotation"}},
        ],
    }]
    while len(binary) % 4:
        binary.append(0)
    document["buffers"][0]["byteLength"] = len(binary)
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    with open(sys.argv[2], "wb") as out:
        out.write(struct.pack("<III", 0x46546C67, 2, total))
        out.write(struct.pack("<II", len(encoded), 0x4E4F534A))
        out.write(encoded)
        out.write(struct.pack("<II", len(binary), 0x004E4942))
        out.write(binary)


if __name__ == "__main__":
    main()
