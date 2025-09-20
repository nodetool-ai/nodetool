import React, { useMemo } from "react";
import { UnifiedModel } from "../../stores/ApiTypes";
import { llama_models } from "../../config/models";
import useMetadataStore from "../../stores/MetadataStore";
import ModelRecommendationsButton from "./ModelRecommendationsButton";

interface ModelRecommendationsProps {
  nodeType: string;
}

const ModelRecommendations: React.FC<ModelRecommendationsProps> = ({
  nodeType
}) => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const recommendedModels: UnifiedModel[] = useMemo(() => {
    const nodeMetadata = getMetadata(nodeType);
    const node_namespace = nodeMetadata?.namespace || "";

    if (node_namespace.startsWith("ollama.")) {
      return llama_models.map((model) => ({
        id: model.id,
        name: model.name,
        type: "llama_model",
        repo_id: model.id
      }));
    } else {
      return (nodeMetadata?.recommended_models || []).map((model) => {
        const id = model.path
          ? `${model.repo_id}/${model.path}`
          : model.repo_id || "";
        // Ensure `type` is a string to satisfy UnifiedModel
        const modelType =
          typeof model.type === "string" ? model.type : "hf.model";
        return {
          id,
          repo_id: model.repo_id || "",
          name: model.repo_id || "",
          type: modelType,
          path: model.path ?? null,
          allow_patterns: model.allow_patterns ?? undefined,
          ignore_patterns: model.ignore_patterns ?? undefined
        } as UnifiedModel;
      });
    }
  }, [getMetadata, nodeType]);

  return <ModelRecommendationsButton recommendedModels={recommendedModels} />;
};

export default ModelRecommendations;
