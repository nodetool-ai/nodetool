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
resolves to a regular Mach-O dynamic library inside the bundle that has every
architecture of the file that holds the reference (review F5: a folder, a
non-Mach-O file, an executable or a wrong-architecture library does not
resolve, as dyld rejects them); a resolution that leaves
the bundle (../ traversal, a symlink out) fails. An rpath must be @-relative
and stay inside the bundle.

  macho-deps.py check BUNDLE        prints JSON; exit 1 on any failure
  macho-deps.py prune BUNDLE        deletes every rpath that leaves the bundle,
                                    then the plug-ins (PlugIns/, Resources/qml/)
                                    whose references do not resolve, until
                                    none is left, then the QML modules whose
                                    plug-in went, and prints what it removed
  macho-deps.py notices BUNDLE --brew-prefix P [--local JSON]... [--default-licence PREFIX=FILE,...]...
                                    maps every Mach-O file of the bundle to the
                                    Homebrew keg it came from (or to a --local
                                    component), copies each keg's licence texts
                                    to Resources/licenses/third-party/<formula>/,
                                    writes Resources/source/components.json and
                                    prints the source section for SOURCES.txt;
                                    exit 1 when a file has no origin or a keg
                                    has no licence text
  macho-deps.py notices-check BUNDLE
                                    prints JSON; exit 1 unless every Mach-O file
                                    of the bundle has a component with licence
                                    texts and a source in SOURCES.txt, and every
                                    Qt framework's version is its component's

The notice list comes from the bundle contents, not from a fixed list (review
M6 F8): OpenSSL, GLib, PCRE2, ICU, FreeType and every other library that
macdeployqt copies get their notices because they are in the bundle. The
source of a keg is its install-time record (sbom.spdx.json and the formula
copy in .brew/), not the current Homebrew metadata (review F4).
"""

import argparse
import glob
import hashlib
import json
import os
import re
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


MH_DYLIB, MH_DYLIB_STUB = 6, 9


def macho_header(path):
    """(filetype, set of cputypes) of a Mach-O file, or None when the path is
    not a regular Mach-O file. A universal file reports the cputypes of its
    slices and the filetype of the first slice."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            head = f.read(4096)
            magic = head[:4]
            if magic in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe"):  # thin, little-endian
                return int.from_bytes(head[12:16], "little"), {int.from_bytes(head[4:8], "little")}
            if magic in (b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"):  # universal (32- and 64-bit offsets)
                count = int.from_bytes(head[4:8], "big")
                size = 20 if magic.endswith(b"\xbe") else 32
                if count == 0 or count > 16:
                    return None
                cpus, first = set(), None
                for i in range(count):
                    entry = head[8 + i * size : 8 + (i + 1) * size]
                    cpus.add(int.from_bytes(entry[0:4], "big"))
                    if first is None:
                        first = int.from_bytes(entry[8:16], "big") if size == 32 else int.from_bytes(entry[8:12], "big")
                f.seek(first)
                slice_head = f.read(16)
                if slice_head[:4] not in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe"):
                    return None
                return int.from_bytes(slice_head[12:16], "little"), cpus
    except OSError:
        return None
    return None


def library_problem(path, want_cpus):
    """None when PATH is a regular Mach-O dynamic library that has every
    architecture of the file that loads it, else the reason it is not."""
    header = macho_header(path)
    if header is None:
        return "not a regular Mach-O file"
    filetype, cpus = header
    if filetype not in (MH_DYLIB, MH_DYLIB_STUB):
        return "not a dynamic library"
    if not want_cpus <= cpus:
        return "architecture mismatch"
    return None


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
        own_cpus = (macho_header(f) or (None, set()))[1]
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
            # dyld skips a candidate it cannot load and tries the next one.
            existing = [c for c in candidates if os.path.lexists(c)]
            found = [c for c in existing if library_problem(c, own_cpus) is None]
            if not found:
                reason = "not found in the bundle"
                if existing:
                    reason = f"{library_problem(existing[0], own_cpus)}: {os.path.relpath(existing[0], bundle)}"
                problems.append({"file": os.path.relpath(f, bundle), "dep": dep, "reason": reason})
            elif not inside(bundle, found[0]):
                problems.append({"file": os.path.relpath(f, bundle), "dep": dep, "reason": "resolves outside the bundle"})
    return {"machoFiles": len(files), "references": references, "problems": problems}


LICENCE_NAME = re.compile(r"^(licen[cs]e|copying|notice|copyright|unlicense)([._-].*)?$|gpl.*\.txt$|-or-later\.txt$", re.I)


MIN_LICENCE_BYTES = 200


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def unit_of(rel):
    """A framework is one unit; any other Mach-O file is its own unit."""
    parts = rel.split(os.sep)
    if len(parts) >= 3 and parts[:2] == ["Contents", "Frameworks"] and parts[2].endswith(".framework"):
        return os.path.join(*parts[:3])
    return rel


def bundle_units(bundle):
    """Every shipped Mach-O unit except the app's own executable."""
    units = set()
    own = os.path.join("Contents", "MacOS") + os.sep
    for root, _, names in os.walk(bundle):
        for n in names:
            p = os.path.join(root, n)
            if os.path.islink(p) or not is_macho(p):
                continue
            rel = os.path.relpath(p, bundle)
            if not rel.startswith(own):
                units.add(unit_of(rel))
    return sorted(units)


def origin_index(prefix):
    """Basename -> set of real paths of the libraries, frameworks and Qt
    plug-ins that Homebrew installed under PREFIX."""
    idx = {}
    for lib in glob.glob(os.path.join(prefix, "opt", "*", "lib")):
        for n in os.listdir(lib):
            if n.endswith((".dylib", ".framework")):
                idx.setdefault(n, set()).add(os.path.realpath(os.path.join(lib, n)))
    for sub in ("plugins", "qml"):
        for root, _, names in os.walk(os.path.join(prefix, "share", "qt", sub), followlinks=True):
            for n in names:
                if n.endswith(".dylib"):
                    idx.setdefault(n, set()).add(os.path.realpath(os.path.join(root, n)))
    return idx


def keg_record(keg, formula, version):
    """The install-time record of a keg: its source archive, patches, recipe
    and licence texts."""
    rec = {"kind": "homebrew", "formula": formula, "keg": version, "files": [], "licenses": [], "patches": []}
    sbom_path = os.path.join(keg, "sbom.spdx.json")
    try:
        with open(sbom_path) as f:
            packages = json.load(f)["packages"]
    except (OSError, ValueError, KeyError):
        packages = []
    main_pkg = next((p for p in packages if p.get("name") == formula), None)

    def sha(p):
        return next((c["checksumValue"] for c in p.get("checksums", []) if c.get("algorithm") == "SHA256"), None)

    if main_pkg:
        rec["version"] = main_pkg.get("versionInfo")
        rec["source"] = {"url": main_pkg.get("downloadLocation"), "sha256": sha(main_pkg)}
        rec["patches"] = [{"url": p.get("downloadLocation"), "sha256": sha(p)} for p in packages
                          if p.get("name", "").startswith(formula + " patch ")]
    else:
        rec["version"] = None
        rec["source"] = None
    try:
        with open(os.path.join(keg, "INSTALL_RECEIPT.json")) as f:
            rec["pouredFromBottle"] = json.load(f).get("poured_from_bottle")
    except (OSError, ValueError):
        rec["pouredFromBottle"] = None
    recipe = os.path.join(keg, ".brew", formula + ".rb")
    rec["recipe"] = {"file": f".brew/{formula}.rb", "sha256": sha256_file(recipe)} if os.path.isfile(recipe) else None
    rec["licenseSources"] = sorted(os.path.join(keg, n) for n in os.listdir(keg)
                                   if LICENCE_NAME.search(n) and os.path.isfile(os.path.join(keg, n)))
    rec["licenseSources"] += sorted(glob.glob(os.path.join(keg, "share", "qt", "sbom", "*.spdx")))
    return rec


def notices(argv):
    ap = argparse.ArgumentParser(prog="macho-deps.py notices")
    ap.add_argument("bundle")
    ap.add_argument("--brew-prefix", required=True)
    ap.add_argument("--local", action="append", default=[],
                    help='JSON: {"name","match" (basename regex),"version","licenses":[...],"source":{"file"}}')
    ap.add_argument("--default-licence", action="append", default=[],
                    help="FORMULA_PREFIX=FILE[,FILE]: licence files (already in licenses/) for kegs that ship none")
    a = ap.parse_args(argv)
    bundle = os.path.realpath(a.bundle)
    res = os.path.join(bundle, "Contents", "Resources")
    lic_root = os.path.join(res, "licenses")
    cellar = os.path.realpath(os.path.join(a.brew_prefix, "Cellar"))
    locals_ = [json.loads(x) for x in a.local]
    defaults = []
    for d in a.default_licence:
        k, v = d.split("=", 1)
        defaults.append((k, v.split(",")))
    idx = origin_index(a.brew_prefix)
    components, problems = {}, []
    for unit in bundle_units(bundle):
        name = os.path.basename(unit)
        local = next((l for l in locals_ if re.search(l["match"], name)), None)
        if local:
            c = components.setdefault(local["name"], {"kind": "local", "version": local.get("version"),
                                                      "licenses": list(local["licenses"]), "files": [],
                                                      "source": dict(local["source"])})
            c["files"].append(unit)
            continue
        origins = idx.get(name, set())
        kegs = set()
        for real in origins:
            m = re.match(re.escape(cellar) + r"/([^/]+)/([^/]+)/", real)
            if m:
                kegs.add((m.group(1), m.group(2)))
        if len(kegs) != 1:
            problems.append({"unit": unit, "reason": "no Homebrew origin" if not kegs else f"several origins: {sorted(kegs)}"})
            continue
        formula, version = kegs.pop()
        if formula not in components:
            components[formula] = keg_record(os.path.join(cellar, formula, version), formula, version)
        components[formula]["files"].append(unit)
    for name, c in components.items():
        if c["kind"] != "homebrew":
            continue
        if not c["source"] or not c["source"].get("url") or not c["source"].get("sha256"):
            problems.append({"component": name, "reason": "no source record in the keg (sbom.spdx.json)"})
        dest = os.path.join(lic_root, "third-party", name)
        shutil.rmtree(dest, ignore_errors=True)
        for src in c.pop("licenseSources"):
            os.makedirs(dest, exist_ok=True)
            shutil.copy(src, os.path.join(dest, os.path.basename(src)))
            c["licenses"].append(os.path.join("third-party", name, os.path.basename(src)))
        if not any(not l.endswith(".spdx") and os.path.getsize(os.path.join(lic_root, l)) >= MIN_LICENCE_BYTES
                   for l in c["licenses"]):
            extra = next((files for k, files in defaults if name.startswith(k)), None)
            if extra is None:
                problems.append({"component": name, "reason": "the keg has no licence text and no --default-licence"})
            else:
                c["licenses"] = list(extra) + c["licenses"]
    for name, c in components.items():
        for l in c["licenses"]:
            if not os.path.isfile(os.path.join(lic_root, l)):
                problems.append({"component": name, "reason": f"licence file {l} is missing"})
        if c["kind"] == "local":
            f = os.path.join(res, "source", c["source"]["file"])
            if os.path.isfile(f):
                c["source"]["sha256"] = sha256_file(f)
            else:
                problems.append({"component": name, "reason": f"source {c['source']['file']} is missing"})
    os.makedirs(os.path.join(res, "source"), exist_ok=True)
    with open(os.path.join(res, "source", "components.json"), "w") as f:
        json.dump({"generatedFrom": "the Mach-O files of the bundle", "components": components}, f, indent=2, sort_keys=True)
    # The source section of SOURCES.txt.
    out = []
    for name in sorted(components):
        c = components[name]
        if c["kind"] != "homebrew":
            continue
        bottle = "the Homebrew bottle, unmodified" if c.get("pouredFromBottle") else "built from source by Homebrew"
        out.append(f"  {name} {c.get('version')} (keg {c['keg']}, {bottle}); licences: {', '.join(c['licenses'])}")
        if c.get("source"):
            out.append(f"    source {c['source'].get('url')}")
            out.append(f"      sha256 {c['source'].get('sha256')}")
        for p in c["patches"]:
            out.append(f"    patch {p['url']}")
            out.append(f"      sha256 {p['sha256']}")
        if c.get("recipe"):
            out.append(f"    recipe {c['recipe']['file']} in the keg, sha256 {c['recipe']['sha256']}")
        out.append(f"    files: {', '.join(c['files'])}")
    print("\n".join(out))
    for p in problems:
        print(f"error: {json.dumps(p)}", file=sys.stderr)
    return 1 if problems else 0


def framework_version(bundle, unit):
    """The current version of a framework's binary (otool -L, its own id)."""
    name = os.path.basename(unit)[: -len(".framework")]
    for binary in (os.path.join(bundle, unit, "Versions", "A", name), os.path.join(bundle, unit, name)):
        if os.path.isfile(binary):
            m = re.search(r"current version ([0-9.]+)\)", otool(["-L"], binary).splitlines()[1])
            return m.group(1) if m else None
    return None


def notices_check(bundle):
    bundle = os.path.realpath(bundle)
    res = os.path.join(bundle, "Contents", "Resources")
    problems = []
    try:
        with open(os.path.join(res, "source", "components.json")) as f:
            components = json.load(f)["components"]
    except (OSError, ValueError, KeyError):
        components = {}
        problems.append({"reason": "no Resources/source/components.json"})
    try:
        with open(os.path.join(res, "source", "SOURCES.txt")) as f:
            sources_txt = f.read()
    except OSError:
        sources_txt = ""
        problems.append({"reason": "no Resources/source/SOURCES.txt"})
    owner = {}
    for name, c in components.items():
        for unit in c.get("files", []):
            owner[unit] = name
    units = bundle_units(bundle)
    for unit in units:
        if unit not in owner:
            problems.append({"unit": unit, "reason": "no component (licence notice) for this bundled file"})
    for unit in sorted(set(owner) - set(units)):
        problems.append({"unit": unit, "reason": "component lists a file the bundle does not have"})
    for name, c in components.items():
        # Every listed file exists, and one is a full text (not a pointer
        # such as PCRE2's COPYING, and not only Qt's SBOM).
        full = 0
        for l in c.get("licenses", []):
            f = os.path.join(res, "licenses", l)
            if not os.path.isfile(f):
                problems.append({"component": name, "reason": f"licence text {l} is missing"})
            elif os.path.getsize(f) >= MIN_LICENCE_BYTES and not l.endswith(".spdx"):
                full += 1
        if full == 0:
            problems.append({"component": name, "reason": "no full licence text"})
        src = c.get("source") or {}
        if not src.get("sha256") or src["sha256"] not in sources_txt:
            problems.append({"component": name, "reason": "the source checksum is not in SOURCES.txt"})
        if c.get("kind") == "homebrew" and (not src.get("url") or src["url"] not in sources_txt):
            problems.append({"component": name, "reason": "the source URL is not in SOURCES.txt"})
        if c.get("kind") == "local":
            f = os.path.join(res, "source", src.get("file", ""))
            if not os.path.isfile(f) or sha256_file(f) != src.get("sha256"):
                problems.append({"component": name, "reason": "the bundled source does not match its checksum"})
        # Review F4: the Qt source named for a framework is the one it was built from.
        for unit in c.get("files", []):
            if not (os.path.basename(unit).startswith("Qt") and unit.endswith(".framework")):
                continue
            v = framework_version(bundle, unit)
            url = src.get("url") or ""
            if v is None or c.get("version") != v or (f"-everywhere-src-" in url and f"-everywhere-src-{v}." not in url):
                problems.append({"unit": unit, "component": name, "frameworkVersion": v, "sourceVersion": c.get("version"),
                                 "source": url, "reason": "the Qt source does not match the framework's version"})
    return {"pass": bool(units) and bool(components) and not problems, "units": len(units),
            "components": len(components), "problems": problems}


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "notices":
        return notices(sys.argv[2:])
    if len(sys.argv) == 3 and sys.argv[1] == "notices-check":
        r = notices_check(sys.argv[2])
        print(json.dumps(r))
        return 0 if r["pass"] else 1
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
