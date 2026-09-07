# Agentic GitHub Workflow Reference

These are the GitHub Actions definitions removed from this repository. Recreate their schedules, event filters, permissions, setup steps, prompts, and follow-up behavior in the external orchestrator.

## .github/workflows/abstraction-improver.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Abstraction Improver

# Flattens abstractions that carry no variation: an interface with one
# implementation, a factory that returns one thing, a wrapper that only
# forwards, a barrel that only re-exports, a type parameter used once.
#
# Each of them costs a hop when reading and a file when navigating, and pays for
# it only if a second implementation ever arrives. This routine removes the ones
# where it did not. The seams that carry real variation — LLM providers, storage
# backends, vector stores, execution surfaces — are explicitly out of scope.

on:
  schedule:
    - cron: "30 8 * * *" # Daily at 08:30 UTC
  workflow_dispatch:

jobs:
  abstraction-improver:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Find abstractions with one implementation
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          node --input-type=module - <<'JS' > thin-abstractions.log
          import { readFileSync } from "node:fs";
          import { execFileSync } from "node:child_process";

          const files = execFileSync(
            "bash",
            [
              "-c",
              "git ls-files 'web/src/*.ts' 'web/src/*.tsx' 'electron/src/*.ts' " +
                "'mobile/src/*.ts' 'mobile/src/*.tsx' 'packages/*/src/*.ts' " +
                "| grep -vE '__tests__|\\.test\\.|\\.spec\\.|/generated/|\\.d\\.ts$'",
            ],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
          )
            .split("\n")
            .filter(Boolean);

          const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
          const corpus = [...sources.values()].join("\n");

          const countRefs = (name) =>
            (corpus.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;

          console.log("## Interfaces with exactly one implementer");
          // A props/options/result type is a record shape, not an abstraction —
          // it has nothing to flatten. What matters here is an interface that
          // declares behavior and has one implementation of it.
          const SHAPE_SUFFIX = /(Props|Options|Params|Result|Deps|Config|State|Snapshot|Payload|Args)$/;
          for (const [file, source] of sources) {
            for (const match of source.matchAll(
              /export (?:interface|abstract class) ([A-Z][A-Za-z0-9]*)[^{]*\{([\s\S]*?)\n\}/g,
            )) {
              const [, name, body] = match;
              if (SHAPE_SUFFIX.test(name)) continue;
              const methods = (body.match(/^\s+[a-zA-Z][A-Za-z0-9]*(\??\s*\(|\??:\s*\()/gm) ?? []).length;
              if (methods === 0) continue;
              const implementers = (corpus.match(new RegExp(`(?:implements|extends) ${name}\\b`, "g")) ?? []).length;
              if (implementers === 1) {
                console.log(`  ${file}  ${name}  methods=${methods}  implementers=1  refs=${countRefs(name)}`);
              }
            }
          }

          console.log("");
          console.log("## Barrel files that only re-export");
          for (const [file, source] of sources) {
            const lines = source.split("\n").filter((line) => line.trim() && !line.trim().startsWith("//"));
            if (lines.length < 3) continue;
            if (lines.every((line) => /^\s*export .*from ["']/.test(line))) {
              // Importers of the barrel, by the directory it fronts. Counting
              // the word "index" instead would match every occurrence of it in
              // the repo and report a number that means nothing.
              const dir = file.replace(/\/index\.tsx?$/, "").split("/").pop();
              const importers = (corpus.match(new RegExp(`from "[^"]*/${dir}(/index)?"`, "g")) ?? []).length;
              console.log(`  ${file}  ${lines.length} re-exports  importers=${importers}`);
            }
          }

          console.log("");
          console.log("## Exported functions that only forward to one call");
          for (const [file, source] of sources) {
            // export const f = (a) => g(a)  /  export function f(a) { return g(a) }
            for (const match of source.matchAll(
              /export (?:const ([a-zA-Z][A-Za-z0-9]*) *(?::[^=]+)?= *(?:async )?\([^)]*\) *=> *([a-zA-Z][A-Za-z0-9.]*)\([^)]*\);?|function ([a-zA-Z][A-Za-z0-9]*)\([^)]*\)[^{]*\{\s*return ([a-zA-Z][A-Za-z0-9.]*)\([^)]*\);?\s*\})/g,
            )) {
              const name = match[1] ?? match[4];
              const delegate = match[2] ?? match[5];
              if (!name || name === delegate) continue;
              console.log(`  ${file}  ${name} -> ${delegate}  refs=${countRefs(name)}`);
            }
          }

          console.log("");
          console.log("## Single-method classes");
          for (const [file, source] of sources) {
            for (const match of source.matchAll(/export class ([A-Z][A-Za-z0-9]*)[^{]*\{([\s\S]*?)\n\}/g)) {
              const [, name, body] = match;
              const methods = (body.match(/^\s{2}(?:public |private |protected )?(?:async )?[a-zA-Z][A-Za-z0-9]*\s*\(/gm) ?? []).length;
              if (methods === 1 && !/extends|implements/.test(match[0].slice(0, 120))) {
                console.log(`  ${file}  ${name}  methods=1  refs=${countRefs(name)}`);
              }
            }
          }
          JS

          echo "## Thin Abstractions" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -70 thin-abstractions.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          # The scan prints its four section headers whatever it finds, so
          # emptiness is measured by the indented findings under them.
          FINDINGS=$(grep -c "^  " thin-abstractions.log || true)
          echo "Findings: $FINDINGS" >> $GITHUB_STEP_SUMMARY
          if [ "${FINDINGS:-0}" -gt 0 ]; then echo "THIN_FOUND=1" >> $GITHUB_ENV; else echo "THIN_FOUND=0" >> $GITHUB_ENV; fi

      - name: Run quality checks baseline
        if: env.THIN_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.THIN_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Flatten an Over-Engineered Abstraction

            `thin-abstractions.log` groups candidates into four kinds:
            interfaces with a single implementer, barrel files that only
            re-export, exported functions that only forward to one call, and
            classes with one method.

            Read `.claude/skills/codebase-design/SKILL.md` for the vocabulary
            this repo uses to talk about module depth. Prefer removing a shallow
            layer over deepening it.

            Pick **one** abstraction and remove the indirection.

            ## What to remove
            - **Interface with one implementer** and no second one in sight:
              delete the interface, use the concrete type. Keep it when it exists
              to break a dependency cycle or to let tests substitute a fake —
              check for both before deleting.
            - **Wrapper that only forwards**: inline it at the call sites and
              delete it. Keep it when it adapts types, narrows a surface
              deliberately, or is a package's public entry point.
            - **Barrel that only re-exports**: point the importers at the real
              modules and delete the barrel. Keep a package's own `index.ts` —
              that is its API.
            - **Class with one method** that holds no state: make it a function.
            - **Generic parameter used once**: replace it with the concrete type.
            - **Config object with one caller** passing the same literal every
              time: take the value as an argument.

            ## What to leave alone
            These seams carry real variation and are load-bearing:
            - `packages/runtime/src/providers/**` — one interface, many providers.
            - Storage backends, vector stores, secret stores.
            - `@nodetool-ai/execution`'s `ExecutionSession` facade — several
              surfaces go through it on purpose
              (`scripts/check-execution-boundary.mjs` enforces that).
            - `web/src/components/ui_primitives/**` — the primitives layer is
              mandatory by AGENTS.md, however thin an individual primitive looks.
            - The protocol types shared by web, mobile and the backend.
            - Anything a public API, a plugin, or a sandbox pack depends on.

            An abstraction with one implementation **today** but an obvious
            second one arriving (a provider, a backend, an OS) stays.

            ## Rules
            - Behavior-preserving. No feature or bug-fix changes.
            - Update every call site. Do not leave a deprecated alias behind.
            - Do not replace one abstraction with another. The diff should be
              net-negative in lines and in files.
            - One abstraction per PR. Maximum 15 files.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if an abstraction PR
              is already open.

            ## Verification
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```
            Backend packages also need `npm run build:packages && npm run test:packages`.

            ## Submit
            Create a PR titled "refactor: flatten <abstraction>" explaining what
            the layer was for, why nothing needs it, and what now calls what.

      - name: Post-change verification
        if: always() && env.THIN_FOUND == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/abstraction-police.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Abstraction Police

# Enforces the layering AGENTS.md describes: the package dependency order, the
# `@nodetool-ai/<package>` import rule, no reaching into another package's
# `dist/` or `src/`, the ui_primitives boundary in the frontend, and the
# Electron main/renderer split.
#
# The repo already ships boundary checks — check:deps, check:circular,
# check:keys, check:coupled-deps, check:execution-boundary — and they run in
# `npm run check`. This runs them plus the greps for violations no script covers
# yet, and has the agent fix the layering rather than widen an allowlist.

on:
  schedule:
    - cron: "30 4 * * *" # Daily at 04:30 UTC
  workflow_dispatch:

jobs:
  abstraction-police:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run the repo's boundary checks
        id: checks
        continue-on-error: true
        shell: bash
        run: |
          echo "## Boundary Checks" >> $GITHUB_STEP_SUMMARY
          : > layering-violations.log
          VIOLATIONS=0

          for check in check:deps check:circular check:keys check:coupled-deps check:execution-boundary; do
            if npm run "$check" > "/tmp/$check.log" 2>&1; then
              echo "- OK: $check" >> $GITHUB_STEP_SUMMARY
            else
              VIOLATIONS=1
              echo "- FAIL: $check" >> $GITHUB_STEP_SUMMARY
              { echo "### npm run $check"; echo '```'; tail -60 "/tmp/$check.log"; echo '```'; echo; } >> layering-violations.log
            fi
          done

          echo "SCRIPT_VIOLATIONS=$VIOLATIONS" >> $GITHUB_ENV

      - name: Grep for violations no script covers
        id: grep
        continue-on-error: true
        shell: bash
        run: |
          echo "## Import-Rule Violations" >> $GITHUB_STEP_SUMMARY
          FOUND=0

          record() {
            local title="$1"; local file="$2"
            if [ -s "$file" ]; then
              FOUND=1
              COUNT=$(wc -l < "$file" | tr -d ' ')
              echo "- $title: $COUNT" >> $GITHUB_STEP_SUMMARY
              { echo "### $title"; echo '```'; head -40 "$file"; echo '```'; echo; } >> layering-violations.log
            else
              echo "- $title: 0" >> $GITHUB_STEP_SUMMARY
            fi
          }

          # AGENTS.md: never import from dist/, and never reach into another
          # package's src/ — inter-package imports go through the package name.
          grep -rEn "from \"[^\"]*@nodetool-ai/[a-z-]+/(dist|src)/" \
            --include="*.ts" --include="*.tsx" \
            packages/*/src web/src electron/src mobile/src 2>/dev/null > /tmp/deep-imports.log || true
          record "Deep imports into another package's dist/ or src/" /tmp/deep-imports.log

          # Relative paths that climb out of one workspace into another.
          grep -rEn "from \"(\.\./)+(packages|web|electron|mobile)/" \
            --include="*.ts" --include="*.tsx" \
            packages/*/src web/src electron/src mobile/src 2>/dev/null > /tmp/relative-crossing.log || true
          record "Relative imports crossing a workspace boundary" /tmp/relative-crossing.log

          # AGENTS.md: raw MUI is allowed only inside ui_primitives/ and editor_ui/.
          grep -rEn "from \"@mui/(material|icons-material)" \
            --include="*.tsx" --include="*.ts" web/src 2>/dev/null \
            | grep -vE "web/src/components/(ui_primitives|editor_ui)/" > /tmp/raw-mui.log || true
          record "Raw MUI imports outside ui_primitives/ and editor_ui/" /tmp/raw-mui.log

          # Node builtins in the renderer: the frontend has no Node runtime, and
          # reaching for one means the boundary was crossed somewhere upstream.
          grep -rEn "from \"(node:)?(fs|path|child_process|os|net|worker_threads)\"" \
            --include="*.ts" --include="*.tsx" web/src mobile/src 2>/dev/null > /tmp/node-builtins.log || true
          record "Node builtins imported in a renderer surface" /tmp/node-builtins.log

          # Electron: the renderer talks to the main process through the
          # contextBridge preload, never through electron's own module.
          grep -rEn "from \"electron\"" --include="*.ts" --include="*.tsx" \
            electron/src/renderer 2>/dev/null > /tmp/electron-renderer.log || true
          record "electron imported from the renderer" /tmp/electron-renderer.log

          echo "GREP_VIOLATIONS=$FOUND" >> $GITHUB_ENV

      - name: Decide whether there is anything to fix
        run: |
          if [ "$SCRIPT_VIOLATIONS" = "1" ] || [ "$GREP_VIOLATIONS" = "1" ]; then
            echo "LAYERING_VIOLATIONS=1" >> $GITHUB_ENV
          else
            echo "LAYERING_VIOLATIONS=0" >> $GITHUB_ENV
          fi

      - name: Run quality checks baseline
        if: env.LAYERING_VIOLATIONS == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.LAYERING_VIOLATIONS == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Fix Layering Violations

            `layering-violations.log` holds the output of the repo's boundary
            checks and the import greps that found something.

            ## The layering, from AGENTS.md
            Package dependency order — imports go left to right, never back:
            ```
            protocol → config → security → auth → storage
                                         → runtime → kernel → node-sdk → base-nodes
                                         → models → agents → chat → websocket ← cli
            ```
            Plus:
            - Inter-package imports use `@nodetool-ai/<package>`. Never
              `dist/`, never another package's `src/`, never a relative path
              that climbs out of the workspace.
            - `web/` and `mobile/` are renderer surfaces: no Node builtins.
            - Mobile shares exactly two packages: `@nodetool-ai/protocol` and
              `@nodetool-ai/app-runtime`.
            - Raw MUI imports belong only in `web/src/components/ui_primitives/`
              and `editor_ui/`. Everything else uses the primitives.
            - The Electron renderer reaches the main process through the
              `contextBridge` preload API, never by importing `electron`.
            - `WorkflowRunner` is constructed only in `@nodetool-ai/execution`
              (`scripts/check-execution-boundary.mjs`).

            ## How to fix a violation
            Fix the direction of the dependency, not the check:
            - **Wrong-direction import** → move the shared type or helper down to
              a package both sides already depend on (often `protocol` or
              `config`), or invert the dependency by passing the value in.
            - **Deep import** → export the symbol from the package's entry point
              and import it by package name. If it is not meant to be public,
              that is the real finding: say so and move the caller instead.
            - **Relative crossing** → same fix, via the workspace package name.
              Add the dependency to the importing package's `package.json`
              (`npm run check:deps` verifies that).
            - **Node builtin in a renderer** → move the work behind the API the
              renderer already talks to (HTTP route, IPC handler, preload).
            - **Raw MUI** → use the primitive, or add one to `ui_primitives/`
              following its STRATEGY.md.
            - **Cycle** → break it by extracting the shared piece into the lower
              package. Do not paper over it with a dynamic import.

            ## Rules
            - **Never widen an allowlist to make a check pass.** The grandfathered
              list in `check-execution-boundary.mjs` may only shrink. If a
              violation genuinely cannot be fixed now, leave it, and say why in
              the PR body — do not add an entry.
            - Do not delete or weaken a check script.
            - Do not move code across a package boundary to hide a violation
              unless the destination is where the code belongs on its own merits.
            - One boundary per PR. Maximum 15 files.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a layering PR is
              already open.

            ## Verification
            ```bash
            npm run check:deps && npm run check:circular && npm run check:keys && \
              npm run check:coupled-deps && npm run check:execution-boundary
            npm run build:packages && npm run typecheck && npm run lint && npm run test
            ```
            Re-run the grep that found your violation and show it returns nothing.

            ## Submit
            Create a PR titled "refactor: fix <boundary> layering violation"
            naming the rule, the violating imports, and the direction the
            dependency now runs.

      - name: Post-change verification
        if: always() && env.LAYERING_VIOLATIONS == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/anti-slop-ratchet.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Anti-Slop Ratchet

# Drives (rule, tree) pairs of the anti-slop backlog to zero and ratchets what
# it wins. See AGENTS.md § anti-slop for the backlog/enforced config split.
#
# The measurement is the slow part: one oxlint invocation per tree, run three
# times over a full pass (scan, `:write`, `:check`). Budget for that, not for
# the edits.

on:
  schedule:
    - cron: "30 9 * * *" # Daily at 09:30 UTC
  workflow_dispatch:

jobs:
  anti-slop-ratchet:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Measure the backlog and pick targets
        id: targets
        run: |
          npm run lint:anti-slop:targets > /tmp/anti-slop-targets.md
          cat /tmp/anti-slop-targets.md >> $GITHUB_STEP_SUMMARY

          # Read the count rather than infer it. An unreadable measurement must
          # fail here: parsed as "0 pairs left" it would skip the agent and
          # report a clean nightly, which is the one wrong answer available.
          REMAINING=$(sed -n 's/^\([0-9]\{1,\}\) non-zero pairs remain.*/\1/p' /tmp/anti-slop-targets.md)
          if [ -z "$REMAINING" ]; then
            echo "Could not read the pair count from the measurement." >> $GITHUB_STEP_SUMMARY
            exit 1
          fi
          echo "REMAINING_PAIRS=$REMAINING" >> $GITHUB_ENV
          echo "$REMAINING non-zero (rule, tree) pairs remain." >> $GITHUB_STEP_SUMMARY

          # Which end of the backlog this run works. Decided here rather than
          # in the prompt: the mode has to be legible in the run summary, and
          # an agent asked to derive it from a run number is one arithmetic
          # slip away from never picking the large pairs at all.
          if [ $(( ${{ github.run_number }} % 4 )) -eq 0 ]; then
            PAIR_MODE=large
          else
            PAIR_MODE=cheap
          fi
          echo "PAIR_MODE=$PAIR_MODE" >> $GITHUB_ENV
          echo "Target selection for this run: **$PAIR_MODE**." >> $GITHUB_STEP_SUMMARY

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV
          echo "PKG_TEST_PRE_EXIT=$PKG_TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.REMAINING_PAIRS != '0'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff."
          prompt: |
            # Drive anti-slop (rule, tree) pairs to zero

            The vendored anti-slop Oxlint plugin runs through two configs: a
            backlog (`.oxlintrc.anti-slop.json`) and an enforced config
            (`.oxlintrc.anti-slop-enforced.json`) carrying every (rule, tree)
            pair already at zero. Read AGENTS.md § anti-slop first — it explains
            the split, the generated overrides, and which rules are holdouts.

            Your job: take pairs from backlog to enforced, by fixing the code.

            ## Today's measurement

            `npm run lint:anti-slop:targets` has already run. Read
            `/tmp/anti-slop-targets.md` — it holds the per-rule table, the trees
            closest to zero, and the cheapest remaining pairs. **Use it. Do not
            re-derive these numbers**: counting findings off a raw `oxlint` run
            silently mixes in oxlint's own default-rule diagnostics, which
            report through the same channel and are not backlog findings.

            To see the findings for one tree:
            ```bash
            npx oxlint --config .oxlintrc.anti-slop.json --format json packages/<name>/src \
              | jq '.diagnostics[] | select(.code | startswith("anti-slop"))'
            ```

            ## Picking scope

            **This run's target selection is `${{ env.PAIR_MODE }}`** — one run
            in four is `large`, the rest are `cheap`.

            **`cheap`:** prefer finishing one whole tree over scattering single
            fixes. One typecheck and one test run then cover several pairs at
            once, and a tree at zero on every rule cannot regress on any of
            them. Take the top tree from the "closest to zero" table that you
            can finish; if none is finishable, take cheap pairs from one
            package. Keep it to one package (plus any caller you must update).

            **`large`:** ignore both tables above and take the top row of
            "Largest (rule, tree) pairs" that no open PR is already working.
            Those pairs are never cheap and their trees are never nearly-done,
            so nothing in `cheap` mode ever selects them — `web` sat at
            thousands of findings and had a separate nightly workflow built for
            it, which these runs replace.

            A large pair does not finish in one PR, so bound it the same way:
            one directory of the tree, every finding in that directory fixed,
            the pair's before/after count in the PR body. It ratchets only when
            the whole pair reaches zero — say so in the PR rather than implying
            the win is held.

            When the pair is `require-safety-comment-for-type-assertion` in
            `web`, `electron` or `mobile`, expect **test files**: those trees
            have no `as any` in production code at all. Type the double instead
            of commenting the assertion — `selectorOver(state)` for a mocked
            zustand hook, a real fixture type or a factory in
            `web/src/test-utils/doubles.ts` for a partial object, a declared
            member instead of `(global as any).fetch = …`. A deliberately
            invalid fixture keeps its assertion **and** gets the `SAFETY:`
            comment saying which invalid input it is proving the code survives.
            Never weaken an assertion to make a fixture compile: typing the
            double is how `ChatView` was found asserting against `PlanningUpdate`
            payloads the app cannot produce.

            ## What a real fix looks like

            Fix the typing, do not annotate around the finding. Four shapes
            cover nearly everything:

            1. **Name the value crossing a boundary.** A function taking
               `Record<string, unknown>` or `unknown` usually has a real
               contract nobody wrote down. Write it, and make the caller meet it
               at its own boundary.
            2. **Give a `typeof` narrowing a predicate that takes a domain
               type.** `no-runtime-typeof` allows `typeof` inside a function
               returning `v is T`. But a predicate taking bare `unknown` just
               moves the finding into `no-unknown-parameters` — take `T`, a
               named union, or an indexed access like `Foo["bar"]` instead.
            3. **Delete guards that check what the type already declares.** A
               `typeof params.seconds === "number"` against a declared
               `seconds?: number` is a defensive check on a trusted path and
               usually collapses into `??`.
            4. **Point a type at its owner.** `params?: RunWorkflowOptions["params"]`
               beats a second `Record<string, unknown>` that can drift from it.
            5. **Write down the return type the body already has.** For
               `no-implicit-return-type`, read what the function returns and
               annotate it — or annotate the binding, which is the same answer.
               If the inferred type is unpleasant to write, that is the finding
               talking: name it. Do not annotate `unknown` to silence this rule;
               that just moves the finding to `no-unknown-returns`.

            A genuine assertion that cannot go away keeps a `SAFETY:` comment
            stating the invariant TypeScript cannot express. Note the rule's
            comment walk stops at the `VariableDeclaration`, so for an exported
            const the comment goes inside, before the asserted expression.

            ## Rules

            - **Never** weaken the plugin, the backlog config, or a rule's
              options to make findings disappear. Do not add
              `oxlint-disable` comments. The only legitimate way a finding goes
              away is the code getting better.
            - Do not change runtime behavior. Where a check looks dead, confirm
              it against tests before removing it — some are load-bearing for
              injected stubs.
            - Do not touch CI workflow files.
            - Respect the documented holdouts in AGENTS.md; if a pair is a
              holdout, say so in the PR and pick another.

            ## Before starting

            Run `gh pr list --state open --limit 30` and skip the run entirely
            if an anti-slop ratchet PR is already open.

            ## Ratchet what you win

            After the code is fixed, regenerate the enforced overrides from a
            fresh measurement and commit the result:
            ```bash
            npm run lint:anti-slop:write
            ```
            Then update the backlog table, the pair count, and the
            list of trees at zero on all eight rules in AGENTS.md to match what
            it printed. Those numbers are checked, so they must not be guessed.

            ## Prove the new ratchet can fail

            A check that has only ever been green is indistinguishable from one
            that examines nothing. For one pair you just ratcheted,
            re-introduce the violation, confirm `npm run lint:anti-slop:enforced`
            reports it and exits non-zero, then revert and confirm it is green
            again. Put both observations in the PR body. If the enforced lint
            stays green with the violation present, the ratchet did not take —
            stop and report that instead of opening the PR.

            ## Verification

            All of these must pass, and `:check` must agree with the config you
            committed:
            ```bash
            npm run typecheck && npm run lint && npm run test && npm run test:packages
            npm run lint:anti-slop:check
            ```
            `electron/tsconfig.json` excludes `src/__tests__` and `**/*.test.ts`,
            so `npm run typecheck` reads none of the electron test files. If you
            edited one, only `npm run test` (through ts-jest) checks it — a green
            typecheck there proves nothing.

            Some suites fail on a runner for reasons that predate your change.
            If one does, confirm it against a clean tree before calling it
            unrelated, and say which in the PR.

            ## Submit

            Open a PR titled "refactor(lint): drive <tree> to zero on <n> anti-slop rules".
            In the body give the before/after pair count and backlog total, what
            each fix named rather than annotated, the failure you induced to
            prove the ratchet works, and anything you deliberately left as a
            holdout.

      - name: Post-change verification
        if: always() && env.REMAINING_PAIRS != '0'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$PKG_TEST_PRE_EXIT" -eq 0 ] && [ $PKG_TEST_EXIT -ne 0 ]; then
            echo "New package test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi

          # The enforced config is generated from a measurement. A pair driven
          # to zero without `:write` being run leaves it unratcheted, and a
          # regression leaves it claiming a zero that is gone — both are drift,
          # and both look like success without this.
          npm run lint:anti-slop:check
~~~

## .github/workflows/claude-code-review.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Claude Code Review

# One review per PR, not one per push. The review is an `npm ci` plus a long
# Opus run, so `synchronize` held a runner slot on every push while the account
# job cap was already saturated. Re-review on demand with `@claude review` in a
# PR comment (claude.yml).
on:
  pull_request:
    types: [opened, ready_for_review]

# A second `opened`/`ready_for_review` supersedes the review still running.
concurrency:
  group: claude-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  claude-review:
    # `opened` fires for drafts too; review them when they are marked ready.
    if: ${{ !github.event.pull_request.draft }}

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 1

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Run Claude Code Review
        id: claude-review
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'
          plugins: 'code-review@claude-code-plugins'
          prompt: '/code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}'
          claude_args: |
            --model claude-opus-5
            --append-system-prompt "When reviewing this PR, also flag any AI-slop introduced by the change using the unslop skill (.claude/skills/unslop/SKILL.md) — speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing in the PR body."
          # See https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
          # or https://code.claude.com/docs/en/cli-reference for available options
~~~

## .github/workflows/claude.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write # Required so Claude can push commits back to the branch (works around extraheader-override issue in claude-code-action that doesn't cover values from includeIf-included git configs used by actions/checkout)
      pull-requests: read
      issues: read
      id-token: write
      actions: read # Required for Claude to read CI results on PRs
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 1

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

          # This is an optional setting that allows Claude to read CI results on PRs
          additional_permissions: |
            actions: read

          # Optional: Give a custom prompt to Claude. If this is not specified, Claude will perform the instructions specified in the comment that tagged it.
          # prompt: 'Update the pull request description to include a summary of changes.'

          # See https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
          # or https://code.claude.com/docs/en/cli-reference for available options
          claude_args: |
            --model claude-opus-5
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
~~~

## .github/workflows/crash-fuzzer.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Crash Fuzzer

# Feeds malformed documents to the surfaces that parse untrusted input —
# `validateGraph`, the Code-node analyzer, the node property validator — and
# reports the cases that crash instead of failing cleanly.
#
# A validator is allowed to reject its input. It is not allowed to throw a
# TypeError, blow the stack, or hang: those reach users as an unhandled
# exception in the editor, the CLI, or the server. The oracle is therefore the
# *shape* of the failure, never a non-zero exit code.
#
# The fuzzer runs in two legs, both built on the repo's Stryker setup:
#
#   sweep   — the crash corpus at a rotating seed. Finds crashes on inputs no
#             previous run has produced. Fast (seconds), and it is the same
#             suite that runs on every PR at the pinned seed.
#   mutants — Stryker mutates the parser sources and runs the crash corpus as
#             its only test suite. A surviving mutant is a branch no fuzzed
#             document distinguishes: the corpus never reaches it, or reaching
#             it changes nothing the oracle asserts. Either way it is a hole,
#             and it is where the next crash will come from.
#
# Corpus and oracle live in `packages/node-sdk/tests/fuzz/`; the Stryker leg is
# `packages/node-sdk/stryker.crash.config.json`.

on:
  schedule:
    - cron: "0 5 * * *" # Daily at 05:00 UTC
  workflow_dispatch:
    inputs:
      seed:
        description: "Sweep PRNG seed (default: the run number) — reuse to replay a crash"
        required: false
        default: ""
      mutants:
        description: "Mutants to generate per seed document in the sweep"
        required: false
        default: "40"
      skip_stryker:
        description: "Run the sweep only (skip the mutation-testing leg)"
        type: boolean
        required: false
        default: false

jobs:
  crash-fuzzer:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    defaults:
      run:
        working-directory: packages/node-sdk
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install workspace dependencies
        working-directory: .
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      # The corpus is hermetic — it builds its own registry from seed
      # documents and imports the validators from source — so no
      # build:packages is needed.
      - name: Sweep fresh inputs
        id: sweep
        continue-on-error: true
        env:
          FUZZ_SEED: ${{ github.event.inputs.seed || github.run_number }}
          FUZZ_COUNT: ${{ github.event.inputs.mutants || '40' }}
        run: |
          echo "## Crash Fuzzer" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "Sweep seed \`$FUZZ_SEED\`, $FUZZ_COUNT mutants per seed document." >> "$GITHUB_STEP_SUMMARY"
          echo "FUZZ_SEED=$FUZZ_SEED" >> "$GITHUB_ENV"
          echo "FUZZ_COUNT=$FUZZ_COUNT" >> "$GITHUB_ENV"
          # Overwritten by the mutation leg; a skipped leg must not read as
          # "survivors found".
          echo "FUZZ_SURVIVORS=0" >> "$GITHUB_ENV"
          npm run test:crash-fuzz -- --reporter=default --reporter=json \
            --outputFile=../../crash-sweep.json 2>&1 | tee ../../crash-sweep.log

      - name: Report the sweep
        if: always()
        run: |
          if [ "${{ steps.sweep.outcome }}" = "success" ]; then
            echo "✅ No crash on this seed." >> "$GITHUB_STEP_SUMMARY"
            echo "FUZZ_CRASHED=0" >> "$GITHUB_ENV"
          else
            echo "❌ The sweep found a crash. Replay it by dispatching this workflow with seed \`$FUZZ_SEED\` and $FUZZ_COUNT mutants, or locally:" >> "$GITHUB_STEP_SUMMARY"
            echo '```bash' >> "$GITHUB_STEP_SUMMARY"
            echo "FUZZ_SEED=$FUZZ_SEED FUZZ_COUNT=$FUZZ_COUNT npm run test:crash-fuzz --workspace=packages/node-sdk" >> "$GITHUB_STEP_SUMMARY"
            echo '```' >> "$GITHUB_STEP_SUMMARY"
            echo "FUZZ_CRASHED=1" >> "$GITHUB_ENV"
          fi

      - name: Mutation-test the parsers against the crash corpus
        if: github.event.inputs.skip_stryker != 'true'
        continue-on-error: true
        run: npm run test:mutation:crash

      - name: Report the mutation score
        if: always() && github.event.inputs.skip_stryker != 'true'
        working-directory: .
        run: |
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "### 🧬 Parser mutants killed by the crash corpus" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          node scripts/mutation-score.mjs --report-dir reports/crash-fuzz node-sdk >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          node scripts/crash-fuzz-survivors.mjs --limit 40 >> "$GITHUB_STEP_SUMMARY"
          node scripts/crash-fuzz-survivors.mjs --json > crash-survivors.json
          SURVIVORS=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("crash-survivors.json","utf8")).length)')
          echo "FUZZ_SURVIVORS=$SURVIVORS" >> "$GITHUB_ENV"

      - name: Upload the crash corpus report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: crash-fuzz-report
          path: |
            crash-sweep.log
            crash-sweep.json
            crash-survivors.json
            packages/node-sdk/reports/crash-fuzz/mutation.json
          if-no-files-found: warn
          retention-days: 30

      - name: Run quality checks baseline
        if: env.FUZZ_CRASHED == '1' || env.FUZZ_SURVIVORS != '0'
        id: pre-check
        continue-on-error: true
        working-directory: .
        run: |
          LINT_EXIT=0; TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test:packages 2>&1 || TEST_EXIT=1
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> "$GITHUB_ENV"
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> "$GITHUB_ENV"

      - name: Run Claude Code
        if: env.FUZZ_CRASHED == '1' || env.FUZZ_SURVIVORS != '0'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, and prose throat-clearing."
          prompt: |
            # Crash Fuzzer Follow-up

            The crash fuzzer runs a mutated-document corpus
            (`packages/node-sdk/tests/fuzz/`) against `validateGraph`, the
            Code-node analyzer, and the node property validator, then uses that
            corpus as Stryker's test oracle over the parser sources.

            This run: sweep crashed = `${{ env.FUZZ_CRASHED }}` at seed
            `${{ env.FUZZ_SEED }}` (`${{ env.FUZZ_COUNT }}` mutants per seed
            document); `${{ env.FUZZ_SURVIVORS }}` parser mutants survived the
            corpus.

            ## Priority 1 — a crash, if the sweep failed

            `crash-sweep.log` holds the failing assertion. Reproduce it first:

            ```bash
            FUZZ_SEED=${{ env.FUZZ_SEED }} FUZZ_COUNT=${{ env.FUZZ_COUNT }} \
              npm run test:crash-fuzz --workspace=packages/node-sdk
            ```

            Rejecting bad input is correct; crashing on it is not. A failure
            here is an unhandled `TypeError` / `RangeError`, a stack overflow, a
            report whose `counts` disagree with its `issues`, or a document that
            blew the time budget.

            - Read the stack trace to the frame in NodeTool's own code and fix
              it **there** — not at the call site, and not with a catch-all
              wrapper. `try { … } catch { return [] }` around the crashing call
              hides the bug and is not acceptable.
            - Do not make the validator accept invalid input to stop it
              crashing. The correct outcome is a reported issue, not a pass.
            - Add the minimal triggering input to
              `packages/node-sdk/tests/fuzz/seeds.ts` as a literal so the corpus
              covers it at every seed from now on, and re-run at the pinned seed
              to refresh the snapshots (`npm run test:crash-fuzz -- -u`).

            ## Priority 2 — surviving mutants

            `crash-survivors.json` lists parser mutants the corpus failed to
            kill, each with file, line, mutator, and replacement. Each one is a
            branch the corpus does not distinguish. For the ones that matter:

            - Add a seed document or a mutation operator that reaches the branch
              and makes the mutant observable. New operators go in
              `tests/fuzz/corpus.ts`; new documents in `tests/fuzz/seeds.ts`.
            - A mutant that is genuinely equivalent (no input can tell the two
              versions apart) gets a `// Stryker disable next-line <Mutator>:
              <why>` comment naming the reason — the same convention
              `src/validation.ts` already uses. Do not disable one you merely
              found hard to kill.
            - Prefer widening the corpus over adding hand-written unit tests:
              the point is that fuzzed input reaches the branch.

            ## Rules
            - One concern per commit. Maximum 6 fixes per PR — several
              survivors usually share one root cause, so group them.
            - Do not touch the CI workflow files.
            - Do not lower `stryker.crash.config.json` thresholds or narrow its
              `mutate` list to make the number look better.
            - Check `gh pr list --state open --limit 20` first and skip anything
              an open fuzzer PR already covers.

            ## Verification
            ```bash
            npm run lint
            npm run test:packages
            npm run test:crash-fuzz --workspace=packages/node-sdk
            npm run test:mutation:crash --workspace=packages/node-sdk
            ```
            The mutation score must not drop.

            ## Submit
            Open a PR titled "fix: crash on malformed <input kind>" (Priority 1)
            or "test: close crash-corpus gaps in <file>" (Priority 2). List each
            crash or survivor, the stack frame or branch behind it, and what now
            covers it.

      - name: Post-change verification
        if: always() && (env.FUZZ_CRASHED == '1' || env.FUZZ_SURVIVORS != '0')
        working-directory: .
        run: |
          LINT_EXIT=0; TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test:packages 2>&1 || TEST_EXIT=1

          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> "$GITHUB_STEP_SUMMARY"; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> "$GITHUB_STEP_SUMMARY"; exit 1
          fi
~~~

## .github/workflows/dead-code-cleanup.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Dead Code Cleanup

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

jobs:
  dead-code-cleanup:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Dead Code Cleanup

            Find and remove dead code across the NodeTool codebase.

            ## Scope
            - `/web` — React frontend
            - `/electron` — desktop app (Electron)
            - `/mobile` — React Native app

            ## What to find and remove

            **Unused exports**: Functions, classes, constants, and types that are exported but never imported anywhere in the project. Use grep/ripgrep to verify zero consumers before removing.

            **Unused imports**: Imports that are not referenced in the file. The linter may catch some, but check for type-only imports and namespace imports too.

            **Unreachable code**: Code after unconditional `return`, `throw`, `break`, or `continue` statements.

            **Unused local variables and parameters**: Variables assigned but never read. Be careful with destructuring patterns — only remove if truly unused.

            **Commented-out code blocks**: Large blocks of commented-out code (5+ lines) that are not documentation. Leave short inline comments that explain why something is done.

            **Empty/no-op functions**: Functions with empty bodies or that only return undefined, unless they serve as intentional callbacks or interface implementations.

            ## Rules
            - Only remove genuinely dead code. Do not remove code that is used dynamically (e.g. string-based lookups, plugin registries, event handlers registered by name).
            - Do not remove `@ts-expect-error` / `@ts-ignore` directives.
            - Do not remove `test.skip` / `describe.skipIf` / `test.fixme` markers.
            - Do not touch CI workflow files.
            - Keep changes focused — maximum 15 files per PR.
            - Verify each removal with grep to confirm zero references.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a dead code cleanup PR is already open.

            ## Verification
            After cleanup, all checks must still pass:
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "chore: remove dead code" listing each removed item and why it's unused.

      - name: Post-change verification
        if: always()
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/dependency-cleanup.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Dependency Cleanup

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

jobs:
  dependency-cleanup:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Dependency Cleanup

            Find and clean up unnecessary or outdated dependencies in the NodeTool codebase.

            ## Scope
            - `/web/package.json`
            - `/electron/package.json`
            - `/mobile/package.json`

            ## What to fix

            **Unused dependencies**: For each dependency in `dependencies` and `devDependencies`, search the source code to verify it's actually imported/required. Remove any that have zero imports. Be careful with:
            - Vite/build plugins (referenced in config files, not source)
            - Type packages (`@types/*`) — check if the parent package is used
            - PostCSS/Babel/ESLint plugins (referenced in config files)
            - Packages used only in scripts defined in package.json

            **Duplicate dependencies**: Packages that appear in multiple workspaces with different versions. Align to a single version where possible.

            **Minor/patch updates**: Update dependencies to their latest minor/patch version (not major). Run `npm outdated` to find candidates. Only update if:
            - The update is within the same major version
            - Tests still pass after the update

            **Misplaced dependencies**: Runtime packages in `devDependencies` or dev-only packages in `dependencies`. Move them to the correct section.

            ## Rules
            - Do not bump major versions. Major upgrades need manual review.
            - Do not remove packages you cannot verify are unused — search source, configs, and scripts.
            - Do not touch version pins that have comments explaining why they're pinned.
            - Do not touch CI workflow files.
            - Run `npm ci` after any package.json changes to verify the lockfile is consistent.
            - Keep changes focused — one PR per cleanup run.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a dependency cleanup PR is already open.

            ## Verification
            After changes, reinstall and verify:
            ```bash
            npm ci && cd mobile && npm ci && cd ..
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "chore: clean up dependencies" listing each package added/removed/updated and why.

      - name: Post-change verification
        if: always()
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/docs-completeness.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Documentation Completeness

# Features ship faster than their docs. A CLI command lands, an HTTP route is
# added, a package appears, an env var starts gating behavior — and nothing in
# CI notices that no page mentions any of it.
#
# This job inventories the surfaces users touch (CLI commands, HTTP routes,
# NODETOOL_* env vars, workspace packages), diffs each inventory against what the
# docs mention, and asks Claude to document the gaps it can verify from the code.
# Markdown only. Opens a PR, never auto-merges.

on:
  schedule:
    - cron: "40 5 * * *" # Daily at 05:40 UTC
  workflow_dispatch:

jobs:
  docs-completeness:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      # The CLI enumerates its commands from the built node registry.
      - name: Build packages
        run: npm run build:packages

      - name: Inventory documented vs. undocumented surfaces
        id: coverage
        continue-on-error: true
        run: |
          set -uo pipefail
          mkdir -p docs-facts
          DOCS="docs README.md AGENTS.md"

          mentioned() {
            grep -rqI -- "$1" $DOCS 2>/dev/null
          }

          # --- CLI commands -------------------------------------------------
          npm run --silent dev:nodetool -- --help 2>/dev/null \
            | awk '/^Commands:/{f=1;next} f && /^  [a-z]/{print $1}' \
            | sort -u > docs-facts/cli-commands.txt || true
          : > docs-facts/undocumented-cli.txt
          while read -r cmd; do
            [ -n "$cmd" ] || continue
            mentioned "nodetool $cmd" || echo "$cmd" >> docs-facts/undocumented-cli.txt
          done < docs-facts/cli-commands.txt

          # --- HTTP routes --------------------------------------------------
          grep -rhoE '\.(get|post|put|patch|delete)\(\s*[`"]/[^`"]*' \
            packages/websocket/src --include="*.ts" 2>/dev/null \
            | sed -E 's/^[^`"]*[`"]//' | sort -u > docs-facts/http-routes.txt || true
          : > docs-facts/undocumented-routes.txt
          while read -r route; do
            [ -n "$route" ] || continue
            mentioned "$route" || echo "$route" >> docs-facts/undocumented-routes.txt
          done < docs-facts/http-routes.txt

          # --- NODETOOL_* environment variables ------------------------------
          grep -rhoE 'NODETOOL_[A-Z0-9_]+' packages web/src electron/src \
            --include="*.ts" --include="*.tsx" --include="*.mjs" 2>/dev/null \
            | sort -u > docs-facts/env-vars.txt || true
          : > docs-facts/undocumented-env.txt
          while read -r var; do
            [ -n "$var" ] || continue
            mentioned "$var" || echo "$var" >> docs-facts/undocumented-env.txt
          done < docs-facts/env-vars.txt

          # --- Packages without a README -------------------------------------
          : > docs-facts/packages-without-readme.txt
          for pkg in packages/*/; do
            [ -f "$pkg/package.json" ] || continue
            [ -f "$pkg/README.md" ] || echo "${pkg%/}" >> docs-facts/packages-without-readme.txt
          done

          CLI_GAPS=$(wc -l < docs-facts/undocumented-cli.txt)
          ROUTE_GAPS=$(wc -l < docs-facts/undocumented-routes.txt)
          ENV_GAPS=$(wc -l < docs-facts/undocumented-env.txt)
          PKG_GAPS=$(wc -l < docs-facts/packages-without-readme.txt)
          TOTAL=$((CLI_GAPS + ROUTE_GAPS + ENV_GAPS + PKG_GAPS))

          {
            echo "## Documentation Completeness"
            echo ""
            echo "| Surface | Undocumented |"
            echo "|---|---|"
            echo "| CLI commands | $CLI_GAPS |"
            echo "| HTTP routes | $ROUTE_GAPS |"
            echo "| NODETOOL_* env vars | $ENV_GAPS |"
            echo "| Packages without README | $PKG_GAPS |"
          } >> $GITHUB_STEP_SUMMARY

          echo "DOC_GAPS=$TOTAL" >> $GITHUB_ENV

      - name: Record base commit
        run: echo "BASE_SHA=$(git rev-parse HEAD)" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.DOC_GAPS != '0'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "All prose you write follows docs/WRITING_STYLE.md: concise, concrete, no AI slop (leverage, seamless, robust, comprehensive, it's worth noting, rule-of-three padding). Document what the code does, in the voice the surrounding docs already use."
          prompt: |
            # Documentation Completeness

            Document the NodeTool surfaces that no page currently mentions.

            ## Gaps found for you
            - `docs-facts/undocumented-cli.txt` — CLI commands no doc mentions
            - `docs-facts/undocumented-routes.txt` — HTTP routes no doc mentions
            - `docs-facts/undocumented-env.txt` — `NODETOOL_*` env vars no doc mentions
            - `docs-facts/packages-without-readme.txt` — packages with no README

            These lists are a plain-text grep, so they over-report: a route
            documented as `/api/workflows/:id` will not match a grep for
            `/api/workflows/:workflow_id`. Confirm each gap is real before writing
            anything, and drop the ones that are already covered under another
            spelling.

            ## Where things belong
            Read the existing page first and extend it in its own structure rather
            than starting a new page:
            - CLI commands → `docs/cli.md`, and the CLI section of `AGENTS.md`
            - HTTP routes → `docs/api-reference.md` / `docs/api.md`
            - Env vars → `docs/configuration.md`
            - A package's own behavior → that package's `README.md`

            A new page is justified only when a subsystem has no home at all. If you
            add one, link it from `docs/index.md` so it is reachable.

            ## What to write
            For each gap: what it is, when someone reaches for it, and a working
            example — a real command with real flags, a real request/response shape,
            a real env var value. Derive every detail from the code (`--help` output,
            the route handler, the place the env var is read). Never invent a flag,
            a default, or a response field.

            Internal-only surfaces do not need user docs. If a route is internal
            plumbing or an env var is a test hook, say so in the PR body and skip it
            rather than writing a page nobody needs.

            ## Rules
            - **Markdown only.** Do not change code to match documentation.
            - Match the surrounding page's heading depth, code-fence style, and voice.
            - Do not rewrite documentation that already exists — this pass adds what
              is missing.
            - Do not touch CI workflow files.
            - Keep changes focused — at most 8 gaps per PR, prioritizing CLI commands
              and HTTP routes (what users hit first) over package READMEs.
            - Do not commit the `docs-facts/` directory.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a documentation
              completeness PR is already open.

            ## Verification
            Every command you document must run as written. Check flags against
            `nodetool <command> --help`, and check that any relative link you add
            resolves on disk.

            ## Submit
            Create a PR titled "docs: document <surface>" whose body lists each gap
            filled, where the documentation went, and where in the code you read the
            behavior. List the gaps you deliberately skipped and why.

      # A docs job that edits code has done something it was told not to. Catch it
      # here rather than in review — the PR is already open by this point, so this
      # step failing is the signal to close it.
      - name: Guard — Markdown-only changes
        if: always()
        run: |
          set -uo pipefail
          rm -rf docs-facts
          CHANGED=$( { git diff --name-only "${BASE_SHA:-HEAD}" HEAD; git status --porcelain | awk '{print $NF}'; } | sort -u )
          CODE_CHANGES=$(echo "$CHANGED" | grep -v -E '\.(md|markdown)$' | grep -v '^$' || true)
          if [ -n "$CODE_CHANGES" ]; then
            echo "::error::Non-Markdown files were modified by a docs-only job:"
            echo "$CODE_CHANGES"
            exit 1
          fi
~~~

## .github/workflows/docs-correctness.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Documentation Correctness

# Docs drift silently: a flag gets renamed, a script disappears, a package moves,
# and the page describing it keeps saying the old thing. Nothing in CI catches
# that — `docs-ci.yml` proves the site builds and its links resolve, not that its
# sentences are true.
#
# This job collects ground truth from the repo itself (CLI help, npm scripts,
# workspace list, the week's code changes), hands it to Claude, and asks it to
# check the docs that describe those surfaces against what the code actually
# does. Markdown only — it never edits code to make a doc true. Opens a PR,
# never auto-merges.

on:
  schedule:
    - cron: "10 5 * * *" # Daily at 05:10 UTC
  workflow_dispatch:

jobs:
  docs-correctness:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      # The CLI loads the node registry from dist/ (decorator packages), so its
      # help output is only complete after a build.
      - name: Build packages
        run: npm run build:packages

      - name: Collect ground truth
        id: facts
        continue-on-error: true
        run: |
          set -uo pipefail
          mkdir -p docs-facts

          # Every CLI command's help text — the reference the CLI docs and
          # AGENTS.md command blocks are supposed to match.
          {
            npm run --silent dev:nodetool -- --help
            npm run --silent dev:nodetool -- --help 2>/dev/null \
              | awk '/^Commands:/{f=1;next} f && /^  [a-z]/{print $1}' \
              | sort -u \
              | while read -r cmd; do
                  echo ""
                  echo "===== nodetool $cmd --help ====="
                  npm run --silent dev:nodetool -- "$cmd" --help 2>&1 || true
                done
          } > docs-facts/cli-help.txt 2>&1 || true

          node -e 'const s=require("./package.json").scripts||{};for(const k of Object.keys(s).sort())console.log(k+" = "+s[k])' \
            > docs-facts/npm-scripts.txt 2>/dev/null || true

          node -e 'const {workspaces=[]}=require("./package.json");console.log(workspaces.join("\n"))' \
            > docs-facts/workspaces.txt 2>/dev/null || true
          ls -1 packages >> docs-facts/workspaces.txt 2>/dev/null || true

          # Docs describing code that moved this week are the likeliest to be stale.
          git log --since="7 days ago" --name-only --pretty=format:"--- %h %s" \
            > docs-facts/recent-changes.txt 2>/dev/null || true

          {
            echo "## Documentation Correctness — ground truth"
            echo ""
            echo "- CLI help: $(wc -l < docs-facts/cli-help.txt 2>/dev/null || echo 0) lines"
            echo "- npm scripts: $(wc -l < docs-facts/npm-scripts.txt 2>/dev/null || echo 0)"
            echo "- Commits in the last 7 days: $(git log --since='7 days ago' --oneline | wc -l)"
          } >> $GITHUB_STEP_SUMMARY

      - name: Record base commit
        run: echo "BASE_SHA=$(git rev-parse HEAD)" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "All prose you write follows docs/WRITING_STYLE.md: concise, concrete, no AI slop (leverage, seamless, robust, comprehensive, it's worth noting, rule-of-three padding). Fix slop you pass in paragraphs you are already editing."
          prompt: |
            # Documentation Correctness

            Check NodeTool's documentation against what the code actually does, and
            fix the statements that are wrong.

            ## Ground truth collected for you
            - `docs-facts/cli-help.txt` — every CLI command's real help output
            - `docs-facts/npm-scripts.txt` — the npm scripts that actually exist
            - `docs-facts/workspaces.txt` — the real workspace/package list
            - `docs-facts/recent-changes.txt` — files changed in the last 7 days

            Docs describing code that changed this week are the likeliest to be
            stale. Start there, then widen.

            ## Scope
            - `docs/**/*.md`
            - `README.md`, `AGENTS.md`, and per-package `AGENTS.md` / `README.md`

            ## What counts as an error

            **Commands that do not exist or take different flags.** Every `npm run …`
            and `nodetool …` invocation in a doc must exist with the flags shown.
            Check against `docs-facts/npm-scripts.txt` and `docs-facts/cli-help.txt`,
            not memory.

            **Paths and file names that no longer resolve.** Every path a doc names
            (`packages/foo/src/bar.ts`, `web/src/components/…`, script names, config
            files) must exist. Verify each with `ls`/`test -e`.

            **Symbols that were renamed or removed.** Class, function, hook, store,
            node type, and env var names quoted in prose must appear in the code.
            Grep for each before trusting it.

            **Descriptions contradicted by the code.** Defaults, ports, ordering,
            required versions, return shapes, message formats. Read the code path
            before rewriting the sentence.

            **Internal links that point nowhere.** Relative Markdown links to files
            or headings that no longer exist.

            ## Rules
            - **Markdown only.** Never edit code to make a doc true — if a doc
              describes better behavior than the code has, leave the code alone and
              note it in the PR body instead of rewriting the doc into fiction.
            - Verify every claim you change. If you cannot confirm what the correct
              statement is, delete the wrong sentence rather than guessing a new one.
            - Do not restructure, reword, or "improve" prose that is already correct.
              This PR is a correction pass, not an editing pass.
            - Do not touch CI workflow files.
            - Do not add new documentation pages — `docs-completeness.yaml` covers gaps.
            - Keep changes focused — maximum 15 files per PR.
            - Do not commit the `docs-facts/` directory.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a documentation
              correctness PR is already open.

            ## Submit
            If you found nothing wrong, say so and open no PR.

            Otherwise create a PR titled "docs: fix stale documentation" whose body
            lists each correction as: the file, what the doc claimed, what the code
            actually does, and how you verified it. Add a separate "Code that
            contradicts its own docs" section for anything you chose not to fix.

      # A docs job that edits code has done something it was told not to. Catch it
      # here rather than in review — the PR is already open by this point, so this
      # step failing is the signal to close it.
      - name: Guard — Markdown-only changes
        if: always()
        run: |
          set -uo pipefail
          rm -rf docs-facts
          CHANGED=$( { git diff --name-only "${BASE_SHA:-HEAD}" HEAD; git status --porcelain | awk '{print $NF}'; } | sort -u )
          CODE_CHANGES=$(echo "$CHANGED" | grep -v -E '\.(md|markdown)$' | grep -v '^$' || true)
          if [ -n "$CODE_CHANGES" ]; then
            echo "::error::Non-Markdown files were modified by a docs-only job:"
            echo "$CODE_CHANGES"
            exit 1
          fi
~~~

## .github/workflows/duplicate-unifier.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Duplicate Unifier

# Finds the same implementation living in two or more places and merges it into
# one. Copies drift: a fix lands in one and not the other, and the two behave
# differently for a year before anyone notices.
#
# Detection is a sliding-window hash over normalized lines (identifiers kept,
# whitespace and string contents dropped), so it catches copies that were
# renamed but not restructured. It reports; the agent decides whether a match is
# a real duplicate or two things that merely rhyme.

on:
  schedule:
    - cron: "0 7 * * *" # Daily at 07:00 UTC
  workflow_dispatch:
    inputs:
      window:
        description: "Minimum duplicated lines to report"
        required: false
        default: "14"

jobs:
  duplicate-unifier:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Detect duplicated blocks
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          WINDOW="${{ github.event.inputs.window }}"
          if [ -z "$WINDOW" ]; then WINDOW=14; fi

          DUP_WINDOW="$WINDOW" node --input-type=module - <<'JS' > duplicate-blocks.log
          import { createHash } from "node:crypto";
          import { readFileSync } from "node:fs";
          import { execFileSync } from "node:child_process";

          const window = Number(process.env.DUP_WINDOW) || 14;

          const files = execFileSync(
            "bash",
            [
              "-c",
              "git ls-files 'web/src/*.ts' 'web/src/*.tsx' 'electron/src/*.ts' " +
                "'mobile/src/*.ts' 'mobile/src/*.tsx' 'packages/*/src/*.ts' " +
                "| grep -vE '/generated/|\\.d\\.ts$'",
            ],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
          )
            .split("\n")
            .filter(Boolean);

          // Keep identifiers and structure, drop formatting, string contents and
          // numbers: a copy that was reindented and had its literals swapped is
          // still a copy.
          const normalize = (line) =>
            line
              .replace(/\/\/.*$/, "")
              .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "S")
              .replace(/\b\d+(\.\d+)?\b/g, "N")
              .replace(/\s+/g, " ")
              .trim();

          const blocks = new Map();
          for (const file of files) {
            const lines = readFileSync(file, "utf8").split("\n").map(normalize);
            for (let i = 0; i + window <= lines.length; i += 1) {
              const slice = lines.slice(i, i + window);
              // A window that is mostly imports, braces or blanks is noise.
              const substantive = slice.filter(
                (line) => line.length > 12 && !/^(import|export|\}|\{|\)|\],?)/.test(line),
              );
              if (substantive.length < window * 0.6) continue;

              const key = createHash("sha1").update(slice.join("\n")).digest("hex");
              const seen = blocks.get(key) ?? [];
              // Overlapping windows in one file are the same block, not a copy.
              if (seen.some((hit) => hit.file === file && Math.abs(hit.line - (i + 1)) < window)) continue;
              seen.push({ file, line: i + 1 });
              blocks.set(key, seen);
            }
          }

          // Copies spread across files come first: a block repeated inside one
          // file is usually per-case boilerplate (the decorator-declared nodes
          // look like this), while the same block in two files is drift waiting
          // to happen.
          const spread = (hits) => new Set(hits.map((hit) => hit.file)).size;
          const groups = [...blocks.values()]
            .filter((hits) => hits.length > 1)
            .sort((a, b) => spread(b) - spread(a) || b.length - a.length);

          // A file pair that duplicates ten adjacent windows is one finding.
          const reported = new Set();
          let count = 0;
          for (const hits of groups) {
            const pair = hits.map((hit) => hit.file).sort().join(" | ");
            if (reported.has(pair)) continue;
            reported.add(pair);
            count += 1;
            const files = spread(hits);
            console.log(
              `### ${hits.length} copies of a ${window}-line block across ${files} file${files === 1 ? "" : "s"}`,
            );
            for (const hit of hits.slice(0, 10)) console.log(`  ${hit.file}:${hit.line}`);
            if (hits.length > 10) console.log(`  … ${hits.length - 10} more`);
            console.log("");
            if (count >= 25) break;
          }
          JS

          echo "## Duplicated Blocks (window ${WINDOW})" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -60 duplicate-blocks.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          if [ -s duplicate-blocks.log ]; then
            echo "DUPES_FOUND=1" >> $GITHUB_ENV
          else
            echo "DUPES_FOUND=0" >> $GITHUB_ENV
          fi

      - name: Run quality checks baseline
        if: env.DUPES_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.DUPES_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Merge Duplicated Implementations

            `duplicate-blocks.log` lists blocks of code that appear in more than
            one place, with the file and line of each copy.

            Pick **one** group and merge the copies into a single implementation.

            ## Decide first: is it really a duplicate?
            Read every copy. Merge only when the copies do the same thing for the
            same reason. Leave them alone when:
            - They are alike by coincidence — two reducers with the same shape
              over unrelated domains. Coupling them makes the next change worse.
            - They sit on either side of a package boundary that exists on
              purpose. `packages/protocol` may not import from `web/`, mobile
              shares only `@nodetool-ai/protocol` and `@nodetool-ai/app-runtime`.
              See the dependency order in AGENTS.md.
            - One copy is a deliberate fork with diverging requirements, and the
              divergence is documented.
            - The duplicate is generated (`packages/*/src/generated/**`, DSL
              codegen, provider manifests). Fix the generator or leave it.

            ## Where the merged code goes
            - Same package → a shared module in that package.
            - Two backend packages → the nearest common dependency in the order
              `protocol → config → security → auth → storage → runtime → kernel →
              node-sdk → base-nodes`. Never introduce a back edge.
            - Web and backend → a package both already depend on, or leave the
              copies alone. Do not create a new package for this.
            - React components → a primitive in
              `web/src/components/ui_primitives/` when the duplication is UI
              (see its STRATEGY.md).

            ## The copies must differ somewhere — resolve it
            Two copies of a function that drifted usually differ in one branch,
            one default, or one error path. Diff them line by line, decide which
            behavior is correct, and say so in the PR. If the callers genuinely
            need both behaviors, take a parameter — but only when a caller
            actually passes both values today.

            ## Rules
            - One duplicate group per PR. Maximum 10 files.
            - Every call site must go through the merged implementation. Do not
              leave one copy behind "for now".
            - Keep the tests of every copy. Point them at the merged code; when
              they overlap exactly, keep one and say which you dropped.
            - No new abstraction layer. One function replacing three copies of
              itself, not a strategy interface.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a unification PR
              is already open.

            ## Verification
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```
            Backend packages also need `npm run test:packages`.

            ## Submit
            Create a PR titled "refactor: unify duplicated <thing>" listing every
            copy that was merged, where the single implementation now lives, and
            each behavioral difference you found and how you resolved it.

      - name: Post-change verification
        if: always() && env.DUPES_FOUND == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/flaky-test-fixer.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Flaky Test Fixer

# Finds tests that pass and fail on the same code, and fixes the cause.
#
# Two sources of evidence. The GitHub API says which jobs went red and then
# green on a re-run of the same commit — the definition of a flake, straight
# from CI history. Locally, the suites run twice in randomized order, which
# surfaces the largest class of flakes in this repo: order dependence through
# shared module state.
#
# The only acceptable fix is the cause. Adding a retry, widening a timeout, or
# skipping the test hides a race that will reappear in production.

on:
  schedule:
    - cron: "0 2 * * *" # Daily at 02:00 UTC
  workflow_dispatch:
    inputs:
      repeats:
        description: "Randomized repeat runs of each suite"
        required: false
        default: "2"

jobs:
  flaky-test-fixer:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Build packages
        run: npm run build:packages

      - name: Read flakes out of CI history
        id: history
        continue-on-error: true
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          echo "## Flakes in CI History" >> $GITHUB_STEP_SUMMARY
          : > ci-flakes.log

          # A run with more than one attempt whose final conclusion is success
          # went red and then green on the same commit.
          gh api "repos/${{ github.repository }}/actions/runs?branch=${{ github.event.repository.default_branch }}&per_page=100" \
            --jq '.workflow_runs[] | select(.run_attempt > 1) | "\(.name)\t\(.head_sha[0:8])\tattempts=\(.run_attempt)\t\(.conclusion)\t\(.html_url)"' \
            >> ci-flakes.log 2>/dev/null || echo "(GitHub API unavailable)" >> ci-flakes.log

          RERUNS=$(grep -c "attempts=" ci-flakes.log || true)
          echo "Re-run runs on the default branch (last 100): $RERUNS" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -25 ci-flakes.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

      - name: Repeat the suites in randomized order
        id: repeat
        continue-on-error: true
        shell: bash
        run: |
          REPEATS="${{ github.event.inputs.repeats }}"
          if [ -z "$REPEATS" ]; then REPEATS=2; fi
          : > flaky-runs.log
          FLAKY=0

          # Jest randomizes case order within a file with --randomize; Vitest
          # does the same with --sequence.shuffle. Order dependence — a module
          # mock, a module-level cache, a global left dirty — shows up as a
          # failure that moves between runs.
          for i in $(seq 1 "$REPEATS"); do
            echo "::group::web attempt $i"
            if ! npm test --workspace=web -- --randomize > "/tmp/web-$i.log" 2>&1; then
              FLAKY=1
              { echo "### web attempt $i failed"; echo '```'; grep -E "●|✕|FAIL|Expected|Received" "/tmp/web-$i.log" | head -60; echo '```'; echo; } >> flaky-runs.log
            fi
            echo "::endgroup::"

            echo "::group::packages attempt $i"
            if ! npx turbo run test --filter="./packages/*" -- --sequence.shuffle > "/tmp/pkg-$i.log" 2>&1; then
              FLAKY=1
              { echo "### packages attempt $i failed"; echo '```'; grep -E "FAIL|✕|AssertionError|Expected|Received" "/tmp/pkg-$i.log" | head -60; echo '```'; echo; } >> flaky-runs.log
            fi
            echo "::endgroup::"
          done

          echo "## Randomized Repeat Runs" >> $GITHUB_STEP_SUMMARY
          if [ "$FLAKY" -eq 0 ]; then
            echo "All $REPEATS randomized runs passed." >> $GITHUB_STEP_SUMMARY
          else
            echo "At least one randomized run failed — see flaky-runs.log." >> $GITHUB_STEP_SUMMARY
          fi
          echo "REPEAT_FAILURES=$FLAKY" >> $GITHUB_ENV

      - name: Decide whether there is anything to fix
        shell: bash
        run: |
          # CI history alone is enough to work from: a re-run that went green is
          # a flake even if today's randomized runs happened to pass.
          RERUNS=$(grep -c "attempts=" ci-flakes.log || true)
          if [ "$REPEAT_FAILURES" = "1" ] || [ "${RERUNS:-0}" -gt 0 ]; then
            echo "FLAKES_FOUND=1" >> $GITHUB_ENV
          else
            echo "FLAKES_FOUND=0" >> $GITHUB_ENV
          fi

      - name: Upload run logs
        if: env.FLAKES_FOUND == '1'
        uses: actions/upload-artifact@v7
        with:
          name: flaky-run-logs
          path: |
            ci-flakes.log
            flaky-runs.log
          if-no-files-found: warn
          retention-days: 30

      - name: Run Claude Code
        if: env.FLAKES_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, and prose throat-clearing."
          prompt: |
            # Root-Cause a Flaky Test

            Two sources of evidence:
            - `ci-flakes.log` — runs on the default branch that needed more than
              one attempt. Same commit, red then green.
            - `flaky-runs.log` — failures from running the suites twice with
              randomized order (`jest --randomize`,
              `vitest --sequence.shuffle`).

            Pick **one** flaky test and fix what makes it non-deterministic.

            ## Reproduce it first
            A flake you cannot reproduce is a flake you cannot claim to have
            fixed. Try, in order:
            ```bash
            npm test --workspace=web -- --randomize -t "<test name>"
            npm run test --workspace=packages/<name> -- --sequence.shuffle
            # order dependence: run the suspected neighbour first
            npm test --workspace=web -- <fileA> <fileB>
            ```
            Loop it 20 times and count the failures. Record the rate before and
            after your fix. If it never reproduces, say so and inspect the CI
            logs from `ci-flakes.log` instead — `gh run view <id> --log-failed`.

            ## The usual causes, in this repo's terms
            - **Shared module state** between test files: a module-level cache, a
              Zustand store that is never reset, a registry that accumulates.
            - **Unawaited promises**: an assertion running before the effect it
              depends on; a `void`-ed promise that settles into the next test.
            - **Real timers and real time**: `setTimeout`-based waits, dates near
              midnight, durations asserted with `toBe`.
            - **`waitFor` misuse**: asserting on the first render instead of the
              settled state, or a `waitFor` with a side effect inside it.
            - **Order or index assumptions** over unordered data: `Object.keys`,
              a `Map` iteration, results from a query with no `ORDER BY`.
            - **Ports, files, and databases** shared between parallel workers.
            - **The network**: a test that reaches a real endpoint. Mock it.
            - **WebSocket and MsgPack framing**: assertions that assume one
              message per frame, or a fixed arrival order.

            ## Fix the cause
            Acceptable: reset the shared state in `beforeEach`, await what the
            code awaits, use fake timers, assert on the settled state, sort
            before comparing, isolate the resource, mock the boundary.

            **Not acceptable**, and a PR that does any of these will be rejected:
            - retrying the test (`jest.retryTimes`, `test.retry`)
            - `test.skip` / `describe.skip` / `.fixme` on a flaky test
            - raising a timeout without showing the operation genuinely needs
              longer
            - loosening the assertion until it always passes
            - `await new Promise(r => setTimeout(r, 500))` as a synchronization
              device

            If the flake is caused by a **product** race rather than a test bug,
            fix the product code and say so — that race reaches users too.

            ## Rules
            - One flake per PR. Maximum 8 files.
            - Show the failure rate before and after, from an actual loop.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a flaky-test PR
              is already open.

            ## Verification
            ```bash
            npm run lint && npm run test && npm run test:packages
            ```
            Plus the repeat loop for the test you fixed.

            ## Submit
            Create a PR titled "fix(test): deflake <test>" naming the source of
            non-determinism, the reproduction command, the failure rate before
            and after, and why the fix removes the cause rather than the symptom.

      - name: Post-change verification
        if: always() && env.FLAKES_FOUND == '1'
        run: |
          echo "## Post-Change Suites" >> $GITHUB_STEP_SUMMARY
          FAIL=0
          npm run lint || FAIL=1
          npm run test || FAIL=1
          npm run test:packages || FAIL=1

          if [ $FAIL -eq 0 ]; then
            echo "Suites passed" >> $GITHUB_STEP_SUMMARY
            exit 0
          fi

          # The randomized repeats above are this run's baseline. If they were
          # already failing, a red suite here says nothing new — the whole point
          # of this workflow is that these suites fail intermittently.
          if [ "$REPEAT_FAILURES" = "1" ]; then
            echo "Suites failed, but they were already failing before the change" >> $GITHUB_STEP_SUMMARY
            exit 0
          fi
          echo "Suites failed after the deflake change, having passed before it" >> $GITHUB_STEP_SUMMARY
          exit 1
~~~

## .github/workflows/genspend-pricing.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: GenSpend Pricing Sync

# Nightly: pull generative-media prices from the GenSpend catalog
# (https://genspend.io/api/v1/export) into
# `packages/model-pricing/src/generated/genspend-pricing.json`, and open a PR
# when a price moved.
#
# A price change is a diff a human should see before it gates a run's budget, so
# this opens a PR and never pushes to main. When nothing moved the script
# rewrites nothing and no PR is opened.
#
# Opening that PR needs a token GitHub lets create pull requests, and the
# default `GITHUB_TOKEN` is not one unless the repository enables Settings >
# Actions > General > "Allow GitHub Actions to create and approve pull
# requests". Without it the API answers "GitHub Actions is not permitted to
# create or approve pull requests" and the branch is pushed with nothing to
# review. Three paths, tried in order:
#
#   1. `PRICING_SYNC_TOKEN` (a PAT or App token with `contents: write` and
#      `pull-requests: write`), if the secret is set.
#   2. `GITHUB_TOKEN`, which works where the repository setting above is on.
#   3. The Claude GitHub App, via `anthropics/claude-code-action`. This is how
#      the nightly agent workflows here open PRs as `claude[bot]`: the action
#      trades an OIDC token for an App installation token, and App tokens are
#      not covered by the Actions restriction. It needs no repository admin and
#      no new secret, at the cost of one small model run — only on the nights a
#      price actually moved, and only when 1 and 2 both failed.
#
# `create-pull-request` pushes the branch before it calls the API, so by the
# time path 3 runs the commit already exists and the agent only has to open the
# PR against it. If every path fails the job prints the compare link and exits
# non-zero — a moved price with no PR is not a green run.
#
# The sync matches GenSpend models against the models each provider enumerates
# in NodeTool, so it needs the backend packages built. No provider API keys: the
# listings it reads are static or manifest-backed, and the GenSpend API is
# public and read-only.

on:
  workflow_dispatch: {}
  schedule:
    # 03:20 UTC nightly — off the hour so it doesn't contend with the other
    # scheduled jobs.
    - cron: "20 3 * * *"

permissions:
  # id-token: the Claude action exchanges an OIDC token for a Claude GitHub App
  # installation token. That identity may open pull requests; GITHUB_TOKEN may
  # not unless the repository allows it.
  id-token: write
  contents: write
  pull-requests: write

concurrency:
  group: genspend-pricing
  cancel-in-progress: false

jobs:
  sync:
    name: Refresh the GenSpend price catalog
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install root dependencies
        run: npm ci

      - name: Build backend packages
        # The sync reads each provider's model listing from the built runtime.
        run: npm run build:packages

      - name: Sync prices
        run: npm run sync:genspend -- --report genspend-coverage.json

      - name: Check our arithmetic against GenSpend's calculator
        # The catalog is a snapshot we price locally from, so the risk is that
        # our port of the selection rules drifts from theirs. This re-prices
        # fixed cases from the file just written and asserts each equals
        # POST /api/v1/quote. It needs the network, which is why it lives here
        # and not in the PR quality gate. A drift fails the job rather than
        # opening a PR that ships a wrong number.
        run: node scripts/genspend/parity-check.mjs

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: genspend-coverage
          path: genspend-coverage.json
          if-no-files-found: warn

      - name: Detect changes
        id: diff
        # The PR body goes to a file rather than a step output: both the
        # create-pull-request path and the Claude fallback read the same bytes,
        # so the two cannot describe the same diff differently.
        run: |
          set -euo pipefail
          if git diff --quiet -- packages/model-pricing/src/generated/genspend-pricing.json; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "changed=true" >> "$GITHUB_OUTPUT"
          {
            echo "Nightly refresh of the GenSpend price catalog. Prices via"
            echo "[genspend.io](https://genspend.io)."
            echo
            node -e "
              const c = require('./packages/model-pricing/src/generated/genspend-pricing.json');
              const report = require('./genspend-coverage.json');
              console.log(\`\${c.pricedModels} priced model ids across \${c.providers.length} providers, from \${c.catalogOfferings} offerings over \${c.catalogModels} tracked models (prices last moved \${c.updatedAt}).\`);
              console.log('');
              console.log('| Provider | Offerings priced | Model ids | Unresolved |');
              console.log('| --- | --- | --- | --- |');
              for (const [provider, s] of Object.entries(report.coverage).sort()) {
                console.log(\`| \${provider} | \${s.priced}/\${s.offerings} | \${s.ids} | \${s.unresolved} |\`);
              }
            "
            echo
            echo "These numbers feed \`getModelUnitPrice\`, so they are what the editor's"
            echo "cost preview shows and what a run's budget check is gated on. Read"
            echo "the diff before merging:"
            echo
            echo "- [ ] No price moved by an order of magnitude (GenSpend quarantines"
            echo "      >3× swings, but a unit change would slip through)"
            echo "- [ ] \`unit_class\` values still match the \`billing_unit\` they map to"
            echo "- [ ] No model lost its price because the provider's receipt page moved"
            echo "- [ ] New \`match: \"catalog\"\` entries name the model they claim to price"
            echo
            echo "Unresolved offerings are listed in the run log and the"
            echo "\`genspend-coverage\` artifact — pin any that should be priced in"
            echo "\`scripts/genspend/aliases.json\`."
          } > "$RUNNER_TEMP/pr-body.md"

      - name: Open PR
        id: pr
        if: steps.diff.outputs.changed == 'true'
        continue-on-error: true
        uses: peter-evans/create-pull-request@v8
        with:
          # Falls back to GITHUB_TOKEN, which only opens a PR where the
          # repository allows Actions to. See the header comment.
          token: ${{ secrets.PRICING_SYNC_TOKEN || secrets.GITHUB_TOKEN }}
          branch: chore/genspend-pricing-sync
          base: main
          add-paths: packages/model-pricing/src/generated/genspend-pricing.json
          commit-message: "chore(pricing): sync GenSpend price catalog"
          title: "chore(pricing): sync GenSpend price catalog"
          body-path: ${{ runner.temp }}/pr-body.md
          delete-branch: true

      - name: Does the PR exist?
        id: check
        if: steps.diff.outputs.changed == 'true'
        # Read the state rather than trust the step outcome. create-pull-request
        # reports failure for a refused *creation* and for a refused push alike,
        # and only the first is worth a model run.
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          BRANCH=chore/genspend-pricing-sync
          PUSHED=$(gh api "repos/${{ github.repository }}/branches/$BRANCH" --jq .commit.sha 2>/dev/null || true)
          OPEN=$(gh pr list --head "$BRANCH" --base main --state open --json number --jq 'length')
          echo "pushed=${PUSHED:-}" >> "$GITHUB_OUTPUT"
          echo "open=$OPEN" >> "$GITHUB_OUTPUT"
          echo "Branch head: ${PUSHED:-<not pushed>} · open PRs for it: $OPEN"

      - name: Open PR as the Claude GitHub App
        # Only when the branch is pushed and nothing points at it. The App token
        # this action mints is the one identity in this job GitHub lets open a
        # PR without a repository setting or a new secret.
        if: >-
          steps.diff.outputs.changed == 'true'
          && steps.check.outputs.pushed != ''
          && steps.check.outputs.open == '0'
        continue-on-error: true
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Read,CreatePullRequest"
          prompt: |
            # Open one pull request. Change nothing else.

            The branch `chore/genspend-pricing-sync` is already pushed to this
            repository and already carries the commit. Your only job is to open
            a pull request for it, because the token that pushed it is not
            allowed to open one.

            - head: `chore/genspend-pricing-sync`
            - base: `main`
            - title: `chore(pricing): sync GenSpend price catalog`
            - body: the exact contents of `${{ runner.temp }}/pr-body.md`

            Read that file and use it verbatim as the body. Do not summarize it,
            add to it, or write your own. Do not edit any file in the working
            tree, do not commit, and do not push — the diff under review was
            generated by this workflow and must reach the reviewer untouched.

            If a pull request for that branch already exists, do nothing and say
            so.

      - name: Report a blocked PR
        # Re-read the state instead of trusting the fallback's outcome. Whatever
        # happened above, the question is the same one: does a moved price have
        # a PR pointing at it?
        if: steps.diff.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
          BRANCH: chore/genspend-pricing-sync
        run: |
          set -euo pipefail
          NUM=$(gh pr list --head "$BRANCH" --base main --state open --json number --jq '.[0].number // empty')
          if [ -n "$NUM" ]; then
            echo "Pull request #$NUM is open for $BRANCH." >> "$GITHUB_STEP_SUMMARY"
            exit 0
          fi
          COMPARE="${{ github.server_url }}/${{ github.repository }}/compare/main...$BRANCH?expand=1"
          {
            echo "## GenSpend price sync: prices moved, PR not opened"
            echo
            echo "The refreshed catalog is on \`$BRANCH\`. Open it by hand:"
            echo
            echo "$COMPARE"
            echo
            echo "Every path failed. To fix the next run, do one of:"
            echo
            echo "- enable **Settings > Actions > General > Allow GitHub Actions to create and approve pull requests**,"
            echo "- add a \`PRICING_SYNC_TOKEN\` secret (PAT or App token with \`contents: write\` and \`pull-requests: write\`), or"
            echo "- check the **Open PR as the Claude GitHub App** step above — a bad \`CLAUDE_CODE_OAUTH_TOKEN\` or a missing App installation shows there."
          } >> "$GITHUB_STEP_SUMMARY"
          echo "::error::Prices moved but no pull request was opened. Review $COMPARE"
          exit 1
~~~

## .github/workflows/internal-only-shipper.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Internal-Only Feature Shipper

# Features that only exist in a dev build are features nobody uses. Each one
# still costs: it compiles, it ships in the bundle, it drifts, and it makes the
# code around it harder to read.
#
# This finds surfaces reachable only behind a dev/internal gate — `NODETOOL_ENV
# === "development"`, `import.meta.env.DEV`, `__DEV__`, `NODE_ENV !==
# "production"`, hidden routes, undocumented CLI commands — and forces a
# decision on each: ship it (drop the gate and document it) or delete it. The
# one outcome not allowed is leaving it as it is.

on:
  schedule:
    - cron: "30 5 * * *" # Daily at 05:30 UTC
  workflow_dispatch:

jobs:
  internal-only-shipper:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Find internal-only gates
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          echo "## Internal-Only Gates" >> $GITHUB_STEP_SUMMARY
          : > internal-only-gates.log

          PATTERN='import\.meta\.env\.DEV|__DEV__|NODE_ENV *[!=]== *["'"'"']production|NODETOOL_ENV *[=!]== *["'"'"']development|isDev(elopment)?\b|INTERNAL_ONLY|internalOnly'

          grep -rEn "$PATTERN" \
            --include="*.ts" --include="*.tsx" \
            web/src electron/src mobile/src packages/*/src 2>/dev/null \
            | grep -vE "\.test\.|\.spec\.|__tests__|/tests/" \
            > internal-only-gates.log || true

          GATES=$(wc -l < internal-only-gates.log | tr -d ' ')
          echo "Gated call sites: $GATES" >> $GITHUB_STEP_SUMMARY

          # Last-touched date per gated file: a gate nobody has touched in a
          # year is evidence of abandonment, not of caution.
          : > gate-age.log
          cut -d: -f1 internal-only-gates.log | sort -u | while IFS= read -r file; do
            LAST=$(git log -1 --format=%ad --date=short -- "$file" 2>/dev/null)
            echo "$LAST  $file" >> gate-age.log
          done
          sort gate-age.log | head -30 >> $GITHUB_STEP_SUMMARY

          if [ "$GATES" -gt 0 ]; then echo "GATES_FOUND=1" >> $GITHUB_ENV; else echo "GATES_FOUND=0" >> $GITHUB_ENV; fi

      - name: Run quality checks baseline
        if: env.GATES_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.GATES_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Ship or Delete an Internal-Only Feature

            `internal-only-gates.log` lists every call site gated to a dev or
            internal build. `gate-age.log` gives the last commit date per file,
            oldest first.

            Pick **one** feature — not one line, the whole feature behind the
            gate — and either ship it or delete it.

            ## Choose the feature
            Prefer the oldest gate that is a real user-facing surface: a panel,
            a menu entry, a route, a CLI command, a node, an API route. Skip:
            - debug logging and dev-server plumbing (`vite`, HMR, source maps)
            - React StrictMode and devtools wiring
            - test-only helpers and fixtures
            - anything under `__tests__/`, `tests/`, or `scripts/`

            ## Gather the evidence, then decide
            For the feature you picked, answer each of these with a command:
            - When was it last touched? `git log -5 --oneline -- <paths>`
            - Who references it? `grep -rn "<symbol>" --include="*.ts*" .`
            - Is it documented? Search `docs/`, `AGENTS.md`, `README.md`.
            - Is it covered by tests? Search `__tests__/` and `tests/`.
            - Does it still work? Drive it headlessly — the CLI harnesses in
              AGENTS.md (`nodetool validate`, `node run`, `app debug`) or the
              package's own test suite.

            **Ship it** when the feature works, is complete, and a user would
            want it: remove the gate, wire it into the normal UI/CLI surface,
            document it where its siblings are documented, and add a test if it
            has none.

            **Delete it** when it is abandoned — no commits for many months, no
            references outside its own files, no docs, and no working path
            through it. Remove the feature, its gate, its dead branches, its
            styles, its types, and its now-unused imports.

            State which one you chose and why, with the commands you ran, in the
            PR body. "Unclear" is not a verdict — if the evidence is genuinely
            split, delete it: it can be recovered from git, and an unused gate
            cannot.

            ## Rules
            - One feature per PR. Do not sweep every gate in the log.
            - Shipping means shipping: no gate left behind, no `if (false)`.
            - Do not delete a gate that guards *correctness* rather than
              visibility (dev-only assertions, mock providers used by tests,
              error overlays). Those are not features.
            - Do not touch CI workflow files.
            - Maximum 15 files per PR.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a shipper PR is
              already open.

            ## Verification
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```
            For a shipped feature, also drive it once headlessly and paste what
            it produced.

            ## Submit
            Create a PR titled "feat: ship <feature>" or "chore: remove abandoned
            <feature>", with the evidence table and the verdict.

      - name: Post-change verification
        if: always() && env.GATES_FOUND == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/issue-triage.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Issue Triage

# When a new issue is opened, Claude triages it: applies labels, checks for
# likely duplicates, and — for bug reports missing a reproduction — asks for the
# specifics needed to act. Read-only on code; it only comments and labels.
#
# Skips issues that tagged @claude (claude.yml handles those) and issues opened
# by the automation itself.

on:
  issues:
    types: [opened]

jobs:
  triage:
    if: |
      !contains(github.event.issue.body, '@claude') &&
      !contains(github.event.issue.title, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 1

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Read,Grep,Glob"
          prompt: |
            # Triage a New Issue

            A new issue was opened in ${{ github.repository }}:
            - Number: #${{ github.event.issue.number }}
            - Title: ${{ github.event.issue.title }}

            Read the full issue with `gh issue view ${{ github.event.issue.number }}`.

            Do the following, using the `gh` CLI:

            ## 1. Label it
            - Run `gh label list` to see available labels. Only apply labels that
              already exist — do not create new ones.
            - Apply the labels that fit: kind (`bug`, `enhancement`, `question`,
              `documentation`), and area if the labels support it (e.g. web,
              electron, mobile, backend/packages, a specific provider or node).
            - Infer area from the codebase: search `packages/`, `web/src`,
              `electron/`, `mobile/` for the files, nodes, or providers the issue
              names.
            - Apply with `gh issue edit ${{ github.event.issue.number }} --add-label "<label>"`.

            ## 2. Check for duplicates
            - Search existing issues:
              `gh issue list --search "<keywords>" --state all --limit 20`.
            - If you find a clear duplicate or strongly-related issue, post ONE
              comment linking it (`Possible duplicate of #NNN — ...`). Do not close
              the issue; leave that to a maintainer.

            ## 3. Request missing repro (bugs only)
            - If it's a bug report missing what's needed to reproduce (version /
              platform, exact steps, expected vs actual, the workflow or node
              involved, logs), post ONE friendly comment asking for the specific
              missing items. Be concrete — list exactly what you need.

            ## Rules
            - Read-only on code. Never edit files, never push, never open a PR.
            - Post at most ONE comment total. If nothing needs a comment (clear,
              complete, non-duplicate), just label and stop.
            - Do not restate the issue back to the author or add filler. No comment
              is better than a low-value one.
            - Do not @-mention maintainers or assign anyone.
~~~

## .github/workflows/logic-bugfixer.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Logic Bugfixer

# Picks one piece of tricky logic, builds an independent model of what it should
# do, and runs both over the whole input space. Every divergence is either a bug
# in the code or a bug in the model — and finding out which is the work.
#
# The candidates are pure, decidable functions: predicates, reducers, comparators,
# state transitions, window and range math, retry and backoff, the streaming
# fold. Anything whose behavior depends on a network, a clock, or a model is out
# of scope: this routine only reports what it can prove.

on:
  schedule:
    - cron: "30 6 * * *" # Daily at 06:30 UTC
  workflow_dispatch:
    inputs:
      target:
        description: "Optional file or symbol to model (default: pick from the scan)"
        required: false
        default: ""

jobs:
  logic-bugfixer:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Build packages
        run: npm run build:packages

      - name: Nominate decidable logic
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          echo "## Candidate Logic" >> $GITHUB_STEP_SUMMARY
          : > logic-candidates.log

          # Exported functions whose names say "this is a decision, and it is
          # decidable": predicates, comparators, folds, range and state math.
          grep -rEn "export (async )?function (is|has|can|should|needs|match|compare|merge|fold|clamp|resolve|normalize|select|next|derive|apply|reduce)[A-Z][A-Za-z0-9]*" \
            --include="*.ts" \
            packages/*/src web/src electron/src mobile/src 2>/dev/null \
            | grep -vE "__tests__|\.test\.|\.spec\.|/generated/" \
            >> logic-candidates.log || true

          CANDIDATES=$(wc -l < logic-candidates.log | tr -d ' ')
          echo "Candidates: $CANDIDATES" >> $GITHUB_STEP_SUMMARY

          # Which of them nothing tests yet — those are where divergences live.
          : > untested-candidates.log
          while IFS= read -r hit; do
            SYMBOL=$(echo "$hit" | sed -E 's/.*export (async )?function ([A-Za-z0-9_]+).*/\2/')
            [ -z "$SYMBOL" ] && continue
            if ! grep -rqE "\b$SYMBOL\b" --include="*.test.ts" --include="*.test.tsx" \
                 --include="*.spec.ts" packages web/src electron mobile/src 2>/dev/null; then
              echo "$hit" >> untested-candidates.log
            fi
          done < logic-candidates.log

          UNTESTED=$(wc -l < untested-candidates.log | tr -d ' ')
          echo "Untested candidates: $UNTESTED" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -20 untested-candidates.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          if [ "$CANDIDATES" -gt 0 ]; then echo "LOGIC_FOUND=1" >> $GITHUB_ENV; else echo "LOGIC_FOUND=0" >> $GITHUB_ENV; fi

      - name: Run quality checks baseline
        if: env.LOGIC_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV
          echo "PKG_TEST_PRE_EXIT=$PKG_TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.LOGIC_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, and prose throat-clearing."
          prompt: |
            # Model Tricky Logic and Fix What It Gets Wrong

            Requested target: `${{ github.event.inputs.target }}` (empty means
            choose one yourself).

            `logic-candidates.log` lists exported predicates, comparators,
            folds, and state transitions. `untested-candidates.log` is the
            subset nothing tests yet — prefer those.

            ## Method
            1. **Pick one function** that is pure and decidable: its result
               depends only on its arguments, and its interesting input space is
               small enough to enumerate (a handful of enums, booleans, small
               integers, short arrays) or to sample densely.

            2. **Write down the specification** in the PR body, from the docs,
               the call sites, and the types — not from the implementation.
               If the spec is genuinely ambiguous, say which reading you chose.

            3. **Write an independent model** in a scratch file under
               `/tmp` — a second implementation of the spec, written from the
               spec, deliberately structured differently from the code.

            4. **Enumerate the input space** and compare the model against the
               real function, imported from its real module. Never copy the
               implementation into the scratch file: a copy proves nothing.
               ```bash
               npx tsx /tmp/model-check.ts
               ```
               Cover the boundaries explicitly: empty, one element, duplicates,
               equal keys, min/max, negative, zero, `undefined` vs missing,
               NaN, unicode, and the transitions in and out of every state.

            5. **Triage every divergence.** For each one decide whether the code
               or the model is wrong, and say how you know — a doc, a call site
               that depends on it, a downstream test. A divergence you cannot
               adjudicate goes in the PR body as an open question, not into a
               fix.

            6. **Ship the reproduction with the fix.** For each real bug: add a
               failing test in the repo's own suite first (`__tests__/` next to
               the code, Vitest for `packages/`, Jest for `web`/`electron`),
               watch it fail, then fix the code and watch it pass. AGENTS.md
               requires the reproduction — a fix without one does not ship.

            ## Rules
            - No behavior changes without a failing test that proves the bug.
            - Do not "fix" a divergence by weakening the test or by rewriting
              the model to agree with the code.
            - Do not change a public signature to make modelling easier.
            - The scratch model stays in `/tmp`. What lands in the repo is the
              regression tests and the fix.
            - If the enumeration finds nothing, that is a fine outcome: land the
              enumeration as a table-driven test instead, and say the code held.
            - Do not touch CI workflow files.
            - One function per PR.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a logic-bugfix
              PR is already open.

            ## Verification
            ```bash
            npm run lint && npm run test && npm run test:packages
            ```

            ## Submit
            Create a PR titled "fix: <function> mishandles <case>" (or
            "test: pin <function> behavior" when nothing diverged) containing the
            spec, the input space enumerated, every divergence and its verdict,
            and the tests that now cover them.

      - name: Post-change verification
        if: always() && env.LOGIC_FOUND == '1'
        run: |
          LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1

          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$PKG_TEST_PRE_EXIT" -eq 0 ] && [ $PKG_TEST_EXIT -ne 0 ]; then
            echo "New package test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/logic-simplifier.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Logic Simplifier

# Ranks source files by branch density and nesting depth, then rewrites the
# worst offender's logic without changing what it does.
#
# The ranking is a crude proxy — a switch over twenty node kinds scores high and
# is fine as it is — so the scan only nominates candidates. The agent reads the
# code and decides whether there is a simplification worth making, and proves
# behavior is unchanged by running the existing tests, or by adding
# characterization tests first when there are none.

on:
  schedule:
    - cron: "0 6 * * *" # Daily at 06:00 UTC
  workflow_dispatch:

jobs:
  logic-simplifier:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Rank complexity hotspots
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          node --input-type=module - <<'JS' > complexity-hotspots.log
          import { readFileSync } from "node:fs";
          import { execFileSync } from "node:child_process";

          const files = execFileSync(
            "bash",
            [
              "-c",
              "git ls-files 'web/src/*.ts' 'web/src/*.tsx' 'electron/src/*.ts' " +
                "'mobile/src/*.ts' 'mobile/src/*.tsx' 'packages/*/src/*.ts' " +
                "| grep -vE '__tests__|\\.test\\.|\\.spec\\.|/generated/|/configs/|/data/|\\.d\\.ts$'",
            ],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
          )
            .split("\n")
            .filter(Boolean);

          const BRANCH = /\b(if|else if|switch|case|catch|while|for)\b|&&|\|\||\?\?|\?\./g;

          const scored = [];
          for (const file of files) {
            const source = readFileSync(file, "utf8");
            const lines = source.split("\n");
            if (lines.length < 60) continue;

            const branches = (source.match(BRANCH) ?? []).length;
            // A 5000-line lookup table has no logic to simplify, however long
            // it is. Branches are what this routine can act on.
            if (branches < 15) continue;

            // Max indent depth, tabs counted as one level, comments skipped.
            let depth = 0;
            for (const line of lines) {
              if (!line.trim() || line.trim().startsWith("*") || line.trim().startsWith("//")) continue;
              const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length;
              depth = Math.max(depth, Math.floor(indent / 2));
            }

            // Longest run of consecutive non-blank lines: a 200-line function
            // body and a 200-line file of small functions read very differently.
            let run = 0;
            let longestRun = 0;
            for (const line of lines) {
              run = line.trim() ? run + 1 : 0;
              longestRun = Math.max(longestRun, run);
            }

            const score = branches + depth * 4;
            scored.push({ file, score, branches, depth, longestRun, lines: lines.length });
          }

          scored.sort((a, b) => b.score - a.score);
          for (const entry of scored.slice(0, 25)) {
            console.log(
              `${String(entry.score).padStart(5)}  branches=${entry.branches} depth=${entry.depth} ` +
                `longest-run=${entry.longestRun} lines=${entry.lines}  ${entry.file}`,
            );
          }
          JS

          echo "## Complexity Hotspots" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -25 complexity-hotspots.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          if [ -s complexity-hotspots.log ]; then
            echo "HOTSPOTS_FOUND=1" >> $GITHUB_ENV
          else
            echo "HOTSPOTS_FOUND=0" >> $GITHUB_ENV
          fi

      - name: Run quality checks baseline
        if: env.HOTSPOTS_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.HOTSPOTS_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Simplify Convoluted Logic

            `complexity-hotspots.log` ranks source files by branch count, nesting
            depth, and longest unbroken run of code. It is a proxy, not a
            verdict — read the code before touching it.

            Pick **one** function or closely related group of functions and make
            the logic easier to follow without changing what it does.

            ## What to look for
            - **Deep nesting** that inverts cleanly: guard clauses and early
              returns instead of an arrow of `if`s.
            - **Boolean expressions** carrying three or more terms: name the
              sub-conditions, or express them as a small predicate.
            - **Repeated condition chains**: the same `a && b.c && b.c.d` test in
              five places, computed once instead.
            - **Flag arguments** that make a function do two unrelated things:
              split it in two.
            - **Manual loops** that are a `map`/`filter`/`find`/`some` in
              disguise, and reduces that reimplement `Object.fromEntries`.
            - **State machines written as booleans**: three `isLoading` /
              `isError` / `isDone` flags with implicit invariants become one
              discriminated union (AGENTS.md prefers this).
            - **Dead branches**: conditions that cannot hold given the types.

            ## What NOT to touch
            - Exhaustive `switch` over a union. That is the language working.
            - Ordering that looks arbitrary but is load-bearing (initialization
              order, event ordering, `await` sequencing). If you cannot explain
              why an order is safe to change, leave it.
            - Anything whose complexity is inherent: parsers, schedulers, the
              streaming fold, protocol framing.
            - Generated code (`packages/*/src/generated/**`, DSL codegen output).

            ## Method
            1. Read the function and write down, in the PR body, what it does —
               inputs, outputs, side effects, error paths.
            2. Find its tests. If there are none, **write characterization tests
               first** against the current behavior, in their own commit, and
               confirm they pass before you change anything.
            3. Refactor in small steps, running the tests after each.
            4. Diff the behavior, not the shape: every branch the old code took
               must still be reachable, including the error paths.

            ## Rules
            - Behavior-preserving only. No bug fixes, no new features. If you
              find a bug, leave it and report it in the PR body.
            - No new abstractions. This routine removes indirection; it does not
              add a strategy object to flatten an `if`.
            - One function or one tight cluster per PR. Maximum 6 files.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a simplification
              PR is already open.

            ## Verification
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```
            Backend packages also need `npm run test:packages`.

            ## Submit
            Create a PR titled "refactor: simplify <function> in <area>" with the
            before/after description of the logic and the tests that pin it.

      - name: Post-change verification
        if: always() && env.HOTSPOTS_FOUND == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/opencode.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Interactive Assistant

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  assistant:
    if: |
      contains(github.event.comment.body, ' /oc') ||
      startsWith(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, ' /opencode') ||
      startsWith(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,WebFetch,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # NodeTool Assistant

            You are an assistant for NodeTool, a React/TypeScript visual AI workflow builder.

            ## Project
            - Stack: React 18.2, TypeScript 5.7, Zustand, ReactFlow, MUI v7
            - Layout: `/web` (React app), `/electron` (desktop), `/mobile` (React Native)
            - Backend is a separate Python repo — this repo is frontend only
            - Read `AGENTS.md` and `.github/copilot-instructions.md` for coding conventions

            ## Respond to the comment
            Read the issue/PR comment and do what was asked. This could be:
            - Answering a question about the codebase
            - Investigating a bug
            - Implementing a fix or small feature
            - Reviewing code

            ## If you make code changes
            1. Keep changes minimal and focused on what was asked
            2. Run `npm run typecheck && npm run lint && npm run test` — all must pass
            3. Create a PR linking back to the issue/PR where `/oc` was invoked
            4. Do not refactor or "improve" code beyond what was requested
~~~

## .github/workflows/performance-optimization.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Performance Optimization

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

jobs:
  performance-optimization:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Performance Optimization

            Find and fix React/TypeScript performance issues in the NodeTool codebase.

            ## Scope
            - `/web/src` — React frontend (primary focus)
            - `/electron/src` — desktop app
            - `/mobile/src` — React Native app

            ## What to fix

            **Missing React.memo**: Components that receive the same props frequently but re-render unnecessarily. Look for components rendered inside lists or frequently-updating parents. Only add memo where there's a clear benefit (expensive renders or stable parent with changing siblings).

            **Missing useMemo/useCallback**: Expensive computations or object/array literals created on every render that are passed as props to child components or used as effect dependencies. Focus on:
            - Object/array literals in JSX props: `<Child items={data.filter(...)} />`
            - Functions defined inline and passed as props: `<Child onClick={() => handle(id)} />`
            - Expensive `.filter()`, `.map()`, `.reduce()`, `.sort()` chains on large datasets

            **Inefficient useEffect patterns**:
            - Effects that run on every render due to missing or incorrect dependency arrays
            - Effects that could be replaced with useMemo or event handlers
            - Multiple effects that could be consolidated

            **Unnecessary re-renders from Zustand**: Selectors that return new object references on every call. Fix by selecting primitive values or using shallow comparison.

            **Large bundle imports**: Importing entire libraries when only specific functions are needed (e.g. `import _ from 'lodash'` vs `import debounce from 'lodash/debounce'`).

            ## Rules
            - Only fix clear, measurable performance issues. Do not premature-optimize.
            - Do not change component APIs or public interfaces.
            - Do not touch `@ts-expect-error` / `@ts-ignore` directives.
            - Do not touch CI workflow files.
            - Keep changes focused — maximum 10 files per PR.
            - Each optimization must be justified in the PR description.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a performance PR is already open.
            - Focus on the most impactful files: large components, frequently-rendered components, store selectors.

            ## Verification
            After changes, all checks must still pass:
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "perf: optimize <area>" listing each change and why it improves performance.

      - name: Post-change verification
        if: always()
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/quality-assurance.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Quality Assurance

on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  quality-assurance:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run quality checks
        id: quality-check
        continue-on-error: true
        run: |
          echo "## Quality Check Results" >> $GITHUB_STEP_SUMMARY
          FAILED=0

          npm run lint:fix 2>&1 || true

          if npm run typecheck 2>&1 | tee typecheck.log; then
            echo "- typecheck: PASS" >> $GITHUB_STEP_SUMMARY
          else
            FAILED=1
            echo "- typecheck: FAIL" >> $GITHUB_STEP_SUMMARY
          fi

          if npm run lint 2>&1 | tee lint.log; then
            echo "- lint: PASS" >> $GITHUB_STEP_SUMMARY
          else
            FAILED=1
            echo "- lint: FAIL" >> $GITHUB_STEP_SUMMARY
          fi

          if npm run test 2>&1 | tee test.log; then
            echo "- test: PASS" >> $GITHUB_STEP_SUMMARY
          else
            FAILED=1
            echo "- test: FAIL" >> $GITHUB_STEP_SUMMARY
          fi

          echo "QUALITY_FAILED=$FAILED" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.QUALITY_FAILED == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Fix Broken Quality Checks

            The quality checks for this repo are failing. Your job is to fix them.

            Read the error logs to understand what's broken, then fix it:
            - `typecheck.log` — TypeScript compilation errors
            - `lint.log` — ESLint violations (run `npm run lint:fix` first, then fix the rest manually)
            - `test.log` — failing test cases

            ## Rules
            - Only fix actual errors. Do not refactor, improve, or "clean up" anything.
            - Do not touch code unrelated to the failing checks.
            - Do not add features, comments, or documentation.
            - Keep changes minimal — the smallest diff that makes checks pass.
            - If a test is failing because the code is wrong, fix the code. If a test is wrong, fix the test. Use git blame and recent commits to determine which.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — if an open PR already fixes these errors, stop.
            - Run `git branch -a | grep fix` — avoid duplicate branches.

            ## Verification
            After fixing, run all three and confirm exit code 0:
            ```bash
            npm run typecheck
            npm run lint
            npm run test
            ```

            ## Submit
            If you made changes, create a PR with a title like "fix: resolve typecheck/lint/test failures" describing what broke and how you fixed it.
            If everything was already passing (logs show no errors), do nothing.

      - name: Post-change verification
        if: always() && env.QUALITY_FAILED == '1'
        run: |
          echo "## Post-Fix Verification" >> $GITHUB_STEP_SUMMARY
          if npm run typecheck && npm run lint && npm run test; then
            echo "All checks passing." >> $GITHUB_STEP_SUMMARY
          else
            echo "Checks still failing after fix attempt." >> $GITHUB_STEP_SUMMARY
            exit 1
          fi
~~~

## .github/workflows/security-audit.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Security Audit

on:
  workflow_dispatch:

jobs:
  security-audit:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      security-events: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run npm audit
        continue-on-error: true
        run: |
          echo "## npm audit results" >> $GITHUB_STEP_SUMMARY
          echo "### workspace root (web, electron, packages/*)" >> $GITHUB_STEP_SUMMARY
          npm audit --json > npm-audit.json 2>/dev/null || true
          npm audit 2>/dev/null | tail -20 >> $GITHUB_STEP_SUMMARY || true
          echo "### mobile" >> $GITHUB_STEP_SUMMARY
          cd mobile && npm audit --json > npm-audit.json 2>/dev/null || true
          npm audit 2>/dev/null | tail -20 >> $GITHUB_STEP_SUMMARY || true

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Security Audit

            Audit NodeTool for security vulnerabilities and fix what you find.

            ## Scope
            - `/web` — React frontend
            - `/electron` — desktop app (Electron)
            - `/mobile` — React Native app

            ## What to check

            **Dependencies**: Read `*/npm-audit.json` for known CVEs. Fix critical/high severity by updating packages. Do not bump major versions without checking for breaking changes.

            **Code patterns** (search for these):
            - `dangerouslySetInnerHTML` without sanitization (DOMPurify)
            - `eval()` or `new Function()` with user input
            - Hardcoded API keys, tokens, or passwords in source files
            - User input passed directly to DOM or URLs without validation
            - File upload handlers without type/size validation

            **Electron-specific**:
            - `nodeIntegration` should be `false`
            - `contextIsolation` should be `true`
            - IPC messages should be validated

            ## Rules
            - Fix real vulnerabilities only. Do not add speculative defenses or wrap everything in try/catch.
            - One PR per audit. Keep changes focused and reviewable.
            - Maximum 10 files changed.
            - Do not touch CI workflows.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a security PR is already open.

            ## Verification
            After fixing, all checks must still pass:
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "security: <brief description>" listing each vulnerability fixed and its severity.

      - name: Post-change verification
        if: always()
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/seo-seed.yml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: SEO Showcase Seed

# Layer-3 CI glue for the programmatic-SEO showcase pages: generate → guard →
# upload videos to R2 → ingest → open a review PR. Merging the PR is the index
# gate; NOTHING here auto-merges.
#
# Two triggers:
#   - workflow_dispatch: a maintainer seeds a specific batch on demand.
#   - schedule (weekly): a small default batch keeps the corpus growing. With no
#     inputs, "Resolve run parameters" rotates one image template by ISO week.
#
# Required repo secrets:
#   CLAUDE_CODE_OAUTH_TOKEN  prompt writing (seed.ts, via the Claude Agent SDK)
#   FAL_API_KEY              image/video rendering (seed.ts)
#   CLOUDFLARE_API_TOKEN   R2 upload (wrangler) — same token marketing-ci uses
#   CLOUDFLARE_ACCOUNT_ID  R2 account (wrangler)
# The repo/org setting "Allow GitHub Actions to create and approve pull
# requests" must be ON for the PR step to post with GITHUB_TOKEN.

on:
  workflow_dispatch:
    inputs:
      templates:
        description: "Comma-separated template slugs (movie-posters, product-shots, album-covers, product-trailers)"
        required: false
        type: string
      models:
        description: "Comma-separated model slugs, e.g. flux-schnell,flux-dev"
        required: false
        type: string
      count:
        description: "Assets per template×model"
        required: false
        default: "5"
        type: string
      budget_usd:
        description: "Hard USD cap per template batch"
        required: false
        default: "10"
        type: string
      duel:
        description: "Duel two models over a curated prompt set, e.g. flux-schnell,flux-dev (overrides models)"
        required: false
        type: string
  schedule:
    # Weekly, Monday 07:00 UTC — a small default batch.
    - cron: "0 7 * * 1"

# Least-privilege: the job reads the repo, then peter-evans opens the PR with the
# default GITHUB_TOKEN (needs write + PR create).
permissions:
  contents: write
  pull-requests: write

concurrency:
  group: seo-seed
  cancel-in-progress: false

jobs:
  seed:
    name: Seed, guard, ingest, open PR
    runs-on: ubuntu-latest
    env:
      # R2 target for video assets. Override here if the bucket / media domain
      # differ from the defaults baked into upload-videos-r2.mjs.
      R2_BUCKET: nodetool-media
      R2_PUBLIC_BASE: https://media.nodetool.ai
    steps:
      - name: Checkout code
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Resolve run parameters
        id: params
        env:
          IN_TEMPLATES: ${{ github.event.inputs.templates }}
          IN_MODELS: ${{ github.event.inputs.models }}
          IN_COUNT: ${{ github.event.inputs.count }}
          IN_BUDGET: ${{ github.event.inputs.budget_usd }}
          IN_DUEL: ${{ github.event.inputs.duel }}
          RUN_NUMBER: ${{ github.run_number }}
        run: |
          set -euo pipefail
          # Scheduled runs carry no inputs → rotate one image template by ISO
          # week so the weekly batch varies. flux-schnell is the cheap default.
          WEEK=$(date -u +%V)
          ROTATION=(movie-posters product-shots album-covers)
          DEFAULT_TEMPLATE=${ROTATION[$((10#$WEEK % 3))]}

          TEMPLATES="${IN_TEMPLATES:-$DEFAULT_TEMPLATE}"
          MODELS="${IN_MODELS:-flux-schnell}"
          COUNT="${IN_COUNT:-5}"
          BUDGET="${IN_BUDGET:-10}"
          DUEL="${IN_DUEL:-}"
          BATCH_DATE=$(date -u +%Y%m%d)

          {
            echo "templates=$TEMPLATES"
            echo "models=$MODELS"
            echo "count=$COUNT"
            echo "budget=$BUDGET"
            echo "duel=$DUEL"
            echo "batch_suffix=$BATCH_DATE-$RUN_NUMBER"
          } >> "$GITHUB_OUTPUT"
          echo "Resolved: templates=$TEMPLATES models=$MODELS count=$COUNT budget=$BUDGET duel=${DUEL:-<none>}"

      - name: Install root dependencies
        run: npm ci

      - name: Build backend packages
        # seed.ts imports @nodetool-ai/* from dist/.
        run: npm run build:packages

      - name: Install marketing dependencies
        working-directory: marketing
        run: npm ci

      - name: Seed batches
        working-directory: marketing
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          FAL_API_KEY: ${{ secrets.FAL_API_KEY }}
          TEMPLATES: ${{ steps.params.outputs.templates }}
          MODELS: ${{ steps.params.outputs.models }}
          COUNT: ${{ steps.params.outputs.count }}
          BUDGET: ${{ steps.params.outputs.budget }}
          DUEL: ${{ steps.params.outputs.duel }}
          BATCH_SUFFIX: ${{ steps.params.outputs.batch_suffix }}
        run: |
          set -euo pipefail
          IFS=',' read -ra TPL <<< "$TEMPLATES"
          for t in "${TPL[@]}"; do
            t=$(echo "$t" | xargs)  # trim
            [ -z "$t" ] && continue
            BATCH="$t-$BATCH_SUFFIX"
            if [ -n "$DUEL" ]; then
              echo "::group::seed $t (duel $DUEL)"
              npm run seo:seed -- --template "$t" --duel "$DUEL" \
                --budget-usd "$BUDGET" --batch "$BATCH"
            else
              echo "::group::seed $t (models $MODELS)"
              npm run seo:seed -- --template "$t" --models "$MODELS" \
                --count "$COUNT" --budget-usd "$BUDGET" --batch "$BATCH"
            fi
            echo "::endgroup::"
          done

      - name: Guard manifest (row count + spend vs cap)
        working-directory: marketing
        run: npm run seo:guard -- --budget-usd "${{ steps.params.outputs.budget }}"

      - name: Upload videos to R2
        working-directory: marketing
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npm run seo:upload-videos

      - name: Ingest into page data
        working-directory: marketing
        run: npm run seo:ingest

      - name: Open review PR
        uses: peter-evans/create-pull-request@v8
        with:
          branch: seo/seed-${{ steps.params.outputs.batch_suffix }}
          base: main
          # Commit ONLY the ingested page data + published images. Raw batches
          # (marketing/seo/out) and R2-hosted videos are deliberately excluded.
          add-paths: |
            marketing/src/data/showcaseEntries.generated.ts
            marketing/public/showcase/**
          commit-message: "chore(seo): seed showcase batch ${{ steps.params.outputs.batch_suffix }}"
          title: "SEO showcase seed: ${{ steps.params.outputs.templates }} (${{ steps.params.outputs.batch_suffix }})"
          body: |
            Automated showcase seed batch. **Review is the index gate — this does not auto-merge.**

            Run parameters:
            - Templates: `${{ steps.params.outputs.templates }}`
            - Models: `${{ steps.params.outputs.models }}`
            - Duel: `${{ steps.params.outputs.duel }}`
            - Count: `${{ steps.params.outputs.count }}`
            - Budget cap (per batch): `$${{ steps.params.outputs.budget }}`

            Review checklist before merging:
            - [ ] Outputs eyeballed — no broken, blank, or off-brand assets
            - [ ] Prompts read as human-written, not templated boilerplate
            - [ ] No duplicate slugs / near-duplicate prompts slipped the gate
            - [ ] Committed image weight is within budget (each `<= 300KB`)
            - [ ] Total spend is at or under the cap (see the guard step log)
            - [ ] Every video `src` resolves from R2 (not a local path)
          delete-branch: true
~~~

## .github/workflows/shipped-feature-inliner.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Shipped Feature Inliner

# A flag for a feature that shipped is a branch nobody takes, a config knob
# nobody sets, and a second code path nobody tests. This finds gates that are
# permanently on — constants initialized to `true`, env vars that default to
# enabled and are never set, settings whose "off" branch no test and no caller
# exercises — and inlines the live branch.
#
# Inlining a flag deletes the fallback. That is the point, and it is also the
# risk: the routine only removes a flag when the off-path is provably unused,
# and the rollback is a revert.

on:
  schedule:
    - cron: "0 8 * * *" # Daily at 08:00 UTC
  workflow_dispatch:

jobs:
  shipped-feature-inliner:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Find flags that are always on
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          node --input-type=module - <<'JS' > shipped-flags.log
          import { readFileSync } from "node:fs";
          import { execFileSync } from "node:child_process";

          // The config corpus is tens of megabytes; the 1 MB default throws ENOBUFS.
          const sh = (command) =>
            execFileSync("bash", ["-c", command], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

          const sourceFiles = sh(
            "git ls-files 'web/src/*.ts' 'web/src/*.tsx' 'electron/src/*.ts' " +
              "'mobile/src/*.ts' 'mobile/src/*.tsx' 'packages/*/src/*.ts' " +
              "| grep -vE '__tests__|\\.test\\.|\\.spec\\.|__mocks__|/generated/'",
          )
            .split("\n")
            .filter(Boolean);

          // Everything that could set a variable outside the source itself:
          // env files, CI, container and deploy config, scripts, docs.
          const configCorpus = sh(
            "git ls-files | grep -vE '^(web|electron|mobile)/src/|^packages/[^/]+/src/' " +
              "| grep -E '\\.(env|env\\..*|ya?ml|json|toml|sh|mjs|md|Dockerfile.*)$|Dockerfile|\\.env' " +
              "| head -400 | xargs -r cat 2>/dev/null",
          );

          // Boolean-shaped gates only. A key or a URL read from the environment
          // is configuration; `X === "1"` is a switch.
          const GATE =
            /(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)\s*(?:!==|===|==|!=)\s*["'](?:1|0|true|false)["']|(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)\s*(?:\?\?|\|\|)\s*["'](?:1|0|true|false)["']|Boolean\(\s*(?:process|import\.meta)\.env\.([A-Z][A-Z0-9_]*)\s*\)/g;

          const gates = new Map();
          for (const file of sourceFiles) {
            const source = readFileSync(file, "utf8");
            for (const match of source.matchAll(GATE)) {
              const name = match[1] ?? match[2] ?? match[3];
              const entry = gates.get(name) ?? { reads: 0, files: new Set() };
              entry.reads += 1;
              entry.files.add(file);
              gates.set(name, entry);
            }
          }

          const rows = [...gates.entries()]
            .map(([name, entry]) => ({
              name,
              reads: entry.reads,
              files: [...entry.files],
              // Set anywhere outside the reading code? Then somebody flips it.
              setInConfig: new RegExp(`${name}\\s*[:=]`).test(configCorpus),
            }))
            .sort((a, b) => Number(a.setInConfig) - Number(b.setInConfig) || a.reads - b.reads);

          console.log("## Boolean env gates (never set in the repo first)");
          for (const row of rows) {
            console.log(
              `  ${row.name}  reads=${row.reads}  set-in-config=${row.setInConfig}  ${row.files.join(" ")}`,
            );
          }

          console.log("");
          console.log("## Constants pinned to a boolean literal");
          for (const file of sourceFiles) {
            const source = readFileSync(file, "utf8");
            for (const match of source.matchAll(
              /^(?:export )?const ([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(true|false)(?: as const)?;/gm,
            )) {
              console.log(`  ${file}  ${match[1]} = ${match[2]}`);
            }
          }
          JS

          echo "## Candidate Flags" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -50 shipped-flags.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          # The two section headers print unconditionally; findings are indented.
          FLAGS=$(grep -c "^  " shipped-flags.log || true)
          echo "Findings: $FLAGS" >> $GITHUB_STEP_SUMMARY
          if [ "${FLAGS:-0}" -gt 0 ]; then echo "FLAGS_FOUND=1" >> $GITHUB_ENV; else echo "FLAGS_FOUND=0" >> $GITHUB_ENV; fi

      - name: Run quality checks baseline
        if: env.FLAGS_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.FLAGS_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, and prose throat-clearing."
          prompt: |
            # Inline a Shipped Feature Flag

            `shipped-flags.log` has two sections. **Boolean env gates** —
            environment variables compared against `"1"`/`"true"`, with the
            number of read sites and whether anything in the repo sets them;
            those never set, read in one place, are listed first. **Constants
            pinned to a boolean literal** — a gate whose value is in the source.

            Pick **one** flag whose feature has fully shipped and remove it.

            ## Establish that it has shipped
            Answer each with a command, in the PR body:
            - What value does it actually take in every build? Read the
              declaration and every override (`.env*`, `fly.toml`,
              `docker-compose.yml`, `electron-builder.json`, CI workflows,
              `packages/config`).
            - Does anything set the other value? `grep -rn "<FLAG>" .` including
              docs, scripts, and workflow files.
            - When did it last change? `git log --oneline -- <file>` and
              `git log -S "<FLAG>" --oneline | tail -5` for when it was
              introduced. A gate added last month is not a shipped feature.
            - Do any tests exercise the off-path? If they do, that path is alive
              — pick a different flag.

            A flag qualifies only when every build takes one branch, nothing in
            the repo sets the other, and the feature has been live long enough
            that reverting the flag is not the rollback plan anymore.

            ## Then inline it
            - Replace every read with the value it always has, and delete the
              branch that value never takes.
            - Delete the flag's declaration, its type, its config plumbing, its
              env-var documentation, and any settings-UI control for it.
            - Delete the now-unreachable implementation on the other side —
              including files, components, and helpers only that path used.
            - Delete the tests that only covered the dead path. Keep, and if
              necessary un-parameterize, the tests covering the live one.
            - Update the docs that mention the flag: `docs/`, `AGENTS.md`,
              `README.md`, `.env.example`.

            ## Rules
            - One flag per PR. Maximum 20 files.
            - Never inline a **kill switch** or a safety gate: rate limits, spend
              caps, SSRF and sandbox guards, `NODETOOL_TRUST_*`, auth mode. Those
              are configuration, not shipped features.
            - Never inline a flag that selects between platforms or environments
              (`NODETOOL_ENV`, `process.platform`, dev vs production).
            - Never inline a flag that any test sets.
            - Do not touch CI workflow files.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a flag-inlining
              PR is already open.

            ## Verification
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```
            Backend packages also need `npm run test:packages`. Confirm the flag
            name appears nowhere afterwards: `grep -rn "<FLAG>" . | grep -v .git`

            ## Submit
            Create a PR titled "chore: inline the <feature> flag" with the
            evidence that it shipped, the branch that was removed, and everything
            deleted along with it.

      - name: Post-change verification
        if: always() && env.FLAGS_FOUND == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/test-coverage.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Test Coverage Improvement

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

jobs:
  test-coverage:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Run coverage report
        id: coverage
        continue-on-error: true
        run: |
          echo "## Coverage Report" >> $GITHUB_STEP_SUMMARY

          cd web && npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>&1 | tee coverage.log || true
          echo "### Web Coverage" >> $GITHUB_STEP_SUMMARY
          tail -20 coverage.log >> $GITHUB_STEP_SUMMARY || true
          cd ..

          cd electron && npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>&1 | tee coverage.log || true
          echo "### Electron Coverage" >> $GITHUB_STEP_SUMMARY
          tail -20 coverage.log >> $GITHUB_STEP_SUMMARY || true
          cd ..

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Improve Test Coverage

            Add meaningful tests for untested or under-tested code in the NodeTool codebase.

            ## Scope
            - `/web/src` — React frontend
            - `/electron/src` — desktop app

            ## How to find gaps

            1. Read the coverage reports: `web/coverage.log` and `electron/coverage.log`
            2. Identify source files with low or zero coverage
            3. Prioritize: utility functions > store logic > hooks > components

            ## What to test

            **Utility functions**: Pure functions in utils/helpers directories. Test edge cases, error conditions, and typical usage.

            **Zustand store actions**: Test store actions produce the correct state changes. Use the pattern from existing tests.

            **Custom hooks**: Test hooks using `renderHook` from React Testing Library. Test state changes and side effects.

            **React components**: Test rendering, user interactions, and conditional display. Follow existing patterns using React Testing Library.

            ## Rules
            - Follow existing test patterns and conventions in the codebase. Read existing test files first.
            - Place test files adjacent to source files as `__tests__/<filename>.test.ts(x)` matching the existing convention.
            - Use the same test utilities and mocking patterns already in the codebase.
            - Do not mock what you can test directly. Prefer integration-style tests.
            - Do not add tests for trivial code (simple pass-through components, re-exports).
            - Do not modify existing tests unless they are broken.
            - Do not touch `@ts-expect-error` / `@ts-ignore` directives.
            - Do not touch `test.skip` / `describe.skipIf` / `test.fixme` markers.
            - Do not touch CI workflow files.
            - Keep changes focused — maximum 5 new test files per PR.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a test coverage PR is already open.
            - Read 2-3 existing test files to understand the project's testing conventions.

            ## Verification
            After adding tests, all checks must pass:
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "test: add coverage for <area>" listing each new test file and what it covers.

      - name: Post-change verification
        if: always()
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/ui-primitives-compliance.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: UI Primitives & Design Tokens

# Enforces the two MANDATORY frontend rules from AGENTS.md that no generic
# linter covers:
#   1. Never import raw MUI components outside ui_primitives/ or editor_ui/
#      (use the primitives in web/src/components/ui_primitives/ instead).
#   2. Never hardcode design tokens — border radii, transition strings, font
#      sizes, or off-grid spacing. Use SPACING / TYPOGRAPHY / BORDER_RADIUS /
#      MOTION / Z_INDEX.
#
# There is a large existing backlog, so this migrates a small, verified batch
# per run rather than trying to fix everything at once. Reporting + a focused
# PR — it never auto-merges.

on:
  schedule:
    - cron: "0 3 * * 2" # Tuesdays at 03:00 UTC
  workflow_dispatch:

jobs:
  ui-primitives-compliance:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Scan for design-system violations
        id: ds-scan
        continue-on-error: true
        run: |
          echo "## UI Primitives & Design Token Scan" >> $GITHUB_STEP_SUMMARY
          ISSUES=0

          # Raw MUI imports outside the allowed directories.
          RAW_MUI=$(grep -rlE "from ['\"]@mui/material" web/src --include="*.tsx" --include="*.ts" 2>/dev/null \
            | grep -v "ui_primitives/" | grep -v "editor_ui/" | wc -l || echo 0)
          echo "- Files with raw @mui/material imports (outside ui_primitives/editor_ui): $RAW_MUI" >> $GITHUB_STEP_SUMMARY
          if [ "$RAW_MUI" -gt 0 ]; then ISSUES=1; fi

          # Hardcoded transition strings.
          RAW_TRANSITION=$(grep -rlE "transition:\s*['\"][^'\"]*[0-9]+m?s" web/src --include="*.tsx" --include="*.ts" 2>/dev/null \
            | grep -v "ui_primitives/" | wc -l || echo 0)
          echo "- Files with hardcoded transition strings: $RAW_TRANSITION" >> $GITHUB_STEP_SUMMARY
          if [ "$RAW_TRANSITION" -gt 0 ]; then ISSUES=1; fi

          # Hardcoded px font sizes.
          RAW_FONT=$(grep -rlE "fontSize:\s*['\"][0-9.]+(px|rem)['\"]" web/src --include="*.tsx" --include="*.ts" 2>/dev/null \
            | grep -v "ui_primitives/" | wc -l || echo 0)
          echo "- Files with hardcoded fontSize values: $RAW_FONT" >> $GITHUB_STEP_SUMMARY
          if [ "$RAW_FONT" -gt 0 ]; then ISSUES=1; fi

          echo "DS_ISSUES=$ISSUES" >> $GITHUB_ENV

      - name: Run quality checks baseline
        id: pre-check
        continue-on-error: true
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          echo "TYPECHECK_PRE_EXIT=$TYPECHECK_EXIT" >> $GITHUB_ENV
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.DS_ISSUES == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, useEffect-for-derived-data, raw MUI imports outside ui_primitives/, whole-store Zustand subscriptions, useEffect+fetch instead of useQuery, and prose throat-clearing."
          prompt: |
            # Migrate to UI Primitives & Design Tokens

            Enforce NodeTool's two MANDATORY frontend rules in `web/src`. Read the
            policy first — do not guess the mapping:
            - `web/src/components/ui_primitives/STRATEGY.md` — decision tree,
              migration rules, and the full catalog of 90+ primitives.
            - `docs/DESIGN.md` — the token systems (SPACING, TYPOGRAPHY,
              BORDER_RADIUS, MOTION, Z_INDEX).

            ## What to fix

            **Raw MUI imports**: Files importing components from `@mui/material`
            (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`,
            `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) outside
            `ui_primitives/` and `editor_ui/`. Replace each with the matching
            primitive from `web/src/components/ui_primitives/`. If a primitive
            does not exist for a component you need, leave that file alone and note
            it in the PR body — do NOT invent a new primitive in this PR.

            **Hardcoded design tokens**: Replace hardcoded border radii (`4`,
            `10`, `"18px"`), transition strings (`"all 200ms ease"`), font sizes
            (`"14px"`, `"0.85rem"`), and off-grid spacing (`5px`, `10px`, `13px`)
            with the named constants (`BORDER_RADIUS`, `MOTION`, `TYPOGRAPHY`,
            `SPACING`) from `ui_primitives`.

            ## Rules
            - Verify every mapping against STRATEGY.md and DESIGN.md. When a raw
              component has no clean primitive equivalent, skip it.
            - Do not change runtime behavior or visual appearance — swap the import
              and token, keep the same rendered result.
            - Do not touch `ui_primitives/` or `editor_ui/` internals (they are
              allowed to use raw MUI).
            - Do not touch CI workflow files.
            - Keep changes focused — maximum 10 files per PR. Pick a coherent
              batch (e.g. one feature directory) so review is easy.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a primitives/design
              PR is already open.
            - Pick 5-10 files with the most violations or in one area.

            ## Verification
            After changes, all checks must still pass:
            ```bash
            npm run typecheck && npm run lint && npm run test
            ```

            ## Submit
            Create a PR titled "ui: migrate <area> to primitives/design tokens"
            listing each file changed, the raw components/tokens removed, and any
            files skipped for lack of a primitive.

      - name: Post-change verification
        if: always() && env.DS_ISSUES == '1'
        run: |
          TYPECHECK_EXIT=0; LINT_EXIT=0; TEST_EXIT=0
          npm run typecheck 2>&1 || TYPECHECK_EXIT=1
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1

          if [ "$TYPECHECK_PRE_EXIT" -eq 0 ] && [ $TYPECHECK_EXIT -ne 0 ]; then
            echo "New TypeScript errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
~~~

## .github/workflows/useless-test-pruner.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Useless Test Pruner

# A test that cannot fail is worse than no test: it costs CI time and it reads
# as coverage. This finds the usual shapes — no assertion at all, assertions
# only about mocks the test itself wrote, tautologies, snapshots of a literal —
# and requires proof before anything is deleted.
#
# The proof is a mutation: break the code the test claims to cover, run the test,
# and watch it pass anyway. Only then is it established that the test cannot
# fail. A candidate that turns red under mutation is doing its job and stays.

on:
  schedule:
    - cron: "30 7 * * *" # Daily at 07:30 UTC
  workflow_dispatch:

jobs:
  useless-test-pruner:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      - name: Install mobile dependencies
        run: cd mobile && npm ci

      - name: Find tests that cannot fail
        id: scan
        continue-on-error: true
        shell: bash
        run: |
          node --input-type=module - <<'JS' > useless-tests.log
          import { readFileSync } from "node:fs";
          import { execFileSync } from "node:child_process";

          const files = execFileSync(
            "bash",
            [
              "-c",
              // Playwright suites are out of scope: the proof loop below runs
              // single cases under Jest and Vitest.
              "git ls-files '*.test.ts' '*.test.tsx' '*.spec.ts' '*.spec.tsx' " +
                "| grep -vE '^(marketing|reliability)/|^web/(tests|e2e)/'",
            ],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
          )
            .split("\n")
            .filter(Boolean);

          // Split a test file into cases by `it(`/`test(` at the start of a line,
          // which is how every suite in this repo is written. `describe` is not
          // a case: counting it as one would report every suite whose header
          // sits above its first assertion.
          const splitCases = (source) => {
            const lines = source.split("\n");
            const cases = [];
            let current = null;
            for (let i = 0; i < lines.length; i += 1) {
              const start = /^\s*(it|test)(\.(each|concurrent|failing|only))?\s*[(`]/.test(lines[i]);
              if (start) {
                if (current) cases.push(current);
                current = { line: i + 1, body: [] };
              }
              if (current) current.body.push(lines[i]);
            }
            if (current) cases.push(current);
            return cases;
          };

          const findings = [];
          for (const file of files) {
            const source = readFileSync(file, "utf8");
            for (const testCase of splitCases(source)) {
              const body = testCase.body.join("\n");
              const title = testCase.body[0].trim().slice(0, 90);
              const reasons = [];

              const assertions = body.match(/\bexpect\s*\(|\bassert[.(]/g) ?? [];
              if (assertions.length === 0) {
                reasons.push("no assertion");
              }
              if (/expect\(true\)\.(toBe|toEqual)\(true\)|expect\(1\)\.toBe\(1\)/.test(body)) {
                reasons.push("tautological assertion");
              }
              // Every assertion is `toBeDefined`/`toBeTruthy` on something the
              // test just constructed: it asserts that JavaScript works.
              if (
                assertions.length > 0 &&
                /expect\([^)]*\)\.(toBeDefined|toBeTruthy|not\.toBeNull|not\.toBeUndefined)\(\)/.test(body) &&
                !/toBe\(|toEqual\(|toMatch|toThrow|toHaveBeenCalledWith|toContain|toStrictEqual/.test(body)
              ) {
                reasons.push("only existence assertions");
              }
              // Asserting a mock returns what the same test told it to return.
              // The subject of every assertion has to be the mock itself —
              // asserting the *code under test* while a dependency is mocked is
              // just normal testing.
              const subjects = [...body.matchAll(/expect\(\s*([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
              if (
                subjects.length > 0 &&
                /mockReturnValue|mockResolvedValue|mockImplementation/.test(body) &&
                !/toHaveBeenCalled/.test(body) &&
                subjects.every((subject) => /^mock|Mock$|^jest\./.test(subject))
              ) {
                reasons.push("asserts its own mock");
              }
              if (/expect\([^)]*\)\.toMatchSnapshot\(\)/.test(body) && assertions.length === 1) {
                reasons.push("snapshot-only");
              }

              if (reasons.length) {
                findings.push(`${file}:${testCase.line}  [${reasons.join(", ")}]  ${title}`);
              }
            }
          }

          for (const finding of findings.slice(0, 60)) console.log(finding);
          console.error(`${findings.length} candidates`);
          JS

          echo "## Tests That May Not Be Able To Fail" >> $GITHUB_STEP_SUMMARY
          CANDIDATES=$(wc -l < useless-tests.log | tr -d ' ')
          echo "Candidates: $CANDIDATES" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          head -40 useless-tests.log >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

          if [ "$CANDIDATES" -gt 0 ]; then echo "USELESS_FOUND=1" >> $GITHUB_ENV; else echo "USELESS_FOUND=0" >> $GITHUB_ENV; fi

      - name: Run quality checks baseline
        if: env.USELESS_FOUND == '1'
        id: pre-check
        continue-on-error: true
        run: |
          LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1
          echo "LINT_PRE_EXIT=$LINT_EXIT" >> $GITHUB_ENV
          echo "TEST_PRE_EXIT=$TEST_EXIT" >> $GITHUB_ENV
          echo "PKG_TEST_PRE_EXIT=$PKG_TEST_EXIT" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.USELESS_FOUND == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff. Strip speculative abstractions, narrating comments, defensive try/catch on trusted paths, and prose throat-clearing."
          prompt: |
            # Delete Tests That Cannot Fail

            `useless-tests.log` lists test cases whose shape suggests they assert
            nothing real: no assertion, a tautology, existence checks only, an
            assertion about a mock the test itself configured, a lone snapshot.

            The scan is a heuristic. **Nothing gets deleted without proof.**

            ## The proof
            For each candidate, before touching it:
            1. Find the code it claims to cover.
            2. Break that code — invert a condition, return a wrong constant,
               drop a call. One mutation at a time.
            3. Run only that test:
               ```bash
               npm test --workspace=web -- -t "<test name>"
               npm run test --workspace=packages/<name> -- -t "<test name>"
               ```
            4. If it **still passes**, it cannot fail: it is a candidate for
               real. If it **fails**, the test is doing its job — revert the
               mutation, drop the candidate, and say so.
            5. Revert the mutation before moving on. `git diff` must be clean of
               it before you commit anything.

            Paste the mutation and the result for every case you act on.

            ## Then choose: strengthen or delete
            - **Strengthen** when the behavior deserves coverage and the test is
              merely weak: assert the value, not its existence; assert
              `toHaveBeenCalledWith`, not that a mock was configured; assert the
              error, not that something threw.
            - **Delete** when the behavior is already covered elsewhere, or the
              test only exercises the framework, the mock, or the type system.
              Name the test that covers it instead, or say plainly that the
              behavior is untested and worth someone's attention.

            Prefer strengthening. A deleted test is coverage lost; a strengthened
            one is coverage gained.

            ## Rules
            - Never delete a test to make CI green. This routine runs against a
              green tree.
            - Do not touch `test.skip`, `describe.skipIf`, or `test.fixme`
              markers — those are tracked debt, not useless tests (AGENTS.md).
            - Do not delete a test whose mutation you could not run.
            - Snapshot tests over rendered components are not automatically
              useless — check whether the snapshot has content.
            - Do not touch CI workflow files.
            - Maximum 12 test cases per PR.

            ## Before starting
            - Run `gh pr list --state open --limit 20` — skip if a test-pruning
              PR is already open.

            ## Verification
            ```bash
            npm run lint && npm run test && npm run test:packages
            ```

            ## Submit
            Create a PR titled "test: remove tests that cannot fail in <area>"
            with a table: test, mutation applied, result, verdict (strengthened /
            deleted), and where the behavior is covered now.

      - name: Post-change verification
        if: always() && env.USELESS_FOUND == '1'
        run: |
          LINT_EXIT=0; TEST_EXIT=0; PKG_TEST_EXIT=0
          npm run lint 2>&1 || LINT_EXIT=1
          npm run test 2>&1 || TEST_EXIT=1
          npm run test:packages 2>&1 || PKG_TEST_EXIT=1

          if [ "$LINT_PRE_EXIT" -eq 0 ] && [ $LINT_EXIT -ne 0 ]; then
            echo "New lint errors introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$TEST_PRE_EXIT" -eq 0 ] && [ $TEST_EXIT -ne 0 ]; then
            echo "New test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi
          if [ "$PKG_TEST_PRE_EXIT" -eq 0 ] && [ $PKG_TEST_EXIT -ne 0 ]; then
            echo "New package test failures introduced" >> $GITHUB_STEP_SUMMARY; exit 1
          fi

      - name: Confirm no mutation was committed
        if: always() && env.USELESS_FOUND == '1'
        shell: bash
        run: |
          # A mutation left behind by the proof step would land as a source
          # change in a PR that is meant to touch tests only.
          BASE="origin/${{ github.event.repository.default_branch }}"
          if ! git rev-parse --verify --quiet "$BASE" > /dev/null; then
            echo "Base ref $BASE not available — skipping the test-only check" >> $GITHUB_STEP_SUMMARY
            exit 0
          fi
          CHANGED_SRC=$(git diff --name-only "$BASE"...HEAD \
            | grep -vE "\.test\.|\.spec\.|__tests__|__snapshots__" || true)
          if [ -n "$CHANGED_SRC" ]; then
            echo "Non-test files changed by a test-pruning run:" >> $GITHUB_STEP_SUMMARY
            echo '```' >> $GITHUB_STEP_SUMMARY
            echo "$CHANGED_SRC" >> $GITHUB_STEP_SUMMARY
            echo '```' >> $GITHUB_STEP_SUMMARY
            exit 1
          fi
~~~

## .github/workflows/workflow-example-validation.yaml

Original GitHub Actions definition, preserved for the external orchestrator.

~~~yaml
name: Workflow Example Validation

# Guards the shipped example workflows against registry drift. Nodes get
# renamed, properties change, models get deprecated — and a shipped example that
# references a now-unknown node type or a missing required property is broken for
# every new install. `nodetool validate` catches this statically (unknown node
# types, missing required props, unselected models, dangling/mis-typed edges)
# without running the workflow.
#
# The scan runs `validate` over every example JSON. If any fail, Claude repairs
# them against the current node registry and opens a PR. Never auto-merges.

on:
  schedule:
    - cron: "0 3 * * 4" # Thursdays at 03:00 UTC
  workflow_dispatch:

jobs:
  workflow-example-validation:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: ".nvmrc"
          cache: "npm"

      - name: Install all workspace dependencies
        run: npm ci
        env:
          ELECTRON_SKIP_BINARY_DOWNLOAD: "1"

      # validate loads the node registry, which the decorator packages
      # (base-nodes, node-sdk, ...) expose from dist/.
      - name: Build packages
        run: npm run build:packages

      - name: Validate shipped examples
        id: validate
        continue-on-error: true
        run: |
          echo "## Workflow Example Validation" >> $GITHUB_STEP_SUMMARY
          BROKEN=0
          : > validation-failures.log

          while IFS= read -r -d '' example; do
            if npm run dev:nodetool -- validate "$example" --json > /tmp/v.json 2>/tmp/v.err; then
              echo "- OK: $example" >> $GITHUB_STEP_SUMMARY
            else
              BROKEN=1
              echo "- FAIL: $example" >> $GITHUB_STEP_SUMMARY
              {
                echo "### $example"
                cat /tmp/v.json 2>/dev/null || cat /tmp/v.err
                echo
              } >> validation-failures.log
            fi
          done < <(find packages -path '*examples*' -name '*.json' ! -name '*.app.json' -print0)

          echo "EXAMPLES_BROKEN=$BROKEN" >> $GITHUB_ENV

      - name: Run Claude Code
        if: env.EXAMPLES_BROKEN == '1'
        uses: anthropics/claude-code-action@v1.0.210
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          additional_permissions: |
            actions: read
          claude_args: |
            --model claude-opus-5
            --allowedTools "Bash,Edit,Read,Replace,CreatePullRequest"
            --append-system-prompt "Before finalizing any code change or PR, invoke the unslop skill (.claude/skills/unslop/SKILL.md) and apply its checklist to your diff."
          prompt: |
            # Repair Broken Shipped Workflow Examples

            Some shipped example workflows no longer validate against the current
            node registry. `validation-failures.log` lists each broken example
            with its validation report (unknown node types, missing required
            properties, unselected models, dangling or mis-typed edges).

            ## How to fix
            For each broken example JSON:
            - Read the validation report to see exactly what's wrong.
            - Re-validate a single file with:
              `npm run dev:nodetool -- validate "<path>" --json`
            - Fix the graph to match the current registry:
              - Unknown node type → find the renamed/replacement node type and
                update it (search the codebase for the node's `@node`/type).
              - Missing required property → add it with a sensible default.
              - Unselected model → pick a currently-available model of the right
                kind for that provider.
              - Dangling/mis-typed edge → repair or remove the edge so source and
                target handles exist and their types are compatible.
            - Preserve the example's intent. These are user-facing templates —
              keep them meaningful, do not gut them to make validation pass.

            ## Rules
            - Only edit example JSON files under `packages/**/examples/`.
            - Do not change node source code to fit a broken example — fix the
              example to match the code.
            - Do not touch CI workflow files.

            ## Verification
            Re-run validate on every file you touched and confirm it passes:
            ```bash
            npm run dev:nodetool -- validate "<path>"
            ```

            ## Submit
            Create a PR titled "examples: repair workflows broken by registry drift"
            listing each example fixed and what changed (node renamed, property
            added, model reselected, edge repaired). If every example already
            validates, do nothing.
~~~
