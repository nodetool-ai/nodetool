# Compiler warning baseline

## GCC Release

A clean default build with GCC 16, `NT_HARDENING=ON`, `-Wall -Wextra` and
`-Wdangling-reference` completes without compiler warnings. The compilation
database includes `-Wdangling-reference` and the hardening flags on every
translation unit, including Yoga and generated Qt sources. Reproduce with:

```bash
nice -n 10 cmake --build build --clean-first -j 3
```

The measured build log is `/tmp/pkg-v-gcc-build.log` in the verification
session. No out-of-scope source changes are needed for GCC warnings.

## Clang RelWithDebInfo

The supplied full TSan build log (`V-evidence/build-tsan-1.log`) contains the
following warning. It occurs in `nodetool-timeline`, `tst_seamexample`,
`tst_inspectorprimitives` and `tst_tracksui`.

| File | Flag | Text |
|---|---|---|
| Generated `nt_qml_panels.cpp:3` | `-Wunused-const-variable` | unused variable `qmlPanels` |

Its generator, `src/app/QmlDiscovery.cmake`, is outside package V's allowed
files. The prior Clang ASan build recorded the same diagnostic. The incremental
Clang rebuilds in this verification do not recompile that source.

Warnings remain `-Wall -Wextra` (`/W4` on MSVC). Neither `-Werror` nor
`-Wpedantic` is enabled globally. This inventory does not claim the tree
passes those additional flags.

## Thread-safety annotation check

No existing class has thread annotations yet. A scratch translation unit
using `nt::MutexLocker` compiles with `-Werror=thread-safety`. Removing the
locker fails with `writing variable 'guarded' requires holding mutex 'mutex'
exclusively`. GCC compiles the same header with empty annotation macros and
`-Wall -Wextra -Werror`. The scratch files are removed after verification.
