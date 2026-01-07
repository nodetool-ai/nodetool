/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useMemo } from "react";
import { Tooltip } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import useModelPreferencesStore, {
  DefaultModelType
} from "../../stores/ModelPreferencesStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface DefaultModelStarProps {
  modelType: DefaultModelType;
  provider: string;
  id: string;
  name: string;
  path?: string;
  size?: "small" | "medium";
  stopPropagation?: boolean;
}

const styles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    cursor: "pointer",
    color: theme.vars.palette.success.main,
    transition: "all 0.2s ease-in-out",
    opacity: 0,
    marginLeft: 4,
    "& svg": {
      maxWidth: 18,
      maxHeight: 18
    },
    "&:hover": {
      scale: 1.3,
      color: theme.vars.palette.success.light
    }
  });

const DefaultModelStar: React.FC<DefaultModelStarProps> = ({
  modelType,
  provider,
  id,
  name,
  path,
  size = "small",
  stopPropagation = true
}) => {
  const defaultModels = useModelPreferencesStore((s) => s.defaultModels);
  const setDefaultModel = useModelPreferencesStore((s) => s.setDefaultModel);
  const clearDefaultModel = useModelPreferencesStore((s) => s.clearDefaultModel);

  const isDefault = useMemo(() => {
    const defaultModel = defaultModels?.[modelType];
    return defaultModel?.provider === provider && defaultModel?.id === id;
  }, [defaultModels, modelType, provider, id]);

  const handleClick: React.MouseEventHandler<HTMLSpanElement> = (e) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    if (isDefault) {
      clearDefaultModel(modelType);
    } else {
      setDefaultModel(modelType, { provider, id, name, path });
    }
  };

  const theme = useTheme();

  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_DELAY * 2}
      disableInteractive
      title={isDefault ? "Clear default" : "Set as default"}
    >
      <span
        className="default-model-star"
        css={styles(theme as Theme)}
        style={{
          // Show when default always; otherwise only on parent hover
          opacity: isDefault ? 1 : undefined
        }}
        onClick={handleClick}
      >
        {isDefault ? (
          <CheckCircleIcon fontSize={size} />
        ) : (
          <CheckCircleOutlineIcon fontSize={size} />
        )}
      </span>
    </Tooltip>
  );
};

export default DefaultModelStar;
