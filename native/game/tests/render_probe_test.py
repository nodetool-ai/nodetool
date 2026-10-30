"""Test-only presentation boundary. Invalid frames and assets fail before graphics."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

probe = pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix="render-probe-", dir=os.environ.get("TMPDIR")) as temporary:
    root = pathlib.Path(temporary)
    document = {"schemaVersion": 4, "engine": "native-cpp-1", "dimension": "3d",
                "id": "1" * 32, "title": "Presentation boundary fixture",
                "revision": 0, "initialSceneId": "scene",
                "scenes": [{"id": "scene", "name": "Scene", "entities": []}]}
    scene = document["scenes"][0]
    frame = {"tick": 0, "generation": 0, "sceneId": scene["id"],
             "events": [], "presentationEvents": [], "hostRequests": [],
             "queryResults": [], "music": [], "score": 0, "health": 100,
             "logs": [], "hud": [], "dimension": "3d", "entities": [],
             "particles": [], "authoredOrder": {}, "worldTransforms": {},
             "camera": {}, "lighting": {}, "backgrounds": []}
    doc_path, frame_path = root / "game.json", root / "frame.json"
    def rejected(expected):
        doc_path.write_text(json.dumps(document))
        frame_path.write_text(json.dumps(frame))
        result = subprocess.run([str(probe), "--document", str(doc_path),
            "--frame", str(frame_path), "--assets-dir", str(root),
            "--capture", str(root / "capture.png")], capture_output=True,
            text=True, timeout=20, env={**os.environ, "QT_QPA_PLATFORM": "offscreen"})
        assert result.returncode == 1, (result.returncode, result.stdout, result.stderr)
        report = json.loads(result.stderr.strip().splitlines()[-1])
        assert report["code"] == expected, report
        if expected == "probe":
            assert "digest mismatch" in report["message"], report
        assert not (root / "capture.png").exists()
    frame["tick"] = "invalid"
    rejected("validation_error")
    frame["tick"] = 0
    frame["unadmitted"] = True
    rejected("validation_error")
    del frame["unadmitted"]
    payload = b"closed manifest digest rejection"
    (root / "bad.png").write_bytes(payload)
    document["assets"] = [{"id": "probe-image", "kind": "image", "path": "bad.png",
                            "digest": "0" * 64, "size": len(payload), "dependencies": []}]
    rejected("probe")
print("Render probe rejects invalid frame types, unadmitted fields, and asset digest mismatch")
