/**
 * Scale snapping for a clip's written notes, from FableSynth
 * src/components/ScaleStrip.tsx: OFF, one KEY scale, or each chord's scale
 * (CHORDS). FOLLOW is not ported.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  chordTrackFor,
  harmonyKey,
  keyScale,
  PITCH_NAMES,
  SCALE_IDS,
  SCALES,
  scaleLabel
} from "@nodetool-ai/timeline";
import type { ClipHarmony, HarmonyScaleMode, ResolvedClipHarmony, TimelineTrack } from "@nodetool-ai/timeline";

const MODES: [HarmonyScaleMode, string][] = [
  ["off", "OFF"],
  ["key", "KEY"],
  ["chords", "CHORDS"]
];

export interface ScaleStripProps {
  harmony: ResolvedClipHarmony;
  tracks: ReadonlyArray<TimelineTrack>;
  update: (patch: Partial<ClipHarmony>) => void;
}

export function ScaleStrip({ harmony, tracks, update }: ScaleStripProps): React.JSX.Element {
  const { t } = useTranslation();
  const chords = chordTrackFor(harmony, tracks)?.chords ?? [];
  const key = harmonyKey(harmony, chords);
  const auto = keyScale(chords, key);
  const mode = harmony.scale;
  const resolved = harmony.scaleType === "auto" ? auto : harmony.scaleType;
  const modeLabels: Record<HarmonyScaleMode, string> = {
    off: t("i18n-next77.harmony.scaleStrip.modes.off"),
    key: t("i18n-next77.harmony.scaleStrip.modes.key"),
    chords: t("i18n-next77.harmony.scaleStrip.modes.chords")
  };
  return (
    <div className={`scale-strip${mode !== "off" ? " on" : ""}`} data-testid="harmony-scale-strip">
      <span className="scale-strip-title">{t("i18n-next77.harmony.scaleStrip.title")}</span>
      <div className="scale-strip-segment" role="radiogroup" aria-label={t("i18n-next77.harmony.scaleStrip.modeLabel")}>
        {MODES.map(([m]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => update({ scale: m })}>
            {modeLabels[m]}
          </button>
        ))}
      </div>
      {mode !== "off" && (
        <>
          <label className="scale-strip-field">
            {t("i18n-next77.harmony.scaleStrip.keyField")}
            <select aria-label={t("i18n-next77.harmony.scaleStrip.keyAriaLabel")} value={key} onChange={(e) => update({ scaleKey: Number(e.target.value) })}>
              {PITCH_NAMES.map((n, i) => (
                <option key={n} value={i}>{n}</option>
              ))}
            </select>
          </label>
          <label className="scale-strip-field">
            {mode === "chords" ? t("i18n-next77.harmony.scaleStrip.homeField") : t("i18n-next77.harmony.scaleStrip.scaleField")}
            <select aria-label={t("i18n-next77.harmony.scaleStrip.typeAriaLabel")} value={harmony.scaleType} onChange={(e) => update({ scaleType: e.target.value as ClipHarmony["scaleType"] })}>
              <option value="auto">{t("i18n-next77.harmony.scaleStrip.autoOption")} · {SCALES[auto].name}</option>
              {SCALE_IDS.map((t) => (
                <option key={t} value={t}>{SCALES[t].name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {mode === "key" && <span className="scale-strip-hint">{scaleLabel(key, resolved)} · {t("i18n-next77.harmony.scaleStrip.keyHint")}</span>}
      {mode === "chords" && <span className="scale-strip-hint">{t("i18n-next77.harmony.scaleStrip.chordsHint")}</span>}
    </div>
  );
}
