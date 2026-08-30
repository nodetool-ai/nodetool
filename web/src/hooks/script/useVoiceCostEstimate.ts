/**
 * useVoiceCostEstimate
 *
 * What *Voice all* is about to spend on this script. Speech models are billed
 * by the characters they synthesize, so the figure is the script's own text:
 * every line the click would voice, grouped by the voice it would use, each
 * group's characters priced through `getModelUnitPrice` — the same catalog the
 * storyboard's render estimates and the server's pre-run budget gate read.
 *
 * The lines come from `voiceTargets`, the predicate `voiceAll` itself loops, so
 * the quote and the click cannot disagree about what gets voiced. Grouping is
 * by voice rather than by line because a script with two speakers on two models
 * pays two rates, and one blended number would hide which of them a cast change
 * moved.
 *
 * A voice nothing prices contributes no figure and reports why: several speech
 * models publish only a per-token rate, and a token of generated audio is not
 * something a script's text converts into. Counting those lines as free would
 * understate the click.
 */

import { useMemo } from "react";
import { getModelUnitPrice } from "../../utils/modelUnitPricing";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { voiceTargets } from "../../stores/script/scriptVoicing";

export interface VoiceCostEstimate {
  /** Lines the click would voice. */
  lineCount: number;
  /** Characters those lines would synthesize. */
  characters: number;
  /** Summed USD over the voices that priced. */
  cost: number;
  /** How many of those lines carry a figure. */
  pricedLineCount: number;
  /** How the figure was reached, one entry per voice: "Narrator · 412 chars × $100/1M chars". */
  breakdowns: string[];
  /** Why the rest have no figure, deduplicated. */
  reasons: string[];
  /** What the catalog assumed, and what it warns the figure omits. */
  notes: string[];
}

const EMPTY: VoiceCostEstimate = {
  lineCount: 0,
  characters: 0,
  cost: 0,
  pricedLineCount: 0,
  breakdowns: [],
  reasons: [],
  notes: []
};

/** One model's share of the script: which lines, and how much text. */
interface VoiceGroup {
  provider: string;
  model: string;
  characters: number;
  lineCount: number;
}

export function useVoiceCostEstimate(scriptId: string): VoiceCostEstimate {
  const script = useScriptStore((state) => state.scripts[scriptId]);

  return useMemo(() => {
    if (!script) {
      return EMPTY;
    }
    const targets = voiceTargets(script);
    if (targets.length === 0) {
      return EMPTY;
    }

    // Two speakers on one model are one charge, so group by the model that
    // bills rather than by the voice that reads.
    const groups = new Map<string, VoiceGroup>();
    for (const { line, voice } of targets) {
      const key = `${voice.provider}:${voice.model}`;
      const group = groups.get(key) ?? {
        provider: voice.provider,
        model: voice.model,
        characters: 0,
        lineCount: 0
      };
      group.characters += line.text.trim().length;
      group.lineCount += 1;
      groups.set(key, group);
    }

    const breakdowns: string[] = [];
    const reasons: string[] = [];
    const notes: string[] = [];
    let cost = 0;
    let characters = 0;
    let pricedLineCount = 0;

    for (const group of groups.values()) {
      characters += group.characters;
      const price = getModelUnitPrice(
        { id: group.model, provider: group.provider },
        { characters: group.characters }
      );
      if (!price || price.declined || !Number.isFinite(price.unit_price)) {
        reasons.push(
          `${group.model}: ${price?.declined ?? "no published price in the catalog"}`
        );
        continue;
      }
      cost += price.unit_price;
      pricedLineCount += group.lineCount;
      breakdowns.push(`${group.model} · ${price.breakdown ?? ""}`.trim());
      notes.push(...(price.assumptions ?? []), ...(price.warnings ?? []));
    }

    return {
      lineCount: targets.length,
      characters,
      cost,
      pricedLineCount,
      breakdowns,
      reasons: Array.from(new Set(reasons)),
      notes: Array.from(new Set(notes))
    };
  }, [script]);
}

export default useVoiceCostEstimate;
