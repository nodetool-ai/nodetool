import { z } from "zod";

/**
 * Desktop (X11) tool schemas — CUA-style computer control.
 *
 * Coordinates are screen pixels. Keys use xdotool syntax (e.g. "Return",
 * "ctrl+c", "alt+Tab"). Screenshots are returned as base64 PNG.
 */

export const ScreenCaptureInput = z.object({
  region: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive()
    })
    .optional(),
  format: z.enum(["png", "jpeg"]).optional()
});
export type ScreenCaptureInput = z.infer<typeof ScreenCaptureInput>;

export const ScreenCaptureOutput = z.object({
  image_b64: z.string(),
  format: z.enum(["png", "jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});
export type ScreenCaptureOutput = z.infer<typeof ScreenCaptureOutput>;

export const ScreenFindInput = z.object({
  query: z.string().min(1),
  region: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive()
    })
    .optional()
});
export type ScreenFindInput = z.infer<typeof ScreenFindInput>;

export const ScreenMatch = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int()
});
export type ScreenMatch = z.infer<typeof ScreenMatch>;

export const ScreenFindOutput = z.object({
  matches: z.array(ScreenMatch)
});
export type ScreenFindOutput = z.infer<typeof ScreenFindOutput>;

export const MouseMoveInput = z.object({
  x: z.number().int(),
  y: z.number().int(),
  duration_ms: z.number().int().nonnegative().optional()
});
export type MouseMoveInput = z.infer<typeof MouseMoveInput>;

export const MouseMoveOutput = z.object({
  moved: z.literal(true)
});
export type MouseMoveOutput = z.infer<typeof MouseMoveOutput>;

export const MouseButton = z.enum(["left", "middle", "right"]);
export type MouseButton = z.infer<typeof MouseButton>;

export const MouseClickInput = z.object({
  x: z.number().int(),
  y: z.number().int(),
  button: MouseButton.optional(),
  count: z.number().int().positive().optional()
});
export type MouseClickInput = z.infer<typeof MouseClickInput>;

export const MouseClickOutput = z.object({
  clicked: z.literal(true)
});
export type MouseClickOutput = z.infer<typeof MouseClickOutput>;

export const MouseDragInput = z.object({
  from_x: z.number().int(),
  from_y: z.number().int(),
  to_x: z.number().int(),
  to_y: z.number().int(),
  duration_ms: z.number().int().nonnegative().optional(),
  button: MouseButton.optional()
});
export type MouseDragInput = z.infer<typeof MouseDragInput>;

export const MouseDragOutput = z.object({
  dragged: z.literal(true)
});
export type MouseDragOutput = z.infer<typeof MouseDragOutput>;

export const MouseScrollInput = z.object({
  x: z.number().int(),
  y: z.number().int(),
  dy: z.number().int(),
  dx: z.number().int().optional()
});
export type MouseScrollInput = z.infer<typeof MouseScrollInput>;

export const MouseScrollOutput = z.object({
  scrolled: z.literal(true)
});
export type MouseScrollOutput = z.infer<typeof MouseScrollOutput>;

export const KeyPressInput = z.object({
  keys: z.string().min(1)
});
export type KeyPressInput = z.infer<typeof KeyPressInput>;

export const KeyPressOutput = z.object({
  pressed: z.literal(true)
});
export type KeyPressOutput = z.infer<typeof KeyPressOutput>;

export const KeyTypeInput = z.object({
  text: z.string(),
  delay_ms: z.number().int().nonnegative().optional()
});
export type KeyTypeInput = z.infer<typeof KeyTypeInput>;

export const KeyTypeOutput = z.object({
  typed: z.literal(true)
});
export type KeyTypeOutput = z.infer<typeof KeyTypeOutput>;

export const CursorPositionInput = z.object({}).optional();
export type CursorPositionInput = z.infer<typeof CursorPositionInput>;

export const CursorPositionOutput = z.object({
  x: z.number().int(),
  y: z.number().int()
});
export type CursorPositionOutput = z.infer<typeof CursorPositionOutput>;
