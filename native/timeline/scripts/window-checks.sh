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
#
# Exit 0 only when every budgeted bench, the teardown case and the M3
# checks pass. The F7 runs are measurements, not pass/fail.
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
  Object.values(benches).every((b) => b.pass) && teardown.exit === 0 && teardown.validationFailures === 0 && m2.pass &&
  m3.avSyncLive.pass && m3.soak.pass;
const summary = { pass, benches, teardown, f7, m2, m3 };
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
EOF
exit $status
