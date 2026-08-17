import { useMemo } from "react";
import useModelPreferencesStore from "../stores/ModelPreferencesStore";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { useLanguageModelsByProvider } from "./useModelsByProvider";
import { DEFAULT_MODEL } from "../config/constants";
import type { LanguageModel } from "../stores/ApiTypes";

/** Preference key holding the model that authors Code Node code. */
export const CODE_MODEL_PREFERENCE = "code_model";

/** Where a resolved model came from, in fallback order. */
export type CodeAuthoringModelSource =
  | "code_preference"
  | "chat"
  | "language_model_preference"
  | "application_default";

interface CodeAuthoringModel {
  provider: string;
  id: string;
  name: string;
}

export type CodeAuthoringSkipReason = "no_tool_support" | "unknown_model";

interface SkippedCodeAuthoringCandidate {
  model: CodeAuthoringModel;
  source: CodeAuthoringModelSource;
  reason: CodeAuthoringSkipReason;
}

interface CodeAuthoringModelResult {
  /** The model to generate with, or null while loading or when blocked. */
  model: CodeAuthoringModel | null;
  source: CodeAuthoringModelSource | null;
  /** Candidates passed over, in the order they were tried. */
  skipped: SkippedCodeAuthoringCandidate[];
  isLoading: boolean;
  /** The catalog loaded and no candidate supports tool calling. */
  isBlocked: boolean;
}

interface Candidate {
  model: CodeAuthoringModel;
  source: CodeAuthoringModelSource;
}

const isConcreteProvider = (provider: string): boolean =>
  provider !== "" && provider !== "empty";

function findInCatalog(
  models: LanguageModel[],
  candidate: CodeAuthoringModel
): LanguageModel | undefined {
  if (isConcreteProvider(candidate.provider)) {
    const provider = candidate.provider.toLowerCase();
    return models.find(
      (m) => m.id === candidate.id && (m.provider ?? "").toLowerCase() === provider
    );
  }
  return models.find((m) => m.id === candidate.id);
}

/**
 * Resolve the model that writes Code Node code.
 *
 * Order: the `code_model` preference, the active chat model, the
 * `language_model` preference, the application default. Candidates the
 * provider declares as non-tool-capable are skipped — the generated code
 * arrives as a tool call. The model is never stored on the node.
 */
export function useCodeAuthoringModel(): CodeAuthoringModelResult {
  const codeDefault = useModelPreferencesStore(
    (s) => s.defaults[CODE_MODEL_PREFERENCE]
  );
  const languageDefault = useModelPreferencesStore(
    (s) => s.defaults["language_model"]
  );
  const chatModel = useGlobalChatStore((s) => s.selectedModel);
  const { models, isLoading } = useLanguageModelsByProvider();

  const candidates = useMemo<Candidate[]>(() => {
    const raw: Array<{
      source: CodeAuthoringModelSource;
      model: Partial<CodeAuthoringModel> | undefined | null;
    }> = [
      { source: "code_preference", model: codeDefault },
      { source: "chat", model: chatModel },
      { source: "language_model_preference", model: languageDefault },
      {
        source: "application_default",
        model: { provider: "", id: DEFAULT_MODEL, name: DEFAULT_MODEL }
      }
    ];

    const seen = new Set<string>();
    const result: Candidate[] = [];
    for (const { source, model } of raw) {
      if (!model?.id) {
        continue;
      }
      const provider = model.provider ?? "";
      const key = `${provider}:${model.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push({
        source,
        model: { provider, id: model.id, name: model.name ?? "" }
      });
    }
    return result;
  }, [codeDefault, chatModel, languageDefault]);

  return useMemo<CodeAuthoringModelResult>(() => {
    if (isLoading) {
      return {
        model: null,
        source: null,
        skipped: [],
        isLoading: true,
        isBlocked: false
      };
    }

    const skipped: SkippedCodeAuthoringCandidate[] = [];
    for (const candidate of candidates) {
      const match = findInCatalog(models, candidate.model);
      if (!match) {
        skipped.push({ ...candidate, reason: "unknown_model" });
        continue;
      }
      if (match.supports_tools === false) {
        skipped.push({ ...candidate, reason: "no_tool_support" });
        continue;
      }
      return {
        model: {
          provider: match.provider ?? candidate.model.provider,
          id: match.id,
          name: match.name || candidate.model.name || match.id
        },
        source: candidate.source,
        skipped,
        isLoading: false,
        isBlocked: false
      };
    }

    return {
      model: null,
      source: null,
      skipped,
      isLoading: false,
      isBlocked: true
    };
  }, [candidates, models, isLoading]);
}

export default useCodeAuthoringModel;
