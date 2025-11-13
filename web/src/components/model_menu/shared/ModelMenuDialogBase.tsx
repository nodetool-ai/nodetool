/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Divider,
  Tabs,
  Tab,
  Tooltip,
  IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchInput from "../../search/SearchInput";
import ModelFiltersBar from "../ModelFiltersBar";
import ProviderList from "../ProviderList";
import ModelList from "../ModelList";
import FavoritesList from "../FavoritesList";
import RecentList from "../RecentList";
import ModelMenuFooter from "../ModelMenuFooter";
import ProviderApiKeyWarningBanner from "./ProviderApiKeyWarningBanner";
import useModelFiltersStore from "../../../stores/ModelFiltersStore";
import {
  applyAdvancedModelFilters,
  buildMetaIndex,
  ModelSelectorModel
} from "../../../utils/modelNormalization";
import {
  ModelMenuStoreHook,
  useModelMenuData
} from "../../../stores/ModelMenuStore";

const containerStyles = css({
  display: "grid",
  gridTemplateColumns: "275px 360px 240px",
  gap: 4,
  minHeight: 480,
  gridTemplateRows: "auto auto 1fr",
  "@media (max-width: 900px)": {
    gridTemplateColumns: "1fr",
    gridTemplateRows: "auto auto auto 1fr",
    minHeight: "auto",
    gap: 8
  }
});

export interface ModelMenuBaseProps<TModel extends ModelSelectorModel> {
  open: boolean;
  onClose: () => void;
  useModelsHook: () => {
    models: TModel[] | undefined;
    isLoading: boolean;
    error: unknown;
  };
  onModelChange?: (model: TModel) => void;
  title?: string;
  searchPlaceholder?: string;
  storeHook: ModelMenuStoreHook<TModel>;
}


export default function ModelMenuDialogBase<TModel extends ModelSelectorModel>({
  open,
  onClose,
  useModelsHook,
  onModelChange,
  title = "Select Model",
  searchPlaceholder = "Search models...",
  storeHook
}: ModelMenuBaseProps<TModel>) {
  const {
    models,
    isLoading,
    error: fetchedError
  } = useModelsHook();

  const isError = !!fetchedError;
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const setSearch = storeHook((s) => s.setSearch);
  const activeSidebarTab = storeHook((s) => s.activeSidebarTab);
  const setActiveSidebarTab = storeHook((s) => s.setActiveSidebarTab);

  const [selectedModel, setSelectedModel] = useState<TModel | null>(null);

  // Debug logging in development - log what we receive
  if (process.env.NODE_ENV === "development" && open) {
    console.log("ModelMenuDialogBase received:", {
      modelsProp: models,
      modelsLength: models?.length ?? 0,
      modelsType: Array.isArray(models) ? "array" : typeof models,
      isLoading,
      isError
    });
  }

  const {
    providers,
    filteredModels,
    favoriteModels,
    recentModels,
    totalCount,
    filteredCount,
    totalActiveCount
  } = useModelMenuData<TModel>(models || [], storeHook);

  // Advanced filters state snapshot
  const selectedTypes = useModelFiltersStore((s) => s.selectedTypes);
  const sizeBucket = useModelFiltersStore((s) => s.sizeBucket);
  const families = useModelFiltersStore((s) => s.families);
  const search = storeHook((s) => s.search);
  const selectedProvider = storeHook((s) => s.selectedProvider);

  const { familiesList } = useMemo(() => {
    const idx = buildMetaIndex(filteredModels.length ? filteredModels : []);
    const f = Array.from(
      new Set(idx.map((x) => x.meta.family).filter(Boolean) as string[])
    ).sort();
    return { familiesList: f };
  }, [filteredModels]);

  const filteredModelsAdvanced = useMemo(() => {
    const result = applyAdvancedModelFilters<TModel>(filteredModels, {
      selectedTypes,
      sizeBucket,
      families
    });
    return result;
  }, [filteredModels, selectedTypes, sizeBucket, families]);

  // Debug logging in development
  if (process.env.NODE_ENV === "development" && open) {
    console.log("ModelMenuDialogBase:", {
      modelsCount: models?.length ?? 0,
      filteredModelsCount: filteredModels.length,
      filteredModelsAdvancedCount: filteredModelsAdvanced.length,
      providersCount: providers.length,
      totalCount,
      filteredCount,
      totalActiveCount,
      selectedProvider,
      search,
      selectedTypes,
      sizeBucket,
      families
    });
  }

  const handleSelectModel = useCallback(
    (model: TModel) => {
      console.log("handleSelectModel:", model);
      setSelectedModel(model);
      onModelChange?.(model);
    },
    [onModelChange]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      css={css({
        zIndex: 20000
      })}
      className="model-menu__dialog"
      transitionDuration={isSmall ? 0 : undefined}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: isSmall ? "none" : theme.vars.palette.glass.blur,
            backgroundColor: isSmall
              ? theme.vars.palette.background.default
              : theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            maxWidth: "950px",
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: { xs: "98%", sm: "92%" },
          maxWidth: { xs: "100%", sm: "1200px" },
          margin: "auto",
          borderRadius: 1.5,
          background: "transparent",
          border: `1px solid ${theme.vars.palette.grey[700]}`
        }
      }}
    >
      <DialogTitle
        className="model-menu__title"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "transparent",
          m: 0,
          p: 4,
          borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
          fontSize: "1rem",
          letterSpacing: 0.4
        }}
      >
        {title}
        <Tooltip title="Close">
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: (t) => t.spacing(1),
              top: (t) => t.spacing(2),
              color: (t) => t.vars.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          marginTop: theme.spacing(4)
        }}
      >
        <ProviderApiKeyWarningBanner providers={providers} />
        <Box
          sx={{ mb: 1, display: "flex", gap: 2, alignItems: "center" }}
          className="model-menu__controls"
        >
          <Box sx={{ flex: 1 }}>
            <SearchInput
              onSearchChange={setSearch}
              placeholder={searchPlaceholder}
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
              storeHook={storeHook}
            />
          </Box>
          <Box
            className="model-menu__model-list-container"
            sx={{
              maxWidth: { xs: "100%", sm: 420 },
              height: "100%",
              minHeight: 320,
              overflow: "hidden"
            }}
          >
            <ModelList<TModel>
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
                <FavoritesList<TModel>
                  models={favoriteModels}
                  onSelect={handleSelectModel}
                />
              ) : (
                <RecentList<TModel>
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
