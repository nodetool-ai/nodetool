import type { DynamicsMessage } from '../../engine/dynamics';
import type { EchoMessage } from '../../engine/echo';
import type { ReverbMessage } from '../../engine/reverb';
import type { ReactNode } from 'react';
import type { AutoEqSource } from './AutoEqStrip';
import type { AutoCompTap } from './AutoCompStrip';

/** Small structural surface shared by WT-1, BL-1 and DR-1 FX visualizers. */
export interface FxTelemetryEngine {
  ctx?: { sampleRate: number } | null;
  subscribeDynamics(listener: (message: DynamicsMessage) => void): () => void;
  subscribeEcho(listener: (message: EchoMessage) => void): () => void;
  subscribeReverb(listener: (message: ReverbMessage) => void): () => void;
}

export interface FxPanelAdapter {
  engine: FxTelemetryEngine;
  params: Record<string, number>;
  setParam: (id: string, value: number) => void;
  /** Namespaces per-pad controls, e.g. `pad3.` for DR-1. */
  prefix?: string;
  /** Optional honest context shown in panel captions (DR-1 bus return). */
  context?: string;
  title?: string;
  /** Renders the knob for a full parameter id. `accent` is the FableSynth accent key (LAB cards). */
  renderKnob: (id: string, key?: string, accent?: string) => ReactNode;
  renderPower: (id: string) => ReactNode;
  /** Enum stepper, used by the LAB reso chord. */
  renderStepper?: (id: string) => ReactNode;
  /** Full tape echo (routing, sync, tone, wow, flutter) instead of the plain delay. */
  tape?: boolean;
  /** Host tempo for synced echo times; falls back to `params['seq.bpm']`. */
  bpm?: number;
  /** Signal and default reference for the EQ panel's auto-EQ. */
  analysis?: AutoEqSource;
  /** Auto-comp input source and default style. Without a source it uses comp telemetry. */
  compTap?: AutoCompTap;
  /** Analyser for the EQ panel's live spectrum; defaults to `analysis.source`, null hides it. */
  liveSpectrum?: AnalyserNode | null;
  /** COMP side-chain sources (src/engine/sidechain.ts) and whether the SQ-4 key bus is connected. */
  sidechain?: SideChainInfo;
}

export interface SideChainInfo {
  sources: readonly string[];
  /** True inside SQ-4, where the track keys are connected. */
  hosted: boolean;
  /** Display names for sources, e.g. TRACK 2 → BASS. */
  labels?: Record<string, string>;
}

export const fxId = (prefix: string | undefined, id: string) => `${prefix ?? ''}${id}`;
