import { memo, useCallback } from "react";
import { Select, OutlinedInput } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
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
  "chroma_text_search",
  "chroma_hybrid_search",
  "extract_pdf_tables",
  "extract_pdf_text",
  "convert_pdf_to_markdown",
  "create_apple_note",
  "read_apple_notes",
  "semantic_doc_search",
  "keyword_doc_search",
  "list_assets_directory",
  "read_asset",
  "save_asset",
  "create_workspace_file",
  "read_workspace_file",
  "update_workspace_file",
  "delete_workspace_file",
  "list_workspace_contents",
  "execute_workspace_command",
  "run_nodejs",
  "run_npm_command",
  "run_eslint",
  "debug_javascript",
  "run_jest_test",
  "validate_javascript"
];

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames = props.value?.map((tool: any) => tool.name);

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
      <Select
        id={id}
        multiple
        value={toolNames || []}
        onChange={(e) => onChange(e.target.value as string[])}
        className="mui-select nodrag"
        input={<OutlinedInput id="select-multiple-tools" label="Tools" />}
        renderValue={(selected) => (selected as string[]).join(", ")}
      >
        {AVAILABLE_TOOLS.map((toolName) => (
          <MenuItem key={toolName} value={toolName}>
            {toolName}
          </MenuItem>
        ))}
      </Select>
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
