"""Run one half of the menu cases, discovering every Qt Test function."""

import re
import subprocess
import sys

binary, group = sys.argv[1:]
group = int(group)
if group not in (0, 1):
    raise SystemExit("menu test group must be 0 or 1")
listing = subprocess.run([binary, "-functions"], capture_output=True, text=True, check=True)
functions = [line.removesuffix("()") for line in listing.stdout.splitlines() if re.fullmatch(r"\w+\(\)", line)]
if len(functions) < 2 or len(functions) != len(set(functions)):
    raise SystemExit("expected at least two distinct menu test functions")
selected = functions[group::2]
print(f"Menu group {group}: {len(selected)} of {len(functions)} functions", flush=True)
raise SystemExit(subprocess.run([binary, *selected]).returncode)
