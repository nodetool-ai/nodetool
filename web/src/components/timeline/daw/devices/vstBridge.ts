/**
 * The desktop app's VST3 host, as the renderer sees it (`window.api.vst`).
 *
 * The plug-ins run in NodeToolVstHost, a helper process the desktop app starts;
 * the browser build has no bridge, so a `vst` track there is silent and its
 * device view says why. These types mirror `electron/src/types.d.ts`.
 */

import type { TimelineOpPluginHost } from "@nodetool-ai/timeline/ops";

export interface VstHostStatus {
  available: boolean;
  path?: string;
  reason?: string;
}

export interface VstPluginInfo {
  uid: string;
  name: string;
  vendor: string;
  version: string;
  path: string;
  format?: "vst3" | "au";
  isInstrument: boolean;
}

export interface VstPluginTarget {
  path: string;
  uid: string;
}

export interface VstNoteEvent {
  pitch: number;
  velocity: number;
  startFrame: number;
  gateOffFrame: number;
}

export interface VstRenderRequest {
  plugin: VstPluginTarget;
  state: string | null;
  sampleRate: number;
  frames: number;
  events: VstNoteEvent[];
}

export interface VstRenderResult {
  frames: number;
  /** Planar stereo: `frames` left samples, then `frames` right samples. */
  pcm: Float32Array;
}

export interface VstOpenEditorRequest {
  instance: string;
  plugin: VstPluginTarget;
  state: string | null;
  title: string;
}

export interface VstHostEvent {
  event: "state" | "editorClosed" | "exited";
  instance?: string;
  state?: string;
}

export interface VstPluginPresetInfo {
  index: number;
  name: string;
}

export interface VstListPresetsRequest {
  instance: string;
  plugin: VstPluginTarget;
  state: string | null;
}

export interface VstListPresetsResult {
  currentPresetIndex: number;
  presets: VstPluginPresetInfo[];
}

export interface VstSelectPresetRequest {
  instance: string;
  plugin: VstPluginTarget;
  state: string | null;
  presetIndex?: number;
  presetName?: string;
}

export interface VstSelectPresetResult {
  preset: VstPluginPresetInfo;
  state: string | null;
}

export interface VstPluginParameterInfo {
  id: string;
  index: number;
  name: string;
  label?: string;
  value: number;
  displayValue: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  numSteps?: number;
  isDiscrete?: boolean;
  isBoolean?: boolean;
  isAutomatable?: boolean;
}

export interface VstPluginParameterChange {
  id?: string;
  index?: number;
  value?: number;
  displayValue?: string;
}

export interface VstGetParametersRequest {
  instance: string;
  plugin: VstPluginTarget;
  state: string | null;
}

export interface VstGetParametersResult {
  parameters: VstPluginParameterInfo[];
}

export interface VstSetParametersRequest {
  instance: string;
  plugin: VstPluginTarget;
  state: string | null;
  changes: VstPluginParameterChange[];
}

export interface VstSetParametersResult {
  parameters: VstPluginParameterInfo[];
  state: string | null;
}

export interface VstBridge {
  status: () => Promise<VstHostStatus>;
  scan: (rescan?: boolean, includeEffects?: boolean) => Promise<VstPluginInfo[]>;
  render: (request: VstRenderRequest) => Promise<VstRenderResult>;
  openEditor: (request: VstOpenEditorRequest) => Promise<void>;
  closeEditor: (instance: string) => Promise<void>;
  listPresets?: (request: VstListPresetsRequest) => Promise<VstListPresetsResult>;
  selectPreset?: (request: VstSelectPresetRequest) => Promise<VstSelectPresetResult>;
  getParameters?: (request: VstGetParametersRequest) => Promise<VstGetParametersResult>;
  setParameters?: (request: VstSetParametersRequest) => Promise<VstSetParametersResult>;
  onEvent: (callback: (event: VstHostEvent) => void) => () => void;
}

/** The bridge, or null outside the desktop app. */
export function vstBridge(): VstBridge | null {
  return typeof window !== "undefined" ? window.api?.vst ?? null : null;
}

/** Adapt the desktop Electron `window.api.vst` bridge to `TimelineOpPluginHost`. */
export function createBrowserPluginHost(): TimelineOpPluginHost | undefined {
  const bridge = vstBridge();
  if (!bridge) return undefined;
  return {
    status: () => bridge.status(),
    scan: (options) =>
      bridge.scan(options?.rescan === true, options?.includeEffects !== false),
    listPresets: (request) => {
      if (!bridge.listPresets) {
        return Promise.reject(new Error("This desktop build does not support listing VST/AU presets."));
      }
      return bridge.listPresets(request);
    },
    selectPreset: (request) => {
      if (!bridge.selectPreset) {
        return Promise.reject(new Error("This desktop build does not support selecting VST/AU presets."));
      }
      return bridge.selectPreset(request);
    },
    getParameters: (request) => {
      if (!bridge.getParameters) {
        return Promise.reject(new Error("This desktop build does not support reading VST/AU parameters."));
      }
      return bridge.getParameters(request);
    },
    setParameters: (request) => {
      if (!bridge.setParameters) {
        return Promise.reject(new Error("This desktop build does not support setting VST/AU parameters."));
      }
      return bridge.setParameters(request);
    }
  };
}

/** The editor instance a track's plug-in window uses. */
export function vstEditorInstance(trackId: string): string {
  return `track:${trackId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120)}`;
}
