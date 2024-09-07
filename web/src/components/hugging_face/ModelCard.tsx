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
import { useQuery } from "@tanstack/react-query";
import { UnifiedModel } from "../../stores/ApiTypes";
import { isProduction } from "../../stores/ApiClient";

export async function fetchOllamaModelInfo(modelName: string) {
  const response = await fetch("http://localhost:11434/api/show", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: modelName })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  console.log("ollama response", data);
  return data;
}

const modelSize = (model: any) =>
  (model.size_on_disk / 1024 / 1024).toFixed(2).toString() + " MB";

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
    ".repo-name": {
      width: "calc(100% - 1em)",
      padding: "0",
      margin: "0 0 .5em 0",
      fontSize: "1em"
    },
    ".repo-name .owner": {
      fontSize: ".8em",
      color: theme.palette.c_info,
      padding: "0 "
    },
    "&.missing .repo-name": {
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
      paddingBottom: "1em",
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
      border: "1px solid" + theme.palette.c_gray3,
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
    ".text-model-size": {
      margin: 0,
      padding: 0,
      color: theme.palette.c_warning
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
  model: UnifiedModel;
  handleDelete?: (repoId: string) => void;
  onDownload?: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  onDownload,
  handleDelete
}) => {
  const isHuggingFace = model.type.startsWith("hf.");
  const isOllama = model.type.startsWith("llama_model");
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const {
    data: modelData,
    isLoading,
    error: modelInfoError
  } = useQuery({
    queryKey: ["modelInfo", model.id],
    queryFn: () => {
      if (isHuggingFace) {
        return fetchModelInfo(model.id);
      } else if (isOllama) {
        return fetchOllamaModelInfo(model.id);
      }
      return null;
    }
  });

  const toggleTags = () => {
    setTagsExpanded(!tagsExpanded);
  };

  const formatId = (id: string) => {
    if (id.includes("/")) {
      const [owner, repo] = id.split("/");
      return (
        <>
          <span className="repo">
            {repo}
            <br />
          </span>
          <span className="owner">{owner}/</span>
        </>
      );
    }
    return <span className="repo">{id}</span>;
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
        {handleDelete && !isProduction && (
          <DeleteButton onClick={() => handleDelete(model.id)} />
        )}
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography
            className="repo-name"
            variant="h4"
            component="div"
            gutterBottom
          >
            {formatId(model.id)}
          </Typography>
          <Typography
            variant="h3"
            style={{ color: ThemeNodetool.palette.c_warning }}
          ></Typography>
          {isOllama && (
            <>
              <Typography
                variant="h5"
                style={{ color: ThemeNodetool.palette.c_gray5 }}
              >
                Model not downloaded.
              </Typography>
            </>
          )}
          {isHuggingFace && (
            <>
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
                href={`https://huggingface.co/${model.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {model.id}
              </Button>
            </>
          )}
        </CardContent>
        <CardActions sx={{ justifyContent: "space-between", p: 2 }}>
          {isOllama && onDownload && (
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
          {isOllama && (
            <Tooltip
              enterDelay={TOOLTIP_ENTER_DELAY * 2}
              title="View on Ollama"
            >
              <Button
                className="view-on-ollama"
                size="small"
                variant="contained"
                href={`https://ollama.com/library/${model.id.split(":")[0]}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/ollama.png" alt="Ollama" width={16} />
              </Button>
            </Tooltip>
          )}
          {model.size_on_disk && (
            <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
              <Typography variant="body2" className="text-model-size">
                {modelSize(model)}
              </Typography>
            </Tooltip>
          )}
        </CardActions>
      </Card>
    );
  }

  return (
    <Card className="model-card" css={styles}>
      {handleDelete && handleDelete && (
        <DeleteButton onClick={() => handleDelete(model.id)} />
      )}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography
          className="repo-name"
          variant="h4"
          component="div"
          gutterBottom
        >
          {formatId(model.id)}
        </Typography>

        {isOllama && (
          <>
            <Tooltip title="Parent Model">
              <Typography variant="body2">
                Parent Model: {modelData.details?.parent_model || "N/A"}
              </Typography>
            </Tooltip>
            <Tooltip title="Format">
              <Typography variant="body2">
                Format: {modelData.details?.format || "N/A"}
              </Typography>
            </Tooltip>
            <Tooltip title="Family">
              <Typography variant="body2">
                Family: {modelData.details?.family || "N/A"}
              </Typography>
            </Tooltip>
            <Tooltip title="Parameter Size">
              <Typography variant="body2">
                Parameter Size: {modelData.details?.parameter_size || "N/A"}
              </Typography>
            </Tooltip>
            <Tooltip title="Quantization Level">
              <Typography variant="body2">
                Quantization Level:{" "}
                {modelData.details?.quantization_level || "N/A"}
              </Typography>
            </Tooltip>
          </>
        )}

        {isHuggingFace && (
          <>
            {modelData.cardData?.license && (
              <Typography className="text-license" variant="body2">
                {modelData.cardData.license.toUpperCase()}
              </Typography>
            )}
            <Box>
              <Typography
                className="text-model-type"
                variant="body2"
                color="text.secondary"
              >
                Base Model: {modelData.model_type}
              </Typography>

              <Box className="tags-container">
                <Button
                  className="pipeline-tag"
                  onClick={toggleTags}
                  endIcon={
                    tagsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />
                  }
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
            </Box>
          </>
        )}

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
      </CardContent>
      <CardActions sx={{ justifyContent: "space-between", p: 2 }}>
        {onDownload && !isOllama && (
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
        {model.size_on_disk && (
          <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
            <Typography variant="body2" className="text-model-size">
              {modelSize(model)}
            </Typography>
          </Tooltip>
        )}
        {isHuggingFace && (
          <>
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
          </>
        )}
        {isOllama && modelData && (
          <>
            <Box className="model-stats">
              <Typography
                variant="body2"
                color="text.secondary"
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              ></Typography>
            </Box>
            <Tooltip
              enterDelay={TOOLTIP_ENTER_DELAY * 2}
              title="View on Ollama"
            >
              <Button
                className="view-on-ollama"
                size="small"
                variant="contained"
                href={`https://ollama.com/library/${model.id.split(":")[0]}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/ollama.png" alt="Ollama" width={16} />
              </Button>
            </Tooltip>
          </>
        )}
      </CardActions>
    </Card>
  );
};

export default ModelCard;
