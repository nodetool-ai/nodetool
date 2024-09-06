/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
  Tooltip,
  CircularProgress
} from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { fetchModelInfo } from "../../utils/huggingFaceUtils";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteButton from "../buttons/DeleteButton";
import { devError } from "../../utils/DevLog";

const styles = (theme: any) =>
  css({
    "&.model-card": {
      position: "relative",
      height: "300px",
      width: "100%",
      marginTop: ".5em",
      maxWidth: "370px",
      display: "flex",
      flexDirection: "column",
      boxShadow:
        "3px 3px 6px rgba(0, 0, 0, 0.35), -1px -2px 3px rgba(200, 200, 100, 0.1)",
      border: "4px solid rgba(0, 0, 0, .2)",
      borderRadius: "10px",
      outline: "2px solid #111",
      outlineOffset: "-3px",
      background:
        "linear-gradient(10deg, #333, #363636 65%, #363636 75%, #333)",
      transition: "all 0.15s ease-out"
    },
    "&.model-card:hover": {
      boxShadow:
        "2px 2px 3px rgba(0, 0, 0, 0.2), -1px -2px 2px rgba(180, 200, 200, 0.35)",
      background: "linear-gradient(55deg, #333, #393939 65%, #393939 75%, #333)"
    },
    "&.missing": {
      background: ThemeNodetool.palette.c_gray1
    },
    "&.missing:hover": {
      background: ThemeNodetool.palette.c_gray1
    },
    ".model-name": {
      margin: "0"
    },
    "&.missing .model-name": {
      color: theme.palette.c_warning
    },
    ".tags-container": {
      position: "relative"
    },
    ".pipeline-tag": {
      fontFamily: theme.fontFamily2,
      lineHeight: "1.1em",
      width: "fit-content",
      wordBreak: "break-word",
      color: theme.palette.c_gray0,
      backgroundColor: theme.palette.c_gray5,
      marginTop: ".5em",
      padding: "0.1em 0.4em",
      borderRadius: 5,
      textTransform: "uppercase",
      fontWeight: "bold",
      fontSize: theme.fontSizeSmall
    },
    ".tags-list": {
      display: "none",
      position: "absolute",
      width: "100%",
      height: "auto",
      maxHeight: "115px",
      top: "40px",
      left: "0",
      flexWrap: "wrap",
      gap: 2,
      zIndex: 100,
      overflow: "hidden auto",
      transition: "all 0.2s ease-out"
    },
    ".tags-list.expanded": {
      display: "flex"
    },
    ".tag": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray1,
      padding: "0 0.1em",
      borderRadius: 8,
      border: "1px solid" + theme.palette.c_gray4,
      fontSize: theme.fontSizeSmaller
    },
    ".text-license": {
      margin: 0,
      padding: 0,
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray5,
      fontSize: theme.fontSizeSmaller
    },
    ".text-model-type": {
      margin: 0,
      padding: 0,
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
    },
    ".delete-button": {
      position: "absolute",
      top: ".25em",
      right: ".25em",
      color: theme.palette.c_gray5
    },
    ".delete-button:hover": {
      color: theme.palette.c_delete
    },
    ".button-link": {
      boxShadow: "none",
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      textDecoration: "none",
      lineHeight: "1.1em",
      "&:hover": {
        color: theme.palette.c_white
      }
    }
  });

interface ModelCardProps {
  repoId: string;
  modelSize?: string;
  handleDelete?: (repoId: string) => void;
  onDownload?: () => void;
  modelType?: string;
}

const HuggingFaceModelCard: React.FC<ModelCardProps> = ({
  repoId,
  modelSize,
  onDownload,
  handleDelete,
  modelType
}) => {
  const [modelData, setModelData] = useState<any>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isOllama = modelType?.startsWith("ollama");

  useEffect(() => {
    if (isOllama) {
      setIsLoading(false);
    } else {
      const fetchData = async () => {
        setIsLoading(true);
      };
      try {
        const info = fetchModelInfo(repoId);
        setModelData(info);
      } catch (error) {
        devError("ModelCard:Error fetching model info:", error);
      } finally {
        setIsLoading(false);
      }
      fetchData();
    }
  }, [isOllama, repoId]);

  const toggleTags = () => {
    setTagsExpanded(!tagsExpanded);
  };

  if (isLoading) {
    return (
      <Card className="model-card" css={styles}>
        <CardContent
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%"
          }}
        >
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  if (!modelData) {
    return (
      <Card className="model-card missing" css={styles}>
        {handleDelete && handleDelete && (
          <DeleteButton onClick={() => handleDelete(repoId)} />
        )}
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography
            className="model-name"
            variant="h4"
            component="div"
            gutterBottom
          >
            {repoId}
          </Typography>
          <Typography
            variant="h3"
            style={{ color: ThemeNodetool.palette.c_warning }}
          ></Typography>
          <Typography
            variant="h5"
            style={{ color: ThemeNodetool.palette.c_gray5 }}
          >
            Failed to find matching repository:
          </Typography>
          <Button
            className="button-link"
            size="small"
            variant="contained"
            href={`https://huggingface.co/${repoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {repoId}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="model-card" css={styles}>
      {handleDelete && handleDelete && (
        <DeleteButton onClick={() => handleDelete(repoId)} />
      )}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography
          className="model-name"
          variant="h4"
          component="div"
          gutterBottom
        >
          {repoId}
        </Typography>

        {!isOllama && modelData.cardData?.license && (
          <Typography className="text-license" variant="body2">
            {modelData.cardData.license.toUpperCase()}
          </Typography>
        )}

        <Box>
          {!isOllama && modelData.model_type && (
            <Typography
              className="text-model-type"
              variant="body2"
              color="text.secondary"
            >
              Base Model: {modelData.model_type}
            </Typography>
          )}

          {!isOllama && (
            <Box className="tags-container">
              <Button
                className="pipeline-tag"
                onClick={toggleTags}
                endIcon={tagsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              >
                {modelData.cardData?.pipeline_tag ||
                  (tagsExpanded ? "Hide Tags" : "Show Tags")}
              </Button>

              <Box className={`tags-list ${tagsExpanded ? "expanded" : ""}`}>
                {(modelData.cardData?.tags || modelData.tags) && (
                  <Box mt={1}>
                    {(modelData.cardData?.tags || modelData.tags).map(
                      (tag: string) => (
                        <Chip
                          className="tag"
                          key={tag}
                          label={tag}
                          size="small"
                          sx={{ margin: "2px" }}
                        />
                      )
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>

        {!isOllama && (
          <div
            style={{
              position: "absolute",
              backgroundColor: "transparent",
              top: "120px",
              left: 0,
              width: "100%",
              height: "120px",
              backgroundImage: `url(${modelData.cardData?.thumbnail})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center"
            }}
          ></div>
        )}
      </CardContent>
      <CardActions sx={{ justifyContent: "space-between", p: 2 }}>
        {onDownload && (
          <Button
            className="download"
            size="small"
            variant="contained"
            sx={{
              padding: "1em .5em ",
              color: ThemeNodetool.palette.c_hl1,
              backgroundColor: "transparent"
            }}
            onClick={onDownload}
          >
            Download
          </Button>
        )}
        {modelSize && (
          <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
            <Typography variant="body2" color="text.secondary">
              {modelSize}
            </Typography>
          </Tooltip>
        )}
        {!isOllama && (
          <Box className="model-stats">
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
                {modelData.downloads?.toLocaleString() || "N/A"}
              </Typography>
              <FavoriteIcon
                fontSize="small"
                sx={{ ml: 2, color: ThemeNodetool.palette.c_gray3 }}
              />{" "}
              {modelData.likes?.toLocaleString() || "N/A"}
            </Typography>
          </Box>
        )}
        {!isOllama && (
          <Tooltip
            enterDelay={TOOLTIP_ENTER_DELAY * 2}
            title="View on HuggingFace"
          >
            <Button
              className="view-on-huggingface"
              size="small"
              variant="contained"
              href={`https://huggingface.co/${modelData.id}`}
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
        )}
      </CardActions>
    </Card>
  );
};

export default HuggingFaceModelCard;
