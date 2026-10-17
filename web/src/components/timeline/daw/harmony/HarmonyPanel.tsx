/**
 * Arpeggiator, chord comping and scale snapping for the selected midi clip,
 * and the editor for the selected chord. FableSynth's ArpPanel
 * (src/components/panels/ArpPanel.tsx) over a clip's `harmony`: the steps sit
 * on the timeline's beat grid and the chords come from a chord track.
 */

import React, { useMemo, useState, type ReactNode } from "react";
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
import { EmptyState, FlexColumn } from "../../../ui_primitives";
import { ChordEditor } from "./ChordEditor";
import { barTicks, chordHue } from "./chordGrid";
import { CompBrowser, loadCompEntry, VOICING_NAMES } from "./CompBrowser";
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
        <button key={String(v)} type="button" title={title} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
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

const VOICE_TITLES: Record<string, string> = {
  TOP: "Highest chord note",
  MID: "Chord notes between the lowest and highest",
  LOW: "Lowest chord note",
  BASS: "Chord root, one octave below"
};

const STYLE_OPTIONS: ReadonlyArray<readonly [HarmonyStyle, string, string]> = [
  ["off", "OFF", "Play the written notes"],
  ["arp", "ARP", "Arpeggiate the chords or the held notes"],
  ["comp", "COMP", "Strike chord voicings in a rhythm"]
];

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
  const stepPreset = (d: number): void =>
    update(loadCompEntry(COMP_LIBRARY[(Math.max(preset, d > 0 ? -1 : 0) + d + COMP_LIBRARY.length) % COMP_LIBRARY.length]));
  const underClip = chords.filter((c) => {
    const startMs = tempo.offsetMs + (c.startTick / MIDI_PPQ) * (60000 / tempo.bpm);
    const endMs = startMs + (c.durationTick / MIDI_PPQ) * (60000 / tempo.bpm);
    return endMs > clip.startMs && startMs < clip.startMs + clip.durationMs;
  });
  const status = h.style === "off"
    ? h.scale !== "off" ? "WRITTEN NOTES · SCALE SNAP" : "OFF · WRITTEN NOTES PLAY"
    : chordMode && !chordTrack ? "ADD A CHORD TRACK"
      : chordMode && !underClip.length ? "DRAW CHORDS UNDER THE CLIP"
        : !chordMode && !(clip.notes?.length) ? "WRITE NOTES TO ARPEGGIATE"
          : `${expanded.length} NOTES`;

  const loadProgression = (index: number): void => {
    if (!chordTrack) return;
    const from = msToTicks(clip.startMs - tempo.offsetMs, tempo.bpm);
    const to = msToTicks(clip.startMs + clip.durationMs - tempo.offsetMs, tempo.bpm);
    setTrackChords(chordTrack.id, fillProgression(chordTrack.chords ?? [], index, progressionKey, from, to, barTicks(tempo)));
    setProgression(index);
  };
  const addChordTrack = (): void => {
    const index = tracks.findIndex((t) => t.id === clip.trackId);
    const id = insertTrack("chord", Math.max(0, index), "Chords");
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
      <span>CHORD</span>
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
    <div className="arp-grid" aria-label="Comp pattern">
      {chordRow}
      {stepNumbers}
      {COMP_ROWS.map(([label, bit]) => (
        <div className="arp-row arp-voice" key={label}>
          <span title={VOICE_TITLES[label]}>{label}</span>
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
                title={VOICE_TITLES[label]}
                aria-label={`${label} voice step ${i + 1}`}
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
      ))}
      <div className="arp-divider" />
      {lane("HOLD", h.ties, "ties", "⁀", "Hold the previous chord through this step; a chord change strikes the new chord", "hold")}
      {lane("ACCENT", h.accents, "accents", "●", "Play this step louder", "accent")}
    </div>
  );

  const phrase = page.stacks.map((s) => (s.length ? s[s.length - 1] : -1));
  const used = phrase.filter((n) => n >= 0);
  const low = Math.min(...used, 48);
  const high = Math.max(...used, low + 12);
  const arpGrid = (
    <>
      <div className="arp-display" aria-label="Generated phrase preview">
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
        {lane("PLAY", h.hits, "hits", "●", "Play or rest on this step")}
        {lane("ACCENT", h.accents, "accents", "●", "Play this step louder", "accent")}
      </div>
    </>
  );

  return (
    <section className="panel ns-section arp-panel" data-testid="harmony-panel-clip">
      <div className="arp-top">
        <h2>{comp ? "CHORD COMPING" : h.style === "arp" ? "ARPEGGIATOR" : "HARMONY"}</h2>
        <Segmented<HarmonyStyle> label="Harmony style" value={h.style} options={STYLE_OPTIONS} onChange={(style) => update({ style })} />
        <span className="arp-status">
          {clip.name} · {status}
          <span className={active ? "arp-led on" : "arp-led"} />
        </span>
      </div>

      <Card
        n={1}
        title="NOTES"
        tools={
          <>
            <Segmented<ClipHarmony["input"]>
              label="Harmony input"
              value={h.input}
              onChange={(input) => update({ input })}
              options={[
                ["chords", "CHORD TRACK", "Play the chords of a chord track"],
                ["notes", "CLIP NOTES", "Play the notes the clip holds at each step"]
              ]}
            />
            {chordMode && chordTracks.length > 0 && (
              <label className="arp-field">
                TRACK
                <select aria-label="Chord track" value={chordTrack?.id ?? ""} onChange={(e) => update({ chordTrackId: e.target.value })}>
                  {chordTracks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            {chordMode && (
              <div className="arp-octave">
                <button type="button" aria-label="Lower chord octave" disabled={h.octave <= 0} onClick={() => update({ octave: h.octave - 1 })}>−</button>
                <span>OCT {h.octave}</span>
                <button type="button" aria-label="Raise chord octave" disabled={h.octave >= 7} onClick={() => update({ octave: h.octave + 1 })}>+</button>
              </div>
            )}
            {chordMode && chordTrack && (
              <button type="button" className="ns-btn" onClick={() => setBrowsing("progression")}>PROGRESSIONS</button>
            )}
            {chordMode && !chordTrack && (
              <button type="button" className="ns-btn" onClick={addChordTrack}>ADD CHORD TRACK</button>
            )}
          </>
        }
      >
        <div className="arp-note-pool" aria-label="Chords under the clip">
          {chordMode
            ? underClip.map((c) => (
                <span key={c.id} className="arp-note" style={{ "--hue": chordHue(c.root) } as React.CSSProperties}>{chordName(c)}</span>
              ))
            : [...new Set((clip.notes ?? []).map((n) => n.pitch))].sort((a, b) => a - b).map((p) => (
                <span key={p} className="arp-note">{noteName(p)}</span>
              ))}
          {chordMode && !underClip.length && <span className="arp-empty">No chords under the clip. Click the chord lane to add one, or load a progression.</span>}
        </div>
      </Card>

      {h.style !== "off" && (
        <Card
          n={2}
          title="PATTERN"
          className="arp-pattern"
          tools={
            comp ? (
              <div className="arp-pattern-pick">
                <button type="button" aria-label="Previous comp pattern" onClick={() => stepPreset(-1)}>‹</button>
                <button type="button" className="pattern-name" aria-label="Browse comp patterns" onClick={() => setBrowsing("comp")}>
                  <strong>{preset < 0 ? "CUSTOM PATTERN" : COMP_LIBRARY[preset].groove}</strong>
                  {preset >= 0 && <em>{COMP_LIBRARY[preset].variation !== "ORIGINAL" ? COMP_LIBRARY[preset].variation : COMP_LIBRARY[preset].family}</em>}
                  <span className="browse">BROWSE</span>
                </button>
                <button type="button" aria-label="Next comp pattern" onClick={() => stepPreset(1)}>›</button>
              </div>
            ) : (
              <>
                <label className="arp-field">
                  ORDER
                  <select aria-label="Arpeggiator order" value={h.order} onChange={(e) => update({ order: e.target.value as ArpOrder })}>
                    <option value="up">↑ UP</option>
                    <option value="down">↓ DOWN</option>
                    <option value="updown">↕ UP / DOWN</option>
                    <option value="played">AS PLAYED</option>
                    <option value="random">RANDOM</option>
                  </select>
                </label>
                <label className="arp-field">
                  RANGE
                  <select aria-label="Arpeggiator octaves" value={h.octaves} onChange={(e) => update({ octaves: Number(e.target.value) })}>
                    <option value={1}>1 OCTAVE</option>
                    <option value={2}>2 OCTAVES</option>
                    <option value={3}>3 OCTAVES</option>
                  </select>
                </label>
                {h.order === "random" && (
                  <button type="button" className="ns-btn" onClick={() => update({ seed: h.seed + 1 })}>NEW SEED · {h.seed}</button>
                )}
                <span className="arp-hint">{chordMode ? "RESTARTS ON EACH CHORD" : "FOLLOWS THE HELD NOTES"}</span>
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
          title="FEEL"
          className="arp-feel"
          tools={
            <div className="arp-feel-controls">
              <label className="arp-field">
                RATE
                <select aria-label="Arpeggiator rate" value={h.rate} onChange={(e) => update({ rate: Number(e.target.value) })}>
                  {ARP_RATES.map(([v, t]) => (
                    <option key={t} value={v}>{t}</option>
                  ))}
                </select>
              </label>
              <Slider label="GATE" value={Math.round(h.gate * 100)} text={`${Math.round(h.gate * 100)}%`} min={5} max={95} reset={65} onChange={(v) => update({ gate: v / 100 })} />
              {comp && (
                <>
                  <Slider label="STRUM" value={h.strumMs} text={h.strumMs ? `${h.strumMs} MS` : "OFF"} min={0} max={STRUM_MAX_MS} reset={0} onChange={(strumMs) => update({ strumMs })} />
                  <span className="arp-field">STROKE</span>
                  <Segmented
                    label="Strum direction"
                    value={h.strumDirection}
                    onChange={(strumDirection) => update({ strumDirection })}
                    options={STRUM_DIRECTIONS.map((d) => [d, d === "up" ? "↑" : d === "down" ? "↓" : "↕", d === "up" ? "Strum low to high" : d === "down" ? "Strum high to low" : "Alternate like a guitarist"] as const)}
                  />
                  <span className="arp-field">VOICING</span>
                  <Segmented
                    label="Comp voicing"
                    value={h.voicing}
                    onChange={(voicing) => update({ voicing })}
                    options={COMP_VOICINGS.map((v) => [v, VOICING_NAMES[v]] as const)}
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
              target="THE CHORDS UNDER THE CLIP"
            />
          )}
        </div>
      )}
    </section>
  );
}

function SelectedChordEditor({ tracks }: { tracks: ReadonlyArray<TimelineTrack> }): React.JSX.Element | null {
  const selected = useHarmonyUIStore((s) => s.selectedChord);
  const selectChord = useHarmonyUIStore((s) => s.selectChord);
  const setTrackChords = useTimelineStore((s) => s.setTrackChords);
  const track = selected ? tracks.find((t) => t.id === selected.trackId) : undefined;
  const chord = track?.chords?.find((c) => c.id === selected?.chordId);
  if (!track || !chord) return null;
  return (
    <section className="panel ns-section arp-panel" data-testid="harmony-panel-chord">
      <div className="arp-top">
        <h2>CHORD · {track.name.toUpperCase()}</h2>
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
          title="No MIDI clip selected"
          description={
            firstMidiClip
              ? "Select a MIDI clip to arpeggiate it or comp it over the chord track."
              : "Add a MIDI clip to arpeggiate it or comp it over the chord track."
          }
          actionText={firstMidiClip ? `Edit “${firstMidiClip.name || "MIDI clip"}”` : undefined}
          onAction={firstMidiClip ? () => selectClip(firstMidiClip.id) : undefined}
        />
      </FlexColumn>
    </FlexColumn>
  );
}
