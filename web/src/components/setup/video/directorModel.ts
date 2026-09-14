/**
 * Which language model drafts the beats (PRD § 8.2).
 *
 * The step used to run on the curated NodeTool director with no way to change
 * it, so an install whose server holds no platform key for the director's
 * delegate reached the plan button and failed there with
 * `missing NODETOOL_PLATFORM_ANTHROPIC_KEY` and nothing to change. The catalog
 * already answers that question — a provider only reports a model it can
 * serve — so the flow picks from what the configured providers report, and
 * offers the choice rather than hiding it.
 *
 * The pick is written onto the document, so a reload, a second host and a
 * re-plan all run the model the estimate was shown for.
 */

import { useCallback, useEffect, useMemo } from "react";
import type { TimelineSetup } from "@nodetool-ai/timeline";

import { STUDIO_DIRECTOR_MODEL } from "../../../studio/curatedModels";
import { useLanguageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { LanguageModelValue } from "../../../stores/ApiTypes";

export type DirectorModelRef = NonNullable<TimelineSetup["directorModel"]>;

/** A model as the catalog reports it. */
interface CatalogModel {
  id: string;
  provider?: string | null;
  name?: string | null;
}

/** The option key: a model id is only unique within its provider. */
export const directorModelKey = (model: {
  id: string;
  provider?: string | null;
}): string => `${model.provider ?? ""}::${model.id}`;

const toRef = (model: CatalogModel): DirectorModelRef => ({
  id: model.id,
  provider: model.provider ?? "",
  name: model.name ?? model.id
});

const sameModel = (
  left: { id: string; provider?: string | null },
  right: { id: string; provider?: string | null }
): boolean =>
  left.id === right.id &&
  (left.provider ?? "").toLowerCase() === (right.provider ?? "").toLowerCase();

/**
 * The model to direct with, given what the creator picked and what the
 * providers report. A stored pick the catalog no longer lists is not honoured:
 * an unservable model is the failure this picker exists to prevent, so it
 * falls back to the curated director and then to whatever is offered.
 */
export const resolveDirectorModel = (
  stored: DirectorModelRef | undefined,
  catalog: readonly CatalogModel[]
): DirectorModelRef | null => {
  const listed = (ref: { id: string; provider?: string | null } | undefined) =>
    ref ? catalog.find((model) => sameModel(model, ref)) : undefined;
  const match = listed(stored) ?? listed(STUDIO_DIRECTOR_MODEL) ?? catalog[0];
  return match ? toRef(match) : null;
};

/** The value shape `planBeats` takes. */
export const toLanguageModelValue = (
  ref: DirectorModelRef
): LanguageModelValue => ({
  type: "language_model",
  id: ref.id,
  provider: ref.provider as LanguageModelValue["provider"],
  name: ref.name ?? ref.id
});

export interface DirectorModelState {
  /** The resolved pick, or null while nothing can be resolved. */
  model: DirectorModelRef | null;
  /** Every language model a configured provider reports. */
  options: DirectorModelRef[];
  select: (key: string) => void;
  loading: boolean;
  /** Why the list could not be read, in the creator's words. */
  error: string | null;
  /** No configured provider offers a language model at all. */
  noProvider: boolean;
}

/**
 * The picker's state. Stamps the resolved model onto the document as soon as
 * the catalog answers, so the estimate, the run and a later re-plan all read
 * one field rather than each re-deriving a default of their own.
 */
export const useDirectorModel = (): DirectorModelState => {
  const stored = useTimelineStore((state) => state.setup?.directorModel);
  // A sequence with no `setup` belongs to the editor, not to the flow. Writing
  // a model onto it would start a setup at stage `idea` and drop the sequence
  // into the guided flow, so nothing is stamped until a setup exists.
  const hasSetup = useTimelineStore((state) => state.setup != null);
  const setSetup = useTimelineStore((state) => state.setSetup);
  const { models, providers, isLoading, error } = useLanguageModelsByProvider();

  const options = useMemo(() => models.map(toRef), [models]);
  // A list that has not answered yet is no reason to drop a stored pick: only
  // a catalog that did answer can say a model is not servable here.
  const model = useMemo(
    () =>
      isLoading || error
        ? (stored ?? null)
        : resolveDirectorModel(stored, models),
    [error, isLoading, models, stored]
  );

  useEffect(() => {
    if (!hasSetup || !model || (stored && sameModel(stored, model))) {
      return;
    }
    setSetup({ directorModel: model });
  }, [hasSetup, model, setSetup, stored]);

  const select = useCallback(
    (key: string) => {
      const picked = options.find((option) => directorModelKey(option) === key);
      if (picked) {
        setSetup({ directorModel: picked });
      }
    },
    [options, setSetup]
  );

  return {
    model,
    options,
    select,
    loading: isLoading,
    error: error ? error.message : null,
    noProvider: !isLoading && !error && providers.length === 0
  };
};
