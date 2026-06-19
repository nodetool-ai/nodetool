import {
  AUDIO_EFFECT_CONFIGS,
  AUDIO_EFFECT_NODE_TYPES
} from "../audioEffectModules";
import { formatKnobValue, type KnobSpec } from "../synthModules";
import {
  BESPOKE_BODY_REGISTRY,
  BESPOKE_DEFAULT_HEIGHTS,
  isBespokeNode
} from "../../editing/bespokeRegistry";
import SynthModuleBody from "../SynthModuleBody";
import type { NodeMetadata } from "../../../../stores/ApiTypes";

const linear: KnobSpec = { name: "x", label: "X", min: 0, max: 10, default: 1 };

describe("audio effect configs", () => {
  it("registers every effect with a single audio input jack", () => {
    for (const t of AUDIO_EFFECT_NODE_TYPES) {
      expect(AUDIO_EFFECT_CONFIGS[t].inputs).toEqual(["audio"]);
    }
  });

  it("log-scaled knobs have a strictly positive minimum", () => {
    for (const t of AUDIO_EFFECT_NODE_TYPES) {
      for (const k of AUDIO_EFFECT_CONFIGS[t].knobs) {
        if (k.scale === "log") {
          expect(k.min).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every knob default lies within its range", () => {
    for (const t of AUDIO_EFFECT_NODE_TYPES) {
      for (const k of AUDIO_EFFECT_CONFIGS[t].knobs) {
        expect(k.default).toBeGreaterThanOrEqual(k.min);
        expect(k.default).toBeLessThanOrEqual(k.max);
      }
    }
  });

  it("routes every effect node type to the synth module body", () => {
    for (const t of AUDIO_EFFECT_NODE_TYPES) {
      expect(BESPOKE_BODY_REGISTRY[t]).toBe(SynthModuleBody);
      expect(isBespokeNode({ node_type: t } as NodeMetadata)).toBe(true);
      expect(BESPOKE_DEFAULT_HEIGHTS[t]).toBeGreaterThan(0);
    }
  });
});

describe("knob value formatting", () => {
  it("formats milliseconds, rolling over to seconds", () => {
    expect(formatKnobValue({ ...linear, unit: "ms" }, 50)).toBe("50 ms");
    expect(formatKnobValue({ ...linear, unit: "ms" }, 5)).toBe("5.0 ms");
    expect(formatKnobValue({ ...linear, unit: "ms" }, 1500)).toBe("1.50 s");
  });

  it("formats multipliers with a times sign", () => {
    expect(formatKnobValue({ ...linear, unit: "x" }, 4)).toBe("4×");
    expect(formatKnobValue({ ...linear, unit: "x" }, 1.5)).toBe("1.5×");
  });

  it("formats integer knobs without decimals", () => {
    expect(formatKnobValue({ ...linear, integer: true }, 8)).toBe("8");
    expect(formatKnobValue({ ...linear, integer: true }, 8.4)).toBe("8");
  });
});
