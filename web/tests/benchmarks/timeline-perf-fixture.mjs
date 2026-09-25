#!/usr/bin/env node
/**
 * Generate deterministic video inputs for the L0 and L3 preview scenarios.
 * Output is disposable and never checked into git.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDir = process.argv[2] ?? join(tmpdir(), "nodetool-timeline-perf");
mkdirSync(outputDir, { recursive: true });

const videos = [
  ["lead", "testsrc2=size=640x360:rate=24:duration=60"],
  ["incoming", "testsrc2=size=640x360:rate=24:duration=20"],
  ["one-1080p", "testsrc2=size=1920x1080:rate=24:duration=5"],
  ["one-4k", "testsrc2=size=3840x2160:rate=24:duration=5"],
  ["solid-red-1080p", "color=c=red:s=1920x1080:r=24:d=5"],
  ["solid-green-1080p", "color=c=green:s=1920x1080:r=24:d=5"],
  ["solid-blue-1080p", "color=c=blue:s=1920x1080:r=24:d=5"],
  ["solid-yellow-1080p", "color=c=yellow:s=1920x1080:r=24:d=5"],
  ["solid-red-4k", "color=c=red:s=3840x2160:r=24:d=5"],
  ["solid-green-4k", "color=c=green:s=3840x2160:r=24:d=5"],
  ["solid-blue-4k", "color=c=blue:s=3840x2160:r=24:d=5"],
  ["solid-yellow-4k", "color=c=yellow:s=3840x2160:r=24:d=5"],
  ["matte-1080p", "color=c=black:s=1920x1080:r=24:d=5,drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=white:t=fill"],
  ["matte-4k", "color=c=black:s=3840x2160:r=24:d=5,drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=white:t=fill"]
];

for (const [name, source] of videos) {
  const output = join(outputDir, `${name}.${process.pid}.tmp.mp4`);
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      source,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output
    ],
    { stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed generating ${output} (exit ${result.status})`);
  }
  renameSync(output, join(outputDir, `${name}.mp4`));
}

process.stdout.write(`${outputDir}\n`);
