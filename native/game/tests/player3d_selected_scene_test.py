"""Selected glTF scene roots must bound both production rendering paths."""
import hashlib
import json
import os
import pathlib
import struct
import subprocess
import sys
import tempfile


def model(selected, inactive):
    positions = struct.pack('<12f', -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0)
    normals = struct.pack('<12f', *([0, 0, 1] * 4))
    indices = struct.pack('<6H', 0, 1, 2, 0, 2, 3)
    data = positions + normals + indices
    nodes = [{'children': [1]}, {'mesh': 0}, {'mesh': 1, 'translation': [0, 0, 1]}]
    if not inactive:
        nodes[2].pop('mesh')
    gltf = {'asset': {'version': '2.0'}, 'scene': selected,
            'scenes': [{'nodes': [0]}, {'nodes': [2] if inactive else []}], 'nodes': nodes,
            'buffers': [{'byteLength': len(data)}],
            'bufferViews': [{'buffer': 0, 'byteOffset': offset, 'byteLength': size}
                            for offset, size in [(0, 48), (48, 48), (96, 12)]],
            'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 4, 'type': 'VEC3',
                           'min': [-1, -1, 0], 'max': [1, 1, 0]},
                          {'bufferView': 1, 'componentType': 5126, 'count': 4, 'type': 'VEC3'},
                          {'bufferView': 2, 'componentType': 5123, 'count': 6, 'type': 'SCALAR'}],
            'materials': [{'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0}}
                          for color in [[0, 1, 0, 1], [1, 0, 0, 1]]],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1},
                                       'indices': 2, 'material': index}]} for index in range(2)]}
    encoded = json.dumps(gltf).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(data))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(data), 0x004E4942) + data)


binary = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix='selected-scene-', dir=os.environ.get('TMPDIR')) as temporary:
    root = pathlib.Path(temporary)
    for backend in ('opengl', 'vulkan'):
        for pbr in (False, True):
            captures = []
            for name, selected, inactive in [('baseline', 0, False), ('two-scenes', 0, True), ('other-scene', 1, True)]:
                asset = model(selected, inactive)
                (root / 'model.glb').write_bytes(asset)
                scene = {'id': 'scene', 'entities': [{'id': 'model', 'visual': {'kind': 'model', 'assetId': 'model'}}]}
                if pbr:
                    scene['environment'] = {'background': '#000000', 'ambient': {'color': '#ffffff', 'intensity': 3.141592653589793},
                                            'shadows': {'enabled': False, 'mapSize': 512, 'extent': 10}, 'postProcessing': {'enabled': True, 'toneMapping': 'agx', 'antialias': 'smaa'}}
                document = {'engine': 'native-cpp-1', 'schemaVersion': 4, 'dimension': '3d', 'id': 'selected-scene', 'title': 'Selected scene',
                            'initialSceneId': 'scene', 'camera': {'position': [0, 0, 5], 'target': [0, 0, 0], 'fov': 50},
                            'assets': [{'id': 'model', 'kind': 'model', 'path': 'model.glb', 'size': len(asset),
                                        'digest': hashlib.sha256(asset).hexdigest(), 'dependencies': []}], 'scenes': [scene]}
                (root / 'game.json').write_text(json.dumps(document))
                output = root / f'{backend}-{pbr}-{name}.png'
                command = [binary, str(root / 'game.json'), '--capture', str(output), '--assets-dir', str(root), '--width', '96', '--height', '96']
                if not os.environ.get('DISPLAY'):
                    command = ['xvfb-run', '-a', *command]
                result = subprocess.run(command, env={**os.environ, 'QSG_RHI_BACKEND': backend, 'QT_QPA_PLATFORM': 'xcb',
                                                       'QT_XCB_GL_INTEGRATION': 'xcb_egl', 'LIBGL_ALWAYS_SOFTWARE': '1'},
                                        capture_output=True, text=True, timeout=60)
                assert result.returncode == 0, (backend, pbr, name, result.stdout, result.stderr)
                captures.append(output.read_bytes())
            assert captures[0] == captures[1], (backend, pbr, 'Inactive scene changed visible pixels')
            assert captures[0] != captures[2], (backend, pbr, 'Selected second scene must change visible pixels')
print('Selected root descendants render; inactive scene meshes remain invisible in GL/Vulkan compatibility/PBR paths')
