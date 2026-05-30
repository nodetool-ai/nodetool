/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Box } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { isGettingStarted } from "../../utils/templateCategories";
import WorkflowCard from "./WorkflowCard";

interface GettingStartedStripProps {
  workflows: Workflow[];
  loadingWorkflowId: string | null;
  onClick: (workflow: Workflow) => void;
  max?: number;
}

const stripStyles = (theme: Theme) =>
  css({
    padding: "0 1.25em 1em",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    ".strip-header": {
      display: "flex",
      alignItems: "baseline",
      gap: "12px"
    },
    ".strip-title": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      color: theme.vars.palette.primary.main
    },
    ".strip-subtitle": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".strip-row": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: "16px"
    }
  });

const GettingStartedStrip = memo(
  ({
    workflows,
    loadingWorkflowId,
    onClick,
    max = 4
  }: GettingStartedStripProps) => {
    const theme = useTheme();
    const picks = useMemo(
      () => workflows.filter(isGettingStarted).slice(0, max),
      [workflows, max]
    );

    if (picks.length === 0) {
      return null;
    }

    return (
      <Box css={stripStyles(theme)}>
        <Box className="strip-header">
          <Text className="strip-title">Start here</Text>
          <Text className="strip-subtitle">
            Hand-picked templates to get the feel of NodeTool
          </Text>
        </Box>
        <Box className="strip-row">
          {picks.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              matchedNodes={[]}
              nodesOnlySearch={false}
              isLoading={loadingWorkflowId === workflow.id}
              onClick={onClick}
            />
          ))}
        </Box>
      </Box>
    );
  }
);

GettingStartedStrip.displayName = "GettingStartedStrip";

export default GettingStartedStrip;
