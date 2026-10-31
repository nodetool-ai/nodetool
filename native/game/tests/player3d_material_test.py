"""Production player pixels for linear materials and tangentless normal maps."""
import hashlib
from contextlib import nullcontext
import json
import math
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import zlib

binary = pathlib.Path(sys.argv[1]).resolve()

def png_pixel(rgb):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes([0, *rgb, 255]))) + chunk(b'IEND', b''))

def model(normal):
    data = bytearray()
    views = []
    def append(payload):
        while len(data) % 4:
            data.append(0)
        views.append({'buffer': 0, 'byteOffset': len(data), 'byteLength': len(payload)})
        data.extend(payload)
        return len(views) - 1
    positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]
    p = append(struct.pack('<12f', *positions))
    n = append(struct.pack('<12f', *([0, 0, 1] * 4)))
    uv = append(struct.pack('<8f', 0, 1, 1, 1, 1, 0, 0, 0))
    index = append(struct.pack('<6H', 0, 1, 2, 0, 2, 3))
    image = append(png_pixel(normal))
    gltf = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
            'nodes': [{'mesh': 0}], 'buffers': [{'byteLength': len(data)}], 'bufferViews': views,
            'accessors': [{'bufferView': p, 'componentType': 5126, 'count': 4, 'type': 'VEC3', 'min': [-1, -1, 0], 'max': [1, 1, 0]},
                          {'bufferView': n, 'componentType': 5126, 'count': 4, 'type': 'VEC3'},
                          {'bufferView': uv, 'componentType': 5126, 'count': 4, 'type': 'VEC2'},
                          {'bufferView': index, 'componentType': 5123, 'count': 6, 'type': 'SCALAR'}],
            'images': [{'bufferView': image, 'mimeType': 'image/png'}], 'textures': [{'source': 0}],
            'materials': [{'doubleSided': True, 'normalTexture': {'index': 0, 'scale': .65},
                           'pbrMetallicRoughness': {'baseColorFactor': [.4, .4, .4, 1], 'metallicFactor': 0, 'roughnessFactor': .7}}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}]}
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    data += b'\0' * (-len(data) % 4)
    chunks = struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + struct.pack('<II', len(data), 0x004E4942) + data
    return struct.pack('<III', 0x46546C67, 2, 12 + len(chunks)) + chunks

def pixels(path):
    raw = path.read_bytes()
    offset, packed = 8, bytearray()
    while offset < len(raw):
        length = struct.unpack('>I', raw[offset:offset + 4])[0]
        kind, payload = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + length]
        offset += length + 12
        if kind == b'IHDR':
            width, height, depth, color, *_ = struct.unpack('>IIBBBBB', payload)
            assert depth == 8 and color in (2, 6)
            channels = 4 if color == 6 else 3
        elif kind == b'IDAT':
            packed.extend(payload)
    decoded, previous, values, offset = zlib.decompress(packed), bytearray(width * channels), [], 0
    for _ in range(height):
        mode, row = decoded[offset], bytearray(decoded[offset + 1:offset + 1 + len(previous)])
        offset += 1 + len(previous)
        for x in range(len(row)):
            a, b, c = row[x - channels] if x >= channels else 0, previous[x], previous[x - channels] if x >= channels else 0
            if mode == 1:
                row[x] = (row[x] + a) & 255
            elif mode == 2:
                row[x] = (row[x] + b) & 255
            elif mode == 3:
                row[x] = (row[x] + (a + b) // 2) & 255
            elif mode == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                row[x] = (row[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
            else:
                assert mode == 0
        values.extend(tuple(row[x:x + 3]) for x in range(0, len(row), channels))
        previous = row
    return values

def quaternion(direction):
    x, y, z = direction
    q = [-y, x, 0, 1 + z]
    length = math.sqrt(sum(v * v for v in q))
    return [v / length for v in q]

report_directory = os.environ.get('NODETOOL_NATIVE_MATERIAL_REPORT_DIR')
context = nullcontext(report_directory) if report_directory else tempfile.TemporaryDirectory(prefix='native-material-', dir=os.environ.get('TMPDIR'))
with context as temporary:
    root = pathlib.Path(temporary)
    root.mkdir(parents=True, exist_ok=True)
    results = {}
    for side in ('front', 'back'):
        sign = 1 if side == 'front' else -1
        for channel, normal in [('x', (204, 128, 204)), ('y', (128, 204, 204)), ('flat', (128, 128, 255))]:
            asset = model(normal)
            path = root / (side + '-' + channel + '.glb')
            path.write_bytes(asset)
            light_direction = [.6, .7, sign * math.sqrt(.15)]
            document = {'engine': 'native-cpp-1', 'schemaVersion': 4, 'dimension': '3d', 'id': 'normal-regression', 'title': 'Normal map regression', 'initialSceneId': 'scene',
                        'camera': {'position': [0, 0, sign * 5], 'target': [0, 0, 0], 'fov': 50, 'near': .03, 'far': 30},
                        'assets': [{'id': 'normal', 'kind': 'model', 'path': path.name, 'size': len(asset), 'digest': hashlib.sha256(asset).hexdigest(), 'dependencies': []}],
                        'scenes': [{'id': 'scene', 'name': 'Scene', 'environment': {'background': '#000000', 'ambient': {'color': '#ffffff', 'intensity': .05}, 'shadows': {'enabled': False, 'mapSize': 512, 'extent': 10}, 'sky': {'kind': 'color'}, 'postProcessing': {'enabled': True, 'toneMapping': 'agx', 'antialias': 'smaa', 'exposure': 1}},
                                    'entities': [{'id': 'surface', 'visual': {'kind': 'model', 'assetId': 'normal'}, 'transform': {'position': [0, 0, 0], 'rotation': quaternion([.2, .15, math.sqrt(.9375)]), 'scale': [1.3, .7, 1]}},
                                                 {'id': 'sun', 'light3d': {'kind': 'directional', 'color': '#ffffff', 'intensity': 2, 'castShadow': False}, 'transform': {'position': [0, 0, 0], 'rotation': quaternion(light_direction), 'scale': [1, 1, 1]}}]}]}
            doc = root / (side + '-' + channel + '.json')
            doc.write_text(json.dumps(document))
            captures = []
            for backend in ('opengl', 'vulkan'):
                name = side + '-' + channel + '-' + backend
                output, report = root / (name + '.png'), root / (name + '.json')
                command = [str(binary), str(doc), '--capture', str(output), '--report', str(report), '--assets-dir', str(root), '--width', '128', '--height', '96']
                if not os.environ.get('DISPLAY'):
                    command = ['xvfb-run', '-a', *command]
                env = {**os.environ, 'QSG_RHI_BACKEND': backend, 'QT_QPA_PLATFORM': 'xcb', 'QT_XCB_GL_INTEGRATION': 'xcb_egl', 'LIBGL_ALWAYS_SOFTWARE': '1'}
                process = subprocess.run(command, env=env, capture_output=True, text=True, timeout=60)
                assert process.returncode == 0, (name, process.returncode, process.stdout, process.stderr)
                metadata = json.loads(report.read_text())
                assert metadata['pipeline'] == 'linear-hdr-pbr' and metadata['triangles'] == 2, metadata
                captures.append(pixels(output))
            delta = [abs(a[c] - b[c]) for a, b in zip(*captures) for c in range(3)]
            assert sum(delta) / len(delta) < .15, (side, channel, 'backend mean', sum(delta) / len(delta))
            assert sum(d > 3 for d in delta) / len(delta) < .002, (side, channel, 'backend differences')
            results[(side, channel)] = captures[0]
    for side in ('front', 'back'):
        for channel in ('x', 'y'):
            delta = [abs(a[c] - b[c]) for a, b in zip(results[(side, channel)], results[(side, 'flat')]) for c in range(3)]
            assert sum(delta) / len(delta) > 1, (side, channel, 'normal map has no visible effect')
print('Tangentless X/Y normal maps match GL/Vulkan on rotated nonuniform front/back surfaces')
