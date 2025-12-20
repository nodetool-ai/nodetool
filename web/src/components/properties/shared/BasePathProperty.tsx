/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import isEqual from "lodash/isEqual";
import PropertyLabel from "../../node/PropertyLabel";
import { PropertyProps } from "../../node/PropertyInput";
import { Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FileBrowserDialog from "../../dialogs/FileBrowserDialog";

// Types
export type PathType = "file_path" | "folder_path";

interface PathPreviewProps {
  value?: { path: string };
  onBrowseClick: () => void;
  onClear: () => void;
  ariaLabel: string;
}

interface BasePathPropertyProps extends PropertyProps {
  pathType: PathType;
  dialogTitle: string;
  onlyDirs: boolean;
}

// Styles
const createPathPropertyStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "0.5em",

    ".path-picker__inputs": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minHeight: "20px",
      flex: 1
    },

    ".path-picker__browse-button": {
      backgroundColor: theme.vars.palette.grey[600],
      border: `1px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "2px",
      color: theme.vars.palette.common.white,
      cursor: "pointer",
      padding: "2px 4px",
      height: "100%",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[500]
      }
    },

    ".path-picker__preview": {
      display: "flex",
      alignItems: "center",
      flex: 1,
      color: theme.vars.palette.grey[400],
      fontSize: theme.vars.fontSizeTinyer,
      marginLeft: ".5em",
      wordBreak: "break-all",
      minHeight: "20px"
    },

    ".path-picker__reset-button": {
      backgroundColor: "transparent",
      border: "none",
      borderRadius: "50%",
      color: theme.vars.palette.grey[400],
      cursor: "pointer",
      padding: "4px 8px",
      minWidth: "20px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      "&:hover": {
        color: "var(--palette-primary-main)"
      }
    }
  });

// Components
const PathPreview = ({
  value,
  onBrowseClick,
  onClear,
  ariaLabel
}: PathPreviewProps) => {
  return (
    <div className="path-picker__inputs">
      <button onClick={onBrowseClick} className="path-picker__browse-button">
        Browse
      </button>
      <div className="path-picker__preview">
        <Typography>{value?.toString()}</Typography>
        {value?.toString() && (
          <button
            onClick={onClear}
            className="path-picker__reset-button"
            aria-label={ariaLabel}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

const BasePathProperty = (props: BasePathPropertyProps) => {
  const theme = useTheme();
  const id = `${props.pathType}-${props.property.name}-${props.propertyIndex}`;
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);

  const handleBrowseClick = useCallback(() => {
    setIsFileBrowserOpen(true);
  }, []);

  const handleClear = useCallback(() => {
    props.onChange("");
  }, [props]);

  const handleConfirm = useCallback(
    (path: string) => {
      console.log("selectedPath", path);
      props.onChange(path);
      setIsFileBrowserOpen(false);
    },
    [props]
  );

  const handleCancel = useCallback(() => {
    setIsFileBrowserOpen(false);
  }, []);

  return (
    <div css={createPathPropertyStyles(theme)} className="path-picker">
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      <PathPreview
        value={props.value}
        onBrowseClick={handleBrowseClick}
        onClear={handleClear}
        ariaLabel={`Clear ${props.pathType.split("_")[0]} selection`}
      />

      <FileBrowserDialog
        open={isFileBrowserOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={props.dialogTitle}
        initialPath={typeof props.value === "string" ? props.value : "~"}
        selectionMode={props.onlyDirs ? "directory" : "file"}
      />
    </div>
  );
};

export default memo(BasePathProperty, isEqual);
