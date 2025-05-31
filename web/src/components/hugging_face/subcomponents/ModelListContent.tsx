import React, { memo } from "react";
import { Box, Grid, List, Typography } from "@mui/material";
import ModelCard from "../ModelCard";
import ModelListItem from "../ModelListItem";
import { UnifiedModel } from "../../../stores/ApiTypes";

interface Props {
  filteredModels: Record<string, UnifiedModel[]>;
  viewMode: "grid" | "list";
  selectedModelType: string;
  modelSearchTerm: string;
  onDelete: (repoId: string) => void;
  modelTypes: string[];
}

const renderModels = (
  models: UnifiedModel[],
  viewMode: "grid" | "list",
  onDelete: (repoId: string) => void
) => {
  if (models.length === 0) {
    return <Typography variant="body1" sx={{ mt: 2 }}>No models found</Typography>;
  }
  if (viewMode === "grid") {
    return (
      <Grid className="model-grid-container" container spacing={3}>
        {models.map((model) => (
          <Grid className="model-grid-item" item xs={12} sm={12} md={6} lg={4} xl={3} key={model.id}>
            <ModelCard model={model} handleDelete={model.type !== "llama_model" ? onDelete : () => {}} />
          </Grid>
        ))}
      </Grid>
    );
  }
  return (
    <List>
      {models.map((model) => (
        <ModelListItem key={model.id} model={model} handleDelete={model.type !== "llama_model" ? onDelete : () => {}} />
      ))}
    </List>
  );
};

const ModelListContent: React.FC<Props> = ({ filteredModels, viewMode, selectedModelType, modelSearchTerm, onDelete, modelTypes }) => (
  <Box className="content">
    {selectedModelType === "All" ? (
      <>
        {modelSearchTerm && (
          <Typography variant="h3">Searching models for &quot;{modelSearchTerm}&quot;</Typography>
        )}
        {modelTypes
          .slice(1)
          .filter((type) => filteredModels[type]?.length > 0)
          .map((type) => (
            <Box className="model-list-section" key={type} mt={2}>
              <Typography variant="h2">{type}</Typography>
              {renderModels(filteredModels[type] || [], viewMode, onDelete)}
            </Box>
          ))}
      </>
    ) : (
      <Box className="model-list-section" mt={2}>
        <Typography variant="h2">{selectedModelType}</Typography>
        {renderModels(Object.values(filteredModels)[0], viewMode, onDelete)}
      </Box>
    )}
  </Box>
);

export default memo(ModelListContent);
