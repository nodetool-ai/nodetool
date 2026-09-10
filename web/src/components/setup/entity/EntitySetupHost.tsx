import { createElement, useCallback, useMemo, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import {
  useEntities,
  useSaveEntity
} from "../../../serverState/useEntities";
import { SetupFlow } from "../SetupFlow";
import type { SetupFlowConfig, SetupStep } from "../types";
import {
  DetailsStep,
  type EntityDetailsValue
} from "./DetailsStep";
import { ReferenceStep } from "./ReferenceStep";
import { ReviewStep } from "./ReviewStep";

type EntitySetupStage = "details" | "reference" | "review";

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

const EntitySetupHost = ({
  projectId,
  initialDescriptor = "",
  initialAssetId,
  onFinish,
  onChangeFlow
}: EntitySetupHostProps) => {
  const saveEntity = useSaveEntity();
  const {
    data: entities,
    isLoading: entitiesLoading,
    isError: entitiesError
  } = useEntities();
  const [stage, setStage] = useState<EntitySetupStage>("details");
  const [details, setDetails] = useState<EntityDetailsValue>({
    kind: "character",
    name: "",
    descriptor: initialDescriptor,
    tags: ""
  });
  const [assetId, setAssetId] = useState<string | null>(
    initialAssetId ?? null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const excludedAssetIds = useMemo(
    () => (entities ?? []).map((entity) => entity.id),
    [entities]
  );
  const referenceAssetId =
    assetId && !excludedAssetIds.includes(assetId) ? assetId : null;

  const handlePick = useCallback((pickedAssetId: string) => {
    setAssetId(pickedAssetId);
    setPickerOpen(false);
  }, []);

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
          createElement(DetailsStep, { value: details, onChange: setDetails })
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
      saveEntity.isPending
    ]
  );

  const config: SetupFlowConfig<EntitySetupStage> = {
    labels: { title: "Entity" },
    steps,
    stage,
    onStageChange: setStage
  };

  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(details.descriptor),
    [details.descriptor, onChangeFlow]
  );

  return onChangeFlow ? (
    <SetupFlow config={config} onChangeFlow={handleChangeFlow} />
  ) : (
    <SetupFlow config={config} />
  );
};

export default EntitySetupHost;
