/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useCallback, useState } from "react";
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
import ModelFiltersBar from "./ModelFiltersBar";
import useModelMenuStore, {
  useModelMenuData
} from "../../stores/ModelMenuStore";
import useModelFiltersStore from "../../stores/ModelFiltersStore";
import { applyAdvancedModelFilters } from "../../utils/modelFilters";
import { buildMetaIndex } from "../../utils/modelNormalization";

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
  gridTemplateColumns: "275px 300px 300px",
  gap: 4,
  minHeight: 480,
  gridTemplateRows: "auto auto 1fr"
});

export default function ModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: ModelMenuDialogProps) {
  const theme = useTheme();
  const setSearch = useModelMenuStore((s) => s.setSearch);
  const activeSidebarTab = useModelMenuStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useModelMenuStore((s) => s.setActiveSidebarTab);
  const [selectedModel, setSelectedModel] = useState<LanguageModel | null>(
    null
  );
  const {
    providers,
    filteredModels,
    favoriteModels,
    recentModels,
    totalCount,
    filteredCount,
    totalActiveCount
  } = useModelMenuData(models);

  // Advanced filters state snapshot
  const selectedTypes = useModelFiltersStore((s) => s.selectedTypes);
  const sizeBucket = useModelFiltersStore((s) => s.sizeBucket);
  const families = useModelFiltersStore((s) => s.families);

  // Build option lists for Family and Quant based on all models
  const { familiesList } = React.useMemo(() => {
    const idx = buildMetaIndex(filteredModels.length ? filteredModels : []);
    const f = Array.from(
      new Set(idx.map((x) => x.meta.family).filter(Boolean) as string[])
    ).sort();
    return { familiesList: f };
  }, [filteredModels]);

  const filteredModelsAdvanced = React.useMemo(() => {
    const result = applyAdvancedModelFilters(filteredModels, {
      selectedTypes,
      sizeBucket,
      families
    });
    return result;
  }, [filteredModels, selectedTypes, sizeBucket, families]);
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
      slotProps={{
        paper: {
          sx: {
            height: "70vh",
            width: "90vw",
            maxWidth: "1000px",
            backgroundImage: "none",
            backgroundColor: theme.vars.palette.background.paper
          }
        }
      }}
    >
      <DialogTitle
        sx={{ fontSize: "1rem", letterSpacing: 0.4, padding: "0 1em 0 2em" }}
        className="model-menu__title"
      >
        Select Model
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden"
        }}
      >
        <Box
          sx={{ mb: 1, display: "flex", gap: 2, alignItems: "center" }}
          className="model-menu__controls"
        >
          <Box sx={{ flex: 1 }}>
            <SearchInput
              onSearchChange={(v) => {
                setSearch(v);
              }}
              placeholder="Search models..."
              debounceTime={150}
              focusSearchInput
              focusOnTyping
              maxWidth="300px"
              width={270}
            />
          </Box>
          <ModelFiltersBar familiesList={familiesList} />
        </Box>
        <div
          css={containerStyles}
          className="model-menu__grid"
          style={{ flex: 1, minHeight: 0 }}
        >
          <Box sx={{ height: "100%", overflow: "hidden" }}>
            <ProviderList
              providers={providers}
              isLoading={!!isLoading}
              isError={!!isError}
            />
          </Box>
          <Box
            className="model-menu__model-list-container"
            sx={{ maxWidth: 300, height: "100%", overflow: "hidden" }}
          >
            <ModelList
              models={filteredModelsAdvanced}
              onSelect={handleSelectModel}
            />
          </Box>
          <Box
            className="model-menu__sidebar"
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
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
        </div>
        <ModelMenuFooter
          filteredCount={filteredModelsAdvanced.length}
          totalCount={totalCount}
          totalActiveCount={totalActiveCount}
        />
      </DialogContent>
    </Dialog>
  );
}
