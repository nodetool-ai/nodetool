/**
 * Arpeggiator, chord comping and scale snapping for the selected midi clip,
 * and the editor for the selected chord. FableSynth's ArpPanel
 * (src/components/panels/ArpPanel.tsx) over a clip's `harmony`: the steps sit
 * on the timeline's beat grid and the chords come from a chord track.
 */

import React, { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ARP_RATES,
  chordAtTick,
  chordName,
  chordTrackFor,
  COMP_LIBRARY,
  COMP_ROWS,
  COMP_VOICINGS,
  compLibraryIndex,
  expandClipHarmony,
  harmonyKey,
  isHarmonyActive,
  MIDI_PPQ,
  msToTicks,
  noteName,
  resolveClipHarmony,
  resolveTempo,
  sortChords,
  STRUM_DIRECTIONS,
  STRUM_MAX_MS
} from "@nodetool-ai/timeline";
import type {
  ArpOrder,
  ClipHarmony,
  HarmonyStyle,
  MidiNote,
  ResolvedClipHarmony,
  TimelineChord,
  TimelineClip,
  TimelineTempo,
  TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { EmptyState, FlexColumn, Tooltip } from "../../../ui_primitives";
import { ChordEditor } from "./ChordEditor";
import { barTicks, chordHue } from "./chordGrid";
import { CompBrowser, loadCompEntry } from "./CompBrowser";
import { useHarmonyUIStore } from "./harmonyUIStore";
import { ProgressionBrowser } from "./ProgressionBrowser";
import { fillProgression } from "./progressionFill";
import { ScaleStrip } from "./ScaleStrip";
import "./harmony.css";

/** A row of mutually exclusive buttons. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string, string?]>;
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <div className="arp-seg" role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <Tooltip key={String(v)} title={title ?? ""}>
          <button type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** A numbered panel section: musical decisions read top to bottom. */
function Card({ n, title, tools, children, className = "" }: { n: number; title: string; tools?: ReactNode; children?: ReactNode; className?: string }): React.JSX.Element {
  return (
    <div className={`arp-card ${className}`}>
      <div className="arp-card-head">
        <span className="arp-card-no">{n}</span>
        <h3>{title}</h3>
        {tools}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, text, min, max, reset, onChange }: { label: string; value: number; text: string; min: number; max: number; reset: number; onChange: (v: number) => void }): React.JSX.Element {
  return (
    <label className="arp-knob">
      <span>
        {label}
        <output>{text}</output>
      </span>
      <input aria-label={label} type="range" min={min} max={max} value={value} onDoubleClick={() => onChange(reset)} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const VOICE_TITLE_KEYS: Record<string, string> = {
  TOP: "top", MID: "middle", LOW: "low", BASS: "bass"
};

/** One lane cycle (16 steps) of the clip's expansion, for the grids. */
interface StepPage {
  /** Notes struck at each of the 16 steps, lowest first. */
  stacks: number[][];
  /** The chord under each step. */
  chords: (TimelineChord | undefined)[];
}

function stepPage(
  clip: TimelineClip,
  h: ResolvedClipHarmony,
  notes: ReadonlyArray<MidiNote>,
  chords: ReadonlyArray<TimelineChord>,
  tempo: TimelineTempo
): StepPage {
  const stepTicks = h.rate * MIDI_PPQ;
  const inPoint = clip.inPointMs ?? 0;
  const shift = msToTicks(clip.startMs - inPoint - tempo.offsetMs, tempo.bpm);
  const k0 = Math.ceil((shift + msToTicks(inPoint, tempo.bpm)) / stepTicks - 1e-6);
  const kBase = k0 - (((k0 % 16) + 16) % 16);
  const stacks: number[][] = Array.from({ length: 16 }, () => []);
  const chordsAt: (TimelineChord | undefined)[] = [];
  for (let i = 0; i < 16; i++) {
    const docTick = (kBase + i) * stepTicks;
    chordsAt.push(h.input === "chords" ? chordAtTick(chords, docTick + 1e-6) : undefined);
    const contentTick = docTick - shift;
    for (const n of notes) {
      // A strum spreads a stack over a few ticks after the step.
      if (n.startTick >= contentTick - 0.5 && n.startTick < contentTick + stepTicks * 0.5) stacks[i].push(n.pitch);
    }
    stacks[i].sort((a, b) => a - b);
  }
  return { stacks, chords: chordsAt };
}

interface ClipHarmonyEditorProps {
  clip: TimelineClip;
  tracks: ReadonlyArray<TimelineTrack>;
  tempo: TimelineTempo;
}

function ClipHarmonyEditor({ clip, tracks, tempo }: ClipHarmonyEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const setClipHarmony = useTimelineStore((s) => s.setClipHarmony);
  const setTrackChords = useTimelineStore((s) => s.setTrackChords);
  const insertTrack = useTimelineStore((s) => s.insertTrack);
  const [browsing, setBrowsing] = useState<"comp" | "progression" | null>(null);
  const stored: ClipHarmony = clip.harmony ?? { style: "off", input: "chords" };
  const h = resolveClipHarmony(stored);
  const update = (patch: Partial<ClipHarmony>): void => setClipHarmony(clip.id, { ...stored, ...patch });
  const chordTracks = tracks.filter((t) => t.type === "chord");
  const chordTrack = chordTrackFor(h, tracks) as TimelineTrack | undefined;
  const chords = useMemo(() => sortChords(chordTrack?.chords ?? []), [chordTrack?.chords]);
  const expanded = useMemo(() => expandClipHarmony(clip, { tracks, tempo }), [clip, tracks, tempo]);
  const page = useMemo(() => stepPage(clip, h, expanded, chords, tempo), [clip, h, expanded, chords, tempo]);
  const [progressionKey, setProgressionKey] = useState(() => harmonyKey(h, chords));
  const [progression, setProgression] = useState(-1);

  const chordMode = h.input === "chords";
  const comp = h.style === "comp";
  const active = isHarmonyActive(clip.harmony) && h.style !== "off";
  const preset = comp ? compLibraryIndex(h) : -1;
  const presetLabel = (kind: "families" | "grooves" | "variations", value: string): string =>
    t(`i18n-cont-music-09.harmony.presets.${kind}.${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`);
  const stepPreset = (d: number): void =>
    update(loadCompEntry(COMP_LIBRARY[(Math.max(preset, d > 0 ? -1 : 0) + d + COMP_LIBRARY.length) % COMP_LIBRARY.length]));
  const underClip = chords.filter((c) => {
    const startMs = tempo.offsetMs + (c.startTick / MIDI_PPQ) * (60000 / tempo.bpm);
    const endMs = startMs + (c.durationTick / MIDI_PPQ) * (60000 / tempo.bpm);
    return endMs > clip.startMs && startMs < clip.startMs + clip.durationMs;
  });
  const status = h.style === "off"
    ? h.scale !== "off" ? t("i18n-cont-music-09.harmony.status.writtenScaleSnap") : t("i18n-cont-music-09.harmony.status.offWrittenNotes")
    : chordMode && !chordTrack ? t("i18n-cont-music-09.harmony.status.addChordTrack")
      : chordMode && !underClip.length ? t("i18n-cont-music-09.harmony.status.drawChords")
        : !chordMode && !(clip.notes?.length) ? t("i18n-cont-music-09.harmony.status.writeNotes")
          : t("i18n-cont-music-09.harmony.status.noteCount", { count: expanded.length });

  const loadProgression = (index: number): void => {
    if (!chordTrack) return;
    const from = msToTicks(clip.startMs - tempo.offsetMs, tempo.bpm);
    const to = msToTicks(clip.startMs + clip.durationMs - tempo.offsetMs, tempo.bpm);
    setTrackChords(chordTrack.id, fillProgression(chordTrack.chords ?? [], index, progressionKey, from, to, barTicks(tempo)));
    setProgression(index);
  };
  const addChordTrack = (): void => {
    const index = tracks.findIndex((t) => t.id === clip.trackId);
    const id = insertTrack("chord", Math.max(0, index), t("i18n-cont-music-09.harmony.newChordTrackName"));
    update({ chordTrackId: id, input: "chords" });
  };

  const lane = (label: string, values: boolean[], key: "hits" | "accents" | "ties", glyph: string, title: string, kind = ""): React.JSX.Element => (
    <div className={`arp-row arp-lane ${kind}`} key={key}>
      <span title={title}>{label}</span>
      {values.map((on, i) => (
        <button
          key={i}
          type="button"
          title={title}
          aria-label={`${label} step ${i + 1}`}
          aria-pressed={on}
          className={`${on ? "on" : ""}${i % 4 === 0 ? " beat" : ""}`}
          onClick={() => update({ [key]: values.map((v, j) => (j === i ? !v : v)) })}
        >
          {on ? glyph : ""}
        </button>
      ))}
    </div>
  );
  const stepNumbers = (
    <div className="arp-row arp-steps" aria-hidden="true">
      <span />
      {page.stacks.map((_, i) => (
        <span key={i} className={i % 4 === 0 ? "beat" : ""}>{i % 4 === 0 ? i / 4 + 1 : "·"}</span>
      ))}
    </div>
  );
  const chordRow = chordMode && (
    <div className="arp-row arp-chords" aria-hidden="true">
      <span>{t("i18n-cont-music-09.harmony.chord")}</span>
      {page.chords.map((c, i) => {
        const starts = !!c && c !== page.chords[i - 1];
        return (
          <span key={i} className={starts ? "start" : ""} style={c ? ({ "--hue": chordHue(c.root) } as React.CSSProperties) : undefined}>
            {starts ? chordName(c) : ""}
          </span>
        );
      })}
    </div>
  );

  let held = 0;
  const heldMasks = h.comp.map((m, i) => (held = h.ties[i] ? held : m));
  const compGrid = (
    <div className="arp-grid" aria-label={t("i18n-cont-music-09.harmony.compPattern")}>
      {chordRow}
      {stepNumbers}
      {COMP_ROWS.map(([label, bit]) => {
        const name = VOICE_TITLE_KEYS[label];
        const localizedLabel = t(`i18n-cont-music-09.harmony.voiceNames.${name}`);
        const title = t(`i18n-cont-music-09.harmony.voices.${name}`);
        return (
          <div className="arp-row arp-voice" key={label}>
            <span title={title}>{localizedLabel}</span>
            {h.comp.map((m, i) => {
              const tied = h.ties[i];
              const strike = !tied && !!(m & bit);
              const hold = tied && !!(heldMasks[i] & bit);
              const next = (i + 1) % 16;
              const continues = (strike || hold) && h.ties[next] && !!(heldMasks[next] & bit) && next !== 0;
              return (
                <button
                  key={i}
                  type="button"
                  title={title}
                  aria-label={t("i18n-cont-music-09.harmony.voiceStep", { label: localizedLabel, step: i + 1 })}
                  aria-pressed={strike}
                  className={`${strike ? "on" : hold ? "held" : ""}${continues ? " continues" : ""}${h.accents[i] && strike ? " accent" : ""}${i % 4 === 0 ? " beat" : ""}`}
                  onClick={() =>
                    update(
                      tied
                        ? { ties: h.ties.map((v, j) => (j === i ? false : v)), comp: h.comp.map((v, j) => (j === i ? heldMasks[i] ^ bit : v)) }
                        : { comp: h.comp.map((v, j) => (j === i ? v ^ bit : v)) }
                    )
                  }
                />
              );
            })}
          </div>
        );
      })}
      <div className="arp-divider" />
      {lane(t("i18n-cont-music-09.harmony.hold"), h.ties, "ties", "⁀", t("i18n-cont-music-09.harmony.holdHelp"), "hold")}
      {lane(t("i18n-cont-music-09.harmony.accent"), h.accents, "accents", "●", t("i18n-cont-music-09.harmony.accentHelp"), "accent")}
    </div>
  );

  const phrase = page.stacks.map((s) => (s.length ? s[s.length - 1] : -1));
  const used = phrase.filter((n) => n >= 0);
  const low = Math.min(...used, 48);
  const high = Math.max(...used, low + 12);
  const arpGrid = (
    <>
      <div className="arp-display" aria-label={t("i18n-cont-music-09.harmony.generatedPhrasePreview")}>
        <div className="arp-register">
          <span>{noteName(high)}</span>
          <span>{noteName(low)}</span>
        </div>
        <div className="arp-phrase">
          {phrase.map((n, i) => (
            <div key={i} className={`arp-column${i % 4 === 0 ? " beat" : ""}`}>
              {n >= 0 && (
                <div
                  className={`arp-generated${h.accents[i] ? " accented" : ""}`}
                  style={{ bottom: `${8 + ((n - low) / (high - low)) * 66}%`, width: `${Math.max(12, h.gate * 90)}%` }}
                >
                  <span>{noteName(n)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="arp-grid">
        {chordRow}
        {stepNumbers}
        {lane(t("i18n-cont-music-09.harmony.play"), h.hits, "hits", "●", t("i18n-cont-music-09.harmony.playRestHelp"))}
        {lane(t("i18n-cont-music-09.harmony.accent"), h.accents, "accents", "●", t("i18n-cont-music-09.harmony.accentHelp"), "accent")}
      </div>
    </>
  );

  return (
    <section className="panel ns-section arp-panel" data-testid="harmony-panel-clip">
      <div className="arp-top">
        <h2>{comp ? t("i18n-cont-music-09.harmony.chordComping") : h.style === "arp" ? t("i18n-cont-music-09.harmony.arpeggiator") : t("i18n-cont-music-09.harmony.harmony")}</h2>
        <Segmented<HarmonyStyle> label={t("i18n-cont-music-09.harmony.style")} value={h.style} options={[["off", t("i18n-cont-music-09.harmony.styles.off"), t("i18n-cont-music-09.harmony.styles.offHelp")], ["arp", t("i18n-cont-music-09.harmony.styles.arp"), t("i18n-cont-music-09.harmony.styles.arpHelp")], ["comp", t("i18n-cont-music-09.harmony.styles.comp"), t("i18n-cont-music-09.harmony.styles.compHelp")]]} onChange={(style) => update({ style })} />
        <span className="arp-status">
          {clip.name} · {status}
          <span className={active ? "arp-led on" : "arp-led"} />
        </span>
      </div>

      <Card
        n={1}
        title={t("i18n-cont-music-09.harmony.notes")}
        tools={
          <>
            <Segmented<ClipHarmony["input"]>
              label={t("i18n-cont-music-09.harmony.input")}
              value={h.input}
              onChange={(input) => update({ input })}
              options={[
                ["chords", t("i18n-cont-music-09.harmony.chordTrack"), t("i18n-cont-music-09.harmony.playChordTrackHelp")],
                ["notes", t("i18n-cont-music-09.harmony.clipNotes"), t("i18n-cont-music-09.harmony.playClipNotesHelp")]
              ]}
            />
            {chordMode && chordTracks.length > 0 && (
              <label className="arp-field">
                {t("i18n-cont-music-09.harmony.track")}
                <select aria-label={t("i18n-cont-music-09.harmony.chordTrack")} value={chordTrack?.id ?? ""} onChange={(e) => update({ chordTrackId: e.target.value })}>
                  {chordTracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            {chordMode && (
              <div className="arp-octave">
                <button type="button" aria-label={t("i18n-cont-music-09.harmony.lowerOctave")} disabled={h.octave <= 0} onClick={() => update({ octave: h.octave - 1 })}>−</button>
                <span>{t("i18n-cont-music-09.harmony.octaveShort")} {h.octave}</span>
                <button type="button" aria-label={t("i18n-cont-music-09.harmony.raiseOctave")} disabled={h.octave >= 7} onClick={() => update({ octave: h.octave + 1 })}>+</button>
              </div>
            )}
            {chordMode && chordTrack && (
              <button type="button" className="ns-btn" onClick={() => setBrowsing("progression")}>{t("i18n-cont-music-09.harmony.progressions")}</button>
            )}
            {chordMode && !chordTrack && (
              <button type="button" className="ns-btn" onClick={addChordTrack}>{t("i18n-cont-music-09.harmony.addChordTrack")}</button>
            )}
          </>
        }
      >
        <div className="arp-note-pool" aria-label={t("i18n-cont-music-09.harmony.chordsUnderClip")}>
          {chordMode
            ? underClip.map((c) => (
                <span key={c.id} className="arp-note" style={{ "--hue": chordHue(c.root) } as React.CSSProperties}>{chordName(c)}</span>
              ))
            : [...new Set((clip.notes ?? []).map((n) => n.pitch))].sort((a, b) => a - b).map((p) => (
                <span key={p} className="arp-note">{noteName(p)}</span>
              ))}
          {chordMode && !underClip.length && <span className="arp-empty">{t("i18n-cont-music-09.harmony.noChordsUnderClip")}</span>}
        </div>
      </Card>

      {h.style !== "off" && (
        <Card
          n={2}
          title={t("i18n-cont-music-09.harmony.pattern")}
          className="arp-pattern"
          tools={
            comp ? (
              <div className="arp-pattern-pick">
                <button type="button" aria-label={t("i18n-cont-music-09.harmony.previousCompPattern")} onClick={() => stepPreset(-1)}>‹</button>
                <button type="button" className="pattern-name" aria-label={t("i18n-cont-music-09.harmony.browseCompPatterns")} onClick={() => setBrowsing("comp")}>
                  <strong>{preset < 0 ? t("i18n-cont-music-09.harmony.customPattern") : presetLabel("grooves", COMP_LIBRARY[preset].groove)}</strong>
                  {preset >= 0 && <em>{presetLabel(COMP_LIBRARY[preset].variation !== "ORIGINAL" ? "variations" : "families", COMP_LIBRARY[preset].variation !== "ORIGINAL" ? COMP_LIBRARY[preset].variation : COMP_LIBRARY[preset].family)}</em>}
                  <span className="browse">{t("i18n-cont-music-09.harmony.browse")}</span>
                </button>
                <button type="button" aria-label={t("i18n-cont-music-09.harmony.nextCompPattern")} onClick={() => stepPreset(1)}>›</button>
              </div>
            ) : (
              <>
                <label className="arp-field">
                  {t("i18n-cont-music-09.harmony.order")}
                  <select aria-label={t("i18n-cont-music-09.harmony.arpeggiatorOrder")} value={h.order} onChange={(e) => update({ order: e.target.value as ArpOrder })}>
                    <option value="up">↑ {t("i18n-cont-music-09.harmony.orders.up")}</option>
                    <option value="down">↓ {t("i18n-cont-music-09.harmony.orders.down")}</option>
                    <option value="updown">↕ {t("i18n-cont-music-09.harmony.orders.upDown")}</option>
                    <option value="played">{t("i18n-cont-music-09.harmony.orders.asPlayed")}</option>
                    <option value="random">{t("i18n-cont-music-09.harmony.orders.random")}</option>
                  </select>
                </label>
                <label className="arp-field">
                  {t("i18n-cont-music-09.harmony.range")}
                  <select aria-label={t("i18n-cont-music-09.harmony.arpeggiatorOctaves")} value={h.octaves} onChange={(e) => update({ octaves: Number(e.target.value) })}>
                    <option value={1}>{t("i18n-cont-music-09.harmony.octaveCount", { count: 1 })}</option>
                    <option value={2}>{t("i18n-cont-music-09.harmony.octaveCount", { count: 2 })}</option>
                    <option value={3}>{t("i18n-cont-music-09.harmony.octaveCount", { count: 3 })}</option>
                  </select>
                </label>
                {h.order === "random" && (
                  <button type="button" className="ns-btn" onClick={() => update({ seed: h.seed + 1 })}>{t("i18n-cont-music-09.harmony.newSeed", { seed: h.seed })}</button>
                )}
                <span className="arp-hint">{chordMode ? t("i18n-cont-music-09.harmony.restartsEachChord") : t("i18n-cont-music-09.harmony.followsHeldNotes")}</span>
              </>
            )
          }
        >
          {comp ? compGrid : arpGrid}
        </Card>
      )}

      {h.style !== "off" && (
        <Card
          n={3}
          title={t("i18n-cont-music-09.harmony.feel")}
          className="arp-feel"
          tools={
            <div className="arp-feel-controls">
              <label className="arp-field">
                {t("i18n-cont-music-09.harmony.rate")}
                <select aria-label={t("i18n-cont-music-09.harmony.arpeggiatorRate")} value={h.rate} onChange={(e) => update({ rate: Number(e.target.value) })}>
                  {ARP_RATES.map(([v, rateName]) => {
                    const [note, articulation] = rateName.split(" ");
                    const label = articulation === "DOTTED"
                      ? t("i18n-cont-music-09.harmony.dottedRate", { note })
                      : articulation === "TRIPLET"
                        ? t("i18n-cont-music-09.harmony.tripletRate", { note })
                        : rateName;
                    return <option key={rateName} value={v}>{label}</option>;
                  })}
                </select>
              </label>
              <Slider label={t("i18n-cont-music-09.harmony.gate")} value={Math.round(h.gate * 100)} text={`${Math.round(h.gate * 100)}%`} min={5} max={95} reset={65} onChange={(v) => update({ gate: v / 100 })} />
              {comp && (
                <>
                  <Slider label={t("i18n-cont-music-09.harmony.strum")} value={h.strumMs} text={h.strumMs ? t("i18n-cont-music-09.harmony.milliseconds", { count: h.strumMs }) : t("i18n-cont-music-09.harmony.off")} min={0} max={STRUM_MAX_MS} reset={0} onChange={(strumMs) => update({ strumMs })} />
                  <span className="arp-field">{t("i18n-cont-music-09.harmony.stroke")}</span>
                  <Segmented
                    label={t("i18n-cont-music-09.harmony.strumDirection")}
                    value={h.strumDirection}
                    onChange={(strumDirection) => update({ strumDirection })}
                    options={STRUM_DIRECTIONS.map((d) => [d, d === "up" ? "↑" : d === "down" ? "↓" : "↕", d === "up" ? t("i18n-cont-music-09.harmony.strumLowToHigh") : d === "down" ? t("i18n-cont-music-09.harmony.strumHighToLow") : t("i18n-cont-music-09.harmony.strumAlternate")] as const)}
                  />
                  <span className="arp-field">{t("i18n-cont-music-09.harmony.voicing")}</span>
                  <Segmented
                    label={t("i18n-cont-music-09.harmony.compVoicing")}
                    value={h.voicing}
                    onChange={(voicing) => update({ voicing })}
                    options={COMP_VOICINGS.map((v) => [v, t(`i18n-cont-music-09.harmony.voicings.${v}`)] as const)}
                  />
                </>
              )}
            </div>
          }
        />
      )}

      <ScaleStrip harmony={h} tracks={tracks} update={update} />

      {browsing && (
        <div className="fablesynth harmony-root harmony-overlay">
          {browsing === "comp" ? (
            <CompBrowser harmony={h} update={update} onClose={() => setBrowsing(null)} />
          ) : (
            <ProgressionBrowser
              chordKey={progressionKey}
              setKey={setProgressionKey}
              current={progression}
              load={loadProgression}
              onClose={() => setBrowsing(null)}
              target={t("i18n-cont-music-09.harmony.chordsUnderClipTarget")}
            />
          )}
        </div>
      )}
    </section>
  );
}

function SelectedChordEditor({ tracks }: { tracks: ReadonlyArray<TimelineTrack> }): React.JSX.Element | null {
  const { t } = useTranslation();
  const selected = useHarmonyUIStore((s) => s.selectedChord);
  const selectChord = useHarmonyUIStore((s) => s.selectChord);
  const setTrackChords = useTimelineStore((s) => s.setTrackChords);
  const track = selected ? tracks.find((t) => t.id === selected.trackId) : undefined;
  const chord = track?.chords?.find((c) => c.id === selected?.chordId);
  if (!track || !chord) return null;
  return (
    <section className="panel ns-section arp-panel" data-testid="harmony-panel-chord">
      <div className="arp-top">
        <h2>{t("i18n-cont-music-09.harmony.chordTitle", { name: track.name.toUpperCase() })}</h2>
      </div>
      <ChordEditor
        chord={chord}
        onChange={(patch) => setTrackChords(track.id, (track.chords ?? []).map((c) => (c.id === chord.id ? { ...c, ...patch } : c)))}
        onDelete={() => {
          setTrackChords(track.id, (track.chords ?? []).filter((c) => c.id !== chord.id));
          selectChord(null);
        }}
      />
    </section>
  );
}

/** Chord track and clip arp/comp editor for the selected midi clip. */
export function HarmonyPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const selectedIds = useTimelineUIStore((s) => s.selectedClipIds);
  const clips = useTimelineStore((s) => s.clips);
  const tracks = useTimelineStore((s) => s.tracks);
  const tempoState = useTimelineStore((s) => s.tempo);
  const tempo = useMemo(() => resolveTempo({ tempo: tempoState }), [tempoState]);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const clip = useMemo(
    () => clips.find((c) => selectedIds.has(c.id) && c.mediaType === "midi"),
    [clips, selectedIds]
  );
  const firstMidiClip = useMemo(() => (clip ? undefined : clips.find((c) => c.mediaType === "midi")), [clip, clips]);
  if (clip) {
    return (
      <div className="fablesynth harmony-root harmony-panel" data-testid="harmony-panel">
        <SelectedChordEditor tracks={tracks} />
        <ClipHarmonyEditor clip={clip} tracks={tracks} tempo={tempo} />
      </div>
    );
  }
  // The empty state sits outside the FableSynth scope, whose hardware type
  // would restyle the shared EmptyState primitive.
  return (
    <FlexColumn fullWidth fullHeight data-testid="harmony-panel" sx={{ overflow: "auto" }}>
      <div className="fablesynth harmony-root harmony-chord-host">
        <SelectedChordEditor tracks={tracks} />
      </div>
      <FlexColumn align="center" justify="center" fullWidth sx={{ flex: 1, minHeight: 0 }}>
        <EmptyState
          title={t("i18n-cont-music-09.harmony.noMidiClipSelected")}
          description={
            firstMidiClip
              ? t("i18n-cont-music-09.harmony.selectMidiClip")
              : t("i18n-cont-music-09.harmony.addMidiClip")
          }
          actionText={firstMidiClip ? t("i18n-cont-music-09.harmony.editClip", { name: firstMidiClip.name || t("i18n-cont-music-09.harmony.midiClip") }) : undefined}
          onAction={firstMidiClip ? () => selectClip(firstMidiClip.id) : undefined}
        />
      </FlexColumn>
    </FlexColumn>
  );
}
