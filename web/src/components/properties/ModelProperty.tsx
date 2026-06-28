/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import LlamaModelSelect from "./LlamaModelSelect";
import HuggingFaceModelSelect from "./HuggingFaceModelSelect";
import TransformersJsModelSelect from "./TransformersJsModelSelect";
import isEqual from "fast-deep-equal";
import { memo, useMemo } from "react";
import LanguageModelSelect from "./LanguageModelSelect";
import EmbeddingModelSelect from "./EmbeddingModelSelect";
import ImageModelSelect from "./ImageModelSelect";
import TTSModelSelect from "./TTSModelSelect";
import MusicModelSelect from "./MusicModelSelect";
import ASRModelSelect from "./ASRModelSelect";
import VideoModelSelect from "./VideoModelSelect";
import Model3DModelSelect from "./Model3DModelSelect";
import { useNodes } from "../../contexts/NodeContext";
import { useIsConnectedSelector } from "../../hooks/nodes/useIsConnected";
import { useRecommendedModelsForNode } from "../../hooks/useRecommendedModelsForNode";
import ConnectedBadge from "./ConnectedBadge";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { SPACING, getSpacingPx } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    // Model selects that use the custom `Select` component need slightly tighter density.
    "& .select-container .options-list": {
      padding: `${getSpacingPx(SPACING.micro)} 0`,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.rounded.buttonSmall,
    },
    "& .select-container .option": {
      fontSize: theme.fontSizeSmaller,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.primary,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`
    },
    "& .select-container .option:first-of-type": {
      borderTop: "none"
    },
    "& .select-container .option:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      cursor: "pointer"
    },
    "& .select-container .select-header-text": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.primary
    },
    "& .select-container .select-header": {
      padding: `0 ${getSpacingPx(SPACING.xs)}`,
      minHeight: "28px",
      borderRadius: theme.rounded.buttonSmall,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    }
  });

const ModelProperty = (props: PropertyProps) => {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const modelType = props.property.type.type;
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const isConnectedSelector = useIsConnectedSelector(props.nodeId, props.property.name);
  const isConnected = useNodes(isConnectedSelector);

  const { recommendedModels, modelPacks } = useRecommendedModelsForNode(
    props.nodeType
  );

  // Provider-locked nodes (e.g. mlx.text_generation, document.SplitDocument)
  // declare a concrete provider in their model field's default. Constrain the
  // picker to that provider so it doesn't offer models the node can't run.
  // Generic nodes (agents, generators, …) default to the `empty` sentinel (or
  // no provider) → no constraint, all providers shown.
  const lockedProviders = useMemo(() => {
    const def = props.property.default;
    const provider =
      def && typeof def === "object"
        ? (def as { provider?: string }).provider
        : undefined;
    if (!provider || provider === "empty") {
      return undefined;
    }
    return [provider];
  }, [props.property.default]);

  const modelClass = useMemo(
    () => `model-type-${modelType.replace(/\./g, "-")}`,
    [modelType]
  );

  // Memoize task calculations to avoid recalculation on every render
  const { imageTask, videoTask, model3dTask } = useMemo(() => {
    const imageTaskByNode = {
      "nodetool.image.TextToImage": "text_to_image",
      "nodetool.image.ImageToImage": "image_to_image",
      "nodetool.image.Upscale": "upscale",
      "nodetool.image.RemoveBackground": "remove_background",
      "nodetool.image.Relight": "relight",
      "nodetool.image.Vectorize": "vectorize"
    } as const;
    const videoTaskByNode = {
      "nodetool.video.TextToVideo": "text_to_video",
      "nodetool.video.ImageToVideo": "image_to_video",
      "nodetool.video.VideoToVideo": "video_to_video",
      "nodetool.video.LipSync": "lip_sync"
    } as const;
    const imageTask =
      imageTaskByNode[props.nodeType as keyof typeof imageTaskByNode];
    const videoTask =
      videoTaskByNode[props.nodeType as keyof typeof videoTaskByNode];
    const model3dTask =
      props.nodeType === "nodetool.model3d.TextTo3D"
        ? ("text_to_3d" as const)
        : props.nodeType === "nodetool.model3d.ImageTo3D"
          ? ("image_to_3d" as const)
          : undefined;
    return { imageTask, videoTask, model3dTask };
  }, [props.nodeType]);

  // Memoize model select component to avoid recreation on every render
  const modelSelectComponent = useMemo(() => {
    if (modelType === "language_model") {
      return (
        <LanguageModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          allowedProviders={lockedProviders}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "embedding_model") {
      return (
        <EmbeddingModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          allowedProviders={lockedProviders}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "image_model") {
      return (
        <ImageModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={imageTask}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "tts_model") {
      return (
        <TTSModelSelect
          onChange={props.onChange}
          value={props.value || ""}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "music_model") {
      return (
        <MusicModelSelect
          onChange={props.onChange}
          value={props.value || ""}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "asr_model") {
      return (
        <ASRModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "video_model") {
      return (
        <VideoModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={videoTask}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType === "model_3d_model") {
      return (
        <Model3DModelSelect
          onChange={props.onChange}
          value={props.value?.id || ""}
          task={model3dTask}
        />
      );
    } else if (modelType === "llama_model") {
      return (
        <LlamaModelSelect
          onChange={props.onChange}
          value={props.value?.repo_id || ""}
        />
      );
    } else if (modelType.startsWith("hf.")) {
      return (
        <HuggingFaceModelSelect
          modelType={modelType}
          onChange={props.onChange}
          value={props.value}
          recommendedModels={recommendedModels}
          modelPacks={modelPacks}
        />
      );
    } else if (modelType.startsWith("tjs.")) {
      return (
        <TransformersJsModelSelect
          modelType={modelType}
          onChange={props.onChange}
          value={props.value}
        />
      );
    }
    return null;
  }, [modelType, props.nodeType, props.onChange, props.value, imageTask, videoTask, model3dTask, recommendedModels, modelPacks, lockedProviders]);

  if (isConnected) {
    return (
      <div className={`model-property ${modelClass} connected`} css={cssStyles}>
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        <ConnectedBadge />
      </div>
    );
  }

  return (
    <div className={`model-property ${modelClass}`} css={cssStyles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {modelSelectComponent}
    </div>
  );
};

export default memo(ModelProperty, isEqual);
