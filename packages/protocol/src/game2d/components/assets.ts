import { z } from "zod";
import { finite, frame } from "./common.js";

export const gameSheetPreparation = z.strictObject({
  cols: z.number().int().min(1).max(64),
  rows: z.number().int().min(1).max(64),
  baseline: z.number().int().min(0).max(4095).optional()
});

export const gameTilesetPreparation = z.strictObject({
  tileWidth: z.number().int().min(1).max(1024).default(32),
  tileHeight: z.number().int().min(1).max(1024).default(32),
  edges: z.number().int().min(1).max(64).default(2),
  highlight: finite.min(1).max(2).default(1.16),
  shadow: finite.min(0).max(1).default(0.72)
}).refine((settings) => settings.edges * 2 <= Math.min(settings.tileWidth, settings.tileHeight),
  "edge width must leave room for the tile interior");

export const gameLutPreparation = z.strictObject({
  size: z.number().int().min(2).max(32).default(16),
  brightness: finite.min(-1).max(1).default(0),
  contrast: finite.min(0).max(2).default(1),
  saturation: finite.min(0).max(2).default(1),
  lift: z.tuple([finite.min(-1).max(1), finite.min(-1).max(1), finite.min(-1).max(1)]).default([0, 0, 0]),
  gain: z.tuple([finite.min(0).max(2), finite.min(0).max(2), finite.min(0).max(2)]).default([1, 1, 1]),
  gamma: z.tuple([finite.min(0.1).max(4), finite.min(0.1).max(4), finite.min(0.1).max(4)]).default([1, 1, 1])
});

export const gameImagePreparation = z.strictObject({
  trimAlpha: z.boolean(),
  targetWidth: z.number().int().positive().optional(),
  targetHeight: z.number().int().positive().optional(),
  cropPolicy: z.enum(["cover", "contain", "stretch"]).optional(),
  mirrorX: z.boolean(),
  mirrorY: z.boolean(),
  sheet: gameSheetPreparation.optional(),
  tileset: gameTilesetPreparation.optional(),
  lut: gameLutPreparation.optional()
});

export const gameAssetBinding = z.strictObject({
  assetId: z.string().min(1),
  digest: z.string().min(1),
  mediaKind: z.enum(["image", "audio", "font"]).default("image"),
  fontFormat: z.enum(["ttf", "otf"]).optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: frame.optional(),
  pivot: z.strictObject({ x: finite.min(0).max(1), y: finite.min(0).max(1) }).default({ x: 0.5, y: 0.5 }),
  sampling: z.enum(["nearest", "linear"]).default("nearest"),
  required: z.boolean().optional(),
  preparation: gameImagePreparation.optional(),
  originalDimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  trim: z.strictObject({ sourceWidth: z.number().int().positive(), sourceHeight: z.number().int().positive(), x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).optional(),
  referenceAssetId: z.string().optional(),
  provenance: z.string().optional()
});

export type GameAssetBinding = z.infer<typeof gameAssetBinding>;
