/**
 * @jest-environment jsdom
 *
 * What *Voice all* quotes before the click. Speech is billed by the characters
 * it synthesizes, so the figure must come from the script's own text, over
 * exactly the lines `voiceAll` would voice — and a voice the catalog cannot
 * price has to say so rather than count as free.
 */
import { renderHook, act } from "@testing-library/react";

const mockPrice = jest.fn();
jest.mock("../../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (...args: unknown[]) => mockPrice(...args)
}));

jest.mock("../../../stores/script/timelineSync", () => ({
  syncLineClipToTimeline: jest.fn(async () => undefined)
}));

import { useVoiceCostEstimate } from "../useVoiceCostEstimate";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import type { ScriptDraft, ScriptLine } from "../../../stores/script/ScriptStore";

const SCRIPT = "sc-cost";

const MARA = { provider: "elevenlabs", model: "eleven_v3", voice: "alloy" };
const RUIZ = { provider: "elevenlabs", model: "eleven_flash_v2_5", voice: "echo" };

const line = (id: string, speakerId: string, text: string, takes: ScriptLine["takes"] = []): ScriptLine => ({
  id,
  speakerId,
  text,
  takes,
  currentTakeId: takes[0]?.id ?? null
});

const loadScript = (lines: ScriptLine[]): void => {
  const script: ScriptDraft = {
    id: SCRIPT,
    title: "Film",
    cast: [
      { id: "sp-1", name: "Mara", voice: MARA },
      { id: "sp-2", name: "Ruiz", voice: RUIZ }
    ],
    sections: [{ id: "sec-1", lines }],
    timelineId: null
  } as ScriptDraft;
  act(() => {
    useScriptStore.setState({ scripts: { [SCRIPT]: script } } as never);
  });
};

describe("useVoiceCostEstimate", () => {
  beforeEach(() => {
    mockPrice.mockReset();
    mockPrice.mockImplementation(
      (_model: unknown, params: { characters?: number }) => ({
        // $100 per million characters, the ElevenLabs shape.
        unit_price: ((params.characters ?? 0) * 100) / 1_000_000,
        billing_unit: "1m_chars",
        currency: "USD",
        source: "bundle",
        breakdown: `${params.characters} chars × $100/1M chars`
      })
    );
  });

  it("prices the script by the characters the click will synthesize", () => {
    loadScript([line("ln-1", "sp-1", "We are closed.")]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    expect(mockPrice).toHaveBeenCalledWith(
      { id: "eleven_v3", provider: "elevenlabs" },
      { characters: 14 }
    );
    expect(result.current).toMatchObject({
      lineCount: 1,
      characters: 14,
      pricedLineCount: 1
    });
    expect(result.current.cost).toBeCloseTo(0.0014, 12);
  });

  it("charges two models separately when the cast reads on two", () => {
    loadScript([
      line("ln-1", "sp-1", "We are closed."),
      line("ln-2", "sp-2", "Not to me.")
    ]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    // One call per billing model, not one per line.
    expect(mockPrice).toHaveBeenCalledTimes(2);
    expect(mockPrice).toHaveBeenCalledWith(
      { id: "eleven_flash_v2_5", provider: "elevenlabs" },
      { characters: 10 }
    );
    expect(result.current.lineCount).toBe(2);
    expect(result.current.breakdowns).toHaveLength(2);
  });

  it("skips lines that are already voiced — the click will not re-voice them", () => {
    const voiced = line("ln-1", "sp-1", "We are closed.", [
      {
        id: "tk-1",
        assetId: "asset-1",
        durationMs: 900,
        words: [],
        textSnapshot: "We are closed.",
        voiceSnapshot: MARA,
        createdAt: "2026-01-01T00:00:00Z"
      }
    ]);
    loadScript([voiced, line("ln-2", "sp-1", "Not to me.")]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    expect(result.current.lineCount).toBe(1);
    expect(result.current.characters).toBe(10);
  });

  it("re-prices a line whose text drifted from its take", () => {
    const stale = line("ln-1", "sp-1", "We are shut.", [
      {
        id: "tk-1",
        assetId: "asset-1",
        durationMs: 900,
        words: [],
        textSnapshot: "We are closed.",
        voiceSnapshot: MARA,
        createdAt: "2026-01-01T00:00:00Z"
      }
    ]);
    loadScript([stale]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    expect(result.current.lineCount).toBe(1);
    expect(result.current.characters).toBe(12);
  });

  it("skips a line with no voice — nothing will voice it", () => {
    loadScript([line("ln-1", "sp-missing", "Who am I?")]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    expect(result.current.lineCount).toBe(0);
    expect(mockPrice).not.toHaveBeenCalled();
  });

  it("reports a declined model instead of counting its lines as free", () => {
    mockPrice.mockReturnValue({
      unit_price: 0,
      billing_unit: "1m_tokens",
      currency: "USD",
      source: "bundle",
      declined: "priced per token of generated audio"
    });
    loadScript([line("ln-1", "sp-1", "We are closed.")]);

    const { result } = renderHook(() => useVoiceCostEstimate(SCRIPT));

    expect(result.current).toMatchObject({
      lineCount: 1,
      cost: 0,
      pricedLineCount: 0
    });
    expect(result.current.reasons[0]).toContain("token");
  });
});
