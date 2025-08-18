import React from "react";
import { ToggleButton, ToggleButtonGroup, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchInput from "../../search/SearchInput";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";

const ModelListHeader: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
        width={isMobile ? undefined : 250}
        maxWidth={isMobile ? "100%" : "300px"}
        onSearchChange={setModelSearchTerm}
        searchTerm={modelSearchTerm}
      />

      <ToggleButtonGroup
        className="toggle-button-group-recommended"
        value={modelSource}
        exclusive
        onChange={handleModelSourceChange}
        aria-label="model source"
        size={isMobile ? "small" : "medium"}
        sx={{
          flexShrink: 0,
          width: isMobile ? "100%" : "auto",
          marginTop: isMobile ? 1 : 0
        }}
      >
        <ToggleButton
          value="downloaded"
          sx={{ 
            fontSize: isMobile ? "0.75rem" : "0.85rem", 
            padding: isMobile ? "0.6em 1em" : "0.5em 1.25em",
            flex: isMobile ? 1 : "none",
            minHeight: isMobile ? "44px" : "auto"
          }}
        >
          Downloaded
        </ToggleButton>
        <ToggleButton
          value="recommended"
          sx={{ 
            fontSize: isMobile ? "0.75rem" : "0.85rem", 
            padding: isMobile ? "0.6em 1em" : "0.5em 1.25em",
            flex: isMobile ? 1 : "none",
            minHeight: isMobile ? "44px" : "auto"
          }}
        >
          Recommended
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
};

export default React.memo(ModelListHeader);
