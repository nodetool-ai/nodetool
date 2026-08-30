/**
 * The timeline casts, kept apart from `index.ts` so a consumer (or the demo
 * page) can reach the cast data without pulling in the editor behind it —
 * the same split `../doc/casts.ts` makes for the document casts.
 */
import { heroTimelineCast } from "../hero/heroTimelineCast";
import { promoTimelineCast } from "./promoTimelineCast";
import type { TimelineDemoCast } from "./timelineCastTypes";
import { timelineEditingCast } from "./timelineEditingCast";

export const timelineCasts: TimelineDemoCast[] = [
  promoTimelineCast,
  timelineEditingCast,
  heroTimelineCast
];
