"""Ratchet failed AOT function sites in the scrolling delegates."""
import argparse
import json
from pathlib import Path

HOT_FILES = ("Clip", "ClipBody", "ClipChrome", "ClipFadeGrips", "ClipLaneRow", "TrackLane", "TracksRegion")


def failed_sites(document):
    if document.get("formatRevision") != 1:
        raise ValueError("unsupported aotstats format")
    entries = [entry for module in document["modules"]
               for source in module["moduleFiles"] for entry in source["entries"]]
    if not entries:
        raise ValueError("aotstats inspected no functions")
    # A failed function can have several diagnostics. Count the function once.
    return {(entry["line"], entry["column"], entry["functionName"])
            for entry in entries if entry["codegenResult"] != 0}


def check(cache, ceilings):
    if set(ceilings) != set(HOT_FILES):
        raise ValueError("budget must enumerate every hot QML file")
    counts = {}
    for name in HOT_FILES:
        limit = ceilings[name]
        if type(limit) is not int or limit < 0:
            raise ValueError(f"{name}: invalid ceiling")
        stats = cache / f"timeline_qml_qml_Tracks_{name}_qml.cpp.aotstats"
        counts[name] = len(failed_sites(json.loads(stats.read_text())))
        if counts[name] > limit:
            raise ValueError(f"{name}: {counts[name]} failed AOT functions exceeds {limit}")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache", type=Path)
    parser.add_argument("budget", type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.cache, json.loads(args.budget.read_text())), sort_keys=True))


if __name__ == "__main__":
    main()
