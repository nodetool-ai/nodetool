import React, { useMemo } from "react";
import { UnifiedModel } from "../../stores/ApiTypes";
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
    return nodeMetadata?.recommended_models || [];
  }, [getMetadata, nodeType]);

  return <ModelRecommendationsButton recommendedModels={recommendedModels} />;
};

export default ModelRecommendations;
