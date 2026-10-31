1. **F1 — P2: the new WARP check conflicts with the prototype’s imported hardware device.**  
   [native-timeline.yml:179](.github/workflows/native-timeline.yml:179) requests software rendering, and [line 187](.github/workflows/native-timeline.yml:187) requires WARP’s adapter-selection messages. However, [HwWindow.cpp:87](native/timeline/src/preview/hw/HwWindow.cpp:87) creates and imports a hardware D3D11 device whenever creation succeeds. On such a Windows runner, Qt cannot select WARP and skips adapter enumeration, so successful rendering fails the new CI check. This follows from [Qt’s imported-device branch](https://github.com/qt/qtbase/blob/v6.12.0/src/gui/rhi/qrhid3d11.cpp#L220).  
   **Fix:** honor the software-renderer preference before creating the custom device, allowing Qt to create WARP. This is a conditional configuration defect, not an observed Windows CI failure.

2. **F2 — P2: the new Mach-O validator accepts static-link stubs as runtime libraries.**  
   [macho-deps.py:113](native/timeline/scripts/macho-deps.py:113) explicitly accepts `MH_DYLIB_STUB`. A dependency replaced with a same-architecture stub therefore passes this check, although [dyld’s runtime file-type validation rejects it](https://github.com/apple-oss-distributions/dyld/blob/main/common/MachOAnalyzer.cpp#L225). An unused plugin can escape the exercised smoke paths. An in-memory header substitution reproduced acceptance, and none of the six new tests covers stubs.  
   **Fix:** require `MH_DYLIB` and add a negative stub-library test.

3. **F3 — P2: the new notice checker accepts licence pointers as complete texts.**  
   [macho-deps.py:294](native/timeline/scripts/macho-deps.py:294) collects root-level licence filenames, while [line 440](native/timeline/scripts/macho-deps.py:440) treats any non-SPDX file of at least 200 bytes as complete. The installed FreeType `LICENSE.TXT` is 2,149 bytes but points to `docs/FTL.TXT` and `docs/GPLv2.TXT`. D-Bus `COPYING` similarly points to separate texts. Both generated component records pass `notices_check` without those texts.  
   **Fix:** collect the referenced full texts using component-specific mappings and test these actual pointer-file cases.

Earlier findings from `rv2-pkg.out`:

| Finding | Status | Evidence |
|---|---|---|
| **Prior F1 — Linux/Windows rendering** | **Fixed in part** | Linux now uses xcb/Xvfb at [workflow:162](.github/workflows/native-timeline.yml:162). Windows removes offscreen QPA, but new F1 above remains. |
| **Prior F2 — seek failures exit zero** | **Fixed** | Gate failures update status at [window-checks.sh:108](native/timeline/scripts/window-checks.sh:108). The summary exits nonzero at [line 352](native/timeline/scripts/window-checks.sh:352), with propagation at line 198. Injected failures confirmed both paths. |
| **Prior F3 — Windows package contamination** | **Fixed for the reported causes** | [Workflow:213](.github/workflows/native-timeline.yml:213) relocates the package. Lines 220–232 sanitize the environment and exercise QML rendering and decoding. Windows execution remains unverified. |
| **Prior F4 — wrong Qt source version** | **Fixed** | [macho-deps.py:268](native/timeline/scripts/macho-deps.py:268) reads installed-keg metadata. [Line 459](native/timeline/scripts/macho-deps.py:459) rejects framework/source version mismatches. Negative probes confirmed rejection. |
| **Prior F5 — directories accepted as libraries** | **Fixed for the reported case** | [macho-deps.py:77](native/timeline/scripts/macho-deps.py:77) requires a regular file. Directory, text, executable and wrong-architecture cases have tests. New F2 identifies another unsupported file type. |

The report also carried these older findings forward:

| Older finding | Status after this commit | Evidence |
|---|---|---|
| **F4 — Windows downloads** | **Remains fixed** | Pinned names and hashes remain at [workflow:110](.github/workflows/native-timeline.yml:110). Downloads were not repeated. |
| **F5 — DLL discovery/Bash** | **Remains fixed** | [Workflow:106](.github/workflows/native-timeline.yml:106), [CMakeLists.txt:325](native/timeline/CMakeLists.txt:325). |
| **F6 — headless rendering** | **Fixed in part** | Same disposition as prior F1 above. |
| **F8 — licence/source materials** | **Fixed in part** | Bundle-derived coverage now exists at [macho-deps.py:320](native/timeline/scripts/macho-deps.py:320), but new F3 remains. |
| **F9 — GPL scan false negative** | **Remains fixed** | Producer failure and completed-output scanning remain at [check-package-macos.sh:74](native/timeline/scripts/check-package-macos.sh:74). |
| **F10 — unresolved bundle paths** | **Fixed in part** | Resolution and containment checks remain at [macho-deps.py:199](native/timeline/scripts/macho-deps.py:199). New F2 remains. |
| **F11 — proxy-audio reference** | **Remains fixed per supplied review** | Handling remains at [TimelineJson.cpp:157](native/timeline/src/model/TimelineJson.cpp:157) and [check-mix.mjs:181](native/timeline/scripts/check-mix.mjs:181). Outside this review’s diff scope. |
| **F12 — M6 exit criteria** | **Fixed in part; criteria remain open** | Packaging remains unverified at [README.md:706](native/timeline/README.md:706), and reference-machine budgets remain unmeasured. |

Verification:

- **Qt strings are correct.** Both workflow patterns match Qt 6.12’s [D3D11 messages](https://github.com/qt/qtbase/blob/v6.12.0/src/gui/rhi/qrhid3d11.cpp#L258-L268) and [Vulkan messages](https://github.com/qt/qtbase/blob/v6.12.0/src/gui/rhi/qrhivulkan.cpp#L560-L574). Both pipelines accepted source-shaped selected-adapter logs and rejected enumeration without selection.
- **Mutation checks:** all six Mach-O test bodies passed with mocked filesystem/`otool` boundaries and failed under targeted mutations. The 16 newly registered JavaScript tests passed normally, and each failed under a targeted in-memory mutation. These establish assertion sensitivity, not full integration coverage.
- **Other checks:** seek failure propagation, notice/version rejection probes, and shell syntax passed. Pointer-only notices and Mach-O stubs demonstrated false acceptance.

The native Mach-O suite could not create temporary fixtures under read-only permissions. Its existing `build-r2` log records six passing tests. Running `build-r2/tst_editpreview` on the default platform aborted before rendering because the sandbox exposed no screens.

I did not verify Windows/Linux execution, complete packaging, clean-machine deployment, native C++ mutations, or runtime lifetime/threading outside the scoped files. No files were edited, builds rebuilt, servers started, port 7777 accessed, visible windows opened, or sound played.