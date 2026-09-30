import { describe, expect, it } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { toMono } from "../src/analysis/audio-dsp.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/index.js";

function wav(channels: number, values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(44 + values.length * 2);
  const view = new DataView(bytes.buffer);
  for (const [offset, text] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"]
  ] as const) {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  }
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000 * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, values.length * 2, true);
  values.forEach((value, index) =>
    view.setInt16(
      44 + index * 2,
      Math.round(value < 0 ? value * 32768 : value * 32767),
      true
    )
  );
  return bytes;
}

describe("source channel headroom and energy", () => {
  it.each([
    {
      name: "antiphase stereo",
      channels: 2,
      values: [1, -1, -1, 1],
      clipped: 4,
      fraction: 1,
      rms: 0
    },
    {
      name: "clipped and silent stereo",
      channels: 2,
      values: [1, 0, -1, 0],
      clipped: 2,
      fraction: 0.5,
      rms: -3.01
    },
    {
      name: "in-phase stereo",
      channels: 2,
      values: [1, 1, -1, -1],
      clipped: 4,
      fraction: 1,
      rms: 0
    },
    {
      name: "mono",
      channels: 1,
      values: [1, -1],
      clipped: 2,
      fraction: 1,
      rms: 0
    }
  ])(
    "measures $name before signed downmix",
    async ({ channels, values, clipped, fraction, rms }) => {
      const run = createCapabilityRun({
        context: new ProcessingContext({ jobId: "channel-safety" }),
        gate: UNGATED
      });
      const audio = `data:audio/wav;base64,${Buffer.from(wav(channels, values)).toString("base64")}`;
      const result = await run.invoke("analyze_audio", { audio, frame_ms: 5 });
      expect(result).toMatchObject({
        channels,
        loudness: {
          peak_dbfs: 0,
          rms_dbfs: expect.closeTo(rms, 2),
          clipped_samples: clipped,
          clipped_fraction: fraction,
          channel_samples_analyzed: values.length
        },
        envelope: {
          series: [
            {
              time: 0,
              rms_db: expect.closeTo(Math.round(rms * 10) / 10, 2),
              peak_db: 0
            }
          ]
        }
      });
    }
  );
  it("preserves signed mono mixing for spectral analysis", () => {
    expect([...toMono(new Float32Array([1, -1, -1, 1]), 2)]).toEqual([0, 0]);
  });

  it("keeps planar LUFS unchanged by channel phase", async () => {
    const run = createCapabilityRun({
      context: new ProcessingContext({ jobId: "phase-loudness" }),
      gate: UNGATED
    });
    const results: unknown[] = [];
    for (const phase of [1, -1]) {
      const samples = Array.from({ length: 16000 }, (_unused, index) => {
        const value = Math.floor(index / 2) % 8 < 4 ? 0.25 : -0.25;
        return index % 2 === 0 ? value : phase * value;
      });
      const result = await run.invoke("analyze_audio", {
        audio: `data:audio/wav;base64,${Buffer.from(wav(2, samples)).toString("base64")}`
      });
      expect(result).toMatchObject({
        loudness: { integrated_lufs: expect.any(Number) }
      });
      if (
        typeof result !== "object" ||
        result === null ||
        !("loudness" in result)
      ) {
        throw new Error("Missing source loudness");
      }
      results.push(result.loudness);
    }
    expect(results[0]).toEqual(results[1]);
  });
});
