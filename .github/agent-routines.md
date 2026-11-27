# Scheduled Agent Routines: Picking Work That Matters

Every scheduled agent routine in `.github/workflows/` reads this file before
it picks a target. The routine's own prompt says what kind of change it
makes. This file says which target to pick and how much of it to finish.

A routine run costs a model session, a CI run and a maintainer's review. A
PR that renames one helper, pins one pure function, or documents one
environment variable costs the same review as a PR that removes a class of
bug from a subsystem. Spend the run on the second kind.

## Rank candidates by impact

`$RUNNER_TEMP/agent-impact.md` lists the impact signals for this run:

- **Hot areas and files**: where maintainers committed most in the last 90
  days, excluding bot commits, tests and generated files. Code that changes
  often is code people read, extend and break.
- **Open issues**: what users and maintainers have filed.

Rank every candidate your routine's scan produces, and take the highest:

1. It fixes, or removes the cause of, something an open issue reports.
2. It sits in a hot area, or on a path users run directly: the CLI, server
   routes, the workflow runtime and kernel, the editor, chat, providers.
3. Many call sites depend on it.
4. Everything else. Take a candidate with no signal only when nothing
   ranked higher qualifies, and say so in the PR body.

Do not prefer a candidate because it is small, untested or easy to finish.
Those are reasons a target is cheap, not reasons it matters.

## Finish the theme, not one instance

Once you have the target, take every instance of the same defect or pattern
in its module or package, not only the one the scan named. Enumerate them
with `rg` or the ast-grep-outline skill, and list each in the PR body as
fixed or as left with a reason. A PR that fixes one of nine identical call
sites is unfinished.

Keep one theme per PR: one kind of change, in one module, package or
feature directory. The theme sets the size. There is no file cap. Stop
adding when the next change would need a different explanation in the PR
body.

## State the impact

Start the PR body with a section headed **Impact** of two or three
sentences: who notices the change and what is different for them, such as a
bug a user hit, a crash class gone, a subsystem that is now covered, or a
layer that is now enforced. Name the signal that ranked the target: the
issue number, the hot area, or the call-site count. If you cannot write
this section honestly, pick a different target.

## Unchanged

- The routine's own rules on safety, verification and what it must not
  touch still apply, as do `AGENTS.md` and `.github/bot-guardrails.md`.
- Do not modify CI workflow files.
- The preflight still skips a run while the routine's own PR is open, and
  files in `agent-recent-files.txt` are still off limits.
