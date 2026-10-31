# Gap Plan Workflow Prompt (Linux)

Paste the text below into a session that has the Workflow tool, on a
Linux machine (Ubuntu 24.04 or a similar distribution) with the Codex
CLI. The paths are relative to the repository root. The macOS version
is [GAPS-WORKFLOW-PROMPT.md](GAPS-WORKFLOW-PROMPT.md).

The native timeline was written and tested on macOS only. The Linux
code paths (VAAPI decode, DMA-BUF import into Vulkan, the Linux CPU
counter, miniaudio on ALSA or PulseAudio) compile in CI configuration
but have never run. So this prompt starts with a bring-up step.

```text
Use a workflow. Run the gap plan of the native timeline prototype on this Linux machine.

Setup, before any agent starts:
1. Check out the branch feat/native-timeline of git@github.com:nodetool-ai/nodetool.git. Put it in a git worktree if the clone has other work on it. All paths below are relative to the repository root.
2. Run scripts/setup-agent-env.sh, then npm run build:packages. The conformance checks and the golden stills import packages/timeline.
3. Install the native dependencies. Use the package list of the step "Install dependencies (Linux)" in .github/workflows/native-timeline.yml, plus libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev for a local FFmpeg. Install Qt with the version in QT_VERSION of that workflow: pipx run aqtinstall install-qt linux desktop <QT_VERSION> linux_gcc_64 -m qtshadertools -O ~/qt. Do not use the distribution's Qt package. It is too old.
4. Record the GPU: vulkaninfo --summary and vainfo. Use the real Vulkan driver if one exists. Use lavapipe (mesa-vulkan-drivers) only when no GPU driver exists. Report which one the run uses.
5. Make the fixture media: native/timeline/scripts/make-fixtures.sh.
6. Check that `codex exec -m gpt-6-astra` works. If it does not, stop and report it. Do not use a different reviewer.

The project is native/timeline/ (C++20, Qt 6 QML, QRhi, FFmpeg). The web version is the reference: web/src/components/timeline/ and packages/timeline/.

Inputs:
- native/timeline/docs/PLAN-GAPS.md: the plan, the rules for every package, the risks.
- native/timeline/docs/gaps-manifest.json: the packages with id, wave, needs, owns (files the package may edit), web (reference files), exit (exit criteria), plus mergeOrder, maxConcurrentBuilds and the review command.
- native/timeline/docs/reviews/round3-*.md: the last Codex review of each area (save, decode, ui, pkg).
- .github/workflows/native-timeline.yml: the Linux CI steps show the environment for tests (Xvfb, xcb, Vulkan).

How to run the tests on Linux:
- Window-event tests: QT_QPA_PLATFORM=offscreen (their ctest ENVIRONMENT sets it).
- Tests with the ctest label "render" and any test that needs a QRhi: xvfb-run -a -s "-screen 0 1920x1080x24" with QT_QPA_PLATFORM=xcb and QSG_RHI_BACKEND=vulkan. Xvfb shows nothing on the screen, so this obeys the window rule below.
- The full run is: xvfb-run -a -s "-screen 0 1920x1080x24" ctest --test-dir <dir> -j 2 --output-on-failure, with QT_QPA_PLATFORM=xcb and QSG_RHI_BACKEND=vulkan.

Steps:
1. Step L, Linux bring-up. One agent, before every other step:
   a. Configure: cmake -S native/timeline -B native/timeline/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=~/qt/<QT_VERSION>/gcc_64. Build with nice -n 10 cmake --build native/timeline/build -j 3.
   b. Make the build, the full ctest run, plan-conformance, op-conformance and check-group-surfaces pass on Linux. Fix Linux defects in the Linux code paths only. Do not change the macOS or Windows paths.
   c. Run the hardware path on the real driver: VAAPI decode, DMA-BUF import into Vulkan, release back to VA. Use --decode hw on the fixtures and compare the stills with --decode sw (PSNR at least 40 dB). Run with the Vulkan validation layer (VK_LOADER_LAYERS_ENABLE=*validation*) and report every validation message. If the machine has no VAAPI driver, say so and skip this part.
   d. Write the Linux results into native/timeline/README.md, section "Build and test": the commands, the driver, and the tests that are skipped on Linux and why.
   e. Review and merge as in steps 7 and 8. The later steps start from this merge.
2. Step 0, fix round. Fix the findings in native/timeline/docs/reviews/round3-save.md, round3-decode.md, round3-ui.md and round3-pkg.md, one agent per report, in parallel. Fix all P1 and P2 findings, and the parts of earlier findings that the reports mark "fixed in part", except m5b F4. Fix only what this machine can build and test:
   - Fix and test on Linux: the save findings, decode F1 and F2, the Vulkan release on renderer restart, the UI findings (UI F1 means the FIFO test must compile on Windows: put it behind Q_OS_UNIX), the peaks check.
   - Leave open and list in the output: the macOS Mach port reuse in src/platform/CpuUsage.cpp, pkg F1 (D3D11 WARP), pkg F2 and F3 (macOS bundle checks). They need macOS or Windows.
   Review the fixes as in step 7, merge, then run the checks in step 6e.
3. Add two packages to PLAN-GAPS.md and gaps-manifest.json, in wave 1:
   - "T: server identity before a write". It closes m5b F4. The client must verify the server identity before it sends a mutation. A check on the response is not enough.
   - "U: linear transition resolver". It replaces the quadratic scan in resolveDocumentTransitions (src/preview/SceneEval.cpp) with a linear one that gives the same results as packages/timeline/src/render/transition.ts. plan-conformance is the oracle.
4. Run wave 0 (S1) alone. Merge it before wave 1 starts.
5. Run each wave in parallel. A package starts when all of its `needs` are merged. Run at most maxConcurrentBuilds (4) builds at a time.
6. For each package, one agent in its own git worktree, branched from the current feat/native-timeline:
   a. Read the package section in PLAN-GAPS.md and the web files in `web`. Copy the web UX and UI as closely as possible.
   b. Edit only the files in `owns`, plus new files in the package's own module folder. If a change to another file is necessary, stop and report it. Do not work around it.
   c. Write a test that fails first, then make it pass. Report the red and green evidence for each exit criterion.
   d. Do not edit code inside an `#ifdef` for macOS (Q_OS_MACOS, __APPLE__, VideoToolbox, Metal) or Windows (Q_OS_WIN, D3D11). This machine cannot build it. If a package needs such a change, write it, mark it "unbuilt on this machine", and list it in the output.
   e. Build in a build directory of the worktree with nice -n 10 cmake --build <dir> -j 3. Checks before the review, from native/timeline: the full ctest run under Xvfb, node scripts/plan-conformance.mjs --bin <dir>/nodetool-timeline, node scripts/op-conformance.mjs --bin <dir>/timeline-ops, and node scripts/check-group-surfaces.mjs --bin <dir>/nodetool-timeline (under Xvfb) when the package changes rendering. All must pass with zero problems.
7. Review each package with the review command in the manifest (codex exec -m gpt-6-astra -s read-only ...) on the package diff. Tell the reviewer that the machine is Linux and which Vulkan driver it uses. A fix agent fixes all P0 and P1 findings, and P2 findings that are small and inside the package's files. Then review the fixes again with the same command. Repeat until a review has no P0 or P1 finding, at most 3 rounds. If P0 or P1 findings remain after round 3, do not merge the package. Report it. P2 findings do not block a merge: the merge step records every P2 finding still open in the last review in [gaps-backlog.md](gaps-backlog.md).
8. Merge the packages into feat/native-timeline in mergeOrder, one at a time. After each merge, build and run the checks in step 6e on the merged tree. If a check fails, stop the merge and report.
9. At the end, run a completeness check: for each package, list each exit criterion with its evidence, mark the criteria that only macOS or Windows can verify, and list the gaps that are still open.

Rules for all agents:
- Never open a window on the user's display and never play sound. Run every GUI process under xvfb-run or with QT_QPA_PLATFORM=offscreen. Unset DISPLAY and WAYLAND_DISPLAY in every agent shell before a test. For audio, use the dry-run and file-output modes of the app only.
- Never send a request to a NodeTool server that the user runs (port 7777). For a server, use scripts/scratch-server.mjs with a fresh SECRETS_MASTER_KEY on another port.
- Edit only the worktrees of this run. Never edit web/ or packages/. They are the reference.
- Commit in each package worktree. Do not add a co-author line to a commit. Do not push. Do not start CI.
- Remove a package worktree and its build directory after its merge. Keep at least 20 GB of free disk space.

Output: a table with one row for each package: status (merged / not merged), commits, the review rounds, the open findings, the exit criteria with evidence, and the criteria that need macOS or Windows. After the table, list the Linux bring-up results (driver, hardware decode, validation messages) and the decisions that need the user.
```
