"""Drive actual keyboard events into the live 2D player and inspect committed movement."""
import ctypes
import ctypes.util
import hashlib
import json
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import time
import zlib

if os.environ.get("NODETOOL_LIVE_INPUT_XVFB") != "1":
    # Isolate focus and held keys from other native tests and the user's desktop.
    raise SystemExit(subprocess.run(["xvfb-run", "-a", "-s", "-screen 0 640x480x24", sys.executable, __file__, sys.argv[1]],
        env={**os.environ, "NODETOOL_LIVE_INPUT_XVFB": "1"}).returncode)

x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
xtst = ctypes.CDLL(ctypes.util.find_library("Xtst"))
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x11.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_void_p)]
x11.XFree.argtypes = [ctypes.c_void_p]
class WindowAttributes(ctypes.Structure):
    _fields_ = [("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int), ("height", ctypes.c_int),
        ("border_width", ctypes.c_int), ("depth", ctypes.c_int), ("visual", ctypes.c_void_p), ("root", ctypes.c_ulong),
        ("window_class", ctypes.c_int), ("bit_gravity", ctypes.c_int), ("win_gravity", ctypes.c_int), ("backing_store", ctypes.c_int),
        ("backing_planes", ctypes.c_ulong), ("backing_pixel", ctypes.c_ulong), ("save_under", ctypes.c_int),
        ("colormap", ctypes.c_ulong), ("map_installed", ctypes.c_int), ("map_state", ctypes.c_int),
        ("all_event_masks", ctypes.c_long), ("your_event_mask", ctypes.c_long), ("do_not_propagate_mask", ctypes.c_long),
        ("override_redirect", ctypes.c_int), ("screen", ctypes.c_void_p)]
x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(WindowAttributes)]
x11.XGetInputFocus.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int)]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XGetImage.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int]
x11.XGetImage.restype = ctypes.c_void_p
x11.XGetPixel.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
x11.XGetPixel.restype = ctypes.c_ulong
x11.XDestroyImage.argtypes = [ctypes.c_void_p]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
assert display, "Cannot connect to the live player's X display"

def find_window(title):
    pending = [x11.XDefaultRootWindow(display)]
    while pending:
        window = pending.pop()
        name = ctypes.c_void_p()
        if x11.XFetchName(display, window, ctypes.byref(name)) and name.value:
            value = ctypes.string_at(name).decode("utf8", errors="replace")
            x11.XFree(name)
            if value == title:
                return window
        root, parent, count = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_uint()
        children = ctypes.POINTER(ctypes.c_ulong)()
        if x11.XQueryTree(display, window, ctypes.byref(root), ctypes.byref(parent), ctypes.byref(children), ctypes.byref(count)):
            pending.extend(children[index] for index in range(count.value))
            if children:
                x11.XFree(children)
    return None

def rendered_window(window):
    attributes = WindowAttributes()
    if not x11.XGetWindowAttributes(display, window, ctypes.byref(attributes)) or attributes.map_state != 2:
        return False
    # A rendered background and actor prove Qt processed exposure and published a GPU frame.
    image = x11.XGetImage(display, window, 0, 0, attributes.width, attributes.height, ctypes.c_ulong(-1).value, 2)
    if not image:
        return False
    try:
        return x11.XGetPixel(image, 10, 10) & 0xffffff == 0x12161e and x11.XGetPixel(image, attributes.width // 2, attributes.height // 2) & 0xffffff == 0xffffff
    finally:
        x11.XDestroyImage(image)

def focused_window(window):
    x11.XSetInputFocus(display, window, 1, 0)
    x11.XSync(display, 0)
    focus, revert = ctypes.c_ulong(), ctypes.c_int()
    x11.XGetInputFocus(display, ctypes.byref(focus), ctypes.byref(revert))
    return focus.value == window

def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0\xff\xff\xff\xff")) + chunk(b"IEND", b"")

with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as temporary:
    root = pathlib.Path(temporary)
    image = png()
    (root / "white.png").write_bytes(image)
    title = "Native live 2D keyboard regression"
    document = {"schemaVersion": 5, "engine": "native-cpp-1", "dimension": "2d", "id": "live-input-regression", "title": title,
        "initialSceneId": "scene", "gravity": {"x": 0, "y": 0}, "camera2d": {"width": 8, "height": 6, "zoom": 1},
        "assets": [{"id": "white", "kind": "image", "path": "white.png", "size": len(image), "digest": hashlib.sha256(image).hexdigest()}],
        "scenes": [{"id": "scene", "entities": [{"id": "actor", "body2d": {"type": "kinematic", "gravityScale": 0}, "sprite": {"assetId": "white", "width": 1, "height": 1}}]}]}
    source, report, recording = root / "game.json", root / "report.json", root / "inputs.json"
    source.write_text(json.dumps(document))
    process = subprocess.Popen([str(pathlib.Path(sys.argv[1]).resolve()), str(source), "--quit-after", "360", "--width", "320", "--height", "240", "--report", str(report), "--record-inputs", str(recording)],
        env={**os.environ, "QT_QPA_PLATFORM": "xcb", "QSG_RHI_BACKEND": "vulkan"}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    key = None
    try:
        deadline = time.monotonic() + 12
        window = None
        while process.poll() is None and time.monotonic() < deadline:
            window = find_window(title)
            if window and rendered_window(window) and focused_window(window):
                break
            window = None
            time.sleep(.02)
        if window:
            key = x11.XKeysymToKeycode(display, ord("d"))
            assert key, "No keyboard mapping for D"
            xtst.XTestFakeKeyEvent(display, key, 1, 0)
            x11.XSync(display, 0)
            # Keep the key down through the run so a busy Qt loop cannot collapse a short pulse.
        stdout, stderr = process.communicate(timeout=25)
        assert process.returncode == 0, ("Live 2D simulation failed", process.returncode, stderr, stdout)
        assert window, ("Live 2D window never appeared", stderr)
        result = json.loads(report.read_text())
        assert result.get("status") != "error" and "code" not in result, result
        frames = json.loads(recording.read_text())
        assert result["committedTick"] >= 180 and result["tick"] > 0, result
        assert len(frames) >= 180 and all(isinstance(frame.get("move"), dict) and set(frame["move"]) == {"x", "y"} for frame in frames), frames[:3]
        assert any(frame["actions"].get("right") is True and frame["move"]["x"] == 1 for frame in frames), "Keyboard movement was not recorded"
        assert result["entityTransforms"]["actor"]["x"] > .05, result
        print("Live 2D keyboard input advances committed ticks and world position")
    finally:
        if key is not None:
            xtst.XTestFakeKeyEvent(display, key, 0, 0)
            x11.XSync(display, 0)
        if process.poll() is None:
            process.kill()
            process.communicate()
x11.XCloseDisplay(display)
