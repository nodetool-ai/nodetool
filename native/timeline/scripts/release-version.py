#!/usr/bin/env python3
"""Validate an existing timeline tag against CMake's numeric application version."""
from pathlib import Path
import re
import sys

tag = sys.argv[1]
match = re.fullmatch(r'timeline-v(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?', tag)
cmake = Path('native/timeline/CMakeLists.txt').read_text()
version = re.search(r'project\(NodeToolTimeline VERSION ([0-9.]+)', cmake)[1]
if not match or match[1] != version:
    sys.exit(f'Expected timeline-v{version} (optional prerelease suffix), matching CMake PROJECT_VERSION, got {tag!r}')
print(f'version={tag.removeprefix("timeline-v")}')
print(f'app_version={version}')
