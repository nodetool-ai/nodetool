import React from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import SearchInput from "../../search/SearchInput";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const ModelListHeader: React.FC = () => {
  const {
    modelSource,
    handleModelSourceChange,
    modelSearchTerm,
    setModelSearchTerm
  } = useModelManagerStore();

  return (
    <>
      <SearchInput
        focusOnTyping={true}
        focusSearchInput={false}
        width={300}
        maxWidth={"300px"}
        onSearchChange={setModelSearchTerm}
        searchTerm={modelSearchTerm}
      />

      <ToggleButtonGroup
        className="toggle-button-group-recommended"
        value={modelSource}
        exclusive
        onChange={handleModelSourceChange}
        aria-label="model source"
        size="medium"
        sx={{
          flexShrink: 0
        }}
      >
        <ToggleButton
          value="downloaded"
          sx={{ fontSize: "0.85rem", padding: "0.5em 1.25em" }}
        >
          Downloaded
        </ToggleButton>
        <ToggleButton
          value="recommended"
          sx={{ fontSize: "0.85rem", padding: "0.5em 1.25em" }}
        >
          Recommended
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
};

export default React.memo(ModelListHeader);
