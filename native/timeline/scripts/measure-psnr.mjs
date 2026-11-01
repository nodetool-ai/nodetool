import { spawnSync } from "node:child_process";

// FFmpeg writes its successful filter measurements to stderr.
export function measurePsnr(first, second) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-i", first, "-i", second,
    "-lavfi", "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr", "-f", "null", "-"],
  { encoding: "utf8" });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error(`FFmpeg PSNR failed (${result.status}): ${result.stderr}`); }
  const match = /average:(inf|[0-9.]+)/.exec(result.stderr);
  if (!match) { throw new Error(`No PSNR measurement for ${first}`); }
  return match[1] === "inf" ? Infinity : Number(match[1]);
}
