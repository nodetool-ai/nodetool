/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { Box } from "@mui/material";
import { EditButton, DeleteButton, Text, FlexRow } from "../ui_primitives";
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
        <FlexRow
          align="center"
          justify="flex-end"
          gap={1}
          sx={{ padding: 0 }}
          css={{
            ".actions": { opacity: 0, transition: "opacity 0.15s ease" },
            ":hover .actions": { opacity: 1 }
          }}
        >
          <FlexRow
            className="actions"
            gap={0.5}
            sx={{ height: "1em" }}
          >
            <EditButton
              onClick={handleRename}
              tooltip="Rename output"
              iconVariant="edit"
              tabIndex={-1}
            />
            <DeleteButton
              onClick={handleDelete}
              tooltip="Remove output"
              iconVariant="outline"
              tabIndex={-1}
            />
          </FlexRow>
          <Text sx={{ textAlign: "right" }}>{output.name}</Text>
        </FlexRow>
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
            <Text sx={{ textAlign: "right" }}>{output.name}</Text>
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
