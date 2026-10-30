"""First-person and fixed cameras share committed projection and viewmodel poses."""
import copy
import hashlib
import json
import math
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import zlib


def pixels(path):
    raw = path.read_bytes(); offset = 8; compressed = b''
    while offset < len(raw):
        length = struct.unpack('>I', raw[offset:offset+4])[0]
        kind, data = raw[offset+4:offset+8], raw[offset+8:offset+8+length]; offset += 12+length
        if kind == b'IHDR':
            width, height, depth, color, *_ = struct.unpack('>IIBBBBB', data)
            assert depth == 8 and color in (2, 6); channels = 4 if color == 6 else 3
        if kind == b'IDAT': compressed += data
    decoded = zlib.decompress(compressed); stride = width*channels; previous = bytearray(stride); result = []; offset = 0
    for _ in range(height):
        mode = decoded[offset]; row = bytearray(decoded[offset+1:offset+1+stride]); offset += stride+1
        for x in range(stride):
            a = row[x-channels] if x >= channels else 0; b = previous[x]; c = previous[x-channels] if x >= channels else 0
            if mode == 1: row[x] = (row[x]+a) & 255
            elif mode == 2: row[x] = (row[x]+b) & 255
            elif mode == 3: row[x] = (row[x]+((a+b)//2)) & 255
            elif mode == 4:
                q = a+b-c; pa, pb, pc = abs(q-a), abs(q-b), abs(q-c)
                row[x] = (row[x]+(a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
            else: assert mode == 0
        result.extend(tuple(row[x:x+channels]) for x in range(0, stride, channels)); previous = row
    return result


def viewmodel():
    positions = struct.pack('<9f', -.1, -.1, 0, .1, -.1, 0, 0, .1, 0)
    normals = struct.pack('<9f', *([0, 0, 1]*3)); indices = struct.pack('<3H', 0, 1, 2)
    payload = positions+normals+indices
    document = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(payload)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(positions)}, {'buffer': 0, 'byteOffset': len(positions), 'byteLength': len(normals)}, {'buffer': 0, 'byteOffset': len(positions)+len(normals), 'byteLength': len(indices)}],
        'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'}, {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC3'}, {'bufferView': 2, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [0, 1, 0, 1]}}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
        'nodes': [{'mesh': 0}], 'scenes': [{'nodes': [0]}], 'scene': 0}
    encoded = json.dumps(document, separators=(',', ':')).encode(); encoded += b' '*((-len(encoded)) % 4); payload += b'\0'*((-len(payload)) % 4)
    return struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(payload))+struct.pack('<II', len(encoded), 0x4e4f534a)+encoded+struct.pack('<II', len(payload), 0x004e4942)+payload


binary = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
    root = pathlib.Path(directory); model = viewmodel(); (root/'rifle.glb').write_bytes(model)
    first_person = {'kind': 'firstPerson', 'targetId': 'player', 'offset': [0, .65, 0], 'fov': 78, 'near': .03, 'far': 160}
    document = {'schemaVersion': 4, 'engine': 'native-cpp-1', 'dimension': '3d', 'id': 'camera-pixels', 'title': 'Camera pixels', 'initialSceneId': 'scene', 'camera': first_person,
        'assets': [{'id': 'rifle', 'kind': 'model', 'path': 'rifle.glb', 'size': len(model), 'digest': hashlib.sha256(model).hexdigest()}],
        'scenes': [{'id': 'scene', 'entities': [
            {'id': 'player'},
            {'id': 'front', 'transform': {'position': [0, .65, -4]}, 'visual': {'kind': 'primitive', 'shape': 'box', 'size': [2, 2, 2], 'color': [1, 0, 0, 1]}},
            {'id': 'right', 'transform': {'position': [4, .65, 0]}, 'visual': {'kind': 'primitive', 'shape': 'box', 'size': [2, 2, 2], 'color': [0, 0, 1, 1]}},
            {'id': 'rifle', 'transform': {'position': [0, -.15, -.5]}, 'visual': {'kind': 'model', 'assetId': 'rifle', 'cameraRelative': True}}
        ]}]}
    def capture(label, camera=None, inputs=None, restore=False):
        authored = copy.deepcopy(document)
        if camera is not None: authored['camera'] = camera
        source, image, report = root/f'{label}.json', root/f'{label}.png', root/f'{label}-report.json'
        source.write_text(json.dumps(authored))
        command = [binary, str(source), '--capture', str(image), '--width', '320', '--height', '240', '--report', str(report)]
        if inputs is not None:
            recording = root/f'{label}-inputs.json'; recording.write_text(json.dumps(inputs)); command += ['--inputs', str(recording), '--tick', str(len(inputs))]
        if restore: command.append('--verify-restore')
        if sys.platform.startswith('linux'): command = ['xvfb-run', '-a', *command]
        result = subprocess.run(command, env={**os.environ, 'QSG_RHI_BACKEND': 'vulkan'}, capture_output=True, text=True, timeout=45)
        assert result.returncode == 0, (label, result.stderr, result.stdout)
        return pixels(image), json.loads(report.read_text())
    initial, initial_report = capture('initial')
    turned, turned_report = capture('turned', inputs=[{'look': {'x': math.pi/(2*.002), 'y': 0}}])
    restored, _ = capture('restored', inputs=[{'look': {'x': math.pi/(2*.002), 'y': 0}}], restore=True)
    center = 120*320+160
    assert initial[center][0] > 20 and initial[center][2] < 10, initial[center]
    assert turned[center][2] > 20 and turned[center][0] < 10, turned[center]
    assert turned == restored, 'Restored first-person camera capture changed'
    assert initial_report['camera']['position'] == [0, .65, 0], initial_report
    assert turned_report['camera']['target'][0] > .99 and abs(turned_report['camera']['target'][2]) < .001, turned_report
    green = lambda image: {index for index, color in enumerate(image) if color[1] > 20 and color[0] < 10 and color[2] < 10}
    initial_model, turned_model = green(initial), green(turned)
    assert len(initial_model) > 100 and initial_model == turned_model, 'Camera-relative rifle moved on screen while looking'
    fixed = {'position': [0, .65, 0], 'target': [0, .65, -1], 'fov': 78, 'near': .03, 'far': 160}
    fixed_image, _ = capture('fixed', camera=fixed)
    assert fixed_image == initial, 'Fixed camera regressed or disagrees with equivalent first-person pose'
    clipped, _ = capture('near', camera={**first_person, 'near': 1})
    assert not green(clipped) and clipped[center][0] > 20, 'Committed near plane was ignored'
    far, _ = capture('far', camera={**first_person, 'far': 2})
    assert far[center][:3] == (18, 22, 30) and len(green(far)) > 100, 'Committed far plane was ignored'
print('Committed first-person/fixed camera pixels, viewmodel, clipping and restore passed')
