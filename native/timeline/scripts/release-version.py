#!/usr/bin/env python3
"""Print the NodeTool release version that names the timeline downloads, and
CMake's numeric application version, which --version reports."""
from pathlib import Path
import re
import sys

version = sys.argv[1].removeprefix('v')
if not re.fullmatch(r'\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?', version):
    sys.exit(f'Expected a release version X.Y.Z[-pre][+build], got {sys.argv[1]!r}')
cmake = Path(__file__).resolve().parents[1].joinpath('CMakeLists.txt').read_text()
app_version = re.search(r'project\(NodeToolTimeline VERSION ([0-9.]+)', cmake)[1]
print(f'version={version}')
print(f'app_version={app_version}')
