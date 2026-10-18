/**
 * The App flow: a description in, a mini app that runs out (study-6-I1).
 *
 * "New app" opens an empty builder whose button runs nothing until a workflow
 * made elsewhere is bound to it. This flow asks for the page in a sentence,
 * writes a design the creator reviews (the workflows behind the screen, the
 * screen itself, and the tests the app must pass), then has the app build
 * harness make exactly that and test-run it. The app is installed only when
 * that run is green. Nothing is created before then, so leaving the flow
 * leaves nothing behind but its draft in this tab.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { useLanguageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useRecommendedModelKeys } from "../../../hooks/useRecommendedModelKeys";
import { useCreateApplication } from "../../../hooks/useApplications";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { SetupFlow } from "../SetupFlow";
import { pickDefaultPlannerModel } from "../workflow/defaultPlannerModel";
import { clearAppSetupDraft, sweepClosedAppDrafts } from "./appSetupModel";
import { useAppSetupFlow, type BuiltApp } from "./useAppSetupFlow";

export type { BuiltApp };

export interface AppSetupHostProps {
  projectId: string;
  /** The guided tab this flow runs in; its draft is kept under this key. */
  draftKey?: string;
  initialBrief: string;
  /** Runs once the app is installed — the host opens it. */
  onFinish: (app: BuiltApp) => void;
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

const AppSetupHost: React.FC<AppSetupHostProps> = ({
  projectId,
  draftKey,
  initialBrief,
  onFinish,
  onChangeFlow
}) => {
  const key = draftKey ?? projectId;
  const language = useLanguageModelsByProvider();
  const recommendedKeys = useRecommendedModelKeys();
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const createApplication = useCreateApplication();
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

  // Drafts left by guided tabs that closed while another flow ran go when an
  // App flow opens.
  useEffect(() => {
    sweepClosedAppDrafts(
      new Set([
        key,
        ...useWorkspaceTabsStore
          .getState()
          .tabs.filter((tab) => tab.type === "guided-flow")
          .map((tab) => tab.ref)
      ])
    );
  }, [key]);

  // A draft keyed by a guided tab can only be recovered by that tab, so it
  // goes when the tab closes. Unmounting with the tab still open keeps it.
  useEffect(() => {
    if (!draftKey) {
      return;
    }
    return () => {
      const tabOpen = useWorkspaceTabsStore
        .getState()
        .tabs.some((tab) => tab.type === "guided-flow" && tab.ref === draftKey);
      if (!tabOpen) {
        clearAppSetupDraft(draftKey);
      }
    };
  }, [draftKey]);

  const finishedRef = useRef(false);
  const handleFinish = useCallback(
    (app: BuiltApp) => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      clearAppSetupDraft(key);
      onFinish(app);
    },
    [key, onFinish]
  );

  const createBlankApp = useCallback(async (): Promise<BuiltApp> => {
    const created = await createApplication.mutateAsync({
      name: "Untitled app",
      description: "",
      projectId
    });
    return { appId: created.id, name: created.name };
  }, [createApplication, projectId]);

  const config = useAppSetupFlow({
    draftKey: key,
    initialBrief,
    projectId,
    defaultModel,
    createBlankApp,
    onFinish: handleFinish
  });

  const brief = config.brief;
  const handleChangeFlow = useCallback(() => {
    clearAppSetupDraft(key);
    return onChangeFlow?.(brief);
  }, [brief, key, onChangeFlow]);

  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

export default AppSetupHost;
