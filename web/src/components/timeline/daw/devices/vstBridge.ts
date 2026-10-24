/**
 * The desktop app's VST3 host, as the renderer sees it (`window.api.vst`).
 *
 * The plug-ins run in FableVstHost, a helper process the desktop app starts;
 * the browser build has no bridge, so a `vst` track there is silent and its
 * device view says why. These types mirror `electron/src/types.d.ts`.
 */

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

export interface VstBridge {
  status: () => Promise<VstHostStatus>;
  scan: (rescan?: boolean) => Promise<VstPluginInfo[]>;
  render: (request: VstRenderRequest) => Promise<VstRenderResult>;
  openEditor: (request: VstOpenEditorRequest) => Promise<void>;
  closeEditor: (instance: string) => Promise<void>;
  onEvent: (callback: (event: VstHostEvent) => void) => () => void;
}

/** The bridge, or null outside the desktop app. */
export function vstBridge(): VstBridge | null {
  return typeof window !== "undefined" ? window.api?.vst ?? null : null;
}

/** The editor instance a track's plug-in window uses. */
export function vstEditorInstance(trackId: string): string {
  return `track:${trackId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120)}`;
}
