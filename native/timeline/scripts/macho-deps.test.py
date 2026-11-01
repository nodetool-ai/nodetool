#!/usr/bin/env python3
"""Tests for macho-deps.py check (review F5): a dependency resolves only to a
regular Mach-O library with the architectures of the file that loads it.

Builds a tiny app bundle with clang: Contents/MacOS/app links
@rpath/libdep.dylib and has the rpath @executable_path/../Frameworks. Each
case puts something different at Contents/Frameworks/libdep.dylib.

  python3 macho-deps.test.py        (macOS, needs clang and otool)
"""

import importlib.util
import os
import platform
import shutil
import subprocess
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("macho_deps", os.path.join(HERE, "macho-deps.py"))
macho_deps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(macho_deps)

ARCH = platform.machine()  # arm64 or x86_64
OTHER_ARCH = "x86_64" if ARCH == "arm64" else "arm64"


def clang(*args):
    subprocess.run(["clang", *args], check=True, capture_output=True)


class CheckTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = tempfile.mkdtemp(prefix="macho-deps-src-")
        lib_c = os.path.join(cls.src, "dep.c")
        with open(lib_c, "w") as f:
            f.write("int dep(void) { return 1; }\n")
        app_c = os.path.join(cls.src, "app.c")
        with open(app_c, "w") as f:
            f.write("int dep(void);\nint main(void) { return dep() - 1; }\n")
        cls.lib = os.path.join(cls.src, "libdep.dylib")
        clang("-arch", ARCH, "-dynamiclib", "-install_name", "@rpath/libdep.dylib", "-o", cls.lib, lib_c)
        cls.lib_other = os.path.join(cls.src, "libdep-other.dylib")
        clang("-arch", OTHER_ARCH, "-dynamiclib", "-install_name", "@rpath/libdep.dylib", "-o", cls.lib_other, lib_c)
        cls.exe = os.path.join(cls.src, "app")
        clang("-arch", ARCH, "-o", cls.exe, app_c, cls.lib, "-Wl,-rpath,@executable_path/../Frameworks")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.src)

    def setUp(self):
        self.bundle = tempfile.mkdtemp(prefix="macho-deps-", suffix=".app")
        os.makedirs(os.path.join(self.bundle, "Contents", "MacOS"))
        os.makedirs(os.path.join(self.bundle, "Contents", "Frameworks"))
        shutil.copy(self.exe, os.path.join(self.bundle, "Contents", "MacOS", "app"))
        self.dep = os.path.join(self.bundle, "Contents", "Frameworks", "libdep.dylib")

    def tearDown(self):
        shutil.rmtree(self.bundle)

    def problems(self):
        r = macho_deps.analyse(self.bundle)
        # The audit must have inspected the executable and its reference.
        self.assertGreaterEqual(r["machoFiles"], 1)
        self.assertGreaterEqual(r["references"], 1)
        app = os.path.join("Contents", "MacOS", "app")
        return [p for p in r["problems"] if p["file"] == app and p.get("dep") == "@rpath/libdep.dylib"]

    def test_real_library_passes(self):
        shutil.copy(self.lib, self.dep)
        self.assertEqual(self.problems(), [])

    def test_missing_library_fails(self):
        self.assertEqual(len(self.problems()), 1)

    def test_directory_fails(self):
        os.makedirs(self.dep)
        self.assertEqual(len(self.problems()), 1)

    def test_non_macho_file_fails(self):
        with open(self.dep, "w") as f:
            f.write("not a library\n")
        self.assertEqual(len(self.problems()), 1)

    def test_executable_is_not_a_library(self):
        shutil.copy(self.exe, self.dep)
        self.assertEqual(len(self.problems()), 1)

    def test_wrong_architecture_fails(self):
        shutil.copy(self.lib_other, self.dep)
        self.assertEqual(len(self.problems()), 1)


if __name__ == "__main__":
    unittest.main()
