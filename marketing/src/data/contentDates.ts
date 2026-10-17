import { contentDates } from "./contentDates.generated";

/** The commit day a page last changed, or undefined for a route without one. */
export function routeUpdated(route: string): string | undefined {
  return contentDates.routes[route]?.date;
}

/** The commit day a storyboard film was added. */
export function storyboardUploadDate(slug: string): string | undefined {
  return contentDates.films[`storyboard:${slug}`];
}

/** The commit day an ad library video was added. */
export function adVideoUploadDate(slug: string): string | undefined {
  return contentDates.films[`ad:${slug}`];
}

/** A recipe run folder starts with the day it was made, e.g. `2026-09-14-…`. */
export function runDate(runId: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.exec(runId)?.[0];
}
