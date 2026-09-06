import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { recipes } from "@nodetool-ai/protocol/api-schemas";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useOnboardingStore from "../stores/OnboardingStore";
import { installExampleApp } from "../utils/applicationBundle";
import { useOpenApplication } from "./useOpenApplication";

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
  /** Slug of the app being installed, else null. */
  installingApp: string | null;
  /** Copy one step into the library and open it. */
  openStep: (slug: string, step: CopyableStep) => Promise<void>;
  /** Install one of the recipe's apps and open it. */
  installApp: (appSlug: string) => Promise<void>;
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
 * A recipe installs through the paths its parts already have: its app is the
 * example-app install, and each step is the copy a single template takes. The
 * recipe itself needs no import format of its own.
 */
export const useRecipeActions = (): RecipeActions => {
  const navigate = useNavigate();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const openApplication = useOpenApplication();
  const [copyingStep, setCopyingStep] = useState<string | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [installingApp, setInstallingApp] = useState<string | null>(null);

  const busy =
    copyingStep !== null || addingSlug !== null || installingApp !== null;

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

  const installApp = useCallback(
    async (appSlug: string) => {
      if (busy) return;
      useOnboardingStore.getState().markStep("open-template");
      setInstallingApp(appSlug);
      try {
        // The install creates the app and every workflow it binds, so the
        // chain lands in the library alongside the surface that drives it.
        const installed = await installExampleApp(appSlug);
        openApplication(installed.id, installed.name);
      } catch (error) {
        console.error("Error installing recipe app:", error);
      } finally {
        setInstallingApp(null);
      }
    },
    [busy, openApplication]
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

  return { copyingStep, addingSlug, installingApp, openStep, installApp, addRecipe };
};
