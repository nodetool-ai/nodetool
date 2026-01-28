/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/EditOutlined";
import NodeOutput from "./NodeOutput";
import { Property } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";

type OutputItem = Property & { isDynamic?: boolean };

export interface DynamicOutputItemProps {
  id: string;
  output: OutputItem;
  showLabel: boolean;
  supportsDynamicOutputs: boolean;
  isStreamingOutput?: boolean;
  onStartEdit: (name: string) => void;
  onDelete: (name: string) => void;
}

const DynamicOutputItem: React.FC<DynamicOutputItemProps> = ({
  id,
  output,
  showLabel,
  supportsDynamicOutputs,
  isStreamingOutput,
  onStartEdit,
  onDelete
}) => {
  const handleRename = useCallback(
    () => onStartEdit(output.name),
    [onStartEdit, output.name]
  );
  const handleDelete = useCallback(
    () => onDelete(output.name),
    [onDelete, output.name]
  );

  return (
    <>
      {supportsDynamicOutputs && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: 0,
            gap: 1
          }}
          css={{
            ".actions": { opacity: 0, transition: "opacity 0.15s ease" },
            ":hover .actions": { opacity: 1 }
          }}
        >
          <Box
            className="actions"
            sx={{ height: "1em", display: "flex", gap: 0.5 }}
          >
            <Tooltip title="Rename output">
              <IconButton size="small" onClick={handleRename}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove output">
              <IconButton size="small" onClick={handleDelete}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography textAlign="right">{output.name}</Typography>
        </Box>
      )}
      {!supportsDynamicOutputs && (
        <Box
          sx={{
            alignItems: "center",
            gap: 1,
            justifyContent: output.isDynamic ? "flex-end" : "flex-start"
          }}
          css={{
            position: "relative",
            ".actions": { opacity: 0, transition: "opacity 0.15s ease" },
            ":hover .actions": { opacity: 1 }
          }}
        >
          {showLabel && (
            <Typography textAlign="right">{output.name}</Typography>
          )}
        </Box>
      )}

      <NodeOutput
        id={id}
        output={{
          type: output.type,
          name: output.name,
          stream: false
        }}
        isDynamic={true}
        isStreamingOutput={isStreamingOutput}
      />
    </>
  );
};

export default memo(DynamicOutputItem, isEqual);
