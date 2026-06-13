/**
 * The Mega Synth — a generative modular piece that doubles as the stress
 * patch for the realtime perf environment.
 *
 * Musically it's a Berlin-school ensemble in A, ~120 BPM, built only from
 * the shipped synth modules:
 *
 *  - clk16/clk8/clk2/clkBar — four wall-clock Gates (16ths, 8ths, beats,
 *    bars) shared by every layer, so the whole ensemble stays locked.
 *  - bass     saw 55 Hz alternating root/fifth (square-LFO pitch CV), ADSR
 *             driving both VCA and VCF cutoff (classic envelope filter).
 *  - arp      square 220 Hz; pitch CV is the SUM of two square LFOs (1 Hz ×
 *             octave + 0.5 Hz × fifth, mixed in a Mixer — CV rides the chunk
 *             wire) → a repeating 4-step arpeggio: root, fifth, octave,
 *             octave+fifth. Plucky ADSR, resonant low-pass swept by a 20 s
 *             triangle LFO.
 *  - pad      two detuned saws → slow sine-swept low-pass → bar-length
 *             ADSR swells.
 *  - lead     noise → Sample&Hold (beat trigger) → Attenuverter → pitch CV
 *             of a triangle osc: sparse random sparkle on top of the tonal
 *             bed.
 *  - hat      noise → high-pass 6 kHz → 8 Hz tick envelope.
 *  - kick     50 Hz sine thump on the beat.
 *  - drone    FM sine an octave below the bass, breathing over bars.
 *
 * `layers` stacks detuned, phase-decorrelated copies of the whole ensemble
 * (osc pitch × 2^(0.004·layer), LFO rates × (1 + 0.017·layer), levels
 * 1/√layers) — one layer is the demo, 8 is a super-ensemble, 24 is the
 * stress test (~1,100 streaming nodes).
 *
 * Node positions are laid out for the editor, so the same graph installs as
 * a presentable workflow (scripts/install-mega-synth.ts).
 */

export interface MegaNode {
  [key: string]: unknown;
  id: string;
  type: string;
  properties: Record<string, unknown>;
  ui_properties: { position: { x: number; y: number } };
}
export interface MegaEdge {
  [key: string]: unknown;
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

const SEMI = 1 / 12;
const FIFTH = 7 * SEMI;

const T = {
  gate: "nodetool.audio.synth.Gate",
  osc: "nodetool.audio.synth.Oscillator",
  lfo: "nodetool.audio.synth.LFO",
  adsr: "nodetool.audio.synth.ADSR",
  vca: "nodetool.audio.synth.VCA",
  vcf: "nodetool.audio.synth.VCF",
  att: "nodetool.audio.synth.Attenuverter",
  sh: "nodetool.audio.synth.SampleHold",
  mixer: "nodetool.audio.synth.Mixer",
  gain: "nodetool.audio.realtime.StreamingGain",
  highpass: "nodetool.audio.realtime.StreamingHighPass",
  out: "nodetool.audio.realtime.AudioOutput"
} as const;

export function buildMegaSynthPatch(layers: number): {
  nodes: MegaNode[];
  edges: MegaEdge[];
} {
  const L = Math.max(1, Math.floor(layers));
  const nodes: MegaNode[] = [];
  const edges: MegaEdge[] = [];
  let edgeSeq = 0;

  const add = (
    id: string,
    type: string,
    properties: Record<string, unknown>,
    x: number,
    y: number
  ): string => {
    nodes.push({ id, type, properties, ui_properties: { position: { x, y } } });
    return id;
  };
  const wire = (
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string
  ): void => {
    edges.push({
      id: `e${edgeSeq++}`,
      source,
      sourceHandle,
      target,
      targetHandle
    });
  };

  // ── Shared clocks (one set for all layers) ─────────────────────────
  // 120 BPM: beat 0.5s. Slight off-50% duty so gates read as pulses.
  add("clk16", T.gate, { on_duration: 0.06, off_duration: 0.065 }, 0, 0);
  add("clk8", T.gate, { on_duration: 0.11, off_duration: 0.14 }, 0, 140);
  add("clk2", T.gate, { on_duration: 0.22, off_duration: 0.28 }, 0, 280);
  add("clkBar", T.gate, { on_duration: 1.4, off_duration: 2.6 }, 0, 420);

  const layerOuts: string[] = [];
  const level = Number((1 / Math.sqrt(L)).toFixed(3));

  for (let l = 0; l < L; l++) {
    const id = (name: string): string => (L === 1 ? name : `${name}-${l}`);
    // Gentle ensemble spread: pitch detune in cents, LFO rate decorrelation.
    const det = Math.pow(2, 0.004 * l * (l % 2 === 0 ? 1 : -1));
    const rate = (hz: number): number =>
      Number((hz * (1 + 0.017 * l)).toFixed(4));
    const Y = l * 1700;
    const col = (c: number): number => 380 + c * 260;

    // ── Bass: root/fifth saw with envelope filter ────────────────────
    add(id("bass-pitch"), T.lfo, {
      waveform: "square",
      rate_hz: rate(0.125),
      depth: FIFTH / 2,
      offset: FIFTH / 2
    }, col(0), Y + 0);
    add(id("bass-osc"), T.osc, {
      waveform: "saw",
      frequency: 55 * det,
      amplitude: 0.7
    }, col(1), Y + 0);
    add(id("bass-env"), T.adsr, {
      attack: 0.005,
      decay: 0.15,
      sustain: 0.5,
      release: 0.2
    }, col(0), Y + 120);
    add(id("bass-vcf"), T.vcf, {
      mode: "lowpass",
      cutoff_hz: 220,
      q: 3,
      cv_amount: 2.5
    }, col(2), Y + 0);
    add(id("bass-vca"), T.vca, { gain: 1 }, col(3), Y + 0);
    wire(id("bass-pitch"), "cv", id("bass-osc"), "pitch_cv");
    wire("clk2", "cv", id("bass-env"), "gate");
    wire(id("bass-osc"), "chunk", id("bass-vcf"), "audio");
    wire(id("bass-env"), "cv", id("bass-vcf"), "cutoff_cv");
    wire(id("bass-vcf"), "chunk", id("bass-vca"), "audio");
    wire(id("bass-env"), "cv", id("bass-vca"), "cv");

    // ── Arp: 4-step pattern from summed square LFOs ──────────────────
    add(id("arp-oct"), T.lfo, {
      waveform: "square",
      rate_hz: rate(1),
      depth: 0.5,
      offset: 0.5
    }, col(0), Y + 260);
    add(id("arp-fifth"), T.lfo, {
      waveform: "square",
      rate_hz: rate(0.5),
      depth: FIFTH / 2,
      offset: FIFTH / 2
    }, col(0), Y + 380);
    add(id("arp-cv"), T.mixer, { level1: 1, level2: 1 }, col(1), Y + 260);
    add(id("arp-osc"), T.osc, {
      waveform: "square",
      frequency: 220 * det,
      amplitude: 0.45
    }, col(2), Y + 260);
    add(id("arp-sweep"), T.lfo, {
      waveform: "triangle",
      rate_hz: rate(0.05),
      depth: 0.9,
      offset: 0.4
    }, col(2), Y + 380);
    add(id("arp-vcf"), T.vcf, {
      mode: "lowpass",
      cutoff_hz: 700,
      q: 6,
      cv_amount: 2
    }, col(3), Y + 260);
    add(id("arp-env"), T.adsr, {
      attack: 0.003,
      decay: 0.09,
      sustain: 0.15,
      release: 0.08
    }, col(3), Y + 380);
    add(id("arp-vca"), T.vca, { gain: 1 }, col(4), Y + 260);
    wire(id("arp-oct"), "cv", id("arp-cv"), "in1");
    wire(id("arp-fifth"), "cv", id("arp-cv"), "in2");
    wire(id("arp-cv"), "chunk", id("arp-osc"), "pitch_cv");
    wire(id("arp-osc"), "chunk", id("arp-vcf"), "audio");
    wire(id("arp-sweep"), "cv", id("arp-vcf"), "cutoff_cv");
    wire("clk8", "cv", id("arp-env"), "gate");
    wire(id("arp-vcf"), "chunk", id("arp-vca"), "audio");
    wire(id("arp-env"), "cv", id("arp-vca"), "cv");

    // ── Pad: detuned saw swell ───────────────────────────────────────
    add(id("pad-osc1"), T.osc, {
      waveform: "saw",
      frequency: 110 * det,
      amplitude: 0.4
    }, col(0), Y + 540);
    add(id("pad-osc2"), T.osc, {
      waveform: "saw",
      frequency: 110.8 * det,
      amplitude: 0.4
    }, col(0), Y + 660);
    add(id("pad-mix"), T.mixer, { level1: 0.5, level2: 0.5 }, col(1), Y + 540);
    add(id("pad-sweep"), T.lfo, {
      waveform: "sine",
      rate_hz: rate(0.03),
      depth: 0.8,
      offset: 0.5
    }, col(1), Y + 660);
    add(id("pad-vcf"), T.vcf, {
      mode: "lowpass",
      cutoff_hz: 350,
      q: 2,
      cv_amount: 2
    }, col(2), Y + 540);
    add(id("pad-env"), T.adsr, {
      attack: 1.2,
      decay: 1.0,
      sustain: 0.7,
      release: 1.5
    }, col(2), Y + 660);
    add(id("pad-vca"), T.vca, { gain: 1 }, col(3), Y + 540);
    wire(id("pad-osc1"), "chunk", id("pad-mix"), "in1");
    wire(id("pad-osc2"), "chunk", id("pad-mix"), "in2");
    wire(id("pad-mix"), "chunk", id("pad-vcf"), "audio");
    wire(id("pad-sweep"), "cv", id("pad-vcf"), "cutoff_cv");
    wire("clkBar", "cv", id("pad-env"), "gate");
    wire(id("pad-vcf"), "chunk", id("pad-vca"), "audio");
    wire(id("pad-env"), "cv", id("pad-vca"), "cv");

    // ── Lead: S&H random sparkle ─────────────────────────────────────
    add(id("lead-noise"), T.osc, { waveform: "noise", amplitude: 1 }, col(0), Y + 820);
    add(id("lead-sh"), T.sh, {}, col(1), Y + 820);
    add(id("lead-att"), T.att, { scale: 0.4, offset: 0.6 }, col(2), Y + 820);
    add(id("lead-osc"), T.osc, {
      waveform: "triangle",
      frequency: 440 * det,
      amplitude: 0.5
    }, col(3), Y + 820);
    add(id("lead-vcf"), T.vcf, {
      mode: "lowpass",
      cutoff_hz: 2500,
      q: 4,
      cv_amount: 0
    }, col(4), Y + 820);
    add(id("lead-env"), T.adsr, {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.2,
      release: 0.4
    }, col(4), Y + 940);
    add(id("lead-vca"), T.vca, { gain: 1 }, col(5), Y + 820);
    wire(id("lead-noise"), "chunk", id("lead-sh"), "signal");
    wire("clk2", "cv", id("lead-sh"), "trigger");
    wire(id("lead-sh"), "cv", id("lead-att"), "signal");
    wire(id("lead-att"), "cv", id("lead-osc"), "pitch_cv");
    wire(id("lead-osc"), "chunk", id("lead-vcf"), "audio");
    wire("clk2", "cv", id("lead-env"), "gate");
    wire(id("lead-vcf"), "chunk", id("lead-vca"), "audio");
    wire(id("lead-env"), "cv", id("lead-vca"), "cv");

    // ── Hat: 8 Hz noise tick ─────────────────────────────────────────
    add(id("hat-noise"), T.osc, { waveform: "noise", amplitude: 0.8 }, col(0), Y + 1100);
    add(id("hat-vcf"), T.vcf, {
      mode: "highpass",
      cutoff_hz: 6000,
      q: 1,
      cv_amount: 0
    }, col(1), Y + 1100);
    add(id("hat-env"), T.adsr, {
      attack: 0.001,
      decay: 0.03,
      sustain: 0,
      release: 0.02
    }, col(1), Y + 1220);
    add(id("hat-vca"), T.vca, { gain: 1 }, col(2), Y + 1100);
    wire(id("hat-noise"), "chunk", id("hat-vcf"), "audio");
    wire("clk16", "cv", id("hat-env"), "gate");
    wire(id("hat-vcf"), "chunk", id("hat-vca"), "audio");
    wire(id("hat-env"), "cv", id("hat-vca"), "cv");

    // ── Kick: beat thump ─────────────────────────────────────────────
    add(id("kick-osc"), T.osc, {
      waveform: "sine",
      frequency: 50,
      amplitude: 1
    }, col(3), Y + 1100);
    add(id("kick-env"), T.adsr, {
      attack: 0.001,
      decay: 0.12,
      sustain: 0,
      release: 0.05
    }, col(3), Y + 1220);
    add(id("kick-vca"), T.vca, { gain: 1 }, col(4), Y + 1100);
    wire("clk2", "cv", id("kick-env"), "gate");
    wire(id("kick-osc"), "chunk", id("kick-vca"), "audio");
    wire(id("kick-env"), "cv", id("kick-vca"), "cv");

    // ── Drone: breathing FM sub ──────────────────────────────────────
    add(id("drone-fm"), T.lfo, {
      waveform: "sine",
      rate_hz: rate(0.07),
      depth: 1,
      offset: 0
    }, col(0), Y + 1380);
    add(id("drone-osc"), T.osc, {
      waveform: "sine",
      frequency: 27.5 * det,
      amplitude: 0.8,
      fm_amount: 0.4
    }, col(1), Y + 1380);
    add(id("drone-env"), T.adsr, {
      attack: 2,
      decay: 2,
      sustain: 0.8,
      release: 2
    }, col(1), Y + 1500);
    add(id("drone-vca"), T.vca, { gain: 1 }, col(2), Y + 1380);
    wire(id("drone-fm"), "cv", id("drone-osc"), "fm");
    wire("clkBar", "cv", id("drone-env"), "gate");
    wire(id("drone-osc"), "chunk", id("drone-vca"), "audio");
    wire(id("drone-env"), "cv", id("drone-vca"), "cv");

    // ── Layer mix: rhythm bus + melodic bus → layer bus ──────────────
    add(id("mix-rhythm"), T.mixer, {
      level1: 0.85, // bass
      level2: 0.9, // kick
      level3: 0.4, // arp
      level4: 0.16 // hat
    }, col(5), Y + 200);
    add(id("mix-tonal"), T.mixer, {
      level1: 0.4, // pad
      level2: 0.32, // lead
      level3: 0.3 // drone
    }, col(5), Y + 540);
    add(id("mix-layer"), T.mixer, { level1: level, level2: level }, col(6), Y + 340);
    wire(id("bass-vca"), "chunk", id("mix-rhythm"), "in1");
    wire(id("kick-vca"), "chunk", id("mix-rhythm"), "in2");
    wire(id("arp-vca"), "chunk", id("mix-rhythm"), "in3");
    wire(id("hat-vca"), "chunk", id("mix-rhythm"), "in4");
    wire(id("pad-vca"), "chunk", id("mix-tonal"), "in1");
    wire(id("lead-vca"), "chunk", id("mix-tonal"), "in2");
    wire(id("drone-vca"), "chunk", id("mix-tonal"), "in3");
    wire(id("mix-rhythm"), "chunk", id("mix-layer"), "in1");
    wire(id("mix-tonal"), "chunk", id("mix-layer"), "in2");
    layerOuts.push(id("mix-layer"));
  }

  // ── Fold layers 4-at-a-time, then master chain ─────────────────────
  let stage = layerOuts;
  let foldSeq = 0;
  while (stage.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < stage.length; i += 4) {
      const group = stage.slice(i, i + 4);
      const mixer = `fold-${foldSeq++}`;
      add(mixer, T.mixer, {
        level1: 1,
        level2: 1,
        level3: 1,
        level4: 1
      }, 2300 + foldSeq * 60, Math.floor(i / 4) * 300);
      group.forEach((src, g) => wire(src, "chunk", mixer, `in${g + 1}`));
      next.push(mixer);
    }
    stage = next;
  }

  add("master-gain", T.gain, { gain_db: -8 }, 2700, 200);
  add("master-hp", T.highpass, { cutoff_frequency_hz: 35 }, 2960, 200);
  add("speaker", T.out, {}, 3220, 200);
  wire(stage[0], "chunk", "master-gain", "chunk");
  wire("master-gain", "chunk", "master-hp", "chunk");
  wire("master-hp", "chunk", "speaker", "chunk");

  return { nodes, edges };
}
