import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type { Entity } from "@nodetool-ai/protocol";

import {
  useEntities,
  useSaveEntity
} from "../../../serverState/useEntities";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { SetupFlow } from "../SetupFlow";
import type { SetupFlowConfig, SetupStep } from "../types";
import {
  DetailsStep,
  type EntityDetailsValue
} from "./DetailsStep";
import { ReferenceStep } from "./ReferenceStep";
import { ReviewStep } from "./ReviewStep";
import {
  clearEntitySetupDraft,
  readEntitySetupDraft,
  writeEntitySetupDraft,
  type EntitySetupStage
} from "./entitySetupDraft";

export interface EntitySetupHostProps {
  readonly projectId?: string;
  readonly initialDescriptor?: string;
  readonly initialAssetId?: string;
  readonly onFinish: (entity: Entity) => void;
  readonly onChangeFlow?: (descriptor: string) => void | Promise<void>;
}

const tagsFromText = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

/** A plain white canvas, so a blank entity has a reference to be built on. */
const createBlankReferenceFile = (): Promise<File> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas 2D context unavailable"));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to render blank image"));
        return;
      }
      resolve(new File([blob], "Untitled.png", { type: "image/png" }));
    }, "image/png");
  });

const EntitySetupHost = ({
  projectId,
  initialDescriptor = "",
  initialAssetId,
  onFinish,
  onChangeFlow
}: EntitySetupHostProps) => {
  const recoveredDraft = useMemo(
    () => readEntitySetupDraft(projectId),
    [projectId]
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
    writeEntitySetupDraft(projectId, {
      version: 1,
      stage,
      details,
      assetId
    });
  }, [assetId, details, projectId, stage]);

  const handlePick = useCallback((pickedAssetId: string) => {
    setAssetId(pickedAssetId);
    setPickerOpen(false);
  }, []);

  /**
   * The blank escape hatch: a plain canvas becomes the reference image and
   * the review step opens, with the name and descriptor filled only where
   * the creator left them empty — everything stays editable one step back.
   * Failures toast rather than stranding the card, which the shell would
   * otherwise leave busy with nothing to say.
   */
  const startBlank = useCallback(async () => {
    setStartingBlank(true);
    try {
      const asset = await createAsset(await createBlankReferenceFile());
      setDetails((current) => ({
        ...current,
        name:
          current.name.trim().length > 0 ? current.name : "Untitled entity",
        descriptor:
          current.descriptor.trim().length > 0
            ? current.descriptor
            : "A reusable visual entity."
      }));
      setAssetId(asset.id);
      setStage("review");
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not start a blank entity: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    } finally {
      setStartingBlank(false);
    }
  }, [addNotification, createAsset]);

  const save = useCallback(async () => {
    if (!referenceAssetId || entitiesLoading || entitiesError) {
      throw new Error("Choose a reference image before creating the entity.");
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
      throw new Error("The entity could not be read after it was created.");
    }
    clearEntitySetupDraft(projectId);
    onFinish(entity);
  }, [
    details,
    entitiesError,
    entitiesLoading,
    onFinish,
    projectId,
    referenceAssetId,
    saveEntity
  ]);

  const steps = useMemo<SetupStep<EntitySetupStage>[]>(
    () => [
      {
        stage: "details",
        label: "Details",
        primaryLabel: "Choose a reference",
        canAdvance:
          details.name.trim().length > 0 &&
          details.descriptor.trim().length > 0,
        blockedReason:
          details.name.trim().length === 0
            ? "Name the entity"
            : "Describe the traits to preserve",
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
        label: "Reference",
        primaryLabel: "Review entity",
        canAdvance:
          referenceAssetId !== null && !entitiesLoading && !entitiesError,
        blockedReason: entitiesError
          ? "Could not verify your entity library"
          : entitiesLoading
            ? "Loading your entity library"
            : "Choose a reference image",
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
        label: "Review",
        primaryLabel: "Create entity",
        pending: saveEntity.isPending,
        pendingLabel: "Creating your entity",
        render: () =>
          referenceAssetId
            ? createElement(ReviewStep, {
                assetId: referenceAssetId,
                kind: details.kind,
                name: details.name.trim(),
                descriptor: details.descriptor.trim(),
                tags: tagsFromText(details.tags)
              })
            : null,
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
      save,
      saveEntity.isPending,
      startBlank,
      startingBlank
    ]
  );

  const config: SetupFlowConfig<EntitySetupStage> = {
    labels: { title: "Entity" },
    steps,
    stage,
    onStageChange: setStage
  };

  const handleChangeFlow = useCallback(
    async () => {
      await onChangeFlow?.(details.descriptor);
      clearEntitySetupDraft(projectId);
    },
    [details.descriptor, onChangeFlow, projectId]
  );

  return onChangeFlow ? (
    <SetupFlow config={config} onChangeFlow={handleChangeFlow} />
  ) : (
    <SetupFlow config={config} />
  );
};

export default EntitySetupHost;
