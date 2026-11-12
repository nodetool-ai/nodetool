"""Run one group of a Qt Test binary's functions, so ctest can run the groups
side by side.

    python3 run-qtest-group.py <binary> <group> <groups>

Lists every function with -functions, including future additions, and runs
every groups-th one from the group-th (0-based), with all their data rows.
"""

import re
import subprocess
import sys

binary, group, groups = sys.argv[1:]
group, groups = int(group), int(groups)
if groups < 2 or not 0 <= group < groups:
    raise SystemExit(f"group must be in 0..{groups - 1} of at least two groups")
listing = subprocess.run([binary, "-functions"], capture_output=True, text=True, check=True)
functions = [line.removesuffix("()") for line in listing.stdout.splitlines() if re.fullmatch(r"\w+\(\)", line)]
if len(functions) < groups or len(functions) != len(set(functions)):
    raise SystemExit(f"expected at least {groups} distinct test functions")
selected = functions[group::groups]
print(f"Group {group} of {groups}: {len(selected)} of {len(functions)} functions", flush=True)
raise SystemExit(subprocess.run([binary, *selected]).returncode)
