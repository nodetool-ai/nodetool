#!/usr/bin/env bash
# Window checks: every check that needs a real window, in one run. Each opens
# a bench window (background mode: it never takes focus, but it is visible),
# so run this when nobody is using the machine. It writes one JSON summary to
# build/window-checks/summary.json and prints it.
#
#   1. The M1b budgeted bench (software decode, 4 tracks).
#   2. The M1c budgeted benches: 4 tracks sw and hw, 8 tracks hw, 4K HEVC hw.
#   3. The teardown case (M1c F1): delete the preview item while hardware
#      frames are in flight, with the Metal debug layer on.
#   4. The stall measurements (M1c F7): six 4-track hw benches without
#      --on-top, with the process nice/stat/priority of the bench and its
#      parents, the expose and occlusion log, and the stall list.
#
# Exit 0 only when every budgeted bench and the teardown case pass. The F7
# runs are measurements, not pass/fail.
set -uo pipefail

cd "$(dirname "$0")/.."
bin=build/nodetool-timeline
out=build/window-checks
rm -rf "$out"
mkdir -p "$out"
status=0

# bench NAME FIXTURE DECODE BUDGET [EXTRA...]
bench() {
    local name=$1 fixture=$2 decode=$3 budget=$4
    shift 4
    "$bin" "fixtures/$fixture.json" --bench --realtime 15 --size 1920x1080 --decode "$decode" \
        --budget "budgets/$budget.json" "$@" > "$out/$name.json" 2> "$out/$name.log"
    local rc=$?
    echo "$rc" > "$out/$name.exit"
    [[ $rc == 0 ]] || status=1
}

bench m1b-4tracks-sw video-4tracks sw m1b --on-top
bench m1c-4tracks-sw video-4tracks sw m1c --on-top
bench m1c-4tracks-hw video-4tracks hw m1c --on-top
bench m1c-8tracks-hw video-8tracks hw m1c --on-top
bench m1c-4k-hevc-hw video-4k-hevc hw m1c --on-top

MTL_DEBUG_LAYER=1 "$bin" fixtures/video-4tracks.json --decode hw --teardown-test > /dev/null 2> "$out/teardown.log"
echo $? > "$out/teardown.exit"
[[ $(cat "$out/teardown.exit") == 0 ]] || status=1

# F7: no --on-top, so other windows may cover the bench; the logs show when.
for i in 1 2 3 4 5 6; do
    "$bin" fixtures/video-4tracks.json --bench --realtime 15 --size 1920x1080 --decode hw \
        > "$out/f7-$i.json" 2> "$out/f7-$i.log" &
    pid=$!
    sleep 3
    {
        p=$pid
        while [[ -n "$p" && "$p" -gt 1 ]]; do
            ps -o pid=,ppid=,stat=,ni=,pri=,command= -p "$p"
            p=$(ps -o ppid= -p "$p" | tr -d ' ')
        done
    } > "$out/f7-$i.ps"
    wait "$pid"
    echo $? > "$out/f7-$i.exit"
done

node - "$out" <<'EOF'
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "");
const json = (f) => {
  try {
    return JSON.parse(read(f));
  } catch {
    return null;
  }
};
const benches = {};
for (const name of ["m1b-4tracks-sw", "m1c-4tracks-sw", "m1c-4tracks-hw", "m1c-8tracks-hw", "m1c-4k-hevc-hw"]) {
  const d = json(`${name}.json`);
  benches[name] = {
    exit: Number(read(`${name}.exit`)),
    pass: d?.budget?.pass ?? false,
    invalid: d?.invalid ?? null,
    failing: (d?.budget?.results ?? []).filter((r) => !r.pass).map((r) => ({ key: r.key, value: r.value, reason: r.reason })),
    frames: d?.frames ?? null,
    cpuMsP95: d?.cpuMs?.p95 ?? null,
    submitIntervalMsP95: d?.submitIntervalMs?.p95 ?? null,
    skippedSubmitsFraction: d?.skippedSubmitsFraction ?? null,
    frameErrorMax: d?.frameError?.max ?? null,
    cpuCopies: d?.cpuCopies ?? null,
    cpu: d?.cpu ?? null,
    frameRefCloseMs: d?.frameRefCloseMs ?? null,
    exposureLosses: d?.exposureLosses ?? null,
    stalls: d?.stalls ?? null
  };
}
const teardownLog = read("teardown.log");
const teardown = {
  exit: Number(read("teardown.exit")),
  validationEnabled: teardownLog.includes("Metal API Validation Enabled"),
  validationFailures: (teardownLog.match(/failed assertion|validation error/gi) ?? []).length,
  result: (teardownLog.match(/teardown: done.*/) ?? [null])[0]
};
const f7 = [];
for (let i = 1; i <= 6; i++) {
  const d = json(`f7-${i}.json`);
  const log = read(`f7-${i}.log`);
  f7.push({
    exit: Number(read(`f7-${i}.exit`)),
    invalid: d?.invalid ?? null,
    frames: d?.frames ?? null,
    stallCount: d?.stallCount ?? null,
    stalls: d?.stalls ?? null,
    exposureLosses: d?.exposureLosses ?? null,
    scheduling: d?.scheduling ?? null,
    exposeEvents: log.split("\n").filter((l) => l.startsWith("diag:") && /expose|occlusion/.test(l)),
    processes: read(`f7-${i}.ps`).trim().split("\n")
  });
}
const pass = Object.values(benches).every((b) => b.pass) && teardown.exit === 0 && teardown.validationFailures === 0;
const summary = { pass, benches, teardown, f7 };
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
EOF
exit $status
