import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MIDI_PPQ } from "@nodetool-ai/timeline";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import { mixCompositedTimelineAudio } from "@nodetool-ai/video-nodes/nodes/timeline";

const run = promisify(execFile);

/** Render the editable MIDI score through the timeline's instruments and mixer. */
export async function renderScore() {
  const { document, ...settings } = JSON.parse(await readFile(new URL("../music.timeline.json", import.meta.url), "utf8"));
  const validation = validateTimelineSequence(document, settings);
  if (!validation.ok) {
    throw new Error(`Invalid Sunrush soundtrack: ${JSON.stringify(validation.errors)}`);
  }
  const sequence = { ...settings, ...document };
  const durationSeconds = sequence.durationMs / 1000;
  const loopTicks = sequence.durationMs * sequence.tempo.bpm * MIDI_PPQ / 60000;
  // Render three cycles and take the middle one, including the preceding
  // cycle's instrument releases and effects without an artificial end fade.
  const repeated = {
    ...sequence,
    durationMs: sequence.durationMs * 3,
    clips: sequence.clips.map(clip => ({
      ...clip,
      durationMs: clip.durationMs + sequence.durationMs * 2,
      notes: [0, 1, 2].flatMap(cycle => clip.notes.map(note => ({
        ...note, id: `${note.id}-${cycle}`, startTick: note.startTick + cycle * loopTicks
      })))
    }))
  };
  const workDir = await mkdtemp(path.join(tmpdir(), "sunrush-score-"));
  const signal = AbortSignal.timeout(120000);
  try {
    // The shared timeline mixer takes a video carrier. Its picture is discarded.
    const basePath = path.join(workDir, "carrier.mov");
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
      "-t", String(durationSeconds * 3), "-c:v", "png", basePath], { signal });
    const mixed = await mixCompositedTimelineAudio({
      sequence: repeated, basePath, workDir,
      output: { format: "mov", extension: "mov", audioCodec: "pcm_s16le" },
      resolveAssetPath: async (id) => { throw new Error(`The Sunrush score uses built-in devices only, but requested asset ${id}`); }
    });
    const out = path.join(workDir, "score.wav");
    await run("ffmpeg", ["-v", "error", "-y", "-i", mixed, "-ss", String(durationSeconds),
      "-t", String(durationSeconds), "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", out], { signal });
    return { bytes: await readFile(out), durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
