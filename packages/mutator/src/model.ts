import type { RawSite } from "./sites.js";

/** One replacement inside a function. */
export interface Site extends RawSite {
  file: string;
  namespace: string;
  formId: string;
  name: string;
  mutationId: string;
}

export type Outcome = "killed" | "survived";
export type Status = Outcome | "uncovered";

export function describeSite(site: Pick<Site, "original" | "mutant">): string {
  return site.mutant === "" ? `delete ${site.original}` : `${site.original} -> ${site.mutant}`;
}

/** Killed, survived, and uncovered totals for one function. */
export interface FormResult {
  id: string;
  namespace: string;
  name: string;
  private: boolean;
  file: string;
  line: number;
  endLine: number;
  digest: string;
  killed: number;
  survived: number;
  uncovered: number;
  sites: number;
}

export function formScore(form: Pick<FormResult, "killed" | "survived">): number | null {
  const executed = form.killed + form.survived;
  return executed === 0 ? null : form.killed / executed;
}
