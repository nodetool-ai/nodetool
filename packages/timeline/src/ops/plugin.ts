/**
 * Timeline document ops for third-party VST3/AU plug-in hosting (VST1):
 * - list_plugins: list scanned VST3/AU instruments and effects
 * - load_plugin: load an instrument on a MIDI track or insert effect on audio/MIDI/master
 * - list_plugin_presets / select_plugin_preset: inspect and select presets, persisting state
 * - get_plugin_parameters / set_plugin_parameters: inspect and set parameters by id/index/name,
 *   using normalized (0..1) or formatted display values, persisting state.
 */

import { isShortResourceId } from "@nodetool-ai/protocol";
import type {
  TimelineClip,
  TimelineTrack,
  TrackEffect,
  TrackVstEffect,
  VstMidiInstrument,
  VstPluginFormat,
  VstPluginRef
} from "../types.js";
import type { TimelineOp } from "./op.js";
import { serializeMaster, type serializeTrack } from "./serialize.js";
import type {
  PluginHostParameterChange,
  PluginHostParameterInfo,
  PluginHostPluginInfo,
  PluginHostPresetInfo,
  PluginHostTarget,
  TimelineOpContext,
  TimelineOpPluginHost,
  TimelineOpResult,
  TimelineOpState
} from "./types.js";

export type PluginOpName =
  | "list_plugins"
  | "load_plugin"
  | "list_plugin_presets"
  | "select_plugin_preset"
  | "get_plugin_parameters"
  | "set_plugin_parameters";

export interface PluginOpScope {
  readonly state: TimelineOpState;
  readonly tracks: TimelineTrack[];
  readonly ctx: TimelineOpContext;
  resolveTrack(target: string): TimelineTrack;
  resolveMidiTrack(target: string): TimelineTrack;
  assertWritable(clips: readonly TimelineClip[], destinationTrackId?: string): void;
  trackOut(track: TimelineTrack): ReturnType<typeof serializeTrack>;
}

const NO_HOST_ERROR =
  "No VST/AU plugin host is available on this surface. Run inside the desktop app with NodeToolVstHost installed.";

function inferFormat(path: string, explicit?: VstPluginFormat): VstPluginFormat {
  if (explicit === "au" || explicit === "vst3") return explicit;
  return path.toLowerCase().endsWith(".component") ? "au" : "vst3";
}

function toPluginRef(info: PluginHostPluginInfo): VstPluginRef {
  return {
    uid: info.uid,
    name: info.name,
    vendor: info.vendor,
    path: info.path,
    format: inferFormat(info.path, info.format)
  };
}

function toPublicPluginInfo(info: PluginHostPluginInfo) {
  const format = inferFormat(info.path, info.format);
  return {
    uid: info.uid,
    name: info.name,
    vendor: info.vendor,
    version: info.version,
    path: info.path,
    format,
    isInstrument: info.isInstrument,
    kind: info.isInstrument ? ("instrument" as const) : ("effect" as const)
  };
}

function isMasterTarget(scope: PluginOpScope, trackRef: string): boolean {
  const lower = trackRef.toLowerCase();
  if (lower !== "master") return false;
  return !scope.tracks.some(
    (t) => t.id === trackRef || t.name.toLowerCase() === lower
  );
}

async function requirePluginHost(
  scope: PluginOpScope
): Promise<TimelineOpPluginHost> {
  const host = scope.ctx.pluginHost;
  if (!host) {
    throw new Error(NO_HOST_ERROR);
  }
  if (host.status) {
    const status = await host.status();
    if (!status.available) {
      throw new Error(status.reason || NO_HOST_ERROR);
    }
  }
  return host;
}

function resolveEffectByIdOrName(
  effects: readonly TrackEffect[],
  ref: string
): TrackEffect | undefined {
  const exact = effects.find((e) => e.id === ref);
  if (exact) return exact;
  if (isShortResourceId(ref)) {
    const prefixMatches = effects.filter((e) => e.id.startsWith(ref));
    if (prefixMatches.length > 1) {
      throw new Error(
        `Prefix "${ref}" matches more than one effect; pass a full effect id.`
      );
    }
    if (prefixMatches[0]) return prefixMatches[0];
  }
  const lower = ref.toLowerCase();
  const byPluginName = effects.filter(
    (e): e is TrackVstEffect =>
      e.type === "vst" && e.plugin?.name.toLowerCase() === lower
  );
  if (byPluginName.length > 1) {
    throw new Error(
      `More than one insert effect matches "${ref}" (${byPluginName.map((e) => e.id).join(", ")}); pass the effect id.`
    );
  }
  return byPluginName[0];
}

interface ResolvedPluginSlot {
  isMaster: boolean;
  track?: TimelineTrack;
  target: "instrument" | "effect";
  effectId?: string;
  effect?: TrackVstEffect;
  instrument?: VstMidiInstrument;
  plugin: VstPluginRef;
  state: string | null;
  instance: string;
}

function resolveLoadedPluginSlot(
  scope: PluginOpScope,
  trackRef: string,
  effectId?: string
): ResolvedPluginSlot {
  const master = isMasterTarget(scope, trackRef);
  if (master) {
    const effects = scope.state.master?.effects ?? [];
    if (!effectId) {
      const vstEffects = effects.filter((e): e is TrackVstEffect => e.type === "vst");
      const hint =
        vstEffects.length > 0
          ? ` Master VST effects: ${vstEffects.map((e) => `${e.id} (${e.plugin?.name ?? "unloaded"})`).join(", ")}.`
          : " The master bus has no VST/AU insert effects loaded.";
      throw new Error(`Pass effectId to address a master bus insert effect.${hint}`);
    }
    const found = resolveEffectByIdOrName(effects, effectId);
    if (!found) {
      throw new Error(`No insert effect "${effectId}" on the master bus.`);
    }
    if (found.type !== "vst") {
      throw new Error(
        `Effect "${found.id}" on the master bus is type "${found.type}", not a VST/AU plugin.`
      );
    }
    if (!found.plugin) {
      throw new Error(`VST effect "${found.id}" on the master bus has no plugin loaded.`);
    }
    return {
      isMaster: true,
      target: "effect",
      effectId: found.id,
      effect: found,
      plugin: found.plugin,
      state: found.state,
      instance: `master-fx:${found.id}`
    };
  }

  const track = scope.resolveTrack(trackRef);
  if (effectId && effectId.toLowerCase() !== "instrument") {
    const effects = track.effects ?? [];
    const found = resolveEffectByIdOrName(effects, effectId);
    if (!found) {
      const vstEffects = effects.filter((e): e is TrackVstEffect => e.type === "vst");
      const hint =
        vstEffects.length > 0
          ? ` Loaded VST effects: ${vstEffects.map((e) => `${e.id} (${e.plugin?.name ?? "unloaded"})`).join(", ")}.`
          : "";
      throw new Error(`No insert effect "${effectId}" on track "${track.name}".${hint}`);
    }
    if (found.type !== "vst") {
      throw new Error(
        `Effect "${found.id}" on track "${track.name}" is type "${found.type}", not a VST/AU plugin.`
      );
    }
    if (!found.plugin) {
      throw new Error(`VST effect "${found.id}" on track "${track.name}" has no plugin loaded.`);
    }
    return {
      isMaster: false,
      track,
      target: "effect",
      effectId: found.id,
      effect: found,
      plugin: found.plugin,
      state: found.state,
      instance: `fx:${track.id}:${found.id}`
    };
  }

  if (track.type !== "midi") {
    const vstEffects = (track.effects ?? []).filter(
      (e): e is TrackVstEffect => e.type === "vst"
    );
    const hint =
      vstEffects.length > 0
        ? ` Pass effectId for one of: ${vstEffects.map((e) => `${e.id} (${e.plugin?.name ?? "unloaded"})`).join(", ")}.`
        : "";
    throw new Error(
      `Track "${track.name}" is a ${track.type} track and holds no instrument.${hint}`
    );
  }
  if (track.instrument?.type !== "vst" || !track.instrument.plugin) {
    throw new Error(
      `Track "${track.name}" does not have a VST/AU instrument loaded. Call load_plugin first.`
    );
  }
  return {
    isMaster: false,
    track,
    target: "instrument",
    instrument: track.instrument,
    plugin: track.instrument.plugin,
    state: track.instrument.state,
    instance: `track:${track.id}`
  };
}

function writeSlotState(
  scope: PluginOpScope,
  slot: ResolvedPluginSlot,
  nextState: string | null
): void {
  if (slot.target === "instrument" && slot.instrument) {
    slot.instrument.state = nextState;
    return;
  }
  if (slot.effect) {
    slot.effect.state = nextState;
    if (slot.isMaster && scope.state.master) {
      scope.state.master = {
        ...scope.state.master,
        effects: [...(scope.state.master.effects ?? [])]
      };
    }
  }
}

function matchPluginFromScan(
  plugins: readonly PluginHostPluginInfo[],
  selector: Extract<TimelineOp, { op: "load_plugin" }>["plugin"]
): PluginHostPluginInfo {
  if (typeof selector === "string") {
    const trimmed = selector.trim();
    const byUid = plugins.find((p) => p.uid === trimmed);
    if (byUid) return byUid;
    const byPath = plugins.find((p) => p.path === trimmed);
    if (byPath) return byPath;
    const lower = trimmed.toLowerCase();
    const byName = plugins.filter((p) => p.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      throw new Error(
        `Plugin name "${trimmed}" matches multiple plugins (${byName.map((p) => `${p.name} [${p.uid}]`).join(", ")}); pass its uid.`
      );
    }
    const available = plugins
      .slice(0, 8)
      .map((p) => `${p.name} (${p.uid})`)
      .join(", ");
    throw new Error(
      `No installed VST/AU plugin matches "${trimmed}".${available ? ` Available: ${available}.` : " Call list_plugins to scan installed plugins."}`
    );
  }

  const matches = plugins.filter((p) => {
    if (selector.uid && p.uid !== selector.uid) return false;
    if (selector.path && p.path !== selector.path) return false;
    if (selector.name && p.name.toLowerCase() !== selector.name.toLowerCase()) return false;
    if (selector.vendor && p.vendor.toLowerCase() !== selector.vendor.toLowerCase()) return false;
    if (selector.format && inferFormat(p.path, p.format) !== selector.format) return false;
    return true;
  });
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new Error(
      `Plugin selector matches multiple plugins (${matches.map((p) => `${p.name} [${p.uid}]`).join(", ")}); include uid.`
    );
  }
  throw new Error(
    `No installed VST/AU plugin matches ${JSON.stringify(selector)}. Call list_plugins to see installed plugins.`
  );
}

function resolveParameterRef(
  params: readonly PluginHostParameterInfo[],
  ref: string | number
): PluginHostParameterInfo {
  if (typeof ref === "number") {
    const byIndex = params.find((p) => p.index === ref);
    if (!byIndex) {
      throw new Error(
        `No plugin parameter at index ${ref}. Valid range: 0..${Math.max(0, params.length - 1)}.`
      );
    }
    return byIndex;
  }
  const trimmed = ref.trim();
  const byId = params.find((p) => p.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  const byName = params.filter((p) => p.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `Parameter name "${trimmed}" is ambiguous (${byName.map((p) => `${p.name} [id=${p.id}, index=${p.index}]`).join(", ")}); pass its id or index.`
    );
  }
  if (/^\d+$/.test(trimmed)) {
    const idx = Number.parseInt(trimmed, 10);
    const byNumericIndex = params.find((p) => p.index === idx);
    if (byNumericIndex) return byNumericIndex;
  }
  const sample = params
    .slice(0, 10)
    .map((p) => `${p.name} (${p.id})`)
    .join(", ");
  throw new Error(
    `No plugin parameter matches "${trimmed}".${sample ? ` Available: ${sample}.` : ""}`
  );
}

type PluginHandler<N extends PluginOpName> = (
  scope: PluginOpScope,
  op: Extract<TimelineOp, { op: N }>
) => TimelineOpResult | Promise<TimelineOpResult>;

export const PLUGIN_OP_HANDLERS: { [N in PluginOpName]: PluginHandler<N> } = {
  list_plugins: async (scope, op) => {
    const host = await requirePluginHost(scope);
    const scanned = await host.scan({
      rescan: op.rescan === true,
      includeEffects: op.kind !== "instrument"
    });
    const kind = op.kind ?? "all";
    const format = op.format ?? "all";
    const query = op.query?.trim().toLowerCase();
    const filtered = scanned.map(toPublicPluginInfo).filter((plugin) => {
      if (kind !== "all" && plugin.kind !== kind) return false;
      if (format !== "all" && plugin.format !== format) return false;
      if (query) {
        const hay = `${plugin.name} ${plugin.vendor} ${plugin.uid} ${plugin.path}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return {
      ok: true,
      plugins: filtered
    };
  },

  load_plugin: async (scope, op) => {
    const master = isMasterTarget(scope, op.track);
    let scannedInfo: PluginHostPluginInfo | undefined;
    let ref: VstPluginRef;

    if (scope.ctx.pluginHost) {
      const host = await requirePluginHost(scope);
      const scanned = await host.scan({ rescan: false, includeEffects: true });
      scannedInfo = matchPluginFromScan(scanned, op.plugin);
      ref = toPluginRef(scannedInfo);
    } else if (
      typeof op.plugin === "object" &&
      op.plugin.uid &&
      op.plugin.path &&
      op.plugin.name
    ) {
      ref = {
        uid: op.plugin.uid,
        name: op.plugin.name,
        vendor: op.plugin.vendor ?? "",
        path: op.plugin.path,
        format: inferFormat(op.plugin.path, op.plugin.format)
      };
    } else {
      throw new Error(NO_HOST_ERROR);
    }

    const track = master ? undefined : scope.resolveTrack(op.track);
    const inferredSlot: "instrument" | "effect" =
      op.slot ??
      (master
        ? "effect"
        : scannedInfo !== undefined
          ? scannedInfo.isInstrument
            ? "instrument"
            : "effect"
          : track?.type === "midi" && op.effectId === undefined && op.wet === undefined && op.index === undefined
            ? "instrument"
            : "effect");

    if (inferredSlot === "instrument") {
      if (master || !track || track.type !== "midi") {
        throw new Error(
          master
            ? "The master bus only accepts insert effects, not instruments."
            : `Track "${track!.name}" is a ${track!.type} track. VST/AU instruments can only load on midi tracks.`
        );
      }
      if (scannedInfo && !scannedInfo.isInstrument) {
        throw new Error(
          `Plugin "${scannedInfo.name}" is an audio effect, not an instrument. Pass slot: "effect" to insert it as an effect.`
        );
      }
      scope.assertWritable([], track.id);
      const instrument: VstMidiInstrument = {
        type: "vst",
        plugin: ref,
        state: op.state ?? null,
        gainDb: op.gainDb ?? 0
      };
      track.instrument = instrument;
      return {
        ok: true,
        slot: "instrument",
        plugin: ref,
        track: scope.trackOut(track)
      };
    }

    // Insert effect slot
    if (scannedInfo && scannedInfo.isInstrument) {
      throw new Error(
        `Plugin "${scannedInfo.name}" is an instrument, not an audio effect. Load it on a midi track with slot: "instrument".`
      );
    }
    if (!master && track) {
      if (track.type !== "audio" && track.type !== "midi") {
        throw new Error(
          `Track "${track.name}" is a ${track.type} track. VST/AU insert effects apply to audio, midi, or master channels only.`
        );
      }
      scope.assertWritable([], track.id);
    }

    const existing = master
      ? [...(scope.state.master?.effects ?? [])]
      : [...(track!.effects ?? [])];
    let targetEffectId: string;
    let replaceIndex = -1;
    if (op.effectId) {
      const matched = resolveEffectByIdOrName(existing, op.effectId);
      if (!matched) {
        throw new Error(
          `No effect "${op.effectId}" on ${master ? "the master bus" : `track "${track!.name}"`} to replace.`
        );
      }
      targetEffectId = matched.id;
      replaceIndex = existing.findIndex((e) => e.id === matched.id);
    } else {
      targetEffectId = scope.ctx.newId("effect");
    }

    const effect: TrackVstEffect = {
      id: targetEffectId,
      type: "vst",
      enabled: op.enabled ?? true,
      plugin: ref,
      state: op.state ?? null,
      wet: op.wet ?? 1
    };

    if (replaceIndex >= 0) {
      existing[replaceIndex] = effect;
    } else if (op.index !== undefined) {
      const clamped = Math.max(0, Math.min(existing.length, op.index));
      existing.splice(clamped, 0, effect);
    } else {
      existing.push(effect);
    }

    if (master) {
      const nextMaster = { ...(scope.state.master ?? { volumeDb: 0 }), effects: existing };
      scope.state.master = nextMaster;
      return {
        ok: true,
        slot: "effect",
        plugin: ref,
        effect: structuredClone(effect),
        master: serializeMaster(nextMaster)
      };
    }

    track!.effects = existing;
    return {
      ok: true,
      slot: "effect",
      plugin: ref,
      effect: structuredClone(effect),
      track: scope.trackOut(track!)
    };
  },

  list_plugin_presets: async (scope, op) => {
    const host = await requirePluginHost(scope);
    const slot = resolveLoadedPluginSlot(scope, op.track, op.effectId);
    const listed = await host.listPresets({
      instance: slot.instance,
      plugin: { path: slot.plugin.path, uid: slot.plugin.uid },
      state: slot.state
    });
    const query = op.query?.trim().toLowerCase();
    const presets = query
      ? listed.presets.filter((p) => p.name.toLowerCase().includes(query))
      : listed.presets;
    return {
      ok: true,
      trackId: slot.isMaster ? "master" : slot.track!.id,
      target: slot.target,
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      plugin: slot.plugin,
      currentPresetIndex: listed.currentPresetIndex,
      presets
    };
  },

  select_plugin_preset: async (scope, op) => {
    const host = await requirePluginHost(scope);
    const slot = resolveLoadedPluginSlot(scope, op.track, op.effectId);
    if (!slot.isMaster && slot.track) {
      scope.assertWritable([], slot.track.id);
    }
    const target: PluginHostTarget = { path: slot.plugin.path, uid: slot.plugin.uid };
    let presetIndex: number | undefined;
    let presetName: string | undefined;

    if (typeof op.preset === "number") {
      presetIndex = op.preset;
    } else {
      const listed = await host.listPresets({
        instance: slot.instance,
        plugin: target,
        state: slot.state
      });
      const trimmed = op.preset.trim();
      const lower = trimmed.toLowerCase();
      const byName = listed.presets.filter((p) => p.name.toLowerCase() === lower);
      if (byName.length === 1) {
        presetIndex = byName[0]!.index;
        presetName = byName[0]!.name;
      } else if (byName.length > 1) {
        throw new Error(
          `Preset name "${trimmed}" matches multiple presets (indices ${byName.map((p) => p.index).join(", ")}); pass the preset index.`
        );
      } else if (/^\d+$/.test(trimmed)) {
        presetIndex = Number.parseInt(trimmed, 10);
      } else {
        const sample = listed.presets
          .slice(0, 10)
          .map((p) => `${p.index}: ${p.name}`)
          .join(", ");
        throw new Error(
          `No preset named "${trimmed}" on "${slot.plugin.name}".${sample ? ` Available presets: ${sample}.` : ""}`
        );
      }
    }

    const selected = await host.selectPreset({
      instance: slot.instance,
      plugin: target,
      state: slot.state,
      presetIndex,
      presetName
    });
    const stateUpdated = selected.state !== slot.state;
    writeSlotState(scope, slot, selected.state);

    return {
      ok: true,
      trackId: slot.isMaster ? "master" : slot.track!.id,
      target: slot.target,
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      plugin: slot.plugin,
      preset: selected.preset,
      stateUpdated,
      ...(slot.isMaster
        ? { master: serializeMaster(scope.state.master) }
        : { track: scope.trackOut(slot.track!) })
    };
  },

  get_plugin_parameters: async (scope, op) => {
    const host = await requirePluginHost(scope);
    const slot = resolveLoadedPluginSlot(scope, op.track, op.effectId);
    const res = await host.getParameters({
      instance: slot.instance,
      plugin: { path: slot.plugin.path, uid: slot.plugin.uid },
      state: slot.state
    });
    let parameters: PluginHostParameterInfo[];
    if (op.parameters && op.parameters.length > 0) {
      parameters = op.parameters.map((ref) =>
        resolveParameterRef(res.parameters, ref)
      );
    } else if (op.query && op.query.trim().length > 0) {
      const q = op.query.trim().toLowerCase();
      parameters = res.parameters.filter((p) =>
        `${p.id} ${p.name} ${p.label ?? ""}`.toLowerCase().includes(q)
      );
    } else {
      parameters = res.parameters;
    }

    return {
      ok: true,
      trackId: slot.isMaster ? "master" : slot.track!.id,
      target: slot.target,
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      plugin: slot.plugin,
      totalCount: res.parameters.length,
      parameters
    };
  },

  set_plugin_parameters: async (scope, op) => {
    const host = await requirePluginHost(scope);
    const slot = resolveLoadedPluginSlot(scope, op.track, op.effectId);
    if (!slot.isMaster && slot.track) {
      scope.assertWritable([], slot.track.id);
    }
    const target: PluginHostTarget = { path: slot.plugin.path, uid: slot.plugin.uid };
    const requested = op.parameters
      ? op.parameters
      : [
          {
            parameter: op.parameter!,
            ...(op.value !== undefined ? { value: op.value } : {}),
            ...(op.displayValue !== undefined ? { displayValue: op.displayValue } : {})
          }
        ];

    const current = await host.getParameters({
      instance: slot.instance,
      plugin: target,
      state: slot.state
    });
    const resolvedIds: string[] = [];
    const changes: PluginHostParameterChange[] = requested.map((entry) => {
      const param = resolveParameterRef(current.parameters, entry.parameter);
      resolvedIds.push(param.id);
      return {
        id: param.id,
        index: param.index,
        ...(entry.value !== undefined ? { value: entry.value } : {}),
        ...(entry.displayValue !== undefined
          ? { displayValue: entry.displayValue }
          : {})
      };
    });

    const applied = await host.setParameters({
      instance: slot.instance,
      plugin: target,
      state: slot.state,
      changes
    });
    const stateUpdated = applied.state !== slot.state;
    writeSlotState(scope, slot, applied.state);

    const byId = new Map(applied.parameters.map((p) => [p.id, p]));
    const updated = resolvedIds
      .map((id) => byId.get(id))
      .filter((p): p is PluginHostParameterInfo => p !== undefined);

    return {
      ok: true,
      trackId: slot.isMaster ? "master" : slot.track!.id,
      target: slot.target,
      ...(slot.effectId ? { effectId: slot.effectId } : {}),
      plugin: slot.plugin,
      updated,
      stateUpdated,
      ...(slot.isMaster
        ? { master: serializeMaster(scope.state.master) }
        : { track: scope.trackOut(slot.track!) })
    };
  }
};

// ── In-memory plugin host for tests and deterministic fixtures ──────────────

export interface MemoryPluginParameterDef {
  id: string;
  index: number;
  name: string;
  label?: string;
  value: number;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  numSteps?: number;
  isDiscrete?: boolean;
  isBoolean?: boolean;
  isAutomatable?: boolean;
  formatDisplay?: (value: number) => string;
  parseDisplay?: (text: string) => number | null;
}

export interface MemoryPluginDefinition {
  info: PluginHostPluginInfo;
  presets?: readonly (PluginHostPresetInfo & { values?: Record<string, number> })[];
  parameters?: readonly MemoryPluginParameterDef[];
}

interface MemoryPluginStateBlob {
  presetIndex: number;
  values: Record<string, number>;
}

function encodeBase64Json(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64Json<T>(state: string | null): T | null {
  if (!state) return null;
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(state, "base64").toString("utf8")
        : new TextDecoder().decode(
            Uint8Array.from(atob(state), (c) => c.charCodeAt(0))
          );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function formatMemoryParam(
  def: MemoryPluginParameterDef,
  value: number
): PluginHostParameterInfo {
  const clamped = Math.max(0, Math.min(1, value));
  return {
    id: def.id,
    index: def.index,
    name: def.name,
    ...(def.label !== undefined ? { label: def.label } : {}),
    value: clamped,
    displayValue: def.formatDisplay
      ? def.formatDisplay(clamped)
      : def.label
        ? `${clamped.toFixed(2)} ${def.label}`
        : clamped.toFixed(2),
    ...(def.defaultValue !== undefined ? { defaultValue: def.defaultValue } : {}),
    ...(def.minValue !== undefined ? { minValue: def.minValue } : {}),
    ...(def.maxValue !== undefined ? { maxValue: def.maxValue } : {}),
    ...(def.numSteps !== undefined ? { numSteps: def.numSteps } : {}),
    ...(def.isDiscrete !== undefined ? { isDiscrete: def.isDiscrete } : {}),
    ...(def.isBoolean !== undefined ? { isBoolean: def.isBoolean } : {}),
    isAutomatable: def.isAutomatable ?? true
  };
}

/** Deterministic in-memory `TimelineOpPluginHost` for unit tests and parity fixtures. */
export function createMemoryPluginHost(
  definitions: readonly MemoryPluginDefinition[] = []
): TimelineOpPluginHost {
  const byKey = new Map<string, MemoryPluginDefinition>();
  for (const def of definitions) {
    byKey.set(`${def.info.path}\0${def.info.uid}`, def);
  }

  function lookup(target: PluginHostTarget): MemoryPluginDefinition {
    const found = byKey.get(`${target.path}\0${target.uid}`);
    if (!found) {
      throw new Error(`Plugin ${target.uid} at ${target.path} is not installed.`);
    }
    return found;
  }

  function readState(
    def: MemoryPluginDefinition,
    raw: string | null
  ): MemoryPluginStateBlob {
    const defaults: Record<string, number> = {};
    for (const p of def.parameters ?? []) {
      defaults[p.id] = p.value;
    }
    const decoded = decodeBase64Json<Partial<MemoryPluginStateBlob>>(raw);
    return {
      presetIndex:
        typeof decoded?.presetIndex === "number" ? decoded.presetIndex : 0,
      values: { ...defaults, ...(decoded?.values ?? {}) }
    };
  }

  return {
    status: () => ({ available: true, path: "memory://vst-host" }),

    async scan(options) {
      const includeEffects = options?.includeEffects !== false;
      return definitions
        .filter((d) => includeEffects || d.info.isInstrument)
        .map((d) => ({ ...d.info }));
    },

    async listPresets(req) {
      const def = lookup(req.plugin);
      const blob = readState(def, req.state);
      return {
        currentPresetIndex: blob.presetIndex,
        presets: (def.presets ?? []).map(({ index, name }) => ({ index, name }))
      };
    },

    async selectPreset(req) {
      const def = lookup(req.plugin);
      const presets = def.presets ?? [];
      const found =
        req.presetIndex !== undefined
          ? presets.find((p) => p.index === req.presetIndex)
          : req.presetName !== undefined
            ? presets.find(
                (p) => p.name.toLowerCase() === req.presetName!.toLowerCase()
              )
            : undefined;
      if (!found) {
        throw new Error(
          `Preset ${req.presetName ?? req.presetIndex} not found on "${def.info.name}".`
        );
      }
      const blob = readState(def, req.state);
      blob.presetIndex = found.index;
      if (found.values) {
        Object.assign(blob.values, found.values);
      }
      return {
        preset: { index: found.index, name: found.name },
        state: encodeBase64Json(blob)
      };
    },

    async getParameters(req) {
      const def = lookup(req.plugin);
      const blob = readState(def, req.state);
      return {
        parameters: (def.parameters ?? []).map((p) =>
          formatMemoryParam(p, blob.values[p.id] ?? p.value)
        )
      };
    },

    async setParameters(req) {
      const def = lookup(req.plugin);
      const blob = readState(def, req.state);
      const defs = def.parameters ?? [];
      for (const change of req.changes) {
        const param =
          change.id !== undefined
            ? defs.find((p) => p.id === change.id)
            : change.index !== undefined
              ? defs.find((p) => p.index === change.index)
              : undefined;
        if (!param) {
          throw new Error(
            `Unknown parameter ${change.id ?? change.index} on "${def.info.name}".`
          );
        }
        if (change.value !== undefined) {
          blob.values[param.id] = Math.max(0, Math.min(1, change.value));
        } else if (change.displayValue !== undefined) {
          let parsed: number | null = null;
          if (param.parseDisplay) {
            parsed = param.parseDisplay(change.displayValue);
          } else {
            const numeric = Number.parseFloat(change.displayValue);
            if (Number.isFinite(numeric)) {
              parsed =
                param.label === "%"
                  ? Math.max(0, Math.min(1, numeric / 100))
                  : Math.max(0, Math.min(1, numeric));
            }
          }
          if (parsed === null || !Number.isFinite(parsed)) {
            throw new Error(
              `Cannot parse displayValue "${change.displayValue}" for parameter "${param.name}".`
            );
          }
          blob.values[param.id] = Math.max(0, Math.min(1, parsed));
        }
      }
      return {
        parameters: defs.map((p) =>
          formatMemoryParam(p, blob.values[p.id] ?? p.value)
        ),
        state: encodeBase64Json(blob)
      };
    }
  };
}
