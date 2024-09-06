/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
  Tooltip
} from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import ThemeNodetool from "../themes/ThemeNodetool";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

const styles = (theme: any) =>
  css({
    "&.model-card": {
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
    "&.model-card:hover": {
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

interface ModelCardProps {
  huggingfaceJson: string | undefined;
  onDownload?: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  huggingfaceJson,
  onDownload
}) => {
  const modelData = huggingfaceJson ? JSON.parse(huggingfaceJson) : undefined;

  return (
    <Card className="model-card" css={styles}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography
          className="model-name"
          variant="h4"
          component="div"
          gutterBottom
        >
          {modelData.id}
        </Typography>
        <Box mb={2}>
          {modelData.model_type && (
            <Typography variant="body2" color="text.secondary">
              Base Model: {modelData.model_type || "N/A"}
            </Typography>
          )}
          {modelData.pipeline_tag && (
            <Typography variant="body2" className="pipeline-tag">
              {modelData.pipeline_tag || ""}
            </Typography>
          )}
          {modelData.tags && (
            <Box mt={1}>
              {modelData.tags.map((tag: string) => (
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
        {modelData.license && (
          <Typography className="license" variant="body2">
            License: {modelData.license || "N/A"}
          </Typography>
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
      </CardActions>
    </Card>
  );
};

export default ModelCard;
