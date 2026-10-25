#!/usr/bin/env python3
"""Resolves every library reference of an app bundle (PLAN M6, review F10).

For each Mach-O file in the bundle it reads the install name, the linked
libraries (`otool -L`) and the rpaths (`otool -l`), and resolves each
reference the way dyld does for the bundle's layout:
  - @executable_path is Contents/MacOS;
  - @loader_path is the folder of the file that holds the reference;
  - @rpath/X tries the rpaths of the file and of the main executable, in
    that order (dyld also uses the rpaths of the images that loaded the file;
    in this bundle every loader chain starts at the executable).
A reference passes when it is a system library (/System, /usr/lib) or when it
resolves to a file that exists inside the bundle; a resolution that leaves
the bundle (../ traversal, a symlink out) fails. An rpath must be @-relative
and stay inside the bundle.

  macho-deps.py check BUNDLE        prints JSON; exit 1 on any failure
  macho-deps.py prune BUNDLE        deletes every rpath that leaves the bundle,
                                    then the plug-ins (PlugIns/, Resources/qml/)
                                    whose references do not resolve, until
                                    none is left, then the QML modules whose
                                    plug-in went, and prints what it removed
"""

import json
import os
import shutil
import subprocess
import sys

SYSTEM = ("/System/", "/usr/lib/")


def is_macho(path):
    try:
        with open(path, "rb") as f:
            magic = f.read(4)
    except OSError:
        return False
    return magic in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca")


def otool(args, path):
    return subprocess.run(["otool", *args, path], check=True, capture_output=True, text=True).stdout


def install_name(path):
    lines = otool(["-D"], path).splitlines()
    return lines[1].strip() if len(lines) > 1 else None


def linked(path):
    own = install_name(path)
    deps = []
    for line in otool(["-L"], path).splitlines()[1:]:
        dep = line.strip().split(" (compatibility")[0].strip()
        if dep and dep != own:
            deps.append(dep)
    return deps


def rpaths(path):
    out, lines = [], otool(["-l"], path).splitlines()
    for i, line in enumerate(lines):
        if line.strip() == "cmd LC_RPATH":
            for follow in lines[i + 1 : i + 4]:
                parts = follow.split()
                if parts and parts[0] == "path":
                    out.append(parts[1])
                    break
    return out


def inside(bundle, path):
    real = os.path.realpath(path)
    return real == bundle or real.startswith(bundle + os.sep)


def expand(ref, bundle, loader_dir):
    if ref.startswith("@executable_path/"):
        return os.path.join(bundle, "Contents", "MacOS", ref[len("@executable_path/") :])
    if ref.startswith("@loader_path/"):
        return os.path.join(loader_dir, ref[len("@loader_path/") :])
    return ref


def analyse(bundle):
    bundle = os.path.realpath(bundle)
    exe_dir = os.path.join(bundle, "Contents", "MacOS")
    files = []
    for root, _, names in os.walk(bundle):
        for n in names:
            p = os.path.join(root, n)
            if not os.path.islink(p) and is_macho(p):
                files.append(p)
    exe = [f for f in files if os.path.dirname(f) == exe_dir]
    exe_rpaths = [expand(r, bundle, exe_dir) for r in rpaths(exe[0])] if exe else []
    problems = []
    references = 0
    for f in files:
        here = os.path.dirname(f)
        own_rpaths = []
        for r in rpaths(f):
            resolved = expand(r, bundle, here)
            if not r.startswith("@") or not inside(bundle, resolved):
                problems.append({"file": os.path.relpath(f, bundle), "rpath": r, "reason": "rpath outside the bundle"})
            own_rpaths.append(resolved)
        for dep in linked(f):
            references += 1
            if dep.startswith(SYSTEM):
                continue
            if dep.startswith("@rpath/"):
                tail = dep[len("@rpath/") :]
                candidates = [os.path.join(r, tail) for r in own_rpaths + exe_rpaths]
            elif dep.startswith("@"):
                candidates = [expand(dep, bundle, here)]
            else:
                problems.append({"file": os.path.relpath(f, bundle), "dep": dep, "reason": "absolute path"})
                continue
            found = [c for c in candidates if os.path.exists(c)]
            if not found:
                problems.append({"file": os.path.relpath(f, bundle), "dep": dep, "reason": "not found in the bundle"})
            elif not inside(bundle, found[0]):
                problems.append({"file": os.path.relpath(f, bundle), "dep": dep, "reason": "resolves outside the bundle"})
    return {"machoFiles": len(files), "references": references, "problems": problems}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("check", "prune"):
        print(__doc__, file=sys.stderr)
        return 2
    bundle = sys.argv[2]
    if sys.argv[1] == "check":
        r = analyse(bundle)
        r["pass"] = r["machoFiles"] > 0 and r["references"] > 0 and not r["problems"]
        print(json.dumps(r))
        return 0 if r["pass"] else 1
    removed = []
    dropped_rpaths = 0
    real = os.path.realpath(bundle)
    for root, _, names in os.walk(real):
        for n in names:
            f = os.path.join(root, n)
            if os.path.islink(f) or not is_macho(f):
                continue
            for r in rpaths(f):
                if not r.startswith("@") or not inside(real, expand(r, real, os.path.dirname(f))):
                    subprocess.run(["install_name_tool", "-delete_rpath", r, f], check=True, capture_output=True)
                    dropped_rpaths += 1
    plugin_roots = (os.path.join("Contents", "PlugIns") + os.sep, os.path.join("Contents", "Resources", "qml") + os.sep)
    while True:
        r = analyse(bundle)
        broken = sorted({p["file"] for p in r["problems"] if p["file"].startswith(plugin_roots)})
        if not broken:
            break
        for rel in broken:
            os.remove(os.path.join(os.path.realpath(bundle), rel))
            removed.append(rel)
    # A QML module whose plug-in went is unusable: remove its folder, which
    # holds a link to the deleted plug-in (a dangling link breaks codesign).
    removed_modules = []
    qml_root = os.path.join(real, "Contents", "Resources", "qml")
    for root, dirs, names in os.walk(qml_root):
        for n in names:
            link = os.path.join(root, n)
            if os.path.islink(link) and not os.path.exists(link) and os.path.isdir(root):
                removed_modules.append(os.path.relpath(root, real))
                shutil.rmtree(root)
                dirs[:] = []
                break
    print(json.dumps({"droppedRpaths": dropped_rpaths, "removed": removed, "removedQmlModules": removed_modules,
                      "remainingProblems": r["problems"]}))
    return 0 if not r["problems"] else 1


if __name__ == "__main__":
    sys.exit(main())
