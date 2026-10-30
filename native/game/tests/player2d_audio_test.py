"""Committed 2D events and moving cameras reach actual spatial WAV output."""
import hashlib
import json
import math
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import wave

binary = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as directory:
    root = pathlib.Path(directory)
    tone = root / "tone.wav"
    with wave.open(str(tone), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes(struct.pack("<1600h", *([16384] * 1600)))
    encoded = tone.read_bytes()
    document = {
        "schemaVersion": 5,
        "engine": "native-cpp-1",
        "dimension": "2d",
        "id": "spatial-audio",
        "title": "2D spatial audio",
        "initialSceneId": "scene",
        "assets": [{"id": "tone", "kind": "audio", "path": "tone.wav",
                    "digest": hashlib.sha256(encoded).hexdigest(), "size": len(encoded)}],
        "scripts": [{"id": "audio", "source": """i=>({commands:
          i.tick===0?[{kind:'audio',assetId:'tone',loop:true,music:true,position:{x:1,y:1}}]:
          i.tick===1?[{kind:'setPosition',entityId:'camera',position:{x:-2,y:-4}}]:
          i.tick===2?[{kind:'setPosition',entityId:'camera',position:{x:-3,y:-2}}]:
          i.tick===3?[{kind:'setPosition',entityId:'camera',position:{x:-3,y:-4}}]:[]})"""}],
        "scenes": [{"id": "scene", "entities": [
            {"id": "camera-parent", "transform": {"x": 4, "y": 5}},
            {"id": "speaker", "parentId": "camera-parent", "behaviors": [{"id": "play", "scriptId": "audio"}]},
            {"id": "camera", "parentId": "camera-parent", "transform": {"x": -4, "y": -4}, "camera2d": {"width": 8, "height": 6}}
        ]}]
    }
    source = root / "game.json"
    source.write_text(json.dumps(document))
    capture = root / "audio.wav"
    report = root / "report.json"
    command = [binary, str(source), "--tick", "4", "--capture", str(root / "frame.png"),
               "--audio-capture", str(capture), "--report", str(report)]
    # Always isolate GUI work from the user's desktop.
    if sys.platform.startswith("linux"):
        command = ["xvfb-run", "-a", *command]
    result = subprocess.run(command, env={**os.environ, "QSG_RHI_BACKEND": "vulkan"},
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, (result.returncode, result.stderr, result.stdout)
    audio = json.loads(report.read_text())["audio"]
    assert audio["diagnostics"] == [] and audio["voices"] == 1, audio
    with wave.open(str(capture), "rb") as stream:
        assert stream.getnchannels() == 2 and stream.getframerate() == 48000
        samples = struct.unpack("<6400h", stream.readframes(3200))
    expected = [(0, .5), (.5, 0), (.5 / (2 * math.sqrt(2)),) * 2,
                (.5 / math.sqrt(2),) * 2]
    for tick, channels in enumerate(expected):
        actual = tuple(samples[tick * 1600 + channel] / 32768 for channel in (0, 1))
        assert all(abs(a - e) < .002 for a, e in zip(actual, channels)), (tick, actual, channels)
print("2D positioned audio and moving listener WAV passed")
