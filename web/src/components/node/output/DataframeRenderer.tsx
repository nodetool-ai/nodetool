/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import isEqual from "lodash/isEqual";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { DataframeRef } from "../../../stores/ApiTypes";
import DataTable from "../DataTable/DataTable";
import DataframeEditorModal from "../../properties/DataframeEditorModal";

interface DataframeRendererProps {
  dataframe: DataframeRef;
}

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    ".dataframe-action-buttons": {
      position: "absolute",
      right: "1.5em",
      top: "4px",
      opacity: 0,
      zIndex: 10,
      transition: "opacity 0.2s ease"
    },
    "&:hover .dataframe-action-buttons": {
      opacity: 1
    },
    ".dataframe-action-buttons .MuiIconButton-root": {
      padding: "0.25em",
      color: theme.vars.palette.primary.main,
      borderRadius: "4px",
      "&:hover": {
        color: theme.vars.palette.primary.light,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`
      }
    },
    ".dataframe-action-buttons .MuiIconButton-root svg": {
      fontSize: "1rem"
    }
  });

const DataframeRenderer: React.FC<DataframeRendererProps> = ({ dataframe }) => {
  const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Notify other dataframe modals to close
        window.dispatchEvent(new Event("close-dataframe-editor-modal"));
      }
      return next;
    });
  }, []);

  // Read-only onChange handler (no-op)
  const handleChange = useCallback(() => {
    // Read-only mode - do nothing
  }, []);

  return (
    <div css={styles(theme)} className="dataframe-renderer">
      <div className="dataframe-action-buttons">
        <Tooltip title="Open in Full View" placement="bottom">
          <IconButton size="small" onClick={toggleExpand}>
            <OpenInFullIcon />
          </IconButton>
        </Tooltip>
      </div>
      <DataTable dataframe={dataframe} editable={false} />
      {isExpanded && (
        <DataframeEditorModal
          value={dataframe}
          onChange={handleChange}
          onClose={toggleExpand}
          propertyName="DataFrame"
          propertyDescription="Read-only view of the DataFrame output"
          readOnly={true}
        />
      )}
    </div>
  );
};

export default memo(DataframeRenderer, isEqual);
