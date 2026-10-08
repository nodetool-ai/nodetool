import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { z } from "zod";
import type { GameEntityProps } from "@nodetool-ai/protocol";
import { gameScriptValue, scriptHandleResult } from "./script-transport.js";

export const GAME_SCRIPT_MAX_QUERIES = 64;
const encoder = new TextEncoder();
const coordinate = z.number().finite();
const point = z.strictObject({ x: coordinate, y: coordinate, z: coordinate.optional() });
const queryOptions = z.strictObject({
  source: z.string().max(1024).optional(),
  tag: z.string().max(1024).optional(),
  near: point.optional(),
  radius: coordinate.nonnegative().optional(),
  limit: z.number().int().min(0).max(1024).default(1024)
}).refine((value) => (value.near === undefined) === (value.radius === undefined), "near and radius must be supplied together");

export interface ScriptWorldEntity {
  readonly id: string;
  readonly source: string;
  readonly x?: number;
  readonly y?: number;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocity?: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly grounded?: boolean;
  /** Schema 4 and 3D metadata, matching the entries of `input.world`. */
  readonly tags?: readonly string[];
  readonly props?: GameEntityProps;
  readonly rotation?: number | readonly [number, number, number, number];
  readonly active?: boolean;
}

/** Owns one immutable start-of-tick view shared by host callbacks, never guest objects. */
export class ScriptWorldSnapshot {
  private readonly entities: readonly ScriptWorldEntity[];
  private readonly byId: ReadonlyMap<string, ScriptWorldEntity>;
  private byX: readonly { readonly entity: ScriptWorldEntity; readonly order: number }[] | undefined;

  /** `props` holds each entity's props once; entities absent from it read `{}`. Legacy inputs pass none. */
  constructor(entities: readonly ScriptWorldEntity[], props?: Readonly<Record<string, GameEntityProps>>) {
    this.entities = entities.map((entity) => {
      const snapshot = { ...entity };
      if (props !== undefined) { snapshot.props = Object.hasOwn(props, entity.id) ? props[entity.id] : {}; }
      if (entity.position) { snapshot.position = Object.freeze({ ...entity.position }); }
      if (entity.velocity) { snapshot.velocity = Object.freeze({ ...entity.velocity }); }
      return Object.freeze(snapshot);
    });
    this.byId = new Map(this.entities.map((entity) => [entity.id, entity]));
  }

  private nearCandidates(x: number, radius: number, checkDeadline: () => void): readonly ScriptWorldEntity[] {
    this.byX ??= this.entities.map((entity, order) => ({ entity, order }))
      .sort((a, b) => (a.entity.position?.x ?? a.entity.x ?? 0) - (b.entity.position?.x ?? b.entity.x ?? 0));
    checkDeadline();
    let low = 0;
    let high = this.byX.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const entity = this.byX[middle].entity;
      if ((entity.position?.x ?? entity.x ?? 0) < x - radius) { low = middle + 1; }
      else { high = middle; }
    }
    const candidates: { readonly entity: ScriptWorldEntity; readonly order: number }[] = [];
    for (let index = low; index < this.byX.length; index += 1) {
      checkDeadline();
      const entry = this.byX[index];
      const entity = entry.entity;
      if ((entity.position?.x ?? entity.x ?? 0) > x + radius) { break; }
      candidates.push(entry);
    }
    candidates.sort((a, b) => a.order - b.order);
    checkDeadline();
    return candidates.map((entry) => entry.entity);
  }

  install(context: QuickJSContext, checkDeadline: () => void, defineData: QuickJSHandle, queryJson: QuickJSHandle): { end(): void; assertWithinLimit(): void } {
    let active = true;
    let queries = 0;
    const assertWithinLimit = (): void => {
      if (queries > GAME_SCRIPT_MAX_QUERIES) { throw new Error(`world maxQueries ${GAME_SCRIPT_MAX_QUERIES} exceeded`); }
    };
    const check = (): void => {
      checkDeadline();
      queries += 1;
      if (!active || queries > GAME_SCRIPT_MAX_QUERIES) {
        throw new Error(`world maxQueries ${GAME_SCRIPT_MAX_QUERIES} exceeded or call ended`);
      }
    };
    const result = (value: unknown): QuickJSHandle => {
      if (encoder.encode(JSON.stringify(value) ?? "null").byteLength > 64 * 1024) {
        throw new Error("world response exceeds 64 KiB");
      }
      const handle = gameScriptValue(context, value, defineData);
      try { checkDeadline(); return handle; } catch (error) { handle.dispose(); throw error; }
    };
    let world: QuickJSHandle | undefined;
    let get: QuickJSHandle | undefined;
    let query: QuickJSHandle | undefined;
    try {
    world = context.newObject();
    get = context.newFunction("get", (id) => {
      check();
      if (!id || context.typeof(id) !== "string") { throw new Error("world.get requires an entity id string"); }
      const length = context.getProp(id, "length");
      try {
        if (context.getNumber(length) > 1024) { throw new Error("world.get id exceeds 1024 characters"); }
      } finally { length.dispose(); }
      return result(this.byId.get(context.getString(id)));
    });
    query = context.newFunction("query", (options) => {
      check();
      let value: unknown = {};
      if (options && context.typeof(options) !== "undefined") {
        const serialized = scriptHandleResult(context, context.callFunction(queryJson, context.undefined, options));
        try { value = JSON.parse(context.getString(serialized)); } finally { serialized.dispose(); }
      }
      const parsed = queryOptions.parse(value);
      const ids: string[] = [];
      const candidates = parsed.near && parsed.radius !== undefined ? this.nearCandidates(parsed.near.x, parsed.radius, checkDeadline) : this.entities;
      if (parsed.limit > 0) {
        for (const entity of candidates) {
          checkDeadline();
          if (parsed.source !== undefined && entity.source !== parsed.source) { continue; }
          // Legacy entities carry no tags, so a tag filter matches none of them.
          if (parsed.tag !== undefined && !entity.tags?.includes(parsed.tag)) { continue; }
          if (parsed.near && parsed.radius !== undefined) {
            const x = entity.position?.x ?? entity.x ?? 0;
            const y = entity.position?.y ?? entity.y ?? 0;
            const z = entity.position?.z ?? 0;
            if (Math.hypot(x - parsed.near.x, y - parsed.near.y, z - (parsed.near.z ?? 0)) > parsed.radius) { continue; }
          }
          ids.push(entity.id);
          if (ids.length === parsed.limit) { break; }
        }
      }
      return result(ids);
    });
      context.setProp(world, "get", get);
      context.setProp(world, "query", query);
      context.setProp(context.global, "world", world);
    } finally {
      get?.dispose(); query?.dispose(); world?.dispose();
    }
    return { end: () => { active = false; }, assertWithinLimit };
  }
}
