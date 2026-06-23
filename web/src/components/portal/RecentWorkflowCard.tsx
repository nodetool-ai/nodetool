/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo, useState } from "react";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { BASE_URL } from "../../stores/BASE_URL";
import { WorkflowMiniPreview } from "../version/WorkflowMiniPreview";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    ".rthumb": {
      position: "relative",
      aspectRatio: "4 / 3",
      borderRadius: BORDER_RADIUS.xl,
      overflow: "hidden",
      background: theme.vars.palette.c_node_bg,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `border-color ${MOTION.normal}, transform ${MOTION.normal}`
    },
    "&:hover .rthumb": {
      borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.45)`,
      transform: "translateY(-2px)"
    },
    ".rthumb img": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    },
    ".rthumb .mini": { position: "absolute", inset: 0 },
    ".nodes": {
      position: "absolute",
      bottom: `${theme.spacing(1)}`,
      left: `${theme.spacing(1)}`,
      display: "inline-flex",
      alignItems: "center",
      gap: `${theme.spacing(0.75)}`,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      padding: `${theme.spacing(0.25)} ${theme.spacing(0.875)}`,
      background: "rgba(8,9,10,0.7)",
      borderRadius: `${theme.spacing(0.5)}`
    },
    ".rmeta": { padding: `0 ${getSpacingPx(SPACING.micro)}` },
    ".rname": {
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary,
      fontWeight: 500,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".redit": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      marginTop: `${theme.spacing(0.25)}`
    }
  });

function lastEdited(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Edited today";
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  if (days < 14) return "Edited last week";
  if (days < 30) return `Edited ${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "Edited last month";
  return `Edited ${Math.floor(days / 30)} months ago`;
}

interface RecentWorkflowCardProps {
  workflow: Workflow;
  onClick: (workflow: Workflow) => void;
}

const boltGlyph = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 2 4 9h3l-1 5 5-7H8l1-5z" />
  </svg>
);

const RecentWorkflowCard: React.FC<RecentWorkflowCardProps> = ({
  workflow,
  onClick
}) => {
  const theme = useTheme();
  const [imgFailed, setImgFailed] = useState(false);

  // The last generation: the server fills thumbnail_url once a workflow has
  // produced output. When it is missing (or fails to load) we fall back to a
  // mini rendering of the node graph so the card is never blank.
  const generationUrl = useMemo(() => {
    const url = workflow.thumbnail_url;
    if (!url) return null;
    return url.startsWith("http") ? url : `${BASE_URL}${url}`;
  }, [workflow.thumbnail_url]);

  const nodeCount = workflow.graph?.nodes?.length ?? 0;
  const showGeneration = generationUrl && !imgFailed;

  return (
    <button type="button" css={styles(theme)} onClick={() => onClick(workflow)}>
      <div className="rthumb">
        {showGeneration ? (
          <img
            src={generationUrl}
            alt={workflow.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="mini">
            <WorkflowMiniPreview
              workflow={workflow}
              width="100%"
              height="100%"
            />
          </div>
        )}
        {nodeCount > 0 && (
          <span className="nodes">
            {boltGlyph}
            {nodeCount} {nodeCount === 1 ? "node" : "nodes"}
          </span>
        )}
      </div>
      <div className="rmeta">
        <div className="rname">{workflow.name}</div>
        <div className="redit">{lastEdited(workflow.updated_at)}</div>
      </div>
    </button>
  );
};

export default memo(RecentWorkflowCard);
