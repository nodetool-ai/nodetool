# Native timeline memory checks

Run commands from `native/timeline/`. Use Clang and Ninja, Qt 6.12,
FFmpeg development libraries and ccache. The presets use `QT_PREFIX` when
set. Override `CMAKE_PREFIX_PATH` on the command line as shown below.
All three build directories are ignored by the existing `build-*/` rule.

## Sanitizers

```bash
export QT_PREFIX="$HOME/qt/6.12.0/gcc_64"
cmake --preset sanitize -DCMAKE_PREFIX_PATH="$QT_PREFIX" \
  -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
nice -n 10 cmake --build --preset sanitize -j 3
QT_QPA_PLATFORM=offscreen NT_NO_HW_DECODE=1 ctest --preset sanitize \
  -E 'tst_editpreview|tst_vulkaninterop|tst_tracksui'

cmake --preset tsan -DCMAKE_PREFIX_PATH="$QT_PREFIX" \
  -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
nice -n 10 cmake --build --preset tsan -j 3
QT_QPA_PLATFORM=offscreen ctest --preset tsan
```

`NT_SANITIZE` accepts `address,undefined`, `thread`, or an empty value.
ASan and UBSan share one build. TSan requires its own build. UBSan cannot
recover. The presets set runtime options with absolute suppression paths,
so CTest's working directory does not affect them. Reports return non-zero.
CTest also rejects sanitizer report text if a wrapper exits zero.

The TSan preset includes source pool, FFmpeg source, CPU usage, audio engine,
easing, frame ring, retire queue and frame cache. The last three currently
exercise their containers synchronously, but remain selected for future
threaded coverage. Fixture setup is selected automatically by CTest.
Qt and system FFmpeg are uninstrumented. Qt suppressions use `race_top`
to avoid hiding project accesses merely because Qt appears deeper in a stack.
The measured exemptions are libdbus teardown, NVIDIA VAAPI list storage,
uninstrumented FFmpeg interceptor accesses, the K-owned AudioEngine
notification race, and one unowned CPU test report across libstdc++ latch
synchronization. [baseline.md](baseline.md) records the stacks and decisions.
ASan interceptor and UBSan suppressions remain empty. A project suppression
must cite its baseline entry. Qt allocation leaks without an owning stack
remain unsuppressed.

The GPU render tests require the platform backend. On a Linux runner with
lavapipe and Xvfb, use `QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a
ctest --preset sanitize`. CI does this for both sanitizer presets.
The sanitize and fuzz test presets set `protect_shadow_gap=0`: NVIDIA's
VAAPI driver uses CUDA mappings in ASan's shadow gap. Without it VAAPI device
initialization fails, even though software decoding works. It is harmless on
lavapipe. The TSan test preset sets `NT_NO_HW_DECODE=1` because NVIDIA/CUDA
threads crash TSan itself at `tsan_interceptors_posix.cpp:2206` (`thr->slot`).
TSan therefore checks software decoding and the other threaded units. CI
sets `NT_NO_HW_DECODE=1` for both jobs because lavapipe has no hardware decoder.
Use offscreen locally and audio dry-run, null-backend or file-output modes.
Sandboxed runs can fail when scratch TCP servers cannot bind or LSan cannot
inspect processes through ptrace. Run on a host that permits both operations
to verify these checks with leak detection enabled.

### GPU leak attribution

The supplied tracks UI allocation stacks mostly end inside uninstrumented
Qt after one frame. Vulkan's remaining stacks name only `<unknown module>`.
Neither justifies a broad Qt or NVIDIA suppression. Rerun these two tests on
the GPU with slow unwinding, keeping the same Qt and NVIDIA libraries loaded.
These environment options intentionally use `--test-dir`: a test preset would
override `ASAN_OPTIONS` supplied in the shell.

```bash
unset NT_NO_HW_DECODE
ASAN_OPTIONS="detect_leaks=1:protect_shadow_gap=0:fast_unwind_on_malloc=0:malloc_context_size=64:halt_on_error=1:abort_on_error=0:suppressions=$PWD/tools/sanitizers/asan.supp" \
UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1:suppressions=$PWD/tools/sanitizers/ubsan.supp" \
LSAN_OPTIONS="suppressions=$PWD/tools/sanitizers/lsan.supp" \
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a \
ctest --test-dir build-sanitize -j 1 --output-on-failure \
  -R '^tst_(tracksui|vulkaninterop)$' --output-log build-sanitize/leak-attribution.log
```

If slow unwinding still cannot name a library, capture loaded-module mappings
and matching debug symbols on that machine before assigning ownership.

## Hardening and annotations

`NT_HARDENING=ON` is the default in every build. Directory options cover
Yoga, libraries, generated code and tests. libstdc++ gets assertions,
libc++ gets its fast hardening mode, optimized glibc builds get
`-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3`, and GCC/Clang get strong stack
protection and zero-initialized automatic variables. MSVC skips these flags.
GCC 13 and newer get `-Wdangling-reference`. Clang gets `-Wthread-safety`.

`src/platform/ThreadSafety.h` supplies `nt::Mutex`, `nt::MutexLocker` and
capability macros. It compiles with empty attributes on other compilers.
Existing classes are outside package V's allowed files and are not annotated.
[compiler-warnings.md](compiler-warnings.md) records existing compiler warnings.

## Repeatable defect checks

```bash
node tools/sanitizers/check-plants.mjs --self-test
node tools/sanitizers/check-plants.mjs hardened
node tools/sanitizers/check-plants.mjs sanitize
node tools/sanitizers/check-plants.mjs tsan
node tools/sanitizers/check-plants.mjs fuzz
```

Each mode configures the matching directory with `NT_SANITIZER_PLANTS=ON`,
builds only its plants at low priority, checks the expected report and
non-zero exit, and disables plants again in `finally`. The hardened plant uses
a separate `build-plants/` directory with GCC Release and libstdc++. It never
enables plants in the normal `build/` directory. The sanitizer mode checks UAF,
signed overflow and a lost allocation under LSan, and proves CTest fails on
the UAF. The self-test rejects a clean executable as an invalid plant and
checks CTest rejects report text from a
successful process. An unavailable runtime or missing report fails the script.
The fuzzer mutates a near-match seed with a dictionary and fixed seed,
with bounded runs and time. Scratch corpus and crash files are removed.
Plant logs remain in the ignored build directories.

## Clang-tidy

```bash
node tools/sanitizers/clang-tidy-baseline.mjs build-sanitize
# Deliberately exits 1 after clang-tidy flags a scratch owning-memory defect.
node tools/sanitizers/clang-tidy-baseline.mjs --self-test
```

The script uses `/usr/bin/run-clang-tidy` with three low-priority workers
and a Clang compilation database. Only `src/` and `tests/` translation units
are selected. Only diagnostics in those directories are compared. Third-party
and build-generated files are excluded. Compiler errors fail the run.
Diagnostics are unique `file | check | message` strings without line or column.
A new string fails the command and is printed. Removed diagnostics are allowed.
The script rejects an empty source selection. Its self-test creates a temporary
source under `tests/fuzz/` with its own compilation database, invokes the same
check mode against the real baseline, requires exit 1 and an owning-memory
diagnostic, then removes the source and database.

The first measured diagnostics are checked into
[clang-tidy-baseline.json](clang-tidy-baseline.json). After reviewing an intended
baseline change, regenerate with `--write`. Never regenerate to hide a new
warning. No individual checks are disabled.

## Fuzzing

```bash
cmake --preset fuzz -DCMAKE_PREFIX_PATH="$QT_PREFIX" \
  -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
nice -n 10 cmake --build build-fuzz -j 3 --target fuzz_timeline_json fuzz_media_probe
QT_QPA_PLATFORM=offscreen ctest --preset fuzz
# Direct fuzzer invocations do not inherit the CTest preset environment.
export ASAN_OPTIONS="detect_leaks=1:protect_shadow_gap=0:halt_on_error=1:abort_on_error=0:suppressions=$PWD/tools/sanitizers/asan.supp"
export UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1:suppressions=$PWD/tools/sanitizers/ubsan.supp"
export LSAN_OPTIONS="suppressions=$PWD/tools/sanitizers/lsan.supp"
mkdir -p build-fuzz/artifacts
QT_QPA_PLATFORM=offscreen build-fuzz/tests/fuzz/fuzz_timeline_json \
  -max_total_time=600 -timeout=10 -max_len=65536 \
  -dict=tests/fuzz/timeline_json.dict -artifact_prefix=build-fuzz/artifacts/ \
  build-fuzz/tests/fuzz/corpus/timeline_json
QT_QPA_PLATFORM=offscreen build-fuzz/tests/fuzz/fuzz_media_probe \
  -max_total_time=600 -timeout=10 -max_len=65536 \
  -artifact_prefix=build-fuzz/artifacts/ build-fuzz/tests/fuzz/corpus/media_probe
```

`NT_FUZZ=ON` requires Clang and rejects TSan. Project libraries receive
`fuzzer-no-link,address,undefined` instrumentation. Entry points link
`fuzzer,address,undefined`. The parser accepts raw JSON bytes. The probe uses
a `QTemporaryFile`, closes and removes it after each input, and never starts
playback. The seed media are under 1 KB each. Regenerate them with
`bash tests/fuzz/generate-media-seeds.sh`. CMake copies seed corpora into the
build tree. Fuzzer mutations never write into the checked-in seed directories.
CTest runs 2,000 inputs per target with a two-minute timeout.

## Default hardened build

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_PREFIX_PATH="$QT_PREFIX" -DNT_HARDENING=ON \
  -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
nice -n 10 cmake --build build -j 3
QT_QPA_PLATFORM=offscreen NT_NO_HW_DECODE=1 ctest --test-dir build -j 2 \
  -E 'tst_editpreview|tst_vulkaninterop|tst_tracksui' --output-on-failure
node scripts/op-conformance.mjs --bin build/timeline-ops
```

## Integration baseline

[baseline.md](baseline.md) records observed sanitizer findings with file,
line, kind, stack and wave 1 owner from
[the manifest](../../docs/gaps-manifest.json). The integration stage runs the
sanitize preset after each merge. A report absent from that baseline fails
the merge. The baseline is a reviewed inventory, not an automatic stack matcher.
A measured exemption also needs a narrow suppression in the matching `.supp`
file, with a comment referring to the entry. The owning package fixes the
report and removes both the exemption and the entry. Unresolved leak entries
are investigative records, remain unsuppressed, and still fail CTest.
Unowned project files require a decision from the maintainer. Package V does
not change them. Environmental failures and unrun GPU tests are recorded
separately from defects.
