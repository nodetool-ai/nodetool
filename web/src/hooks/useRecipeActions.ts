import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { recipes } from "@nodetool-ai/protocol/api-schemas";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useOnboardingStore from "../stores/OnboardingStore";

type Recipe = recipes.ExampleRecipeSummary;

/** What a step needs to become a workflow in the user's library. */
interface CopyableStep {
  example: string;
  packageName: string;
  description: string;
}

interface RecipeActions {
  /** `<slug>:<example>` while that step is being copied, else null. */
  copyingStep: string | null;
  /** Slug of the recipe whose whole chain is being added, else null. */
  addingSlug: string | null;
  /** Copy one step into the library and open it. */
  openStep: (slug: string, step: CopyableStep) => Promise<void>;
  /** Copy every step of a recipe, in order, then open the first. */
  addRecipe: (recipe: Recipe) => Promise<void>;
}

const requestFor = (step: CopyableStep) => ({
  name: step.example,
  package_name: step.packageName,
  description: step.description,
  tags: ["example"],
  access: "private",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

/**
 * Copying a recipe is copying the examples it names, one per step — the same
 * path a single template takes, so a recipe needs no import format of its own.
 */
export const useRecipeActions = (): RecipeActions => {
  const navigate = useNavigate();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [copyingStep, setCopyingStep] = useState<string | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);

  const busy = copyingStep !== null || addingSlug !== null;

  const openStep = useCallback(
    async (slug: string, step: CopyableStep) => {
      if (busy) return;
      useOnboardingStore.getState().markStep("open-template");
      setCopyingStep(`${slug}:${step.example}`);
      try {
        const created = await createWorkflow(
          requestFor(step),
          step.packageName,
          step.example
        );
        navigate(`/editor/${created.id}`);
      } catch (error) {
        console.error("Error copying recipe step:", error);
      } finally {
        setCopyingStep(null);
      }
    },
    [busy, createWorkflow, navigate]
  );

  const addRecipe = useCallback(
    async (recipe: Recipe) => {
      if (busy) return;
      useOnboardingStore.getState().markStep("open-template");
      setAddingSlug(recipe.slug);
      try {
        let firstId: string | null = null;
        for (const step of recipe.steps) {
          const created = await createWorkflow(
            requestFor(step),
            step.packageName,
            step.example
          );
          firstId ??= created.id;
        }
        if (firstId) {
          navigate(`/editor/${firstId}`);
        }
      } catch (error) {
        console.error("Error adding recipe:", error);
      } finally {
        setAddingSlug(null);
      }
    },
    [busy, createWorkflow, navigate]
  );

  return { copyingStep, addingSlug, openStep, addRecipe };
};
