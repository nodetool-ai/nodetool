"""RT-Q8 compile probe. Scheduler execution is not a browser GPU result."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--native-build", type=Path, required=True)
    parser.add_argument("--port", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[2]
    sdk, native, port, output = (path.resolve() for path in
                                 (args.sdk, args.native_build, args.port, args.out))
    compiler = sdk / "upstream/emscripten/em++.py"
    for path in (compiler, sdk / ".emscripten", native / "generated/plan_schema.h",
                 native / "_deps/nlohmann_json-src/include/nlohmann/json.hpp", port):
        if not path.is_file():
            raise RuntimeError(f"Missing prerequisite: {path}")
    output.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, EM_CONFIG=str(sdk / ".emscripten"), EMSDK_PYTHON=sys.executable)

    def run(arguments, name):
        result = subprocess.run(arguments, env=env, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=600)
        (output / f"{name}.log").write_text(result.stdout + result.stderr, encoding="utf-8")
        return result

    command = [sys.executable, str(compiler)]
    version = run(command + ["--version"], "compiler")
    compiler_version = next(iter(version.stdout.splitlines()), "")
    if version.returncode or "7.0.0" not in compiler_version:
        raise RuntimeError("This probe requires the pinned Emscripten 7.0.0 toolchain")
    flags = ["-std=c++20", "-O2", "-fexceptions", "-fno-fast-math", "-ffp-contract=off",
             "-I" + str(source / "include"), "-I" + str(native / "generated"),
             "-I" + str(native / "_deps/nlohmann_json-src/include")]
    gpu = run(command + flags + ["--use-port=" + str(port), "-fsyntax-only",
                                 str(source / "src/offline_gpu.cpp")], "gpu-unmodified")
    # Probe a generated copy only. Do not change the native executor or declare
    # the missing extension implemented by removing its include.
    gpu_source = (source / "src/offline_gpu.cpp").read_text(encoding="utf-8")
    native_include = "#include <webgpu/wgpu.h>"
    if gpu_source.count(native_include) != 1:
        raise RuntimeError("Native extension include changed; review the probe")
    portable_source = output / "gpu-standard-header.cpp"
    portable_source.write_text(gpu_source.replace(native_include, ""), encoding="utf-8")
    standard_header = run(command + flags + ["--use-port=" + str(port), "-fsyntax-only",
                          str(portable_source)], "gpu-standard-header")
    scheduler = run(command + flags + ["-sALLOW_MEMORY_GROWTH=1", "-sEXIT_RUNTIME=1",
                    "-I" + str(source.parent / "timeline/src"),
                    *[str(source / "src" / name) for name in
                      ("plan.cpp", "control.cpp", "math.cpp", "render.cpp")],
                    str(source / "tests/render_test.cpp"), "-o", str(output / "scheduler.js")],
                    "scheduler-build")
    execution = None
    if scheduler.returncode == 0:
        execution = run(["node", str(output / "scheduler.js")], "scheduler-run")
    report = {
        "schemaVersion": 1,
        "compiler": compiler_version,
        "unmodifiedGpuCompileExit": gpu.returncode,
        "withoutNativeIncludeCompileExit": standard_header.returncode,
        "schedulerCompileExit": scheduler.returncode,
        "schedulerRunExit": execution.returncode if execution else None,
        "browserGpuExecuted": False,
        "q8Decided": False
    }
    (output / "probe.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    passed = (scheduler.returncode == 0 and execution and execution.returncode == 0
              and gpu.returncode == 0 and standard_header.returncode == 0)
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
