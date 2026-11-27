import {
  MAX_AUTOMATION_POINTS_PER_LANE,
  MAX_AUTOMATION_LANES_PER_TRACK
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { isShortResourceId } from "@nodetool-ai/protocol";
import {
  automationEditParams,
  MAX_AUTOMATION_TIME_MS
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  automationTargetKey,
  trackAcceptsAutomationTarget
} from "../automation.js";
import type {
  AutomationPoint,
  AutomationTarget,
  TimelineTrack
} from "../types.js";
import { EASING_IDS, parseEasing } from "../animation/easing.js";
import ranges from "../automationRanges.js";

/** The same ranges used by native automation targets, in parameter units. */
export function automationTargetRange(
  track: TimelineTrack,
  target: AutomationTarget
): readonly number[] {
  if (!trackAcceptsAutomationTarget(track, target)) {
    throw new Error("Track cannot take this automation target.");
  }
  let type: string = target.kind;
  let param = target.kind === "clip" ? target.property : target.param;
  if (target.kind === "device") {
    if (target.deviceId === "instrument") {
      type = track.instrument?.type ?? "";
      if (type === "drum" && param.startsWith("pad")) {
        const match = /^pad(\d+)\.(.+)$/.exec(param);
        if (!match || Number(match[1]) >= 16) {
          throw new Error("Invalid drum pad.");
        }
        type = "drumPad";
        param = match[2] ?? "";
      }
    } else {
      type =
        track.effects?.find((effect) => effect.id === target.deviceId)?.type ??
        "";
    }
  }
  const groups: Readonly<
    Record<string, Readonly<Record<string, readonly number[]>>>
  > = ranges;
  const group = Object.hasOwn(groups, type) ? groups[type] : undefined;
  const range = group && Object.hasOwn(group, param) ? group[param] : undefined;
  if (!range) {
    throw new Error("Unknown automation parameter.");
  }
  return range;
}

/** Mutates the op's private state clone, once the complete payload validates. */
export function runAutomationEdit(
  track: TimelineTrack,
  input: unknown,
  newId: () => string
): void {
  const p = automationEditParams.parse(input);
  if (track.locked) {
    throw new Error("Track is locked.");
  }
  if (p.edit === "setTrackAutomationMode") {
    track.automationMode = p.mode;
    return;
  }
  const needsRange =
    p.edit === "automation.addPoints" || p.edit === "automation.movePoints";
  if (p.target.kind === "device" && p.target.deviceId !== "instrument") {
    const ref = p.target.deviceId;
    const ids = new Set((track.effects ?? []).map((effect) => effect.id));
    if (!needsRange) {
      for (const lane of track.automation ?? []) {
        if (lane.target.kind === "device") {
          ids.add(lane.target.deviceId);
        }
      }
    }
    const matches = ids.has(ref)
      ? [ref]
      : isShortResourceId(ref)
        ? [...ids].filter((id) => id.startsWith(ref))
        : [];
    if (matches.length !== 1 || !matches[0]) {
      throw new Error("Device id is missing or ambiguous.");
    }
    p.target.deviceId = matches[0];
  }
  const range = needsRange ? automationTargetRange(track, p.target) : undefined;
  const clamp = (value: number): number => {
    const minimum = range?.[0];
    const maximum = range?.[1];
    if (minimum === undefined || maximum === undefined) {
      throw new Error("Invalid automation range.");
    }
    return Math.min(maximum, Math.max(minimum, value));
  };
  const lanes = [...(track.automation ?? [])];
  const index = lanes.findIndex(
    (lane) => automationTargetKey(lane.target) === automationTargetKey(p.target)
  );
  const existing = lanes[index];
  if (
    existing &&
    (p.edit === "automation.addPoints" || p.edit === "automation.movePoints")
  ) {
    for (const point of existing.points) {
      if (
        !Number.isFinite(point.timeMs) ||
        point.timeMs < 0 ||
        point.timeMs > MAX_AUTOMATION_TIME_MS ||
        !Number.isFinite(point.value)
      ) {
        throw new Error("Invalid stored automation point.");
      }
    }
  }
  if (!existing && p.edit !== "automation.addPoints") {
    throw new Error("Automation lane does not exist.");
  }
  const lane = existing
    ? { ...existing, points: [...existing.points] }
    : { id: "", target: p.target, points: [] };
  if (p.edit === "automation.clearLane") {
    lanes.splice(index, 1);
  } else {
    if (p.edit === "automation.setLaneEnabled") {
      if (p.enabled) {
        delete lane.enabled;
      } else {
        lane.enabled = false;
      }
    } else if (p.edit === "automation.addPoints") {
      // Half-ms buckets keep UI replacement tolerance without scanning the whole lane.
      const buckets = new Map<number, Map<number, AutomationPoint>>();
      const insert = (point: AutomationPoint): void => {
        const bucket = Math.floor(point.timeMs * 2);
        let replaced: AutomationPoint | undefined;
        for (const key of [bucket - 1, bucket, bucket + 1]) {
          for (const candidate of buckets.get(key)?.values() ?? []) {
            if (
              Math.abs(candidate.timeMs - point.timeMs) < 0.5 &&
              (!replaced || candidate.timeMs < replaced.timeMs)
            ) {
              replaced = candidate;
            }
          }
        }
        if (replaced) {
          buckets.get(Math.floor(replaced.timeMs * 2))?.delete(replaced.timeMs);
          if (point.easing === undefined && replaced.easing !== undefined) {
            point = { ...point, easing: replaced.easing };
          }
        }
        let entries = buckets.get(bucket);
        if (!entries) {
          entries = new Map();
          buckets.set(bucket, entries);
        }
        entries.set(point.timeMs, point);
      };
      for (const point of lane.points) {
        insert(point);
      }
      for (const point of p.points) {
        if (
          point.easing !== undefined &&
          (point.easing.length > 256 ||
            (!EASING_IDS.some((id) => id === point.easing?.trim()) &&
              (!/^(cubic-bezier|spring)\(/.test(point.easing.trim()) ||
                !parseEasing(point.easing))))
        ) {
          throw new Error("Invalid automation easing.");
        }
        const timeMs = Math.max(0, point.timeMs);
        insert({ ...point, timeMs, value: clamp(point.value) });
      }
      lane.points = [...buckets.values()]
        .flatMap((entries) => [...entries.values()])
        .sort((a, b) => a.timeMs - b.timeMs);
    } else {
      if (p.toMs < p.fromMs) {
        throw new Error("toMs must be at or after fromMs.");
      }
      const selected = (time: number): boolean =>
        time >= p.fromMs && time <= p.toMs;
      if (p.edit === "automation.deletePoints") {
        lane.points = lane.points.filter((point) => !selected(point.timeMs));
      } else {
        const ordered = [
          ...lane.points.filter((point) => !selected(point.timeMs)),
          ...lane.points.filter((point) => selected(point.timeMs))
        ];
        const moved = ordered.map((point) => {
          if (!selected(point.timeMs)) {
            return point;
          }
          const timeMs = point.timeMs + p.deltaMs;
          const value = point.value + p.deltaValue;
          if (
            !Number.isFinite(timeMs) ||
            timeMs > MAX_AUTOMATION_TIME_MS ||
            !Number.isFinite(value)
          ) {
            throw new Error("Automation move overflow.");
          }
          return {
            ...point,
            timeMs: Math.max(0, timeMs),
            value: clamp(value)
          };
        });
        lane.points = [
          ...new Map(moved.map((point) => [point.timeMs, point])).values()
        ].sort((a, b) => a.timeMs - b.timeMs);
      }
    }
    if (
      lane.points.length > MAX_AUTOMATION_POINTS_PER_LANE ||
      (index < 0 && lanes.length >= MAX_AUTOMATION_LANES_PER_TRACK)
    ) {
      throw new Error("Automation capacity exceeded.");
    }
    if (index < 0) {
      lane.id = newId();
      lanes.push(lane);
    } else {
      lanes[index] = lane;
    }
  }
  if (lanes.length) {
    track.automation = lanes;
  } else {
    delete track.automation;
  }
}
