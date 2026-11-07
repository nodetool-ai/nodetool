#pragma once

// Headless audio modes of nodetool-timeline (PLAN M3). None of them opens a
// real audio device: the offline render reads the sources directly, and the
// real-time part of --av-sync runs on miniaudio's null backend.
//
//   nodetool-timeline <fixture> --render-audio OUT.f32 [--from MS] [--to MS] [--rate HZ]
//     Writes the offline mix as raw interleaved float32 stereo and prints a
//     JSON report. With --server URL --timeline ID it renders that timeline.
//   nodetool-timeline <fixture> --av-sync [--period-ms 1000] [--seconds 6] [--latency-ms 25]
//     The mixer case of M3 exit 1, on a fixture whose sources click every
//     --period-ms of source time (fixtures/av-sync.json):
//       1. offline: each click of the mix lies within 1 ms of the timeline
//          time the clip placement gives it;
//       2. null device in real time, with the audio-master clock: at the
//          moment a click is audible, the clock reads its timeline time
//          within 1 ms. A device change with a new latency halfway through
//          re-anchors the clock, and the clicks after it must hold too.
//     Also: 0 underruns, 0 late starts, play start under 300 ms. Prints one
//     JSON object; exit 0 only when every click was found and matched.
//   nodetool-timeline --audio-devices
//     Lists the playback and capture devices and the loopback candidate.
//     Opens no device.
//   nodetool-timeline <fixture> --av-sync-live [--seconds 60]
//     For scripts/window-checks.sh only: plays the fixture on the system
//     output and records a loopback capture device. Each click's arrival on
//     the loopback is compared with the audio-master clock at that moment.
//     This checks the clock against the speakers' signal; it is not M3 exit
//     3, which needs the flash frame's presentation time on the drawable.
//     Fails, before any sound, when no loopback device is present.

namespace nt::audio {

int audioDevicesCli(int argc, char** argv);
int avSyncLiveCli(int argc, char** argv);
int renderAudioCli(int argc, char** argv);
int avSyncCli(int argc, char** argv);

}  // namespace nt::audio
