import { readFileSync } from "node:fs";
import { KEYFRAME_PROPERTIES, moveKeyframes } from "../../../../packages/timeline/src/keyframes.ts";

const { document, clipId, fromMs, toMs } = JSON.parse(readFileSync(0, "utf8"));
const clips = document.clips.map(clip => clip.id === clipId
  ? { ...clip, animations: moveKeyframes(clip, KEYFRAME_PROPERTIES, fromMs, toMs) }
  : clip);
process.stdout.write(JSON.stringify({ ...document, clips }));
