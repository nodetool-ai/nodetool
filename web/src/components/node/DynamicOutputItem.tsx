/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import { EditButton, DeleteButton, Text, FlexRow } from "../ui_primitives";
import NodeOutput from "./NodeOutput";
import HandleTooltip from "../HandleTooltip";
import { Property } from "../../stores/ApiTypes";
import isEqual from "fast-deep-equal";
import { useTheme } from "@mui/material/styles";

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
  const theme = useTheme();
  const labelSx = useMemo(
    () => ({
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      letterSpacing: "0.01em",
      lineHeight: "1em",
      minHeight: "13px",
      textAlign: "right",
      textTransform: "capitalize",
      userSelect: "none"
    }),
    [theme]
  );

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
          <HandleTooltip
            typeMetadata={output.type}
            paramName={output.name}
            handlePosition="right"
            isStreamingOutput={isStreamingOutput}
            variant="property"
          >
            <Text sx={labelSx}>{output.name}</Text>
          </HandleTooltip>
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
            <HandleTooltip
              typeMetadata={output.type}
              paramName={output.name}
              handlePosition="right"
              isStreamingOutput={isStreamingOutput}
              variant="property"
            >
              <Text sx={labelSx}>{output.name}</Text>
            </HandleTooltip>
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
