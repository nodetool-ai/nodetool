import React from "react";
import { Text } from "../../../ui_primitives";
import { normalizeSearchResults } from "./parseSearchResults";
import { SearchResults } from "./SearchResults";
import { ToolResultJson } from "./ToolResultJson";
import { isString } from "../../../../utils/typePredicates";
import { parsePlanDocument } from "../parsePlanDocument";
import PlanDocument from "../PlanDocument";

interface ToolResultProps {
  toolName?: string | null;
  content: unknown;
}

/**
 * Renders a tool-call result, picking a structured renderer by shape:
 *  - search-style results (arrays / `{ results }` / numbered text) → SearchResults
 *  - a plan (`title` + `tasks`) → PlanDocument
 *  - plain strings → text
 *  - anything else → pretty-printed JSON
 *
 * Tool name is accepted for future per-tool overrides but renderer selection is
 * currently shape-driven so it works for any tool returning a known shape.
 */
const ToolResultBase: React.FC<ToolResultProps> = ({ content }) => {
  const searchItems = normalizeSearchResults(content);
  if (searchItems) {
    return <SearchResults items={searchItems} />;
  }

  const plan = parsePlanDocument(content);
  if (plan) {
    return <PlanDocument plan={plan} />;
  }

  if (isString(content)) {
    return (
      <Text
        size="small"
        className="tool-result-text"
        sx={{ color: "text.secondary", whiteSpace: "pre-wrap" }}
      >
        {content}
      </Text>
    );
  }

  return <ToolResultJson value={content} />;
};

export const ToolResult = React.memo(ToolResultBase);
ToolResult.displayName = "ToolResult";
