import { z } from "zod";

/**
 * Browser tool schemas.
 *
 * The browser exposes TWO addressing modes for every action that hits an
 * element:
 *   - index: numeric id from the element index (produced by browser_view),
 *     cheapest and most reliable for known web apps
 *   - coordinate_x/y: viewport coordinates, required for arbitrary GUI-like
 *     interactions (canvas, custom widgets, drag handles)
 *
 * At least one must be provided; index wins if both are set.
 */

const ElementRef = z
  .object({
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional()
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );

export const BrowserViewInput = z.object({
  include_screenshot: z.boolean().optional()
});
export type BrowserViewInput = z.infer<typeof BrowserViewInput>;

export const BrowserElement = z.object({
  index: z.number().int().nonnegative(),
  tag: z.string(),
  role: z.string().nullable(),
  text: z.string(),
  attributes: z.record(z.string(), z.string()),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
});
export type BrowserElement = z.infer<typeof BrowserElement>;

export const BrowserViewOutput = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  elements: z.array(BrowserElement),
  screenshot_png_b64: z.string().nullable()
});
export type BrowserViewOutput = z.infer<typeof BrowserViewOutput>;

export const BrowserNavigateInput = z.object({
  url: z.string().min(1),
  wait_until: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
});
export type BrowserNavigateInput = z.infer<typeof BrowserNavigateInput>;

export const BrowserNavigateOutput = z.object({
  url: z.string(),
  title: z.string(),
  status: z.number().int().nullable()
});
export type BrowserNavigateOutput = z.infer<typeof BrowserNavigateOutput>;

export const BrowserRestartInput = z.object({
  url: z.string().optional()
});
export type BrowserRestartInput = z.infer<typeof BrowserRestartInput>;

export const BrowserRestartOutput = z.object({
  url: z.string()
});
export type BrowserRestartOutput = z.infer<typeof BrowserRestartOutput>;

export const BrowserClickInput = ElementRef;
export type BrowserClickInput = z.infer<typeof BrowserClickInput>;

export const BrowserClickOutput = z.object({
  clicked: z.literal(true)
});
export type BrowserClickOutput = z.infer<typeof BrowserClickOutput>;

export const BrowserInputTextInput = z
  .object({
    text: z.string(),
    press_enter: z.boolean().optional(),
    index: z.number().int().nonnegative().optional(),
    coordinate_x: z.number().int().optional(),
    coordinate_y: z.number().int().optional()
  })
  .refine(
    (v) =>
      v.index !== undefined ||
      (v.coordinate_x !== undefined && v.coordinate_y !== undefined),
    { message: "provide either index or (coordinate_x, coordinate_y)" }
  );
export type BrowserInputTextInput = z.infer<typeof BrowserInputTextInput>;

export const BrowserInputTextOutput = z.object({
  typed: z.literal(true)
});
export type BrowserInputTextOutput = z.infer<typeof BrowserInputTextOutput>;

export const BrowserMoveMouseInput = z.object({
  coordinate_x: z.number().int(),
  coordinate_y: z.number().int()
});
export type BrowserMoveMouseInput = z.infer<typeof BrowserMoveMouseInput>;

export const BrowserMoveMouseOutput = z.object({
  moved: z.literal(true)
});
export type BrowserMoveMouseOutput = z.infer<typeof BrowserMoveMouseOutput>;

export const BrowserPressKeyInput = z.object({
  key: z.string().min(1)
});
export type BrowserPressKeyInput = z.infer<typeof BrowserPressKeyInput>;

export const BrowserPressKeyOutput = z.object({
  pressed: z.literal(true)
});
export type BrowserPressKeyOutput = z.infer<typeof BrowserPressKeyOutput>;

export const BrowserSelectOptionInput = z.object({
  index: z.number().int().nonnegative(),
  option: z.string()
});
export type BrowserSelectOptionInput = z.infer<typeof BrowserSelectOptionInput>;

export const BrowserSelectOptionOutput = z.object({
  selected: z.array(z.string())
});
export type BrowserSelectOptionOutput = z.infer<
  typeof BrowserSelectOptionOutput
>;

export const BrowserScrollInput = z.object({
  to_top: z.boolean().optional(),
  to_bottom: z.boolean().optional(),
  pixels: z.number().int().optional()
});
export type BrowserScrollInput = z.infer<typeof BrowserScrollInput>;

export const BrowserScrollOutput = z.object({
  scroll_y: z.number()
});
export type BrowserScrollOutput = z.infer<typeof BrowserScrollOutput>;

export const BrowserConsoleExecInput = z.object({
  javascript: z.string().min(1)
});
export type BrowserConsoleExecInput = z.infer<typeof BrowserConsoleExecInput>;

export const BrowserConsoleExecOutput = z.object({
  result_json: z.string()
});
export type BrowserConsoleExecOutput = z.infer<typeof BrowserConsoleExecOutput>;

export const BrowserConsoleViewInput = z.object({
  max_lines: z.number().int().positive().optional()
});
export type BrowserConsoleViewInput = z.infer<typeof BrowserConsoleViewInput>;

export const BrowserConsoleMessage = z.object({
  type: z.string(),
  text: z.string(),
  timestamp: z.number()
});
export type BrowserConsoleMessage = z.infer<typeof BrowserConsoleMessage>;

export const BrowserConsoleViewOutput = z.object({
  messages: z.array(BrowserConsoleMessage)
});
export type BrowserConsoleViewOutput = z.infer<typeof BrowserConsoleViewOutput>;
