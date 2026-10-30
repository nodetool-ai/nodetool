"""Actual Qt mouse deltas and authored F/R bindings enter recorded shared input."""
import ctypes
import ctypes.util
import json
import math
import os
import pathlib
import subprocess
import sys
import tempfile
import time

if os.environ.get('NODETOOL_CAMERA_INPUT_XVFB') != '1':
    raise SystemExit(subprocess.run(['xvfb-run', '-a', '-s', '-screen 0 640x480x24', sys.executable, __file__, sys.argv[1]], env={**os.environ, 'NODETOOL_CAMERA_INPUT_XVFB': '1'}).returncode)
x11 = ctypes.CDLL(ctypes.util.find_library('X11')); xtst = ctypes.CDLL(ctypes.util.find_library('Xtst'))
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]; x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]; x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x11.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_void_p)]
x11.XFree.argtypes = [ctypes.c_void_p]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XGetInputFocus.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int)]
x11.XTranslateCoordinates.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong)]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]; x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]; x11.XGetImage.restype = ctypes.c_void_p
x11.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]; x11.XGetPixel.restype = ctypes.c_ulong
x11.XDestroyImage.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None); assert display

def find_window(title):
    pending = [x11.XDefaultRootWindow(display)]
    while pending:
        window = pending.pop(); name = ctypes.c_void_p()
        if x11.XFetchName(display, window, ctypes.byref(name)) and name.value:
            value = ctypes.string_at(name).decode('utf8', errors='replace'); x11.XFree(name)
            if value == title: return window
        root, parent, count = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_uint(); children = ctypes.POINTER(ctypes.c_ulong)()
        if x11.XQueryTree(display, window, ctypes.byref(root), ctypes.byref(parent), ctypes.byref(children), ctypes.byref(count)):
            pending.extend(children[i] for i in range(count.value))
            if children: x11.XFree(children)

def rendered(window):
    image = x11.XGetImage(display, window, 0, 0, 320, 240, ctypes.c_ulong(-1).value, 2)
    if not image: return False
    try: return x11.XGetPixel(image, 10, 10) & 0xffffff == 0x12161e and x11.XGetPixel(image, 160, 120) & 0xff0000 > 0x500000
    finally: x11.XDestroyImage(image)

def sync(): x11.XSync(display, 0); time.sleep(.08)
def key(symbol, down): xtst.XTestFakeKeyEvent(display, x11.XKeysymToKeycode(display, symbol), int(down), 0); sync()

with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as directory:
    root = pathlib.Path(directory); title = 'Native first-person pointer regression'
    document = {'schemaVersion': 4, 'engine': 'native-cpp-1', 'dimension': '3d', 'id': 'camera-input', 'title': title, 'initialSceneId': 'scene',
        'camera': {'kind': 'firstPerson', 'targetId': 'player', 'offset': [0, .65, 0], 'fov': 78},
        'inputActions': [{'id': 'fire', 'bindings': ['KeyF']}, {'id': 'r', 'bindings': ['KeyR']}],
        'scenes': [{'id': 'scene', 'entities': [{'id': 'player'}, {'id': 'front', 'transform': {'position': [0, .65, -4]}, 'visual': {'kind': 'primitive', 'shape': 'box', 'size': [2, 2, 2], 'color': [1, 0, 0, 1]}}]}]}
    source, report, recording = root/'game.json', root/'report.json', root/'inputs.json'; source.write_text(json.dumps(document))
    process = subprocess.Popen([str(pathlib.Path(sys.argv[1]).resolve()), str(source), '--quit-after', '240', '--width', '320', '--height', '240', '--report', str(report), '--record-inputs', str(recording)],
        env={**os.environ, 'QT_QPA_PLATFORM': 'xcb', 'QSG_RHI_BACKEND': 'vulkan'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic()+12; window = None
        while process.poll() is None and time.monotonic() < deadline:
            candidate = find_window(title)
            if candidate and rendered(candidate):
                x11.XSetInputFocus(display, candidate, 1, 0); x11.XSync(display, 0)
                focus, revert = ctypes.c_ulong(), ctypes.c_int(); x11.XGetInputFocus(display, ctypes.byref(focus), ctypes.byref(revert))
                if focus.value == candidate: window = candidate; break
            time.sleep(.02)
        assert window, 'Rendered first-person window never became ready'
        gx, gy, child = ctypes.c_int(), ctypes.c_int(), ctypes.c_ulong()
        assert x11.XTranslateCoordinates(display, window, x11.XDefaultRootWindow(display), 160, 120, ctypes.byref(gx), ctypes.byref(gy), ctypes.byref(child))
        def move(dx, dy): xtst.XTestFakeMotionEvent(display, 0, gx.value+dx, gy.value+dy, 0); sync()
        move(0, 0)
        xtst.XTestFakeButtonEvent(display, 3, 1, 0); sync(); move(90, 15); xtst.XTestFakeButtonEvent(display, 3, 0, 0); sync()
        move(0, 0); xtst.XTestFakeButtonEvent(display, 1, 1, 0); sync(); xtst.XTestFakeButtonEvent(display, 1, 0, 0); sync()
        move(10, 5)
        key(0xff1b, True); key(0xff1b, False)  # Escape releases captured look.
        move(25, 10)
        key(ord('f'), True); key(ord('r'), True); time.sleep(.2); key(ord('f'), False); key(ord('r'), False)
        stdout, stderr = process.communicate(timeout=20)
        assert process.returncode == 0, (process.returncode, stderr, stdout)
        frames = json.loads(recording.read_text()); committed = json.loads(report.read_text())
        assert committed.get('status') != 'error' and len(frames) >= 180, committed
        dx = sum(frame['look']['x'] for frame in frames); dy = sum(frame['look']['y'] for frame in frames)
        assert abs(dx-100) < .01 and abs(dy-20) < .01, ('Raw pointer recording or Escape release', dx, dy)
        assert sum(frame['actions'].get('fire') is True for frame in frames) > 2, 'Authored F binding did not remain held'
        assert sum(frame['actions'].get('r') is True for frame in frames) > 2, 'Authored R binding was not recorded'
        camera = committed['camera']; direction = [b-a for a, b in zip(camera['position'], camera['target'])]
        expected = [-math.sin(-.2)*math.cos(-.04), math.sin(-.04), -math.cos(-.2)*math.cos(-.04)]
        assert all(abs(a-b) < 1e-5 for a, b in zip(direction, expected)), (direction, expected)
    finally:
        for symbol in (ord('f'), ord('r'), 0xff1b): xtst.XTestFakeKeyEvent(display, x11.XKeysymToKeycode(display, symbol), 0, 0)
        for button in (1, 3): xtst.XTestFakeButtonEvent(display, button, 0, 0)
        x11.XSync(display, 0)
        if process.poll() is None: process.kill(); process.communicate()
x11.XCloseDisplay(display)
print('Actual pointer look, capture/release and authored F/R recording passed')
