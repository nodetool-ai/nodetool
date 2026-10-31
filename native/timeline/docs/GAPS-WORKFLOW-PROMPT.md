# Gap Plan Workflow Prompt

Paste the text below into a session that has the Workflow tool. It
assumes a macOS machine with Homebrew and the Codex CLI. The paths are
relative to the repository root.

```text
Use a workflow. Run the gap plan of the native timeline prototype.

Setup, before any agent starts:
1. Check out the branch feat/native-timeline of git@github.com:nodetool-ai/nodetool.git. Put it in a git worktree if the clone has other work on it. All paths below are relative to the repository root.
2. Run scripts/setup-agent-env.sh, then npm run build:packages. The conformance checks import packages/timeline.
3. Install the native dependencies: brew install qt ninja ffmpeg. Read native/timeline/README.md, section "Build and test".
4. Make the fixture media: native/timeline/scripts/make-fixtures.sh.
5. Configure and build once: cmake -S native/timeline -B native/timeline/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=$(brew --prefix qt), then nice -n 10 cmake --build native/timeline/build -j 3. Run ctest -j 2 in it. If a test fails before any change, stop and report it.
6. Check that `codex exec -m gpt-6-astra` works. If it does not, stop and report it. Do not use a different reviewer.

The project is native/timeline/ (C++20, Qt 6 QML, QRhi on Metal, FFmpeg). The web version is the reference: web/src/components/timeline/ and packages/timeline/.

Inputs:
- native/timeline/docs/PLAN-GAPS.md: the plan, the rules for every package, the risks.
- native/timeline/docs/gaps-manifest.json: the packages with id, wave, needs, owns (files the package may edit), web (reference files), exit (exit criteria), plus mergeOrder, maxConcurrentBuilds and the review command.
- native/timeline/docs/reviews/round3-*.md: the last Codex review of each area (save, decode, ui, pkg).

Steps:
1. Step 0, fix round. Before S1, fix the findings in native/timeline/docs/reviews/round3-save.md, round3-decode.md, round3-ui.md and round3-pkg.md, one agent per report, in parallel. Fix all P1 and P2 findings, the confirmed macOS Mach port reuse in src/platform/CpuUsage.cpp, and the parts of earlier findings that the reports mark "fixed in part", except m5b F4. Review the fixes as in step 6, merge, then run the checks in step 5e.
2. Add two packages to PLAN-GAPS.md and gaps-manifest.json, in wave 1:
   - "T: server identity before a write". It closes m5b F4. The client must verify the server identity before it sends a mutation. A check on the response is not enough.
   - "U: linear transition resolver". It replaces the quadratic scan in resolveDocumentTransitions (src/preview/SceneEval.cpp) with a linear one that gives the same results as packages/timeline/src/render/transition.ts. plan-conformance is the oracle.
3. Run wave 0 (S1) alone. Merge it before wave 1 starts.
4. Run each wave in parallel. A package starts when all of its `needs` are merged. Run at most maxConcurrentBuilds (4) builds at a time.
5. For each package, one agent in its own git worktree, branched from the current feat/native-timeline:
   a. Read the package section in PLAN-GAPS.md and the web files in `web`. Copy the web UX and UI as closely as possible.
   b. Edit only the files in `owns`, plus new files in the package's own module folder. If a change to another file is necessary, stop and report it. Do not work around it.
   c. Write a test that fails first, then make it pass. Report the red and green evidence for each exit criterion.
   d. Build in a build directory of the worktree with nice -n 10 cmake --build <dir> -j 3. Run ctest with -j 2.
   e. Checks before the review: full ctest, node scripts/plan-conformance.mjs --bin <dir>/nodetool-timeline, node scripts/op-conformance.mjs --bin <dir>/timeline-ops, and node scripts/check-group-surfaces.mjs --bin <dir>/nodetool-timeline when the package changes rendering. Run them from native/timeline. All must pass with zero problems.
6. Review each package with the review command in the manifest (codex exec -m gpt-6-astra -s read-only ...) on the package diff. A fix agent fixes all P0 and P1 findings, and P2 findings that are small and inside the package's files. Then review the fixes again with the same command. Repeat until a review has no P0 or P1 finding, at most 3 rounds. If P0 or P1 findings remain after round 3, do not merge the package. Report it. P2 findings do not block a merge: the merge step records every P2 finding still open in the last review in [gaps-backlog.md](gaps-backlog.md).
7. Merge the packages into feat/native-timeline in mergeOrder, one at a time. After each merge, build and run the checks in step 5e on the merged tree. If a check fails, stop the merge and report.
8. At the end, run a completeness check: for each package, list each exit criterion with its evidence, and list the gaps that are still open.

Rules for all agents:
- Never open a visible window and never play sound. Run Qt tests with QT_QPA_PLATFORM=offscreen, except the tests with the ctest label "render", which use the windowless QQuickRenderControl path on the default platform. Put checks that need a window, a display or a speaker into scripts/window-checks.sh. Do not run them.
- Never send a request to a NodeTool server that the user runs (port 7777). For a server, use scripts/scratch-server.mjs with a fresh SECRETS_MASTER_KEY on another port.
- Edit only the worktrees of this run. Never edit web/ or packages/. They are the reference.
- Commit in each package worktree. Do not add a co-author line to a commit. Do not push. Do not start CI.
- Remove a package worktree and its build directory after its merge. Keep at least 20 GB of free disk space.

Output: a table with one row for each package: status (merged / not merged), commits, the review rounds, the open findings, and the exit criteria with evidence. After the table, list the decisions that need the user.
```
