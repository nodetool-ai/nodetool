#!/usr/bin/env python3
"""Portable notice checks for Qt SDK frameworks and plug-ins."""
import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("macho_deps", Path(__file__).with_name("macho-deps.py"))
macho = importlib.util.module_from_spec(spec)
spec.loader.exec_module(macho)


class QtSdkNoticesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bundle = self.root / "Timeline.app"
        self.resources = self.bundle / "Contents/Resources"
        self.sdk = self.root / "qt"
        self.framework = "Contents/Frameworks/QtCore.framework"
        self.plugin = "Contents/PlugIns/platforms/libqcocoa.dylib"
        for path in [self.bundle / self.framework / "Versions/A/QtCore",
                     self.bundle / self.plugin,
                     self.sdk / "lib/QtCore.framework/Versions/A/QtCore",
                     self.sdk / "plugins/platforms/libqcocoa.dylib"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"\xcf\xfa\xed\xfe")
        license_file = self.resources / "licenses/Qt-LGPL-3.0.txt"
        license_file.parent.mkdir(parents=True)
        license_file.write_text("Full license text\n" * 2000)
        self.metadata = {"prefix": str(self.sdk), "version": "6.12.0",
                         "licenses": ["Qt-LGPL-3.0.txt"],
                         "source": {"url": "https://download.qt.io/official_releases/qt/6.12/6.12.0/single/qt-everywhere-src-6.12.0.tar.xz",
                                    "sha256": "a" * 64}}

    def generate(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
            result = macho.notices([str(self.bundle), "--brew-prefix", str(self.root / "brew"),
                                    "--qt-sdk", json.dumps(self.metadata)])
        (self.resources / "source/SOURCES.txt").write_text(output.getvalue())
        return result

    def test_sdk_framework_and_plugin_have_versioned_source_notices(self):
        self.assertEqual(self.generate(), 0)
        with patch.object(macho, "framework_version", return_value="6.12.0"):
            result = macho.notices_check(str(self.bundle))
        self.assertTrue(result["pass"], result)
        self.assertEqual(result["units"], 2)
        self.assertEqual(result["components"], 1)

    def test_framework_version_mismatch_still_fails(self):
        self.assertEqual(self.generate(), 0)
        with patch.object(macho, "framework_version", return_value="6.11.0"):
            result = macho.notices_check(str(self.bundle))
        self.assertFalse(result["pass"])
        self.assertTrue(any("version" in p["reason"] for p in result["problems"]))

    def test_unidentified_plugin_still_fails(self):
        (self.sdk / "plugins/platforms/libqcocoa.dylib").unlink()
        self.assertEqual(self.generate(), 1)
        with patch.object(macho, "framework_version", return_value="6.12.0"):
            result = macho.notices_check(str(self.bundle))
        self.assertFalse(result["pass"])
        self.assertTrue(any(p.get("unit") == self.plugin for p in result["problems"]))


class QtPackagingSelectionTest(unittest.TestCase):
    def test_rewrite_preserves_spaces_in_library_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "NodeTool Timeline.app"
            dependency = app / "Contents/Frameworks/QtCore.framework/Versions/A/QtCore"
            dependency.parent.mkdir(parents=True)
            dependency.write_text("Mach-O fixture")
            script = Path(__file__).with_name("package-macos.sh").read_text()
            rewrite = 'frameworks="$app/Contents/Frameworks"' + script.split(
                'frameworks="$app/Contents/Frameworks"', 1)[1].split("# Every rpath", 1)[0]
            stubs = r'''
file() { echo Mach-O; }
otool() {
    for arch in x86_64 arm64; do
        if [[ "$1" == -D ]]; then
            printf '%s (architecture %s):\n@rpath/QtCore.framework/Versions/A/QtCore\n' "$2" "$arch"
        else
            printf '%s (architecture %s):\n\t%s (compatibility version 6.0.0, current version 6.12.0)\n' "$2" "$arch" "$DEPENDENCY"
        fi
    done
}
install_name_tool() { printf '%s\n' "$@" >> "$CAPTURE"; }
app=$APP
'''
            capture = root / "rewrite-args"
            result = subprocess.run(["bash", "-euo", "pipefail", "-c", stubs + rewrite],
                                    env={**os.environ, "APP": str(app), "DEPENDENCY": str(dependency),
                                         "CAPTURE": str(capture)}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(str(dependency), capture.read_text().splitlines())
            self.assertIn("@rpath/QtCore.framework/Versions/A/QtCore", capture.read_text().splitlines())

    def test_optional_plugins_reach_pruning_but_missing_frameworks_fail(self):
        for location, expected in [("PlugIns/sqldrivers/libqsqlpsql.dylib", 0),
                                   ("Frameworks/QtCore.framework/Versions/A/QtCore", 1)]:
            with self.subTest(location=location), tempfile.TemporaryDirectory() as directory:
                app = Path(directory) / "Timeline.app"
                unit = app / "Contents" / location
                unit.parent.mkdir(parents=True)
                unit.write_text("Mach-O fixture")
                script = Path(__file__).with_name("package-macos.sh").read_text()
                rewrite = 'frameworks="$app/Contents/Frameworks"' + script.split(
                    'frameworks="$app/Contents/Frameworks"', 1)[1].split("# Every rpath", 1)[0]
                stubs = r'''
file() { echo Mach-O; }
otool() {
    if [[ "$1" == -D ]]; then
        printf '%s:\n@rpath/fixture\n' "$2"
    else
        printf '%s:\n\t/missing/libpq.dylib (compatibility version 1.0.0, current version 1.0.0)\n' "$2"
    fi
}
app=$APP
'''
                result = subprocess.run(["bash", "-euo", "pipefail", "-c", stubs + rewrite],
                                        env={**os.environ, "APP": str(app)}, capture_output=True, text=True)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertIn("prune candidate" if expected == 0 else "error:", result.stderr)

    def test_universal_dependencies_skip_architecture_headers_and_own_id(self):
        own = "@rpath/QtCore.framework/Versions/A/QtCore"
        dependency = "@rpath/QtGui.framework/Versions/A/QtGui"
        ids = "".join(f"QtCore (architecture {arch}):\n{own}\n" for arch in ["x86_64", "arm64"])
        links = "".join(f"QtCore (architecture {arch}):\n\t{own} (compatibility version 6.0.0, current version 6.12.0)\n\t{dependency} (compatibility version 6.0.0, current version 6.12.0)\n" for arch in ["x86_64", "arm64"])
        with patch.object(macho, "otool", side_effect=lambda args, path: ids if args == ["-D"] else links):
            self.assertEqual(macho.install_name("fixture"), own)
            self.assertEqual(macho.linked("fixture"), [dependency])

    def test_rpaths_preserve_spaces(self):
        output = "Load command 1\n          cmd LC_RPATH\n      cmdsize 80\n         path /tmp/NodeTool Timeline.app/Contents/Frameworks (offset 12)\n"
        with patch.object(macho, "otool", return_value=output * 2):
            self.assertEqual(macho.rpaths("fixture"), ["/tmp/NodeTool Timeline.app/Contents/Frameworks"])

    def test_configure_uses_selected_sdk_before_homebrew(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "scripts"
            scripts.mkdir()
            shutil.copy(Path(__file__).with_name("package-macos.sh"), scripts)
            tools = root / "tools"
            tools.mkdir()
            sdk = root / "selected Qt SDK"
            (sdk / "bin").mkdir(parents=True)
            commands = {
                scripts / "build-ffmpeg-lgpl.sh": "exit 0",
                sdk / "bin/qmake": "echo 6.12.0",
                sdk / "bin/macdeployqt": "exit 0",
                tools / "brew": "exit 2",
                tools / "cmake": 'printf "%s\\n" "$@" > "$CAPTURE"; exit 17',
            }
            for path, body in commands.items():
                path.write_text("#!/bin/sh\n" + body + "\n")
                path.chmod(0o755)
            capture = root / "configure-args"
            result = subprocess.run(["bash", str(scripts / "package-macos.sh")],
                                    env={**os.environ, "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                                         "QT_PREFIX": str(sdk), "CAPTURE": str(capture)},
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 17, result.stderr)
            self.assertIn("-DCMAKE_PREFIX_PATH=" + str(sdk), capture.read_text().splitlines())


if __name__ == "__main__":
    unittest.main()
