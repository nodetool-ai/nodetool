import type { GraphData } from "@nodetool-ai/protocol";

export type ColorSpace = "linear" | "srgb" | "encoded-sdr" | "data";
export interface TextureContract {
  readonly format: "rgba8unorm" | "rgba16float";
  readonly colorSpace: ColorSpace;
  readonly alpha: "premultiplied" | "straight";
  readonly size: { readonly kind: "session" } | { readonly kind: "fixed"; readonly width: number; readonly height: number } |
    { readonly kind: "input"; readonly input: string; readonly scale: number };
}
export interface TextureInput {
  readonly colorSpace: ColorSpace;
  readonly alpha: "premultiplied" | "straight";
  readonly format?: TextureContract["format"];
  readonly optional?: boolean;
}
export type ControlValue = number | boolean | readonly number[];
export interface ValueBinding { readonly property: string; readonly default: ControlValue; }
export type ControlExpression =
  { readonly kind: "literal"; readonly value: ControlValue } |
  { readonly kind: "property"; readonly property: string; readonly default: ControlValue } |
  { readonly kind: "operation"; readonly op: AnalyticOperation; readonly inputs: readonly ControlExpression[] };
export interface ExpressionBinding { readonly field: string; readonly expression: ControlExpression; }
export type AnalyticOperation = "time.seconds" | "time.beats" | "time.dt" | "time.frame" | "output.width" | "output.height" |
  "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "less" | "equal" | "remap" | "vec2" | "vec3" | "vec4" | "pow" | "tanh";
export type StatefulOperation = "damp" | "envelope" | "oscillator" | "sample_hold" | "integrator" | "counter";
export type ControlDescriptor = { readonly kind: "control"; readonly output: string } & (
  { readonly op: "constant"; readonly value: ValueBinding } |
  { readonly op: AnalyticOperation; readonly inputs: readonly ValueBinding[] } |
  { readonly op: StatefulOperation; readonly inputs: readonly ValueBinding[]; readonly stateVersion: number }
);
export interface ShaderDescriptor {
  readonly kind: "shader";
  readonly module: string;
  readonly output: string;
  readonly textureInputs: Readonly<Record<string, TextureInput>>;
  readonly uniforms: readonly (ValueBinding | ExpressionBinding)[];
  readonly texture: TextureContract;
  readonly retention: "retained" | "volatile";
}
export interface RenderOutputDescriptor { readonly kind: "render-output"; readonly input: string; readonly colorSpace: ColorSpace; }
export type DspKernel = "oscillator" | "noise" | "gain" | "mix" | "level-meter" | "delay" | "sample-player" |
  "biquad.lowpass" | "biquad.highpass" | "biquad.bandpass" | "biquad.notch" | "biquad.allpass" |
  "biquad.peaking" | "biquad.lowshelf" | "biquad.highshelf";
export interface AudioParameterBinding extends ValueBinding {
  readonly smoothing?: { readonly kind: "none" | "ramp" } | { readonly kind: "onePole"; readonly timeConstant: number };
}
export interface DspDescriptor {
  readonly kind: "dsp";
  readonly kernel: DspKernel;
  readonly stateVersion: number;
  readonly inputs: readonly string[];
  readonly output: string;
  readonly params: readonly AudioParameterBinding[];
  readonly channels?: Session["channels"];
  readonly delayFrames?: ValueBinding;
  readonly bufferInput?: string;
}
export interface AudioOutputDescriptor { readonly kind: "audio-output"; readonly input: string; readonly sink: "device" | "tap" | "record"; }
export type LiveDescriptor = ControlDescriptor | ShaderDescriptor | RenderOutputDescriptor | DspDescriptor | AudioOutputDescriptor;
export interface Session {
  readonly sampleRate: 44100 | 48000;
  readonly quantum: 128;
  readonly channels: "mono" | "stereo";
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}
export interface BatchTexture { readonly node: string; readonly output: string; readonly texture: TextureContract; }
/** Trusted metadata for prepared planar float32 little-endian PCM, after decoding/resampling. */
export interface BatchPcm {
  readonly node: string;
  readonly output: string;
  readonly sampleRate: Session["sampleRate"];
  readonly channels: Session["channels"];
  readonly frames: number;
  readonly contentHash: string;
}
export interface CompileInput {
  readonly graph: { readonly nodes: Readonly<GraphData["nodes"]>; readonly edges: Readonly<GraphData["edges"]> };
  readonly descriptors: ReadonlyMap<string, LiveDescriptor>;
  readonly outputs: readonly string[];
  readonly session: Session;
  readonly revision: number;
  readonly batchTextures?: readonly BatchTexture[];
  readonly batchPcm?: readonly BatchPcm[];
  readonly allocation?: ParameterAllocation;
}
export interface ParameterIdentity { readonly node: string; readonly field: string; readonly slot: number; }
/** Session-owned ledger. Removed identities remain reserved until the session ends. */
export interface ParameterAllocation { readonly entries: readonly ParameterIdentity[]; readonly nextSlot: number; }
export interface StateKey { readonly node: string; readonly kind: "audio" | "control"; readonly key: string; }
export interface PlanParameter extends ParameterIdentity {
  readonly value: number;
  readonly smooth: "none" | "ramp" | "onePole";
  readonly timeConstant?: number;
  readonly sync: "audio";
  readonly audioControl?: number;
}
export interface AudioNode {
  readonly node: string;
  readonly kernel: DspKernel;
  readonly stateVersion: number;
  readonly in: readonly { readonly node: string; readonly output: number }[];
  readonly out: readonly number[];
  readonly params: readonly number[];
  readonly delayFrames?: number;
  readonly bufferSlot?: string;
}
export interface Diagnostic { readonly node: string; readonly reason: string; readonly detail: string; }
export interface ControlInstruction {
  readonly node: string;
  readonly op: string;
  readonly domain: "render" | "audio";
  readonly out: number;
  readonly in: readonly number[];
  readonly values: readonly number[];
}
export interface RenderPass {
  readonly node: string;
  readonly module: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly uniforms: readonly number[];
  readonly retention: "retained" | "volatile";
  readonly output: TextureContract;
}
export interface RealtimePlan {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly session: Session;
  readonly params: readonly PlanParameter[];
  readonly slots: readonly (
    { readonly id: string; readonly kind: "texture"; readonly source: string; readonly output: TextureContract } |
    { readonly id: string; readonly kind: "buffer"; readonly source: string; readonly channels: Session["channels"] }
  )[];
  readonly control: { readonly registers: number; readonly ops: readonly ControlInstruction[]; readonly stateful: readonly (ControlInstruction & { readonly stateVersion: number })[] };
  readonly render: { readonly passes: readonly RenderPass[]; readonly present?: { readonly source: string; readonly colorSpace: ColorSpace } };
  readonly audio: {
    readonly buffers: readonly { readonly id: number; readonly channels: Session["channels"] }[];
    readonly nodes: readonly AudioNode[];
    readonly sinks: readonly { readonly node: string; readonly buffer: number; readonly kind: "device" | "tap" | "record"; readonly subgraphHash: string }[];
  };
}
export type RenderPlan = RealtimePlan;
export interface BatchBoundary { readonly node: string; readonly output: string; readonly slot: string; readonly reason: "no_live_descriptor"; }
export type CompileResult = { readonly status: "ok"; readonly plan: RealtimePlan; readonly boundaries: readonly BatchBoundary[]; readonly warnings: readonly Diagnostic[]; readonly allocation: ParameterAllocation; readonly stateKeys: readonly StateKey[] } |
  { readonly status: "error"; readonly diagnostics: readonly Diagnostic[] };
