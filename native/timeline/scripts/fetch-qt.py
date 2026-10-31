#!/usr/bin/env python3
"""Install Qt packages straight from a Qt online repository.

Qt 6.12 moved the Windows desktop packages into one repository per
toolchain (qt6_6120/qt6_6120_msvc2022_64), which aqtinstall 3.3.0 cannot
read. This script reads the repository's Updates.xml, downloads each
package's archives, checks them against their published SHA-1 files and
extracts them with 7z into the output folder.

Usage: fetch-qt.py REPO_URL OUT_DIR PACKAGE...
"""

import hashlib
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# Archives the build never needs.
SKIP_PREFIXES = ("qtdoc-", "qttranslations-")


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    repo, out, wanted = sys.argv[1].rstrip("/"), Path(sys.argv[2]), sys.argv[3:]
    out.mkdir(parents=True, exist_ok=True)
    updates = ET.fromstring(fetch(f"{repo}/Updates.xml"))
    packages = {p.findtext("Name"): p for p in updates.iter("PackageUpdate")}
    for name in wanted:
        package = packages.get(name)
        if package is None:
            print(f"fetch-qt: package {name} is not in {repo}/Updates.xml", file=sys.stderr)
            return 1
        version = package.findtext("Version")
        archives = [a.strip() for a in (package.findtext("DownloadableArchives") or "").split(",") if a.strip()]
        for archive in archives:
            if archive.startswith(SKIP_PREFIXES):
                continue
            url = f"{repo}/{name}/{version}{archive}"
            data = fetch(url)
            expected = fetch(f"{url}.sha1").decode().split()[0].lower()
            if hashlib.sha1(data).hexdigest() != expected:
                print(f"fetch-qt: SHA-1 mismatch for {url}", file=sys.stderr)
                return 1
            path = out / archive
            path.write_bytes(data)
            subprocess.run(["7z", "x", "-y", f"-o{out}", str(path)], check=True, stdout=subprocess.DEVNULL)
            path.unlink()
            print(f"fetch-qt: {name}: {archive}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
