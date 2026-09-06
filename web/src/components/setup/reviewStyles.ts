/**
 * The plan review's visual language, shared by the flows that show a plan
 * before anything is spent.
 *
 * Every field draws its own box at rest. The earlier rule was the opposite —
 * chrome only under the pointer or focus, on the grounds that a review is read
 * far more often than it is edited — and the complaint it produced was that the
 * screenplay "barely looks editable". A reader who cannot tell the text is
 * editable never edits it, which costs more than the quiet gained.
 *
 * Each item of the plan is bounded by a bordered card, and the column stops
 * well before the viewport so the words read as prose.
 *
 * `PlanReview` renders most flows against these; the workflow step list draws
 * its own items, because it carries per-step actions and markers a generic row
 * cannot. Both read the constants from here, so the two cannot drift apart —
 * they did, and the review looked like two different products.
 */

import { BORDER_RADIUS, MOTION, SPACING, reducedMotion } from "../ui_primitives";

/** The review reads as prose, so the column stops well before the viewport. */
export const REVIEW_CONTENT_WIDTH = 720;

/**
 * A plan whose items are grouped — a screenplay's scenes, each holding its
 * shots — puts the scene's own fields in a rail beside its shots instead of
 * above them. That needs two prose columns, not one.
 */
export const REVIEW_WIDE_WIDTH = 1180;

/** The scene rail: wide enough for a slugline, narrow enough to stay a rail. */
export const REVIEW_RAIL_WIDTH = 300;

/** A short field keeps this column; everything else takes the rest of a line. */
export const REVIEW_COMPACT_WIDTH = 168;

/**
 * The width the flexible half of a shared line needs before the line is worth
 * keeping. Below it the row wraps and the fields stack, because a speaker
 * column beside a squeezed line of dialogue is unreadable — in a narrow pane,
 * at 200% zoom, or in the storyboard's scene rail.
 */
export const REVIEW_FLEX_MIN_WIDTH = 220;

/**
 * A field that shows it is a field. Spread it on a wrapper around the control,
 * not on the control.
 */
export const EDITABLE_FIELD = {
  "& .MuiOutlinedInput-root.MuiOutlinedInput-root": {
    backgroundColor: "background.paper",
    transition: MOTION.background,
    ...reducedMotion({ transition: MOTION.none })
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "divider",
    transition: MOTION.border,
    ...reducedMotion({ transition: MOTION.none })
  },
  "&:hover .MuiOutlinedInput-root.MuiOutlinedInput-root": {
    backgroundColor: "action.hover"
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "divider"
  },
  "& .Mui-focused.MuiOutlinedInput-root.MuiOutlinedInput-root": {
    backgroundColor: "action.hover"
  },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderWidth: 1,
    borderColor: "primary.main"
  }
} as const;

/**
 * One item of the plan — a shot of a scene, a step of a workflow. The card is
 * what says where the item starts and stops; a numbered heading alone left the
 * items reading as one long column of fields.
 */
export const REVIEW_BLOCK = {
  border: "1px solid",
  borderRadius: BORDER_RADIUS.sm,
  padding: SPACING.lg,
  borderColor: "divider",
  backgroundColor: "background.default",
  transition: MOTION.border,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover": { borderColor: "text.disabled" }
} as const;

/**
 * A scene: the container that holds a rail of scene fields and the shots that
 * belong to it. It is a surface of its own, one level above its shots, because
 * a header alone did not say where one scene ended and the next began.
 */
export const REVIEW_SCENE = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: BORDER_RADIUS.md,
  backgroundColor: "background.paper",
  overflow: "hidden"
} as const;

/**
 * The scene rail — its number, its size, its slugline and lighting. It sits
 * beside the shots on a wide viewport and above them on a narrow one, so the
 * divider moves from the right edge to the bottom.
 */
export const REVIEW_SCENE_RAIL = {
  flex: {
    xs: "1 1 100%",
    md: `0 0 ${REVIEW_RAIL_WIDTH}px`
  },
  minWidth: 0,
  padding: SPACING.lg,
  borderBottom: { xs: "1px solid", md: "none" },
  borderRight: { xs: "none", md: "1px solid" },
  borderColor: { xs: "divider", md: "divider" }
} as const;
