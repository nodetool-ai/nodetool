/**
 * FableSynth's three hardware editors, embedded in the MIDI track timeline.
 * Sequencing belongs to the timeline. Only render-supported voice controls
 * are shown here.
 */

import React, { useRef, useState } from "react";

import type {
  BassMidiInstrument,
  DrumMidiInstrument,
  DrumPad,
  MidiEnvelope,
  WavetableOscillator,
  MidiFilterType,
  MidiInstrument,
  MidiWavetableName,
  WavetableMidiInstrument
} from "@nodetool-ai/timeline";

import {
  Caption,
  EditorButton,
  FlexRow,
  Label,
  SPACING
} from "../../ui_primitives";

import "./fablesynth-editor.css";

type FableInstrument = Exclude<MidiInstrument, { type: "subtractive" }>;
type KnobSize = "lg" | "md" | "sm" | "xs";
type Accent = "a" | "b" | "f" | "n";

interface ParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  def: number;
  curve?: "log" | "int" | "time";
  fmt?: (value: number) => string;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const bi = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
const sec = (value: number) =>
  value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
const hz = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(1)} kHz`
    : `${Math.round(value)} Hz`;
const st = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)} ST`;
const ct = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)} CT`;

const P = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  fmt: ParamDef["fmt"] = pct,
  curve?: ParamDef["curve"]
): ParamDef => ({ id, label, min, max, def, fmt, curve });

const TABLES = ["PRIME", "BLOOM", "PULSE", "VOX", "CHIME", "GLITCH"];
const FILTERS = ["LP 12", "LP 24", "BP 12", "HP 12", "NOTCH"];
const polar = (radius: number, degrees: number) => {
  const angle = ((degrees - 90) * Math.PI) / 180;
  return [40 + radius * Math.cos(angle), 40 + radius * Math.sin(angle)];
};

const arcPath = (from: number, to: number) => {
  if (Math.abs(to - from) < 0.01) to = from + 0.01;
  const [x0, y0] = polar(33, from);
  const [x1, y1] = polar(33, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 33 33 0 ${Math.abs(to - from) > 180 ? 1 : 0} ${to > from ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

const valueToNorm = (def: ParamDef, value: number) => {
  if (def.curve === "time") return Math.log1p(Math.max(0, value)) / Math.log1p(def.max);
  if (def.curve === "log") {
    return (
      Math.log(Math.max(def.min, value) / def.min) / Math.log(def.max / def.min)
    );
  }
  return (value - def.min) / (def.max - def.min);
};

const normToValue = (def: ParamDef, norm: number) => {
  const clamped = Math.min(1, Math.max(0, norm));
  const raw =
    def.curve === "time"
      ? Math.expm1(clamped * Math.log1p(def.max))
      : def.curve === "log"
      ? def.min * Math.pow(def.max / def.min, clamped)
      : def.min + (def.max - def.min) * clamped;
  return def.curve === "int" ? Math.round(raw) : raw;
};

interface KnobProps {
  def: ParamDef;
  value: number;
  onChange: (value: number) => void;
  size?: KnobSize;
  accent?: Accent;
}

const Knob: React.FC<KnobProps> = ({
  def,
  value,
  onChange,
  size = "md",
  accent = "n"
}) => {
  const drag = useRef<{ y: number; norm: number } | null>(null);
  const norm = Math.min(1, Math.max(0, valueToNorm(def, value)));
  const degrees = -135 + 270 * norm;
  const from = def.min < 0 ? -135 + 270 * valueToNorm(def, 0) : -135;
  return (
    <label className={`fs-knob fs-knob-${size}`} data-accent={accent}>
      <span className="fs-knob-face">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle className="fs-k-body" cx="40" cy="40" r="26" />
          <path className="fs-k-track" d={arcPath(-135, 135)} />
          <path className="fs-k-arc" d={arcPath(from, degrees)} />
          <line
            className="fs-k-ptr"
            x1="40"
            y1="40"
            x2="40"
            y2="17"
            transform={`rotate(${degrees} 40 40)`}
          />
        </svg>
        <input
          type="range"
          aria-label={def.label}
          aria-valuetext={def.fmt?.(value) ?? String(value)}
          title="Drag up or down. Shift for fine adjustment. Double-click to reset."
          min="0"
          max="1"
          step={def.curve === "int" ? 1 / (def.max - def.min) : 0.01}
          value={norm}
          onChange={(event) =>
            onChange(normToValue(def, Number(event.target.value)))
          }
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { y: event.clientY, norm };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const next = Math.min(
              1,
              Math.max(
                0,
                drag.current.norm +
                  (drag.current.y - event.clientY) *
                    (event.shiftKey ? 0.001 : 0.005)
              )
            );
            drag.current = { y: event.clientY, norm: next };
            onChange(normToValue(def, next));
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onDoubleClick={() => onChange(def.def)}
        />
      </span>
      <span className="fs-k-label">{def.label}</span>
      <span className="fs-k-value">{def.fmt?.(value) ?? value.toFixed(2)}</span>
    </label>
  );
};

interface StepperProps {
  label: string;
  options: readonly string[];
  value: number;
  onChange: (value: number) => void;
  accent?: Accent;
}

const Stepper: React.FC<StepperProps> = ({
  label,
  options,
  value,
  onChange,
  accent = "n"
}) => {
  const index = Math.min(options.length - 1, Math.max(0, Math.round(value)));
  const step = (amount: number) =>
    onChange((index + amount + options.length) % options.length);
  return (
    <span className="fs-stepper" data-accent={accent}>
      {label ? <span className="fs-st-label">{label}</span> : null}
      <button
        type="button"
        aria-label={`previous ${label ?? "option"}`}
        onClick={() => step(-1)}
      >
        ◂
      </button>
      <span className="fs-st-value" aria-live="polite">
        {options[index]}
      </span>
      <button
        type="button"
        aria-label={`next ${label ?? "option"}`}
        onClick={() => step(1)}
      >
        ▸
      </button>
    </span>
  );
};

const Power: React.FC<{
  on: boolean;
  label: string;
  onChange: () => void;
  accent?: Accent;
}> = ({ on, label, onChange, accent = "n" }) => (
  <button
    type="button"
    className={`fs-power${on ? " on" : ""}`}
    data-accent={accent}
    aria-label={`${label} power`}
    aria-pressed={on}
    onClick={onChange}
  />
);

const Panel: React.FC<{
  title: string;
  accent?: Accent;
  className?: string;
  head?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, accent, className = "", head, children }) => (
  <section
    className={`fs-panel ${className}`}
    data-accent={accent}
    aria-label={title}
  >
    <div className="fs-panel-head">
      <h3>{title}</h3>
      {head}
    </div>
    {children}
  </section>
);

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B"
];
const noteName = (pitch: number) =>
  `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const BLACK_KEYS = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];

export const InstrumentKeyboard = ({
  start,
  onPlay
}: {
  start: number;
  onPlay: (pitch: number) => void;
}) => (
  <Panel
    title="KEYS"
    className="fs-keys-panel"
    head={<Caption>Click or focus a key and press Enter</Caption>}
  >
    <div className="fs-keys">
      <div className="fs-white-keys">
        {WHITE_KEYS.map((semi) => (
          <button
            type="button"
            key={semi}
            aria-label={`Play ${noteName(start + semi)}`}
            onClick={() => onPlay(start + semi)}
          >
            <span>{noteName(start + semi)}</span>
          </button>
        ))}
      </div>
      {BLACK_KEYS.map((semi) => (
        <button
          type="button"
          className="fs-black-key"
          key={semi}
          aria-label={`Play ${noteName(start + semi)}`}
          style={{
            left: `calc(var(--fs-key-scale, 1) * ${(WHITE_KEYS.filter((white) => white < semi).length / 15) * 100}%)`
          }}
          onClick={() => onPlay(start + semi)}
        />
      ))}
    </div>
  </Panel>
);

interface EditorProps<T extends FableInstrument> {
  instrument: T;
  onChange: (next: T, auditionPitch?: number) => void;
}

const tableNames: readonly MidiWavetableName[] = [
  "prime",
  "bloom",
  "pulse",
  "vox",
  "chime",
  "glitch"
];
const filterTypes: readonly MidiFilterType[] = [
  "lp12",
  "lp24",
  "bp12",
  "hp12",
  "notch"
];
const Filter = <T extends BassMidiInstrument | WavetableMidiInstrument>({
  instrument,
  onChange
}: EditorProps<T>) => (
  <Panel
    title="FILTER"
    accent="f"
    head={
      <Stepper
        label="TYPE"
        options={FILTERS}
        value={filterTypes.indexOf(instrument.filterType)}
        onChange={(index) =>
          onChange({ ...instrument, filterType: filterTypes[index] })
        }
        accent="f"
      />
    }
  >
    <div className="fs-knob-row">
      <Knob
        def={P("cut", "CUT", 20, 20000, 340, hz, "log")}
        value={instrument.cutoffHz}
        onChange={(cutoffHz) => onChange({ ...instrument, cutoffHz })}
        accent="f"
      />
      <Knob
        def={P("res", "RES", 0, 1, 0.2)}
        value={instrument.resonance}
        onChange={(resonance) => onChange({ ...instrument, resonance })}
        accent="f"
      />
      <Knob
        def={P("drive", "DRIVE", 0, 1, 0)}
        value={instrument.drive}
        onChange={(drive) => onChange({ ...instrument, drive })}
        accent="f"
      />
      <Knob
        def={P("env", "ENV", -8, 8, 0, (value) => `${value.toFixed(1)} OCT`)}
        value={instrument.filterEnvAmount}
        onChange={(filterEnvAmount) =>
          onChange({ ...instrument, filterEnvAmount })
        }
        accent="f"
      />
      <Knob
        def={P("key", "TRACK", 0, 1, 0)}
        value={instrument.keyTrack}
        onChange={(keyTrack) => onChange({ ...instrument, keyTrack })}
        accent="f"
      />
    </div>
  </Panel>
);

const Envelope = ({
  title,
  envelope,
  onChange
}: {
  title: string;
  envelope: MidiEnvelope;
  onChange: (value: MidiEnvelope) => void;
}) => (
  <Panel title={title}>
    <div className="fs-knob-row">
      <Knob
        def={P("attack", "ATT", 0, 8000, 4, (v) => sec(v / 1000), "time")}
        value={envelope.attackMs}
        onChange={(attackMs) => onChange({ ...envelope, attackMs })}
      />
      <Knob
        def={P("decay", "DEC", 0, 10000, 250, (v) => sec(v / 1000), "time")}
        value={envelope.decayMs}
        onChange={(decayMs) => onChange({ ...envelope, decayMs })}
      />
      <Knob
        def={P("sustain", "SUS", 0, 1, 0.8)}
        value={envelope.sustain}
        onChange={(sustain) => onChange({ ...envelope, sustain })}
      />
      <Knob
        def={P("release", "REL", 0, 12000, 300, (v) => sec(v / 1000), "time")}
        value={envelope.releaseMs}
        onChange={(releaseMs) => onChange({ ...envelope, releaseMs })}
      />
    </div>
  </Panel>
);

const Oscillator = ({
  title,
  osc,
  onChange,
  accent
}: {
  title: string;
  osc: WavetableOscillator;
  onChange: (osc: WavetableOscillator) => void;
  accent: Accent;
}) => (
  <Panel
    title={title}
    accent={accent}
    head={
      <Stepper
        label="TABLE"
        options={TABLES}
        value={tableNames.indexOf(osc.table)}
        onChange={(index) => onChange({ ...osc, table: tableNames[index] })}
        accent={accent}
      />
    }
  >
    <div className="fs-knob-row">
      <Knob
        def={P("position", "POS", 0, 1, 0)}
        value={osc.position}
        onChange={(position) => onChange({ ...osc, position })}
        accent={accent}
      />
      <Knob
        def={P("semi", "SEMI", -48, 48, 0, st, "int")}
        value={osc.semitones}
        onChange={(semitones) => onChange({ ...osc, semitones })}
        accent={accent}
      />
      <Knob
        def={P("fine", "FINE", -100, 100, 0, ct, "int")}
        value={osc.fine}
        onChange={(fine) => onChange({ ...osc, fine })}
        accent={accent}
      />
      <Knob
        def={P("unison", "UNI", 1, 7, 1, String, "int")}
        value={osc.unison}
        onChange={(unison) => onChange({ ...osc, unison })}
        accent={accent}
      />
      <Knob
        def={P("detune", "DET", 0, 1, 0.2)}
        value={osc.detune}
        onChange={(detune) => onChange({ ...osc, detune })}
        accent={accent}
      />
      <Knob
        def={P("level", "LEVEL", 0, 1, 0.8)}
        value={osc.level}
        onChange={(level) => onChange({ ...osc, level })}
        accent={accent}
      />
    </div>
  </Panel>
);

const BassEditor = ({
  instrument,
  onChange
}: EditorProps<BassMidiInstrument>) => (
  <>
    <div className="fs-voice-grid">
      <Panel
        title="OSC"
        className="fs-panel-inline"
        accent="a"
        head={
          <Stepper
            label="TABLE"
            options={TABLES}
            value={tableNames.indexOf(instrument.table)}
            onChange={(index) =>
              onChange({ ...instrument, table: tableNames[index] })
            }
            accent="a"
          />
        }
      >
        <div className="fs-knob-row">
          <Knob
            def={P("pos", "POS", 0, 1, 0)}
            value={instrument.position}
            onChange={(position) => onChange({ ...instrument, position })}
            accent="a"
          />
          <Knob
            def={P("tune", "TUNE", -48, 48, 0, st, "int")}
            value={instrument.semitones}
            onChange={(semitones) => onChange({ ...instrument, semitones })}
            accent="a"
          />
        </div>
      </Panel>
      <Panel title="SUB">
        <FlexRow className="fs-sub-controls" gap={SPACING.md} wrap>
          <Stepper
            label="SHAPE"
            options={["SINE", "SQUARE"]}
            value={instrument.subShape === "square" ? 1 : 0}
            onChange={(index) =>
              onChange({ ...instrument, subShape: index ? "square" : "sine" })
            }
          />
          <Stepper
            label="OCT"
            options={["-2", "-1"]}
            value={instrument.subOctave === -1 ? 1 : 0}
            onChange={(index) =>
              onChange({ ...instrument, subOctave: index ? -1 : -2 })
            }
          />
          <Knob
            def={P("sub", "LEVEL", 0, 1, 0.5)}
            value={instrument.subLevel}
            onChange={(subLevel) => onChange({ ...instrument, subLevel })}
            accent="a"
          />
        </FlexRow>
      </Panel>
      <Filter instrument={instrument} onChange={onChange} />
      <Panel title="ENV" className="fs-panel-inline" head={<Caption>Filter envelope</Caption>}>
        <div className="fs-knob-row">
          <Knob
            def={P("fattack", "F·ATT", 0, 500, 1, (v) => sec(v / 1000), "time")}
            value={instrument.filterAttackMs}
            onChange={(filterAttackMs) =>
              onChange({ ...instrument, filterAttackMs })
            }
          />
          <Knob
            def={P(
              "fdecay",
              "F·DEC",
              5,
              4000,
              180,
              (v) => sec(v / 1000),
              "log"
            )}
            value={instrument.filterDecayMs}
            onChange={(filterDecayMs) =>
              onChange({ ...instrument, filterDecayMs })
            }
          />
        </div>
      </Panel>
      <Envelope
        title="AMP ENV"
        envelope={instrument.ampEnv}
        onChange={(ampEnv) => onChange({ ...instrument, ampEnv })}
      />
      <Panel title="ACCENT · SLIDE" accent="a">
        <div className="fs-knob-row">
          <Knob
            def={P("accent", "ACC AMT", 0, 1, 0.7)}
            value={instrument.accentAmount}
            onChange={(accentAmount) =>
              onChange({ ...instrument, accentAmount })
            }
            accent="a"
          />
          <Knob
            def={P("velocity", "ACC VEL", 1, 127, 100, String, "int")}
            value={instrument.accentVelocity}
            onChange={(accentVelocity) =>
              onChange({ ...instrument, accentVelocity })
            }
            accent="a"
          />
          <Knob
            def={P("slide", "SLD TIME", 0, 500, 60, (v) => sec(v / 1000), "time")}
            value={instrument.slideMs}
            onChange={(slideMs) => onChange({ ...instrument, slideMs })}
            accent="a"
          />
        </div>
        <Caption>
          Accent follows note velocity. Slide joins overlapping notes.
        </Caption>
      </Panel>
    </div>
  </>
);

const WavetableEditor = ({
  instrument,
  onChange
}: EditorProps<WavetableMidiInstrument>) => (
  <>
    <div className="fs-voice-grid">
      <Oscillator
        title="OSC A"
        osc={instrument.oscA}
        onChange={(oscA) => onChange({ ...instrument, oscA })}
        accent="a"
      />
      <Oscillator
        title="OSC B"
        osc={instrument.oscB}
        onChange={(oscB) => onChange({ ...instrument, oscB })}
        accent="b"
      />
      <Panel title="SUB · NOISE">
        <FlexRow gap={SPACING.md} wrap>
          <Stepper
            label="SUB OCT"
            options={["-2", "-1"]}
            value={instrument.subOctave === -1 ? 1 : 0}
            onChange={(index) =>
              onChange({ ...instrument, subOctave: index ? -1 : -2 })
            }
          />
          <Knob
            def={P("sub", "SUB", 0, 1, 0)}
            value={instrument.subLevel}
            onChange={(subLevel) => onChange({ ...instrument, subLevel })}
            accent="a"
          />
          <Knob
            def={P("noise", "NOISE", 0, 1, 0)}
            value={instrument.noiseLevel}
            onChange={(noiseLevel) => onChange({ ...instrument, noiseLevel })}
            accent="b"
          />
        </FlexRow>
      </Panel>
      <Filter instrument={instrument} onChange={onChange} />
      <Envelope
        title="AMP ENV"
        envelope={instrument.ampEnv}
        onChange={(ampEnv) => onChange({ ...instrument, ampEnv })}
      />
      <Envelope
        title="MOD ENV"
        envelope={instrument.modEnv}
        onChange={(modEnv) => onChange({ ...instrument, modEnv })}
      />
    </div>
  </>
);

const DRUM_PAD_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
const DrumEditor = ({
  instrument,
  onChange
}: EditorProps<DrumMidiInstrument>) => {
  const [selected, setSelected] = useState(0);
  const pad = instrument.pads[selected];
  if (!pad) return null;
  const filter = pad.filter;
  const drumTables: readonly DrumPad["table"][] = [
    ...tableNames,
    "thud",
    "crack",
    "tine",
    "grit"
  ];
  const commit = (next: DrumPad) =>
    onChange(
      {
        ...instrument,
        pads: instrument.pads.map((item, index) =>
          index === selected ? next : item
        )
      },
      instrument.baseNote + selected
    );
  return (
    <div className="fs-dr-layout">
      <Panel
        title="PADS"
        accent="b"
        className="fs-pad-panel"
        head={<Caption>Select to edit and audition</Caption>}
      >
        <div className="fs-pad-grid">
          {DRUM_PAD_ORDER.filter((index) => index < instrument.pads.length).map(
            (index) => (
              <button
                type="button"
                key={index}
                className={selected === index ? "selected" : ""}
                aria-label={`Edit pad ${index + 1}: ${instrument.pads[index].name}`}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index);
                  onChange(instrument, instrument.baseNote + index);
                }}
              >
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>{instrument.pads[index].name}</span>
              </button>
            )
          )}
        </div>
      </Panel>
      <div>
        <Label className="fs-selected-pad">
          {String(selected + 1).padStart(2, "0")} · {pad.name.toUpperCase()}
        </Label>
        <div className="fs-voice-grid">
          <Panel
            title="OSC A"
            accent="a"
            head={
              <Stepper
                label="TABLE"
                options={drumTables.map((table) => table.toUpperCase())}
                value={drumTables.indexOf(pad.table)}
                onChange={(index) =>
                  commit({ ...pad, table: drumTables[index] })
                }
              />
            }
          >
            <div className="fs-knob-row">
              <Knob
                def={P("pos", "POS", 0, 1, 0)}
                value={pad.position}
                onChange={(position) => commit({ ...pad, position })}
                accent="a"
              />
              <Knob
                def={P("tune", "TUNE", -48, 48, 0, st, "int")}
                value={pad.semitones}
                onChange={(semitones) => commit({ ...pad, semitones })}
                accent="a"
              />
            </div>
          </Panel>
          <Panel title="NOISE + RING" accent="b">
            <div className="fs-knob-row">
              <Knob
                def={P("color", "COLOR", -1, 1, 0, bi)}
                value={pad.noiseColor}
                onChange={(noiseColor) => commit({ ...pad, noiseColor })}
                accent="b"
              />
              <Knob
                def={P("noise", "NOISE", 0, 1, 0.2)}
                value={pad.noiseLevel}
                onChange={(noiseLevel) => commit({ ...pad, noiseLevel })}
                accent="b"
              />
              <Knob
                def={P("ringhz", "RING HZ", 20, 20000, 400, hz, "log")}
                value={pad.ringHz}
                onChange={(ringHz) => commit({ ...pad, ringHz })}
                accent="b"
              />
              <Knob
                def={P("ringmix", "RING MIX", 0, 1, 0)}
                value={pad.ringMix}
                onChange={(ringMix) => commit({ ...pad, ringMix })}
                accent="b"
              />
            </div>
          </Panel>
          <Panel title="PITCH ENV" accent="b">
            <div className="fs-knob-row">
              <Knob
                def={P("pitchamt", "AMT", -48, 48, 12, st, "int")}
                value={pad.pitchEnvAmount}
                onChange={(pitchEnvAmount) =>
                  commit({ ...pad, pitchEnvAmount })
                }
                accent="b"
              />
              <Knob
                def={P(
                  "pitchdec",
                  "DECAY",
                  1,
                  4000,
                  80,
                  (v) => sec(v / 1000),
                  "log"
                )}
                value={pad.pitchEnvDecayMs}
                onChange={(pitchEnvDecayMs) =>
                  commit({ ...pad, pitchEnvDecayMs })
                }
                accent="b"
              />
            </div>
          </Panel>
          <Panel title="AMP ENV">
            <div className="fs-knob-row">
              <Knob
                def={P("att", "ATT", 0, 2000, 1, (v) => sec(v / 1000), "time")}
                value={pad.attackMs}
                onChange={(attackMs) => commit({ ...pad, attackMs })}
              />
              <Knob
                def={P("hold", "HOLD", 0, 2000, 20, (v) => sec(v / 1000), "time")}
                value={pad.holdMs}
                onChange={(holdMs) => commit({ ...pad, holdMs })}
              />
              <Knob
                def={P("dec", "DEC", 1, 6000, 300, (v) => sec(v / 1000), "log")}
                value={pad.decayMs}
                onChange={(decayMs) => commit({ ...pad, decayMs })}
              />
              <Knob
                def={P("curve", "CURVE", 0, 1, 0.6)}
                value={pad.curve}
                onChange={(curve) => commit({ ...pad, curve })}
              />
            </div>
          </Panel>
          <Panel
            title="FILTER"
            accent="f"
            head={
              <Power
                on={Boolean(filter)}
                label="Filter"
                onChange={() =>
                  commit({
                    ...pad,
                    filter: filter
                      ? null
                      : { type: "lp24", cutoffHz: 5000, resonance: 0.2 }
                  })
                }
                accent="f"
              />
            }
          >
            {filter ? (
              <>
                <Stepper
                  label="TYPE"
                  options={FILTERS}
                  value={filterTypes.indexOf(filter.type)}
                  onChange={(index) =>
                    commit({
                      ...pad,
                      filter: { ...filter, type: filterTypes[index] }
                    })
                  }
                  accent="f"
                />
                <div className="fs-knob-row">
                  <Knob
                    def={P("cut", "CUT", 20, 20000, 5000, hz, "log")}
                    value={filter.cutoffHz}
                    onChange={(cutoffHz) =>
                      commit({ ...pad, filter: { ...filter, cutoffHz } })
                    }
                    accent="f"
                  />
                  <Knob
                    def={P("res", "RES", 0, 1, 0.2)}
                    value={filter.resonance}
                    onChange={(resonance) =>
                      commit({ ...pad, filter: { ...filter, resonance } })
                    }
                    accent="f"
                  />
                </div>
              </>
            ) : (
              <Caption>Filter bypassed. Enable to shape this pad.</Caption>
            )}
          </Panel>
          <Panel title="OUTPUT" accent="b">
            <div className="fs-knob-row">
              <Knob
                def={P("level", "LEVEL", 0, 1, 0.8)}
                value={pad.level}
                onChange={(level) => commit({ ...pad, level })}
                accent="b"
              />
              <Knob
                def={P("vel", "V→LVL", 0, 1, 1)}
                value={pad.velocityToLevel}
                onChange={(velocityToLevel) =>
                  commit({ ...pad, velocityToLevel })
                }
                accent="b"
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

interface FableSynthInstrumentEditorProps {
  instrument: FableInstrument;
  onChange: (next: MidiInstrument, auditionPitch?: number) => void;
}
const FableSynthInstrumentEditor = ({
  instrument,
  onChange
}: FableSynthInstrumentEditorProps) => {
  const model =
    instrument.type === "bass"
      ? "BL-1"
      : instrument.type === "wavetable"
        ? "WT-1"
        : "DR-1";
  return (
    <div
      className={`fs-editor fs-${instrument.type}`}
      data-testid="fablesynth-editor"
      data-device={model}
    >
      <FlexRow className="fs-header" gap={SPACING.lg} wrap align="center">
        <Label>{model}</Label>
        <Caption className="fs-description">
          {instrument.type === "bass"
            ? "Bass synthesizer"
            : instrument.type === "wavetable"
              ? "Wavetable synthesizer"
              : "Drum synthesizer"}
        </Caption>
        <EditorButton
          size="small"
          onClick={() =>
            onChange(
              instrument,
              instrument.type === "drum" ? instrument.baseNote : 60
            )
          }
        >
          Audition
        </EditorButton>
        <Knob
          def={P(
            "output",
            "OUTPUT",
            -40,
            12,
            -6,
            (value) => `${value.toFixed(1)} dB`
          )}
          value={instrument.gainDb}
          onChange={(gainDb) => onChange({ ...instrument, gainDb })}
          size="sm"
        />
      </FlexRow>
      {instrument.type === "bass" ? (
        <BassEditor instrument={instrument} onChange={onChange} />
      ) : instrument.type === "wavetable" ? (
        <WavetableEditor instrument={instrument} onChange={onChange} />
      ) : (
        <DrumEditor instrument={instrument} onChange={onChange} />
      )}
    </div>
  );
};
export default FableSynthInstrumentEditor;
