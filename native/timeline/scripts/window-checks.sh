#!/usr/bin/env bash
# Window checks: every check that needs a real window, in one run. Each opens
# a bench window (background mode: it never takes focus, but it is visible),
# so run this when nobody is using the machine. It writes one JSON summary to
# build/window-checks/summary.json and prints it.
#
#   0. The paused-seek latency gate (PLAN M1d exit 1), first and offscreen:
#      it waits up to 10 minutes for a 1-minute load average under 4 (else
#      the summary says "not idle" and the numbers are not clean), then runs
#      check-scrub.mjs on the 2 s GOP fixture (limit 100 ms) and the
#      all-intra fixture (limit 30 ms), sw and hw. Then an interleaved A/B of
#      the safe non-reference skip rule against no skipping
#      (NT_DECODE_SKIP=off), 3 rounds of 40 cold seeks on the GOP fixture, sw
#      and hw. Every number in the summary carries the load before and after
#      its run.
#      --dry-run prints the commands of sections 0 and 8 and runs nothing.
#
#   1. The M1b budgeted bench (software decode, 4 tracks).
#   2. The M1c budgeted benches: 4 tracks sw and hw, 8 tracks hw, 4K HEVC hw.
#   3. The teardown case (M1c F1): delete the preview item while hardware
#      frames are in flight, with the Metal debug layer on.
#   4. The stall measurements (M1c F7): six 4-track hw benches without
#      --on-top, with the process nice/stat/priority of the bench and its
#      parents, the expose and occlusion log, and the stall list.
#   5. The M2 tracks UI bench in a window: 200 tracks and 2000 clips, a
#      scripted pinch zoom and pan while the preview plays 4 tracks. Pass:
#      GUI-thread frame time p95 under 8 ms and frame interval p95 under
#      17.5 ms (60 fps).
#   6. M3 audio, on the system output: THESE PLAY SOUND through the default
#      output device.
#      a. The audio clock against the speakers' signal: 60 s of the
#         flash-and-beep fixture, each click recorded on a loopback capture
#         device (BlackHole, Loopback, or NT_LOOPBACK_DEVICE) and compared
#         with the audio-master clock at its arrival. Pass: every click
#         within 33 ms. This is NOT M3 exit 3: exit 3 compares each click
#         with the presentation time of its flash frame on the drawable, and
#         no harness records that time yet. The summary reports exit 3 as not
#         met (m3.exit3.met = false) whatever 6a measures.
#         The loopback hears the output only when the default output is a
#         Multi-Output Device with the built-in speakers and the loopback
#         device; otherwise the clicks are missing and the check fails.
#      b. The soak (M3 exits 4 and 6): a 600 s realtime bench in a window
#         with 4 video tracks and 8 audio clips on the system output. Pass:
#         the bench exits 0, the device mixed at least 594 s of playback
#         (`playedSeconds`), 0 underruns counted in the device callback, 0
#         late starts, 0 source open failures and decode errors, play start
#         under 300 ms. The audio report also records the CoreAudio
#         output latency (device, safety offset, stream, buffer frames).
#      Measure once more on a Bluetooth output by hand (PLAN M3 risk): set it
#      as the default output and rerun 6a.
#   7. M0, the web baseline in a real browser window: web-baseline.mjs
#      --headed plays the fixtures in the web editor in a visible Chromium
#      window (real vsync and frame pacing, Metal WebGPU), against its own
#      scratch server and Vite (ports 7799 and 3799, never 7777). The native
#      counterparts with vsync are the benches of sections 1 and 2. A
#      measurement, not pass/fail: the run's verdict says only whether every
#      counter has samples.
#   8. M0 serein, native against the web: a full example document in a
#      10 s native bench window at 1920x1080, on top, paired with both
#      serein decoder runs from section 7. Each mapped counter carries its
#      method, p50/p95 (heldFrames is a total), load before/after and lower
#      side. Missing reports or samples fail the measurement, not `pass`.
#
# Exit 0 only when the paused-seek gate, every budgeted bench, the teardown
# case and the M3 checks pass, and the summary says pass. The F7 runs are
# measurements, not pass/fail.
set -uo pipefail

cd "$(dirname "$0")/.."
bin=build/nodetool-timeline
out=build/window-checks
dry_run=0
[[ "${1:-}" == "--dry-run" ]] && dry_run=1
if [[ $dry_run == 0 ]]; then
    rm -rf "$out"
    mkdir -p "$out"
fi
status=0

# --- 0. Paused-seek latency gate (offscreen) ---------------------------------
load1() {
    local proc=${NT_LOADAVG_PATH:-/proc/loadavg} value
    if [[ -e $proc ]]; then
        value=$(awk 'NR == 1 { print $1; exit }' "$proc" 2>/dev/null) || return 1
    else
        value=$(sysctl -n vm.loadavg 2>/dev/null | awk 'NR == 1 { print $2; exit }') || return 1
    fi
    [[ $value =~ ^(0|[1-9][0-9]*)(\.[0-9]+)?$ ]] || return 1
    printf '%s\n' "$value"
}
idle=1
waited=0
if [[ $dry_run == 0 ]]; then
    while :; do
        if ! current_load=$(load1); then
            idle=0
            current_load=null
            break
        fi
        if awk -v l="$current_load" 'BEGIN { exit !(l < 4) }'; then
            break
        fi
        if (( waited >= 600 )); then
            idle=0
            break
        fi
        sleep 10
        waited=$((waited + 10))
    done
    echo "{\"idle\":$idle,\"waitedS\":$waited,\"load\":$current_load}" > "$out/seek-idle.json"
fi

# seek NAME FIXTURE DECODE LIMIT_MS SCRIPT SKIP(on|off)
seek() {
    local name=$1 fixture=$2 decode=$3 limit=$4 script=$5 skip=$6
    local cmd=(node scripts/check-scrub.mjs "fixtures/$fixture.json" --max-p95-ms "$limit" --decode "$decode"
               --script "$script" --json)
    if [[ $dry_run == 1 ]]; then
        echo "NT_DECODE_SKIP=$skip ${cmd[*]}"
        return
    fi
    local before after rc
    before=$(load1) || before=null
    NT_DECODE_SKIP=$skip "${cmd[@]}" > "$out/seek-$name.json" 2> "$out/seek-$name.log"
    rc=$?
    after=$(load1) || after=null
    echo "{\"exit\":$rc,\"loadBefore\":$before,\"loadAfter\":$after,\"skip\":\"$skip\",\"decode\":\"$decode\",\"fixture\":\"$fixture\",\"limitMs\":$limit}" \
        > "$out/seek-$name.meta.json"
    # The gate runs are pass/fail; the A/B runs are measurements.
    if [[ $name == gate-* && $rc != 0 ]]; then
        status=1
    fi
}

for decode in sw hw; do
    seek "gate-gop-$decode" video-scrub-gop "$decode" 100 scrub/m1d.json on
    seek "gate-intra-$decode" video-scrub-intra "$decode" 30 scrub/m1d.json on
done
for round in 1 2 3; do
    for decode in sw hw; do
        seek "ab-$round-safe-$decode" video-scrub-gop "$decode" 100 scrub/seek-only.json on
        seek "ab-$round-noskip-$decode" video-scrub-gop "$decode" 100 scrub/seek-only.json off
    done
done

# Section 8 is also called by the dry run, before any bench can execute.
serein_m0() {
    local sequence=(node src/render2d/example-sequence.mjs serein "$out/serein.json")
    local cmd=("$bin" "$out/serein.json" --bench --realtime 10 --size 1920x1080 --decode hw --on-top)
    local pair=(node src/render2d/serein-m0-report.mjs "$out")
    if [[ $dry_run == 1 ]]; then
        echo "8. M0 serein, native against the web"
        echo "${sequence[*]} > $out/m0-serein-sequence.log 2>&1"
        echo 'echo $? > build/window-checks/m0-serein-sequence.exit'
        echo 'wait until load1 <= 10 in 15 s steps, up to 20 minutes; otherwise write not run and log the load limit'
        echo 'before=$(load1)'
        echo "${cmd[*]} > $out/m0-serein-native.json 2> $out/m0-serein-native.log"
        echo 'rc=$?'
        echo 'after=$(load1)'
        echo 'echo "$rc" > build/window-checks/m0-serein-native.exit'
        echo 'echo "{\"playSeconds\":10,\"loadBefore\":$before,\"loadAfter\":$after}" > build/window-checks/m0-serein-native.meta.json'
        echo "${pair[*]} > $out/m0-serein.json 2> $out/m0-serein.log"
        echo 'echo $? > build/window-checks/m0-serein.exit'
        return
    fi
    local rc before after waited=0
    "${sequence[@]}" > "$out/m0-serein-sequence.log" 2>&1
    rc=$?
    echo "$rc" > "$out/m0-serein-sequence.exit"
    before=$(load1) || before=null
    if [[ $rc == 0 ]]; then
        while [[ $before != null ]] && awk -v l="$before" 'BEGIN { exit !(l > 10) }'; do
            if (( waited >= 1200 )); then
                break
            fi
            sleep 15
            waited=$((waited + 15))
            before=$(load1) || before=null
        done
        if [[ $before == null ]]; then
            rc="not run"
            echo "load could not be read; native bench did not run" > "$out/m0-serein-native.log"
        elif awk -v l="$before" 'BEGIN { exit !(l > 10) }'; then
            rc="not run"
            echo "load1 $before exceeds 10 after 20 minutes; native bench did not run" > "$out/m0-serein-native.log"
        else
            "${cmd[@]}" > "$out/m0-serein-native.json" 2> "$out/m0-serein-native.log"
            rc=$?
        fi
    else
        rc="not run"
        echo "sequence generation failed; native bench did not run" > "$out/m0-serein-native.log"
    fi
    echo "$rc" > "$out/m0-serein-native.exit"
    after=$(load1) || after=null
    echo "{\"playSeconds\":10,\"loadBefore\":$before,\"loadAfter\":$after}" > "$out/m0-serein-native.meta.json"
    "${pair[@]}" > "$out/m0-serein.json" 2> "$out/m0-serein.log"
    echo $? > "$out/m0-serein.exit"
}
if [[ $dry_run == 1 ]]; then
    serein_m0
    echo "dry run: sections 0 and 8 only; the window checks did not run"
    exit 0
fi

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

# M2: the tracks UI bench in a real window (threaded render loop, vsync).
node scripts/make-ui-fixture.mjs > /dev/null
"$bin" fixtures/generated/ui-200tracks.json --ui-bench --ui-window --size 1920x1080 --ui-gui-p95 8 \
    > "$out/m2-ui-window.json" 2> "$out/m2-ui-window.log"
echo $? > "$out/m2-ui-window.exit"
[[ $(cat "$out/m2-ui-window.exit") == 0 ]] || status=1

# M3: audio on the system output (these play sound).
"$bin" --audio-devices > "$out/m3-devices.json" 2> /dev/null
node scripts/make-audio-soak.mjs --kind av-sync --seconds 70 > /dev/null
"$bin" fixtures/generated/av-sync-long.json --av-sync-live --seconds 60 \
    > "$out/m3-av-sync-live.json" 2> "$out/m3-av-sync-live.log"
echo $? > "$out/m3-av-sync-live.exit"
[[ $(cat "$out/m3-av-sync-live.exit") == 0 ]] || status=1
node scripts/make-audio-soak.mjs --seconds 600 > /dev/null
"$bin" fixtures/generated/audio-soak.json --bench --realtime 600 --size 1920x1080 --on-top \
    --audio system --audio-report "$out/m3-soak-audio.json" \
    > "$out/m3-soak.json" 2> "$out/m3-soak.log"
echo $? > "$out/m3-soak.exit"
[[ $(cat "$out/m3-soak.exit") == 0 ]] || status=1
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
process.exit(r.backend !== "Null" && r.playedSeconds >= 594 && r.underruns === 0 && r.lateStarts === 0 &&
  r.openFailures === 0 && r.decodeErrors === 0 && r.callbacks > 0 && r.playStartMs >= 0 && r.playStartMs < 300 ? 0 : 1);
' "$out/m3-soak-audio.json" || status=1

# M0: the web baseline in a real browser window (section 7).
node scripts/web-baseline.mjs --headed > "$out/m0-web-headed.log" 2>&1
echo $? > "$out/m0-web-headed.exit"
cp build-m5/web-baseline-headed.json "$out/m0-web-headed.json" 2> /dev/null

# --- 8. M0 serein, native against the web -----------------------------------
serein_m0

# The summary's verdict also sets the exit status.
node - "$out" <<'EOF' || status=1
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
// Section 0: the paused-seek gate and the skip A/B, each with its load.
const seekRun = (name) => {
  const meta = json(`seek-${name}.meta.json`) ?? {};
  const r = json(`seek-${name}.json`);
  return {
    ...meta,
    verdict: r?.verdict ?? "no report",
    p50: r?.seekLatencyMs?.p50 ?? null,
    p95: r?.seekLatencyMs?.p95 ?? null,
    failures: r?.failures ?? ["no report"]
  };
};
const idleInfo = json("seek-idle.json") ?? { idle: 0 };
const gate = {};
for (const d of ["sw", "hw"]) {
  gate[`gop-${d}`] = seekRun(`gate-gop-${d}`);
  gate[`intra-${d}`] = seekRun(`gate-intra-${d}`);
}
const ab = { rounds: [], medianP95: {} };
for (const round of [1, 2, 3]) {
  for (const d of ["sw", "hw"]) {
    for (const rule of ["safe", "noskip"]) ab.rounds.push({ round, rule, ...seekRun(`ab-${round}-${rule}-${d}`) });
  }
}
const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
for (const d of ["sw", "hw"]) {
  for (const rule of ["safe", "noskip"]) {
    ab.medianP95[`${rule}-${d}`] = median(ab.rounds.filter((r) => r.decode === d && r.rule === rule).map((r) => r.p95));
  }
}
const seekGate = {
  idle: idleInfo.idle === 1 ? true : "not idle",
  waitedS: idleInfo.waitedS ?? null,
  loadAtStart: idleInfo.load ?? null,
  clean: idleInfo.idle === 1,
  pass: Object.values(gate).every((g) => g.verdict === "pass"),
  gate,
  ab
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
const ui = json("m2-ui-window.json")?.uiBench ?? null;
const m2 = {
  exit: Number(read("m2-ui-window.exit")),
  guiMs: ui?.guiMs ?? null,
  frameIntervalMs: ui?.frameIntervalMs ?? null,
  clipItemsMax: ui?.clipItemsMax ?? null,
  previewLayers: ui?.previewLayers ?? null,
  pass: (ui?.budget?.pass ?? false) && (ui?.frameIntervalMs?.p95 ?? Infinity) < 17.5
};
const live = json("m3-av-sync-live.json");
const soakAudio = json("m3-soak-audio.json");
const m3 = {
  devices: json("m3-devices.json"),
  avSyncLive: {
    exit: Number(read("m3-av-sync-live.exit")),
    pass: live?.pass ?? false,
    measures: "audio clock vs loopback arrival (not M3 exit 3)",
    error: live?.error ?? null,
    maxErrorMs: live?.maxErrorMs ?? null,
    matched: live?.matched ?? null,
    expected: live?.expected ?? null,
    output: live?.output ?? null,
    outputLatencyMs: live?.outputLatencyMs ?? null,
    clicks: live?.clicks ?? null
  },
  soak: {
    benchExit: Number(read("m3-soak.exit")),
    audio: soakAudio,
    pass:
      Number(read("m3-soak.exit")) === 0 && soakAudio !== null && soakAudio.backend !== "Null" &&
      soakAudio.playedSeconds >= 594 && soakAudio.underruns === 0 && soakAudio.lateStarts === 0 &&
      soakAudio.openFailures === 0 && soakAudio.decodeErrors === 0 &&
      soakAudio.callbacks > 0 && soakAudio.playStartMs >= 0 && soakAudio.playStartMs < 300
  },
  // M3 exit 3 needs the flash frame's presentation time on the drawable;
  // 6a measures the audio clock only, so exit 3 stays open.
  exit3: {
    met: false,
    reason: "no flash-frame presentation time on the drawable is recorded; 6a compares clicks with the audio clock only"
  }
};
const pass =
  seekGate.pass &&
  Object.values(benches).every((b) => b.pass) && teardown.exit === 0 && teardown.validationFailures === 0 && m2.pass &&
  m3.avSyncLive.pass && m3.soak.pass;
// Section 7: a measurement; it does not change `pass`.
const m0Web = json("m0-web-headed.json");
const m0 = {
  exit: Number(read("m0-web-headed.exit")),
  verdict: m0Web?.verdict ?? "no report",
  failures: m0Web?.failures ?? ["no report"],
  environment: m0Web?.environment ?? null,
  results: m0Web?.results ?? []
};
// Section 8: a measurement, like section 7; it does not change `pass`.
const m0Serein = json("m0-serein.json") ?? { verdict: "fail", failures: ["no serein pairing report"] };
const summary = { pass, seekGate, benches, teardown, f7, m2, m3, m0, m0Serein };
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
process.exit(pass ? 0 : 1);
EOF
exit $status
