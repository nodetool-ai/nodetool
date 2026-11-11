# Graph runner plan execution

This page tells an orchestrator how to run the
[stability tasks](graph-runner-stability-tasks.md) and the
[performance tasks](graph-runner-performance-tasks.md) at a low token cost.
The task pages stay the source for each task: its finding, the files it owns,
its order and its check. This page replaces only their wave tables.

## Rules for a low token cost

1. Run the orchestration in a new session. Give it only this page and the
   [kickoff prompt](#kickoff-prompt).
2. Give each file area one agent. The agent does its tasks in the listed
   order and reads each file once.
3. Send all agents of a round in one message. Wait for the notifications. Do
   not poll.
4. Each agent returns a report of at most 30 lines: the changed files, the
   result of each test, and the numbers before and after. It does not paste
   diffs or full logs.
5. The orchestrator checks a round with `git diff --stat` and reads only the
   hunks that change ownership, threads or lifetimes.
6. Build and test once in each round. Write the output to a file, and search
   it for failures.
7. Agents do not commit. The orchestrator commits once after each round.

## Agents and rounds

| Round | Agent | Tasks, in order | Model |
|---|---|---|---|
| 1 | Engine A | T1, T6, T5, PT3 | Opus |
| 1 | Kernel A | T3, T12 | Sonnet |
| 1 | Messages | T2, T7 | Sonnet |
| 1 | Media A | T4 | Haiku |
| 1 | Bundle A | PT1, PT2, PT4, PT5, PT6 | Sonnet |
| 2 | Kernel B | T8, PT15, T10, PT10, PT11 | Opus |
| 2 | Wasm | T9, PT9 | Sonnet |
| 3 | Engine B | T11, PT12, PT13 | Opus |
| 3 | Bundle B | PT7, then PT8 only if PT1 numbers show a load pause after a discarded context | Opus |
| 4 | Media and cancel | PT14, PT16 | Sonnet |
| 5 | Close-out | T13 (sanitizers over all rounds), T14, PT18 | Sonnet |

PT17 runs only if PT18 shows a load time above 0.5 s after PT7.

The rounds satisfy each dependency that crosses agents:

- T1 (round 1) comes before T8, T9 and PT15 (round 2).
- T3 and T12 (round 1) come before T8 and PT10 (round 2).
- T5, T6 (round 1) and T9 (round 2) come before PT12 (round 3).
- T10 and PT11 (round 2) come before T11 and PT13 (round 3).
- PT2 and PT6 (round 1) and T10 (round 2) come before PT7 (round 3).
- T4 (round 1), T7 (round 1), T11 and PT12 (round 3) come before PT14 and
  PT16 (round 4).

## Shared files in round 1

Agents of one round edit the same checkout. Two files have more than one
owner in round 1:

| File | Owners |
|---|---|
| `src/graph_runner.cpp` | Engine A (thread start), Bundle A (bundle load, lines 196-220, and timing) |
| `src/kernel/guest.cpp` | Kernel A (magic and header), Bundle A (line 216 only) |

Each agent reads the file again just before each edit and keeps each edit
small. If an edit fails because the file changed, the agent reads the file
again and edits again.

## Brief template

Each brief has this text, plus the agent's task IDs:

```text
You do tasks <IDs> of docs/plans/graph-runner-stability-tasks.md and
docs/plans/graph-runner-performance-tasks.md, in this order. Read only those
task rows, the review finding each one names in
docs/plans/graph-runner-quickjs-review.md, and native/AGENTS.md.

Edit only the files and parts in each task's "Owns" column. Other agents edit
the rest of the checkout at the same time.

For each task:
1. Write the failing test or the benchmark from the task's check. Run it and
   record the result.
2. Make the fix.
3. Build: cmake --build native/graph-runner/build -j8 > /tmp/gr-<agent>.log 2>&1
   Search the log for errors. Do not paste the log.
4. Run the test again. Run: TMPDIR=$(realpath /tmp) ctest --test-dir
   native/graph-runner/build -R <the tests of this task> --output-on-failure
5. If a test fails and you cannot fix it, stop and report. Do not start the
   next task.

gr_media_native_render_media_tests and gr_media_native_public_tests failed
before this work. Ignore them.

Do not commit. Do not make a new build directory. Check df -h / before you
build, and stop if less than 5 GB is free.

Report in at most 30 lines: for each task, the files you changed, the test
result before and after, and any numbers before and after. Say which tasks
you did not do and why.
```

## Gate after each round

The orchestrator runs these commands and writes each output to a file:

1. `cmake --build native/graph-runner/build -j8`
2. `TMPDIR=$(realpath /tmp) ctest --test-dir native/graph-runner/build`
3. `node native/graph-runner/parity/examples.mjs --runner native/graph-runner/build/nodetool-graph-runner --jobs 3`
   The suite must have no new failures. Before round 1, the result was 117
   completed and 18 failed.
4. `npm run test:affected:native`
5. From round 2 on: `node native/graph-runner/parity/bench-load.mjs`

Then the orchestrator commits the round.

## Kickoff prompt

Paste this text into a new session in this worktree:

```text
Run docs/plans/graph-runner-execution.md, round by round. Start with round 1.
Use the brief template on that page for each agent, with the model it names.
Spawn the agents of a round in one message, without names. After each round,
run the gate, commit, and give me a summary of at most 10 lines. Then start
the next round. Stop and ask me if a gate fails.
```
