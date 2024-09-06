/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
  DialogContentText,
  Tooltip,
  IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { HuggingFaceModel } from "../stores/ApiTypes";
import { fetchModelInfo } from "../utils/huggingFaceUtils";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ThemeNodetool from "./themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "./node/BaseNode";

const styles = (theme: any) =>
  css({
    ".model-card": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      boxShadow:
        "3px 3px 6px rgba(0, 0, 0, 0.35), -1px -1px 3px rgba(200, 200, 100, 0.1)",
      border: "4px solid rgba(0, 0, 0, .2)",
      borderRadius: "10px",
      outline: "2px solid #111",
      outlineOffset: "-3px",
      background:
        "linear-gradient(10deg, #333, #363636 65%, #363636 75%, #333)",
      transition: "all 0.15s ease-out"
    },
    ".model-card:hover": {
      boxShadow:
        "2px 2px 3px rgba(0, 0, 0, 0.2), -1px -1px 2px rgba(200, 200, 100, 0.35)",
      background: "linear-gradient(55deg, #333, #393939 65%, #393939 75%, #333)"
    },
    ".model-name": {
      marginTop: "0"
    },
    ".pipeline-tag": {
      fontFamily: theme.fontFamily2,
      width: "fit-content",
      color: theme.palette.c_gray0,
      backgroundColor: theme.palette.c_gray5,
      padding: "0.2em 0.4em",
      borderRadius: 5,
      textTransform: "uppercase",
      fontWeight: "bold",
      fontSize: theme.fontSizeSmall
    },
    ".tag": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray1,
      padding: "0 0.1em",
      borderRadius: 8,
      fontSize: theme.fontSizeSmall
    },
    ".license": {
      marginTop: theme.spacing(2),
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray5,
      fontSize: theme.fontSizeSmaller
    },
    ".download": {
      boxShadow: "none",
      backgroundColor: theme.palette.c_gray1,
      border: "1px solid" + ThemeNodetool.palette.c_gray1,
      "&:hover": {
        backgroundColor: theme.palette.c_gray0,
        border: "1px solid" + ThemeNodetool.palette.c_gray0
      }
    },
    ".view-on-huggingface": {
      boxShadow: "none",
      backgroundColor: "transparent",
      filter: "saturate(0)",
      transition: "transform 0.125s ease-in, filter 0.2s ease-in",
      "&:hover": {
        backgroundColor: "transparent",
        transform: "scale(1.5)",
        filter: "saturate(1)"
      }
    }
  });

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: HuggingFaceModel[];
  startDownload: (
    repoId: string,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  openDialog: () => void;
}

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload,
  openDialog
}) => {
  const [modelsWithInfo, setModelsWithInfo] = useState<
    (HuggingFaceModel & {
      cardData?: any;
      downloads?: number;
      likes?: number;
    })[]
  >([]);

  useEffect(() => {
    const fetchInfo = async () => {
      const updatedModels = await Promise.all(
        recommendedModels.map(async (model) => {
          if (model.repo_id) {
            const info = await fetchModelInfo(model.repo_id);
            return { ...model, ...info };
          }
          return model;
        })
      );
      setModelsWithInfo(updatedModels);
    };
    fetchInfo();
  }, [recommendedModels]);

  return (
    <Dialog
      css={styles}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle style={{ marginBottom: 2 }}>
        Recommended Models
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | ESC">
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContentText
        sx={{
          position: "absolute",
          bottom: "1em",
          left: "0",
          padding: "0 0 0 2em",
          margin: "0",
          fontSize: ThemeNodetool.fontSizeSmall,
          color: ThemeNodetool.palette.c_gray6
        }}
      >
        Models will be downloaded to your local HuggingFace .cache folder.
      </DialogContentText>
      <DialogContent sx={{ paddingBottom: "3em" }}>
        <Grid container spacing={3}>
          {modelsWithInfo.map((model) => (
            <Grid item xs={12} sm={6} md={4} key={model.repo_id}>
              <Card className="model-card">
                <CardContent
                  sx={{
                    flexGrow: 1
                  }}
                >
                  <Typography
                    className="model-name"
                    variant="h4"
                    component="div"
                    gutterBottom
                  >
                    {model.repo_id}
                  </Typography>
                  {model.cardData && (
                    <Box mb={2}>
                      {model.cardData.base_model && (
                        <Typography variant="body2" color="text.secondary">
                          Base Model: {model.cardData.base_model || "N/A"}
                        </Typography>
                      )}
                      {model.cardData.pipeline_tag && (
                        <Typography variant="body2" className="pipeline-tag">
                          {model.cardData.pipeline_tag || ""}
                        </Typography>
                      )}
                      {model.cardData.tags && (
                        <Box mt={1}>
                          {model.cardData.tags.map((tag: string) => (
                            <Chip
                              className="tag"
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{ margin: "2px" }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  )}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Tooltip title="Downloads last month">
                      <CloudDownloadIcon
                        fontSize="small"
                        sx={{
                          color: ThemeNodetool.palette.c_gray3,
                          marginRight: ".1em"
                        }}
                      />
                    </Tooltip>
                    <Typography variant="body2">
                      {model.downloads?.toLocaleString() || "N/A"}
                    </Typography>
                    <FavoriteIcon
                      fontSize="small"
                      sx={{ ml: 2, color: ThemeNodetool.palette.c_gray3 }}
                    />{" "}
                    {model.likes?.toLocaleString() || "N/A"}
                  </Typography>
                  {model.cardData?.license && (
                    <Typography className="license" variant="body2">
                      License: {model.cardData.license || "N/A"}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: "space-between", p: 2 }}>
                  <Button
                    className="download"
                    size="small"
                    variant="contained"
                    sx={{
                      padding: "1em .5em ",
                      color: ThemeNodetool.palette.c_hl1,
                      backgroundColor: "transparent"
                    }}
                    onClick={() => {
                      if (model.repo_id) {
                        startDownload(
                          model.repo_id,
                          model.allow_patterns ?? null,
                          model.ignore_patterns ?? null
                        );
                        openDialog();
                        onClose();
                      }
                    }}
                  >
                    Download
                  </Button>
                  <Tooltip
                    enterDelay={TOOLTIP_ENTER_DELAY * 2}
                    title="View on HuggingFace"
                  >
                    <Button
                      className="view-on-huggingface"
                      size="small"
                      variant="contained"
                      href={`https://huggingface.co/${model.repo_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
                        alt="Hugging Face"
                        style={{
                          cursor: "pointer",
                          width: "1.5em",
                          height: "auto",
                          verticalAlign: "middle"
                        }}
                      />
                    </Button>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
