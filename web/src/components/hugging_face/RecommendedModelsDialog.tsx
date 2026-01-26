/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState } from "react";
import {
  DialogTitle,
  DialogContent,
  Tooltip,
  IconButton,
  Tabs,
  Tab,
  Box
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { Dialog } from "../ui_primitives";
import InventoryIcon from "@mui/icons-material/Inventory";
import ViewListIcon from "@mui/icons-material/ViewList";
import { UnifiedModel, ModelPack } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RecommendedModels from "./RecommendedModels";
import ModelPackCard from "./ModelPackCard";
import useMetadataStore from "../../stores/MetadataStore";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      height: "calc(100% - 200px)",
      background: "transparent",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: theme.shadows[24]
    },
    ".MuiDialogContent-root": {
      height: "calc(100% - 64px)",
      display: "flex",
      flexDirection: "column"
    },
    ".recommended-models-grid": {
      flex: 1,
      overflow: "auto",
      paddingRight: "1em",
      "&::-webkit-scrollbar": { width: 8 },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.background.paper
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[600],
        borderRadius: 4
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[500]
      }
    },
    ".model-download-button": {
      color: "var(--palette-primary-main)"
    }
  });

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      style={{ flex: 1, overflow: "auto", paddingRight: "1em" }}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
});

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: UnifiedModel[];
  startDownload: (model: UnifiedModel) => void;
  modelPacks?: ModelPack[];
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload,
  modelPacks: propsModelPacks
}) => {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);
  const globalModelPacks = useMetadataStore((state) => state.modelPacks);
  const modelPacks = propsModelPacks || globalModelPacks;

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDownloadAllFromPack = (models: UnifiedModel[]) => {
    models.forEach((model) => startDownload(model));
  };

  return (
    <Dialog
      css={styles(theme)}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.6)`,
            backdropFilter: "blur(20px)"
          }
        }
      }}
    >
      <DialogTitle style={{ marginBottom: 0 }}>
        Model Downloads
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | ESC">
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.vars.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ paddingBottom: "3em", display: "flex", flexDirection: "column" }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{
            borderBottom: 1,
            borderColor: "divider",
            mb: 1,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600
            }
          }}
        >
          <Tab
            icon={<InventoryIcon />}
            iconPosition="start"
            label={`Model Packs${modelPacks.length > 0 ? ` (${modelPacks.length})` : ""}`}
          />
          <Tab
            icon={<ViewListIcon />}
            iconPosition="start"
            label={`Individual Models (${recommendedModels.length})`}
          />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {modelPacks.length === 0 ? (
            <Box sx={{ color: "var(--palette-grey-400)", textAlign: "center", py: 4 }}>
              No model packs available. Model packs group related models for easy one-click download.
            </Box>
          ) : (
            modelPacks.map((pack) => (
              <ModelPackCard
                key={pack.id}
                pack={pack}
                onDownloadAll={handleDownloadAllFromPack}
              />
            ))
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <RecommendedModels
            recommendedModels={recommendedModels}
            startDownload={startDownload}
          />
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
