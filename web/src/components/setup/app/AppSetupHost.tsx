/**
 * The App flow: a description in, a mini app that runs out (study-6-I1).
 *
 * "New app" opens an empty builder whose button runs nothing until a workflow
 * made elsewhere is bound to it. This flow asks for the page in a sentence,
 * has the app build harness make the screen and the workflow behind its
 * button and test-run them together, and installs the app only when that run
 * is green. Nothing is created before the build succeeds, so leaving the flow
 * leaves nothing behind.
 */

import React, { useCallback, useMemo, useState } from "react";

import { useLanguageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useRecommendedModelKeys } from "../../../hooks/useRecommendedModelKeys";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { FlexColumn, GAP, Text, TextInput } from "../../ui_primitives";
import { buildApplication } from "../../../utils/applicationBuild";
import { installApplicationBundle } from "../../../utils/applicationBundle";
import { SetupFlow } from "../SetupFlow";
import type { SetupFlowConfig, SetupOperationContext } from "../types";
import { PlannerModelFooterField } from "../workflow/CategoryStep";
import {
  pickDefaultPlannerModel,
  type PlannerModelChoice
} from "../workflow/defaultPlannerModel";

export interface BuiltApp {
  appId: string;
  name: string;
}

export interface AppSetupHostProps {
  projectId: string;
  initialBrief: string;
  /** Runs once the built app is installed — the host opens it. */
  onFinish: (app: BuiltApp) => void;
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

type AppSetupStage = "idea";

const AppSetupHost: React.FC<AppSetupHostProps> = ({
  projectId,
  initialBrief,
  onFinish,
  onChangeFlow
}) => {
  const [brief, setBrief] = useState(initialBrief);
  const [pickedModel, setPickedModel] = useState<PlannerModelChoice | null>(
    null
  );
  const language = useLanguageModelsByProvider();
  const recommendedKeys = useRecommendedModelKeys();
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const defaultModel = useMemo(
    () =>
      pickDefaultPlannerModel(
        language.models.map((model) => ({
          provider: model.provider,
          id: model.id
        })),
        chatModel,
        recommendedKeys
      ),
    [chatModel, language.models, recommendedKeys]
  );
  const model = pickedModel ?? defaultModel;
  const text = brief.trim();

  const build = useCallback(
    async (context?: SetupOperationContext) => {
      if (!model) {
        return false;
      }
      const built = await buildApplication({
        prompt: text,
        provider: model.provider,
        model: model.id,
        signal: context?.signal
      });
      const installed = await installApplicationBundle(
        built.bundle,
        projectId
      );
      onFinish({ appId: installed.id, name: installed.name || built.name });
      return true;
    },
    [model, onFinish, projectId, text]
  );

  const config = useMemo<SetupFlowConfig<AppSetupStage>>(
    () => ({
      labels: {
        title: "App",
        subline:
          "Describe the page. The screen and the workflow behind its button are built and test-run together."
      },
      stage: "idea",
      onStageChange: () => {},
      steps: [
        {
          stage: "idea",
          label: "Idea",
          primaryLabel: "Build your app",
          canAdvance: text.length > 0 && model !== null,
          blockedReason:
            text.length === 0
              ? "Describe the app first"
              : "Connect a provider to pick a model",
          pendingLabel: "Building the screen and its workflow, then test-running them",
          onAdvance: build,
          footerControls: ({ readOnly }) => (
            <PlannerModelFooterField
              plannerModel={model}
              onPlannerModelChange={setPickedModel}
              readOnly={readOnly}
            />
          ),
          render: () => (
            <FlexColumn gap={GAP.comfortable}>
              <Text size="big" component="h2">
                What should the app do?
              </Text>
              <TextInput
                value={brief}
                autoFocus
                multiline
                rows={4}
                label="The app"
                hideLabel
                placeholder="A page where I type a product name, press a button, and get a short description back"
                helperText="Say what someone types or picks, what the button does, and what they get back."
                onChange={(event) => setBrief(event.target.value)}
              />
            </FlexColumn>
          )
        }
      ]
    }),
    [brief, build, model, text]
  );

  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(brief),
    [brief, onChangeFlow]
  );

  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

export default AppSetupHost;
