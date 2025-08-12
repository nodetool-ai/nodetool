/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useCallback, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Divider,
  Tabs,
  Tab
} from "@mui/material";
import type { LanguageModel } from "../../stores/ApiTypes";
import ProviderList from "./ProviderList";
import ModelList from "./ModelList";
import ModelMenuFooter from "./ModelMenuFooter";
import RecentList from "./RecentList";
import FavoritesList from "./FavoritesList";
import SearchInput from "../search/SearchInput";
import useModelMenuStore, {
  useModelMenuData
} from "../../stores/ModelMenuStore";

export interface ModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: LanguageModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: LanguageModel) => void;
}

const containerStyles = css({
  display: "grid",
  gridTemplateColumns: "300px 300px 280px",
  gap: 4,
  minHeight: 480
});

const ModelMenuDialog: React.FC<ModelMenuDialogProps> = ({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}) => {
  const search = useModelMenuStore((s) => s.search);
  const setSearch = useModelMenuStore((s) => s.setSearch);
  const selectedProvider = useModelMenuStore((s) => s.selectedProvider);
  const setSelectedProvider = useModelMenuStore((s) => s.setSelectedProvider);
  const activeSidebarTab = useModelMenuStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useModelMenuStore((s) => s.setActiveSidebarTab);
  const [selectedModel, setSelectedModel] = useState<LanguageModel | null>(
    null
  );
  const {
    allModels,
    providers,
    filteredModels,
    favoriteModels,
    recentModels,
    totalCount,
    filteredCount,
    totalActiveCount
  } = useModelMenuData(models);
  // Availability, env, and provider enablement handled in store hook

  // derived lists via useModelMenuData (favoriteModels, recentModels, filteredModels)

  const handleSelectModel = useCallback(
    (m: LanguageModel) => {
      setSelectedModel(m);
      onModelChange?.(m);
    },
    [onModelChange]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      className="model-menu__dialog"
      PaperProps={{
        sx: {
          backgroundImage: "none",
          backgroundColor: (theme) => theme.vars.palette.background.paper
        }
      }}
    >
      <DialogTitle
        // import ModelInfoPane from "./ModelInfoPane";
        sx={{ fontSize: "1rem", letterSpacing: 0.4, padding: "0 1em 0 2em" }}
        className="model-menu__title"
      >
        Select Model
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{ mb: 1, display: "flex", gap: 2, alignItems: "center" }}
          className="model-menu__controls"
        >
          <Box sx={{ flex: 1 }}>
            <SearchInput
              onSearchChange={(v) => {
                console.log("[ModelMenu] search", v);
                setSearch(v);
              }}
              placeholder="Search models..."
              debounceTime={150}
              focusSearchInput
              focusOnTyping
              maxWidth="300px"
              width={300}
            />
          </Box>
        </Box>
        <div css={containerStyles} className="model-menu__grid">
          <ProviderList
            providers={providers}
            isLoading={!!isLoading}
            isError={!!isError}
          />
          <Box
            className="model-menu__model-list-container"
            sx={{ maxWidth: 300, overflowX: "hidden" }}
          >
            <ModelList models={filteredModels} onSelect={handleSelectModel} />
          </Box>
          <Box
            className="model-menu__sidebar"
            sx={{
              display: "flex",
              flexDirection: "column",
              maxHeight: 520,
              overflow: "hidden",
              // Hide internal list subheaders from child lists as we have tabs now
              "& .model-menu__favorites-list .MuiListSubheader-root, & .model-menu__recent-list .MuiListSubheader-root":
                {
                  display: "none"
                }
            }}
          >
            <Tabs
              value={activeSidebarTab}
              onChange={(_, v) => {
                console.log("[ModelMenu] sidebar tab", v);
                setActiveSidebarTab(v);
              }}
              variant="fullWidth"
              sx={{
                minHeight: 36,
                "& .MuiTab-root": {
                  minHeight: 36,
                  fontSize: (theme) => theme.vars.fontSizeSmall,
                  paddingY: 0.5
                }
              }}
            >
              <Tab value="favorites" label="Favorites" />
              <Tab value="recent" label="Recent" />
            </Tabs>
            <Divider />
            <Box sx={{ flex: 1, overflowY: "auto", pt: 0.5 }}>
              {activeSidebarTab === "favorites" ? (
                <FavoritesList
                  models={favoriteModels}
                  onSelect={handleSelectModel}
                />
              ) : (
                <RecentList
                  models={recentModels}
                  onSelect={handleSelectModel}
                />
              )}
            </Box>
          </Box>
          <ModelMenuFooter
            filteredCount={filteredCount}
            totalCount={totalCount}
            totalActiveCount={totalActiveCount}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModelMenuDialog;
