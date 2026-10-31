"""Split mesh runs sharing an emitter retain distinct live GPU buffers."""
import json
import os
import pathlib
import subprocess
import struct
import zlib
import sys
import tempfile

probe = pathlib.Path(sys.argv[1]).resolve()

def color_counts(path):
    raw, offset, compressed = path.read_bytes(), 8, bytearray()
    while offset < len(raw):
        length = struct.unpack('>I', raw[offset:offset + 4])[0]
        kind, payload = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + length]
        offset += length + 12
        if kind == b'IHDR':
            width, height, depth, color, *_ = struct.unpack('>IIBBBBB', payload)
            assert depth == 8 and color in (2, 6)
            channels = 4 if color == 6 else 3
        elif kind == b'IDAT':
            compressed.extend(payload)
    data, previous, offset, counts = zlib.decompress(compressed), bytearray(width * channels), 0, [0, 0, 0]
    for _ in range(height):
        mode, row = data[offset], bytearray(data[offset + 1:offset + 1 + len(previous)])
        offset += len(previous) + 1
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
        for x in range(0, len(row), channels):
            for channel in range(3):
                if row[x + channel] > max(row[x + (channel + 1) % 3], row[x + (channel + 2) % 3]) + 10:
                    counts[channel] += 1
        previous = row
    return counts

with tempfile.TemporaryDirectory(prefix='particle-runs-', dir=os.environ.get('TMPDIR')) as temporary:
    root = pathlib.Path(temporary)
    environment = {'background': '#000000', 'ambient': {'color': '#ffffff', 'intensity': 1},
                   'shadows': {'enabled': False, 'mapSize': 512, 'extent': 10},
                   'postProcessing': {'enabled': True, 'toneMapping': 'agx', 'antialias': 'smaa'}}
    camera = {'position': [0, 0, 5], 'target': [0, 0, 0], 'fov': 60, 'near': .03, 'far': 20}
    document = {'schemaVersion': 4, 'engine': 'native-cpp-1', 'dimension': '3d',
                'id': 'split-particle-runs', 'title': 'Particle run lifetime regression',
                'initialSceneId': 'scene', 'camera': camera,
                'presentation': {'hudWidth': 128, 'hudHeight': 96, 'aspectRatio': 128 / 96},
                'scenes': [{'id': 'scene', 'name': 'Scene', 'environment': environment, 'entities': []}]}
    def particle(position, color, mesh=True):
        return {'entityId': 'detached-emitter', 'emitterId': 'debris', 'position': position,
                'velocity': [0, 0, 0], 'color': color, 'opacity': 1, 'size': 1.6,
                'rotation': 0, 'life': .5, 'age': .5, 'lifetime': 1,
                'render': {'kind': 'mesh', 'shape': 'tetrahedron', 'align': 'world'} if mesh else {'kind': 'billboard'},
                'blend': 'normal', 'unlit': True, 'softness': 0}
    # The quad splits two runs of the SAME emitter. Their vertex counts differ,
    # so an emitter-keyed mutable buffer invalidates the first queued draw.
    particles = [particle([-.9, 0, -3], [1, 0, 0]),
                 particle([0, 0, -1], [0, 0, 1], False),
                 particle([.9, .3, 0], [0, 1, 0]),
                 particle([.9, -.3, 0], [0, 1, 0])]
    frame = {'tick': 70, 'generation': 0, 'sceneId': 'scene', 'events': [], 'presentationEvents': [],
             'hostRequests': [], 'queryResults': [], 'music': [], 'score': 0, 'health': 100,
             'logs': [], 'hud': [], 'dimension': '3d', 'particles': particles,
             'authoredOrder': {}, 'worldTransforms': {}, 'entities': [], 'camera': camera,
             'lighting': {}, 'backgrounds': [], 'environment': environment}
    doc_path, frame_path = root / 'game.json', root / 'frame.json'
    doc_path.write_text(json.dumps(document))
    frame_path.write_text(json.dumps(frame))
    reports = []
    for backend in ('opengl', 'vulkan'):
        report_path = root / (backend + '.json')
        command = [str(probe), '--document', str(doc_path), '--frame', str(frame_path),
                   '--assets-dir', str(root), '--capture', str(root / (backend + '.png')),
                   '--report', str(report_path), '--width', '128', '--height', '96', '--benchmark-frames', '8']
        if not os.environ.get('DISPLAY'):
            command = ['xvfb-run', '-a', *command]
        result = subprocess.run(command, env={**os.environ, 'QSG_RHI_BACKEND': backend,
            'QT_QPA_PLATFORM': 'xcb', 'QT_XCB_GL_INTEGRATION': 'xcb_egl', 'LIBGL_ALWAYS_SOFTWARE': '1'},
            capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, (backend, result.returncode, result.stdout, result.stderr)
        report = json.loads(report_path.read_text())
        assert report['sceneDrawCalls'] == 3 and report['sceneTriangles'] == 14, report
        assert report['frameTimings']['samples'] == 8, report
        assert all(count > 10 for count in color_counts(root / (backend + '.png'))), 'A separated red/green mesh run or blue quad vanished'
        reports.append(report)
    assert reports[0]['meshBytes'] == reports[1]['meshBytes']
print('Split emitter runs keep distinct GPU meshes across repeated GL/Vulkan renders')
