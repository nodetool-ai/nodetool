/**
 * The App flow's config: Idea → Design (written, then reviewed) → Build.
 *
 * The one model call before the build is the design: the build's own Spec
 * stage, run alone, which writes the operations, the screen and the tests the
 * build is measured against. The creator edits that text, and the build gets
 * it back as a pinned spec, so what is built is what was read. Nothing is
 * created on the server until the build is green; until then the draft lives
 * in local storage under the guided tab's key.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  buildApplication,
  specifyApplication,
  type AppBuildProgress,
  type AppSpec
} from "../../../utils/applicationBuild";
import { installApplicationBundle } from "../../../utils/applicationBundle";
import { isObjectLike } from "../../../utils/typePredicates";
import type { SetupFlowConfig, SetupStep } from "../types";
import { PlannerModelFooterField } from "../workflow/CategoryStep";
import { AppIdeaStep } from "./IdeaStep";
import { AppReviewStep } from "./ReviewStep";
import { AppBuildStep } from "./BuildStep";
import {
  appBuildPendingLabel,
  appSpecGaps,
  emptyAppSetupDraft,
  readAppSetupDraft,
  writeAppSetupDraft,
  type AppSetupDraft,
  type AppSetupModel,
  type AppSetupStage
} from "./appSetupModel";

const FLOW_LABELS = {
  title: "App",
  subline:
    "Describe the page, review its design, then build and test-run it."
} as const;

/** The Spec stage's per-turn output bound, as the server reserves it. */
const SPEC_MAX_OUTPUT_TOKENS = 4096;

/** What one build may spend. Sent with the build, so the line shown holds. */
export const APP_BUILD_COST_CAP_USD = 2;

export interface BuiltApp {
  appId: string;
  name: string;
}

export interface AppSetupFlowOptions {
  /** Where the draft is kept: the guided tab, else the project. */
  draftKey: string;
  initialBrief: string;
  projectId: string;
  /** The model until the creator picks one; null when none is offered. */
  defaultModel: AppSetupModel | null;
  /** Makes an empty app, without the design. */
  createBlankApp: () => Promise<BuiltApp>;
  /** Runs once the app exists — the host opens it. */
  onFinish: (app: BuiltApp) => void;
}

export interface AppSetupFlowResult extends SetupFlowConfig<AppSetupStage> {
  brief: string;
}

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const useAppSetupFlow = ({
  draftKey,
  initialBrief,
  projectId,
  defaultModel,
  createBlankApp,
  onFinish
}: AppSetupFlowOptions): AppSetupFlowResult => {
  const [draft, setDraft] = useState<AppSetupDraft>(
    () => readAppSetupDraft(draftKey) ?? emptyAppSetupDraft(initialBrief)
  );
  useEffect(() => {
    writeAppSetupDraft(draftKey, draft);
  }, [draft, draftKey]);
  const update = useCallback(
    (patch: Partial<Omit<AppSetupDraft, "version">>) =>
      setDraft((current) => ({ ...current, ...patch })),
    []
  );

  const [startingBlank, setStartingBlank] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [redesigning, setRedesigning] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<AppBuildProgress | null>(
    null
  );
  const redesignRef = useRef<AbortController | null>(null);
  // A re-design answers onto the review, so it stops with the flow.
  useEffect(() => () => redesignRef.current?.abort(), []);

  const brief = draft.brief;
  const text = brief.trim();
  const spec = draft.spec;
  const model = draft.model ?? defaultModel;
  // Stepping back to read the brief must not throw the reviewed design away.
  const designIsCurrent = spec !== null && draft.specBrief === text;
  const gaps = useMemo(
    () => (spec ? appSpecGaps(spec) : ["a design"]),
    [spec]
  );
  const name = draft.name ?? spec?.title ?? "";

  const writeDesign = useCallback(
    async (signal?: AbortSignal) => {
      if (!model) {
        return;
      }
      const next = await specifyApplication({
        prompt: text,
        provider: model.provider,
        model: model.id,
        signal
      });
      update({ spec: next, specBrief: text });
    },
    [model, text, update]
  );

  const redesign = useCallback(() => {
    redesignRef.current?.abort();
    const controller = new AbortController();
    redesignRef.current = controller;
    setRedesigning(true);
    setDesignError(null);
    void writeDesign(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setDesignError(errorText(cause));
        }
      })
      .finally(() => {
        if (redesignRef.current === controller) {
          redesignRef.current = null;
          setRedesigning(false);
        }
      });
  }, [writeDesign]);

  const cancelRedesign = useCallback(() => {
    redesignRef.current?.abort();
    redesignRef.current = null;
    setRedesigning(false);
  }, []);

  const startBlank = useCallback(async () => {
    setBlankError(null);
    setStartingBlank(true);
    try {
      onFinish(await createBlankApp());
    } catch (cause) {
      setBlankError(errorText(cause));
    } finally {
      setStartingBlank(false);
    }
  }, [createBlankApp, onFinish]);

  const footerModel = useCallback(
    ({ readOnly }: { readOnly: boolean }) =>
      createElement(PlannerModelFooterField, {
        plannerModel: model,
        onPlannerModelChange: (next: AppSetupModel) => update({ model: next }),
        readOnly
      }),
    [model, update]
  );

  const steps = useMemo<SetupStep<AppSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: designIsCurrent
          ? "Continue to your design"
          : spec
            ? "Re-design the app"
            : "Write the design",
        canAdvance: !startingBlank && text.length > 0 && model !== null,
        // A blank app lands by leaving this flow, so Back and Change flow
        // wait until it has.
        holdNavigation: startingBlank,
        blockedReason: startingBlank
          ? "Creating your app"
          : text.length === 0
            ? "Describe the app first"
            : "Connect a provider to pick a model",
        generation: designIsCurrent
          ? undefined
          : {
              result:
                "Write a design: the workflows the app runs, what is on the screen, and the tests it must pass",
              next: "Review and edit it next. Nothing is built until the last step.",
              model,
              brief,
              maxOutputTokens: SPEC_MAX_OUTPUT_TOKENS
            },
        primaryDetail: designIsCurrent
          ? "Your design is unchanged — this keeps it."
          : undefined,
        pendingLabel: "Writing the design",
        footerControls: footerModel,
        render: (context) =>
          createElement(AppIdeaStep, {
            brief,
            onBriefChange: (next: string) => update({ brief: next }),
            onStartBlank: () => {
              void startBlank();
            },
            startingBlank,
            blankError,
            onDismissBlankError: () => setBlankError(null),
            readOnly: context?.readOnly ?? false
          }),
        onAdvance: async (context) => {
          if (designIsCurrent) {
            return;
          }
          await writeDesign(context?.signal);
        }
      },
      {
        stage: "review",
        label: "Design",
        primaryLabel: "Continue to the build",
        // A re-design answers onto this step, so Back waits for it.
        holdNavigation: redesigning,
        canAdvance: !redesigning && gaps.length === 0,
        blockedReason: redesigning
          ? "Re-designing the app"
          : `Write ${gaps.join(", ")}`,
        footerControls: footerModel,
        render: (context) =>
          spec
            ? createElement(AppReviewStep, {
                spec,
                onSpecChange: (next: AppSpec) => update({ spec: next }),
                onRedesign: redesign,
                redesignPending: redesigning,
                onCancelRedesign: cancelRedesign,
                error: designError,
                readOnly: context?.readOnly ?? false
              })
            : null
      },
      {
        stage: "build",
        label: "Build",
        primaryLabel: "Build your app",
        primaryDetail: `Plans the workflows, places the screen and test-runs it, up to ${formatUsd(APP_BUILD_COST_CAP_USD)}`,
        canAdvance:
          spec !== null &&
          gaps.length === 0 &&
          model !== null &&
          name.trim().length > 0,
        blockedReason:
          model === null
            ? "Connect a provider to pick a model"
            : name.trim().length === 0
              ? "Name your app"
              : "Finish the design first",
        // Study 8: one fixed sentence through a minute of building read as
        // stalled, so the label follows the stage the server reports.
        pendingLabel: appBuildPendingLabel(
          buildProgress,
          spec?.operations.some((op) => !op.workflowId) ?? true
        ),
        footerControls: footerModel,
        render: (context) =>
          spec
            ? createElement(AppBuildStep, {
                spec,
                name,
                onNameChange: (next: string) => update({ name: next }),
                progress: buildProgress,
                readOnly: context?.readOnly ?? false
              })
            : null,
        onAdvance: async (context) => {
          if (!spec || !model) {
            return false;
          }
          setBuildProgress(null);
          const built = await buildApplication({
            prompt: text,
            spec,
            provider: model.provider,
            model: model.id,
            costCapUsd: APP_BUILD_COST_CAP_USD,
            onProgress: setBuildProgress,
            signal: context?.signal
          }).finally(() => setBuildProgress(null));
          const appName = name.trim();
          // A failed install otherwise surfaced as the bare HTTP text ("Not
          // found"), which reads as the build failing.
          const installed = await installApplicationBundle(
            isObjectLike(built.bundle)
              ? { ...built.bundle, name: appName }
              : built.bundle,
            projectId
          ).catch((cause: unknown) => {
            throw new Error(
              `The app passed its tests, but adding it to your project failed: ${errorText(cause)}`
            );
          });
          onFinish({ appId: installed.id, name: installed.name || appName });
          return true;
        }
      }
    ],
    [
      blankError,
      brief,
      buildProgress,
      cancelRedesign,
      designError,
      designIsCurrent,
      footerModel,
      gaps,
      model,
      name,
      onFinish,
      projectId,
      redesign,
      redesigning,
      spec,
      startBlank,
      startingBlank,
      text,
      update,
      writeDesign
    ]
  );

  const onStageChange = useCallback(
    (stage: AppSetupStage) => update({ stage }),
    [update]
  );

  return {
    labels: FLOW_LABELS,
    steps,
    stage: draft.stage,
    onStageChange,
    brief
  };
};

export default useAppSetupFlow;
