/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
import {
  Typography,
  Chip,
  Button,
  Divider,
  CircularProgress
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ReplicateModel } from "../../stores/ReplicateStore";
import { useReplicateModel } from "../../hooks/useReplicateModels";

const styles = (theme: Theme) =>
  css({
    padding: theme.spacing(2),
    ".model-header": {
      marginBottom: theme.spacing(2)
    },
    ".model-title": {
      fontSize: "1.25rem",
      fontWeight: 600,
      marginBottom: theme.spacing(0.5)
    },
    ".model-owner": {
      fontSize: "0.875rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      marginBottom: theme.spacing(1)
    },
    ".model-description": {
      fontSize: "0.875rem",
      lineHeight: 1.5,
      marginBottom: theme.spacing(2)
    },
    ".model-stats": {
      display: "flex",
      gap: theme.spacing(1),
      marginBottom: theme.spacing(2),
      flexWrap: "wrap"
    },
    ".model-image": {
      width: "100%",
      maxHeight: 200,
      objectFit: "cover",
      borderRadius: theme.spacing(1),
      marginBottom: theme.spacing(2)
    },
    ".section-title": {
      fontSize: "0.875rem",
      fontWeight: 600,
      marginBottom: theme.spacing(1),
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      textTransform: "uppercase"
    },
    ".inputs-list": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      marginBottom: theme.spacing(2)
    },
    ".input-item": {
      padding: theme.spacing(1),
      backgroundColor: theme.vars?.palette?.action?.hover || theme.palette.action.hover,
      borderRadius: theme.spacing(0.5)
    },
    ".input-name": {
      fontWeight: 600,
      fontSize: "0.8125rem"
    },
    ".input-type": {
      fontSize: "0.75rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary
    },
    ".input-description": {
      fontSize: "0.75rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      marginTop: theme.spacing(0.25)
    },
    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing(4)
    },
    ".action-buttons": {
      display: "flex",
      gap: theme.spacing(1),
      marginTop: theme.spacing(2)
    },
    ".version-info": {
      fontSize: "0.75rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      marginTop: theme.spacing(1)
    }
  });

interface ReplicateModelInfoProps {
  model: ReplicateModel;
  onOpenInReplicate?: () => void;
}

/**
 * Displays detailed information about a Replicate model
 */
const ReplicateModelInfo: React.FC<ReplicateModelInfoProps> = ({
  model,
  onOpenInReplicate
}) => {
  const theme = useTheme();

  // Fetch full model details if we only have minimal info
  const { data: fullModel, isLoading } = useReplicateModel(
    model.owner,
    model.name,
    !model.latest_version // Only fetch if we don't have version info
  );

  const displayModel = fullModel || model;

  // Extract input schema
  const inputSchema = useMemo(() => {
    const schema = displayModel.latest_version?.openapi_schema;
    if (!schema?.components?.schemas?.Input?.properties) {
      return [];
    }

    const properties = schema.components.schemas.Input.properties;
    const required = schema.components.schemas.Input.required || [];

    return Object.entries(properties)
      .map(([name, prop]) => ({
        name,
        ...prop,
        required: required.includes(name)
      }))
      .sort((a, b) => (a["x-order"] || 999) - (b["x-order"] || 999));
  }, [displayModel]);

  // Determine output type
  const outputType = useMemo(() => {
    const output = displayModel.latest_version?.openapi_schema?.components?.schemas?.Output;
    if (!output) {return "Unknown";}

    if (output.type === "array" && output.items?.format === "uri") {
      return "Images/Files";
    }
    if (output.format === "uri") {
      return "File/URL";
    }
    return output.type || "Unknown";
  }, [displayModel]);

  if (isLoading) {
    return (
      <div css={styles(theme)}>
        <div className="loading-container">
          <CircularProgress size={24} />
        </div>
      </div>
    );
  }

  return (
    <div css={styles(theme)}>
      {/* Header */}
      <div className="model-header">
        <Typography className="model-title">{displayModel.name}</Typography>
        <Typography className="model-owner">{displayModel.owner}</Typography>
      </div>

      {/* Cover Image */}
      {displayModel.cover_image_url && (
        <img
          className="model-image"
          src={displayModel.cover_image_url}
          alt={displayModel.name}
        />
      )}

      {/* Description */}
      {displayModel.description && (
        <Typography className="model-description">
          {displayModel.description}
        </Typography>
      )}

      {/* Stats */}
      <div className="model-stats">
        {displayModel.run_count !== undefined && (
          <Chip
            size="small"
            label={`${displayModel.run_count.toLocaleString()} runs`}
            variant="outlined"
          />
        )}
        <Chip size="small" label={displayModel.visibility} variant="outlined" />
        <Chip size="small" label={`Output: ${outputType}`} variant="outlined" />
      </div>

      <Divider sx={{ my: 2 }} />

      {/* Inputs */}
      <Typography className="section-title">Inputs</Typography>
      <div className="inputs-list">
        {inputSchema.length > 0 ? (
          inputSchema.slice(0, 8).map((input) => (
            <div key={input.name} className="input-item">
              <div className="input-name">
                {input.name}
                {input.required && <span style={{ color: "red" }}> *</span>}
              </div>
              <div className="input-type">
                {input.type || "any"}
                {input.default !== undefined && ` (default: ${JSON.stringify(input.default)})`}
              </div>
              {input.description && (
                <div className="input-description">{input.description}</div>
              )}
            </div>
          ))
        ) : (
          <Typography variant="caption" color="text.secondary">
            Input schema not available. The model will use default inputs.
          </Typography>
        )}
        {inputSchema.length > 8 && (
          <Typography variant="caption" color="text.secondary">
            + {inputSchema.length - 8} more inputs
          </Typography>
        )}
      </div>

      {/* Version Info */}
      {displayModel.latest_version && (
        <Typography className="version-info">
          Latest version: {displayModel.latest_version.id.slice(0, 12)}...
          <br />
          Created: {new Date(displayModel.latest_version.created_at).toLocaleDateString()}
        </Typography>
      )}

      {/* Action Buttons */}
      <div className="action-buttons">
        {onOpenInReplicate && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<OpenInNewIcon />}
            onClick={onOpenInReplicate}
          >
            View on Replicate
          </Button>
        )}
      </div>
    </div>
  );
};

export default ReplicateModelInfo;
