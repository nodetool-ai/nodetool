import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import type { Entity } from "@nodetool-ai/protocol";

import { useEntities, useSaveEntity } from "../../../serverState/useEntities";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { SetupFlow } from "../SetupFlow";
import type { SetupFlowConfig, SetupStep } from "../types";
import { DetailsStep, type EntityDetailsValue } from "./DetailsStep";
import { ReferenceStep } from "./ReferenceStep";
import { ReviewFallback, ReviewStep } from "./ReviewStep";
import {
  clearEntitySetupDraft,
  readEntitySetupDraft,
  sweepClosedGuidedEntityDrafts,
  writeEntitySetupDraft,
  type EntitySetupStage
} from "./entitySetupDraft";

export interface EntitySetupHostProps {
  readonly projectId?: string;
  readonly draftKey?: string;
  readonly initialDescriptor?: string;
  readonly initialAssetId?: string;
  readonly onFinish: (entity: Entity) => void;
  readonly onChangeFlow?: (descriptor: string) => void | Promise<void>;
  /**
   * Told while the entity is being saved or its blank reference uploads, so
   * an exit outside the flow can wait for work it cannot stop.
   */
  readonly onBusyChange?: (busy: boolean) => void;
}

const tagsFromText = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

/** A plain white canvas, so a blank entity has a reference to be built on. */
const createBlankReferenceFile = (
  t: ReturnType<typeof useTranslation>["t"]
): Promise<File> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error(t("i18n-cont-setup-05.entity.errors.canvasUnavailable")));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t("i18n-cont-setup-05.entity.errors.blankImageFailed")));
        return;
      }
      resolve(
        new File([blob], t("i18n-cont-setup-05.entity.defaults.untitledReferenceFile"), {
          type: "image/png"
        })
      );
    }, "image/png");
  });

const EntitySetupHost = ({
  projectId,
  draftKey,
  initialDescriptor = "",
  initialAssetId,
  onFinish,
  onChangeFlow,
  onBusyChange
}: EntitySetupHostProps) => {
  const { t } = useTranslation();
  const recoveredDraft = useMemo(
    () => readEntitySetupDraft(draftKey ?? projectId),
    [draftKey, projectId]
  );
  const saveEntity = useSaveEntity();
  const {
    data: entities,
    isLoading: entitiesLoading,
    isError: entitiesError
  } = useEntities();
  const [stage, setStage] = useState<EntitySetupStage>(
    recoveredDraft?.stage ?? "details"
  );
  const [details, setDetails] = useState<EntityDetailsValue>(
    recoveredDraft?.details ?? {
      kind: "character",
      name: "",
      descriptor: initialDescriptor,
      tags: ""
    }
  );
  const [assetId, setAssetId] = useState<string | null>(
    recoveredDraft?.assetId ?? initialAssetId ?? null
  );
  // Read by the blank start after its upload, which outlives the render that
  // started it.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [pickerOpen, setPickerOpen] = useState(false);
  // The blank reference being made, while the card reads as busy.
  const [startingBlank, setStartingBlank] = useState(false);
  const createAsset = useAssetStore((state) => state.createAsset);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const excludedAssetIds = useMemo(
    () => (entities ?? []).map((entity) => entity.id),
    [entities]
  );
  const referenceAssetId =
    assetId && !excludedAssetIds.includes(assetId) ? assetId : null;

  useEffect(() => {
    writeEntitySetupDraft(draftKey ?? projectId, {
      version: 1,
      stage,
      details,
      assetId
    });
  }, [assetId, details, draftKey, projectId, stage]);

  // Drafts left by guided tabs that closed while another flow ran, or before
  // the unmount cleanup below existed, go when an entity flow opens.
  useEffect(() => {
    sweepClosedGuidedEntityDrafts(
      new Set(
        useWorkspaceTabsStore
          .getState()
          .tabs.filter((tab) => tab.type === "guided-flow")
          .map((tab) => tab.ref)
      )
    );
  }, []);

  // A draft keyed by a guided tab can only be recovered by that tab, so it
  // goes when the tab closes. Unmounting with the tab still open (another
  // route, a flow change) keeps it.
  useEffect(() => {
    if (!draftKey) {
      return;
    }
    return () => {
      const tabOpen = useWorkspaceTabsStore
        .getState()
        .tabs.some((tab) => tab.type === "guided-flow" && tab.ref === draftKey);
      if (!tabOpen) {
        clearEntitySetupDraft(draftKey);
      }
    };
  }, [draftKey]);

  const handlePick = useCallback((pickedAssetId: string) => {
    setAssetId(pickedAssetId);
    setPickerOpen(false);
  }, []);

  /**
   * The blank escape hatch: a plain canvas becomes the reference image and
   * the review step opens, with the name filled only where the creator left
   * it empty. The descriptor stays as written: it seasons every prompt the
   * entity appears in, so a filler sentence would too, and the review asks
   * for one instead. Failures toast rather than stranding the card, which
   * the shell would otherwise leave busy with nothing to say.
   */
  const startBlank = useCallback(async () => {
    setStartingBlank(true);
    try {
      const asset = await createAsset(await createBlankReferenceFile(t));
      // The creator moved on while the canvas uploaded, so the flow stays
      // where they are (F17).
      if (stageRef.current !== "details") {
        return;
      }
      setDetails((current) => ({
        ...current,
        name:
          current.name.trim().length > 0
            ? current.name
            : t("i18n-cont-setup-05.entity.defaults.untitledName")
      }));
      setAssetId(asset.id);
      setStage("review");
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: t("i18n-cont-setup-05.entity.errors.blankStart", {
          detail: error instanceof Error ? error.message : String(error)
        })
      });
    } finally {
      setStartingBlank(false);
    }
  }, [addNotification, createAsset, t]);

  const save = useCallback(async () => {
    if (!referenceAssetId || entitiesLoading || entitiesError) {
      throw new Error(t("i18n-cont-setup-05.entity.errors.referenceRequired"));
    }
    const input: Parameters<typeof saveEntity.mutateAsync>[0] = {
      assetId: referenceAssetId,
      createOnly: true,
      kind: details.kind,
      name: details.name.trim(),
      descriptor: details.descriptor.trim(),
      tags: tagsFromText(details.tags),
      reference_asset_id: referenceAssetId
    };
    if (projectId) {
      input.projectId = projectId;
    }
    const entity = await saveEntity.mutateAsync(input);
    if (!entity) {
      throw new Error(t("i18n-cont-setup-05.entity.errors.createdEntityUnreadable"));
    }
    clearEntitySetupDraft(draftKey ?? projectId);
    onFinish(entity);
  }, [
    details,
    draftKey,
    entitiesError,
    entitiesLoading,
    onFinish,
    projectId,
    referenceAssetId,
    saveEntity,
    t
  ]);

  const reviewBlockedReason = entitiesError
    ? t("i18n-cont-setup-05.entity.steps.review.blocked.libraryError")
    : entitiesLoading
      ? t("i18n-cont-setup-05.entity.steps.review.blocked.libraryLoading")
      : !referenceAssetId
        ? t("i18n-cont-setup-05.entity.steps.review.blocked.reference")
        : details.name.trim().length === 0
          ? t("i18n-cont-setup-05.entity.steps.review.blocked.name")
          : t("i18n-cont-setup-05.entity.steps.review.blocked.descriptor");

  const steps = useMemo<SetupStep<EntitySetupStage>[]>(
    () => [
      {
        stage: "details",
        label: t("i18n-cont-setup-05.entity.steps.details.label"),
        primaryLabel: t("i18n-cont-setup-05.entity.steps.details.primary"),
        canAdvance:
          details.name.trim().length > 0 &&
          details.descriptor.trim().length > 0,
        blockedReason:
          details.name.trim().length === 0
            ? t("i18n-cont-setup-05.entity.steps.details.blocked.name")
            : t("i18n-cont-setup-05.entity.steps.details.blocked.descriptor"),
        pending: startingBlank,
        pendingLabel: t("i18n-cont-setup-05.entity.steps.details.pending"),
        render: () =>
          createElement(DetailsStep, {
            value: details,
            onChange: setDetails,
            onStartBlank: () => void startBlank(),
            startingBlank
          })
      },
      {
        stage: "reference",
        label: t("i18n-cont-setup-05.entity.steps.reference.label"),
        primaryLabel: t("i18n-cont-setup-05.entity.steps.reference.primary"),
        canAdvance:
          referenceAssetId !== null && !entitiesLoading && !entitiesError,
        blockedReason: entitiesError
          ? t("i18n-cont-setup-05.entity.steps.reference.blocked.libraryError")
          : entitiesLoading
            ? t("i18n-cont-setup-05.entity.steps.reference.blocked.libraryLoading")
            : t("i18n-cont-setup-05.entity.steps.reference.blocked.reference"),
        render: () =>
          createElement(ReferenceStep, {
            name: details.name,
            kind: details.kind,
            descriptor: details.descriptor,
            assetId: referenceAssetId,
            excludedAssetIds,
            assetsLoading: entitiesLoading,
            assetsError: entitiesError,
            pickerOpen,
            onOpenPicker: () => setPickerOpen(true),
            onClosePicker: () => setPickerOpen(false),
            onPick: handlePick
          })
      },
      {
        stage: "review",
        label: t("i18n-cont-setup-05.entity.steps.review.label"),
        primaryLabel: t("i18n-cont-setup-05.entity.steps.review.primary"),
        canAdvance:
          referenceAssetId !== null &&
          !entitiesLoading &&
          !entitiesError &&
          details.name.trim().length > 0 &&
          details.descriptor.trim().length > 0,
        blockedReason: reviewBlockedReason,
        pending: saveEntity.isPending,
        pendingLabel: t("i18n-cont-setup-05.entity.steps.review.pending"),
        // The asset is tagged before the save resolves, so a Cancel would
        // say the draft is unchanged about an entity that was created.
        cancelable: false,
        render: () =>
          referenceAssetId
            ? createElement(ReviewStep, {
                assetId: referenceAssetId,
                kind: details.kind,
                name: details.name.trim(),
                descriptor: details.descriptor.trim(),
                tags: tagsFromText(details.tags)
              })
            : createElement(ReviewFallback, { loading: entitiesLoading }),
        onAdvance: save
      }
    ],
    [
      excludedAssetIds,
      details,
      entitiesError,
      entitiesLoading,
      handlePick,
      pickerOpen,
      referenceAssetId,
      reviewBlockedReason,
      save,
      saveEntity.isPending,
      startBlank,
      startingBlank,
      t
    ]
  );

  const busy = saveEntity.isPending || startingBlank;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const config: SetupFlowConfig<EntitySetupStage> = {
    labels: { title: t("i18n-cont-setup-05.entity.title") },
    steps,
    stage,
    onStageChange: setStage
  };

  const handleChangeFlow = useCallback(async () => {
    await onChangeFlow?.(details.descriptor);
    clearEntitySetupDraft(draftKey ?? projectId);
  }, [details.descriptor, draftKey, onChangeFlow, projectId]);

  return onChangeFlow ? (
    <SetupFlow config={config} onChangeFlow={handleChangeFlow} />
  ) : (
    <SetupFlow config={config} />
  );
};

export default EntitySetupHost;
