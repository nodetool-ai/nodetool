import { memo, useCallback } from "react";
import { Autocomplete, Chip, TextField } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";

// Hardcoded list of tools from cot_agent.py
const AVAILABLE_TOOLS = [
  "search_email",
  "google_search",
  "add_label",
  "browser",
  "screenshot",
  "search_file",
  "chroma_hybrid_search",
  "extract_pdf_text",
  "convert_pdf_to_markdown",
  "create_apple_note",
  "read_apple_notes",
  "list_assets_directory",
  "read_asset",
  "save_asset",
  "create_workspace_file",
  "read_file",
  "run_nodejs",
  "run_npm_command",
  "run_eslint",
  "debug_javascript",
  "run_jest_test",
  "validate_javascript"
];

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames = props.value?.map((tool: any) => tool.name) || [];

  const onChange = useCallback(
    (selectedToolNames: string[]) => {
      props.onChange(
        selectedToolNames.map((name) => ({ type: "tool_name", name }))
      );
    },
    [props]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Autocomplete
        id={id}
        multiple
        freeSolo
        size="small"
        options={AVAILABLE_TOOLS}
        value={toolNames}
        sx={{
          "& .MuiInputBase-root": {
            padding: "2px 2px",
            minHeight: "18px"
          }
        }}
        onChange={(_, newValue) => onChange(newValue as string[])}
        renderTags={(value: readonly string[], getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip
              variant="outlined"
              size="small"
              label={option}
              {...getTagProps({ index })}
              key={option}
              sx={{
                height: "20px",
                "& .MuiChip-label": {
                  fontSize: "0.75rem",
                  padding: "0 6px"
                }
              }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            size="small"
            placeholder={toolNames.length === 0 ? "Select tools..." : ""}
            fullWidth
            sx={{
              "& .MuiOutlinedInput-root": {
                padding: "2px 4px",
                minHeight: "32px"
              }
            }}
          />
        )}
        className="nodrag"
      />
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
