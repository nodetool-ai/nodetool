import { z } from "zod";

export const finite = z.number().finite();

export const positive = finite.positive();

export const uint32 = z.number().int().min(0).max(0xffffffff);

export const vec2 = z.strictObject({ x: finite, y: finite });

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const frame = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
