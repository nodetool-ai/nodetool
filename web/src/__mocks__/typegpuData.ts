/**
 * Minimal `typegpu/data` mock for jsdom Jest. See `typegpu.ts` for why. The
 * compositor uses `d.struct` (at load) and `d.vec4f` (per blend pass, only
 * with a real device). Schema objects only need to be inert placeholders.
 */

type Schema = Record<string, unknown>;

export const struct = (fields: Record<string, unknown>): Schema => ({
  fields
});

export const sizeOf = (): number => 0;

const vec = (...components: number[]): number[] => components;

export const vec2f = vec;
export const vec3f = vec;
export const vec4f = vec;

export const f32 = { scalar: "f32" };
export const u32 = { scalar: "u32" };
export const i32 = { scalar: "i32" };
export const bool = { scalar: "bool" };
