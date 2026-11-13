"""Build the RT-Q8 offline browser experiment without changing native sources."""
import argparse
import os
from pathlib import Path
import subprocess
import sys


def replace_exact(text, before, after, count):
    if text.count(before) != count:
        raise RuntimeError(f"Host adaptation changed, expected {count} occurrences: {before}")
    return text.replace(before, after)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("sdk", "native-build", "port", "out"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--benchmark", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    sdk, native, port, output = (path.resolve() for path in
                                 (args.sdk, args.native_build, args.port, args.out))
    output.mkdir(parents=True, exist_ok=True)
    gpu = (root / "src/offline_gpu.cpp").read_text(encoding="utf-8")
    gpu = replace_exact(gpu, "#include <webgpu/wgpu.h>", "#include <emscripten.h>", 1)
    for call in ("wgpuDevicePoll(device, false, nullptr);",
                 "wgpuDevicePoll(device.get(), false, nullptr);",
                 "wgpuDevicePoll(storage_->device.get(), false, nullptr);"):
        gpu = replace_exact(gpu, call, "", 1)
    gpu = replace_exact(gpu, "std::this_thread::yield();", "emscripten_sleep(0);", 3)
    (output / "offline_gpu.cpp").write_text(gpu, encoding="utf-8")
    driver = (root / "src/offline.cpp").read_text(encoding="utf-8")
    driver = replace_exact(driver, "std::this_thread::sleep_for(std::chrono::milliseconds(1));",
                           "emscripten_sleep(1);", 1)
    (output / "offline.cpp").write_text("#include <emscripten.h>\n" + driver, encoding="utf-8")
    command = [sys.executable, str(sdk / "upstream/emscripten/em++.py"),
               "-std=c++20", "-O2", "-fexceptions", "-fno-fast-math", "-ffp-contract=off",
               "--use-port=" + str(port), "-sASYNCIFY=1", "-sALLOW_MEMORY_GROWTH=1",
               "-sEXIT_RUNTIME=1", "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=web",
               "-sEXPORTED_RUNTIME_METHODS=['FS']", "-DNT_OFFLINE_GPU=1",
               '-DNT_GPU_CATALOG="/gpu-catalog.json"',
               *["-I" + str(path) for path in (root / "include", root / "src",
                  native / "generated", native / "_deps/nlohmann_json-src/include",
                  native / "_deps/rt_stb-src")],
               *[str(root / "src" / name) for name in
                 ("plan.cpp", "control.cpp", "math.cpp", "audio.cpp", "dsp.cpp", "render.cpp",
                  "offline_clock.cpp", "offline_slots.cpp", "offline_image.cpp",
                  "offline_cli.cpp", "offline_main.cpp")],
               str(output / "offline_gpu.cpp"), str(output / "offline.cpp"),
               "--preload-file", str(native / "gpu-catalog.json") + "@/gpu-catalog.json",
               "-o", str(output / "candidate.mjs")]
    if args.benchmark:
        # Retain the full catalog, matching the TypeScript public catalog bundle.
        (output / "gpu-catalog.json").write_bytes((native / "gpu-catalog.json").read_bytes())
        command = [arg for arg in command if not arg.endswith(".cpp")]
        command.extend([str(root / "src" / name) for name in ("plan.cpp", "control.cpp", "math.cpp", "render.cpp")])
        command.extend([str(output / "offline_gpu.cpp"), str(root / "spike/browser/benchmark.cpp")])
    with (output / "build.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(command, env=dict(os.environ, EM_CONFIG=str(sdk / ".emscripten"), EMSDK_PYTHON=sys.executable),
                                stdout=log, stderr=subprocess.STDOUT, timeout=900)
    print(f"Browser candidate compiler exit: {result.returncode}. See {output / 'build.log'}")
    return result.returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
