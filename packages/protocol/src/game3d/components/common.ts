import { z } from "zod";

export const finite = z.number().finite();

export const positive = finite.positive();

export const id = z.string().min(1);

export const tick = z.number().int().nonnegative();

export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const layerBits = z.number().int().min(0).max(0xffff);
