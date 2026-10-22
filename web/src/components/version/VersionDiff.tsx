/**
 * Visualizes the differences between two workflow versions.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import {
  Caption,
  Chip,
  Divider,
  FlexRow,
  Surface,
  Text,
  Box,
  BORDER_RADIUS,
  ListGroup,
  ListItemRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  EmptyState
} from "../ui_primitives";
import AddIcon from "@mui/icons-material/AddOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import EditIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TimelineIcon from "@mui/icons-material/Timeline";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { GraphDiff, NodeChange, PropertyChange } from "../../utils/graphDiff";

interface VersionDiffProps {
  diff: GraphDiff;
  oldVersionNumber: number;
  newVersionNumber: number;
}

const renderPropertyChange = (change: PropertyChange) => {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "null";
    }
    if (typeof value === "object") {
      return JSON.stringify(value).substring(0, 50) + "...";
    }
    return String(value).substring(0, 50);
  };

  return (
    <FlexRow
      key={change.key}
      gap={1}
      align="flex-start"
      sx={{
        py: 0.5,
        pl: 2
      }}
    >
      <Caption
        sx={{ minWidth: 80, color: "text.secondary", fontWeight: 500 }}
      >
        {change.key}:
      </Caption>
      <Box sx={{ flex: 1 }}>
        <Caption
          sx={{
            color: "error.main",
            textDecoration: "line-through",
            display: "block"
          }}
        >
          {formatValue(change.oldValue)}
        </Caption>
        <Caption
          sx={{ color: "success.main", display: "block" }}
        >
          {formatValue(change.newValue)}
        </Caption>
      </Box>
    </FlexRow>
  );
};

const NodeDiffItem: React.FC<{
  node: { id: string; type?: string };
  type: "added" | "removed";
}> = memo(({ node, type }) => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_9" });
  return (
  <ListItemRow
    sx={{
      bgcolor: type === "added" ? "rgba(46, 125, 50, 0.1)" : "rgba(211, 47, 47, 0.1)",
      borderRadius: BORDER_RADIUS.xs,
      mb: 0.5
    }}
    icon={
      type === "added" ? (
        <AddIcon color="success" fontSize="small" />
      ) : (
        <RemoveIcon color="error" fontSize="small" />
      )
    }
    primary={node.type?.split(".").pop() || t("versionDiff.genericNode")}
    secondary={`${t("versionDiff.nodeId", { id: node.id.substring(0, 8) })}...`}
  >
    <Chip
      label={t(`versionDiff.status.${type}`)}
      compact
      color={type === "added" ? "success" : "error"}
    />
  </ListItemRow>
  );
});

const ModifiedNodeItem: React.FC<{ nodeChange: NodeChange }> = memo(({
  nodeChange
}) => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_9" });
  return (
  <Accordion
    sx={{
      bgcolor: "rgba(237, 108, 2, 0.1)",
      mb: 0.5,
      "&:before": { display: "none" }
    }}
    disableGutters
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      sx={{ minHeight: 48 }}
    >
      <FlexRow
        gap={1}
        align="center"
        fullWidth
      >
        <EditIcon color="warning" fontSize="small" />
        <Text size="small">
          {nodeChange.nodeType?.split(".").pop() || t("versionDiff.genericNode")}
        </Text>
        <Chip
          label={t("versionDiff.changeCount", { count: nodeChange.changes.length })}
          compact
          color="warning"
          sx={{ ml: "auto", mr: 1 }}
        />
      </FlexRow>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>
      {nodeChange.changes.map((change) =>
        renderPropertyChange(change)
      )}
    </AccordionDetails>
  </Accordion>
  );
});

const EdgeDiffItem: React.FC<{
  edge: { source?: string; target?: string };
  type: "added" | "removed";
}> = memo(({ edge, type }) => (
  <ListItemRow
    sx={{
      bgcolor:
        type === "added"
          ? "rgba(46, 125, 50, 0.1)"
          : "rgba(211, 47, 47, 0.1)",
      borderRadius: BORDER_RADIUS.xs,
      mb: 0.5,
      py: 0.5
    }}
    icon={
      type === "added" ? (
        <TimelineIcon color="success" fontSize="small" />
      ) : (
        <LinkOffIcon color="error" fontSize="small" />
      )
    }
    secondary={`${edge.source?.substring(0, 8)}... → ${edge.target?.substring(0, 8)}...`}
  />
));

export const VersionDiff: React.FC<VersionDiffProps> = ({
  diff,
  oldVersionNumber,
  newVersionNumber
}) => {
  const { t } = useTranslation("translation", { keyPrefix: "batch2_9" });
  if (!diff.hasChanges) {
    return (
      <Surface>
        <EmptyState variant="no-data" size="small" title={t("versionDiff.noChangesDetected")} />
      </Surface>
    );
  }

  return (
    <Box sx={{ p: 1 }}>
      <Text size="small" weight={600} sx={{ display: "block", mb: 1 }}>
        {t("versionDiff.changesHeading", { oldVersion: oldVersionNumber, newVersion: newVersionNumber })}
      </Text>

      {diff.addedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Caption
            color="success"
            sx={{ display: "block", mb: 1, fontWeight: 500 }}
          >
            {t("versionDiff.addedNodes", { count: diff.addedNodes.length })}
          </Caption>
          <ListGroup compact flush>
            {diff.addedNodes.map((node) => (
              <NodeDiffItem key={node.id} node={node} type="added" />
            ))}
          </ListGroup>
        </Box>
      )}

      {diff.removedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Caption
            color="error"
            sx={{ display: "block", mb: 1, fontWeight: 500 }}
          >
            {t("versionDiff.removedNodes", { count: diff.removedNodes.length })}
          </Caption>
          <ListGroup compact flush>
            {diff.removedNodes.map((node) => (
              <NodeDiffItem key={node.id} node={node} type="removed" />
            ))}
          </ListGroup>
        </Box>
      )}

      {diff.modifiedNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Caption
            color="warning"
            sx={{ display: "block", mb: 1, fontWeight: 500 }}
          >
            {t("versionDiff.modifiedNodes", { count: diff.modifiedNodes.length })}
          </Caption>
          {diff.modifiedNodes.map((nodeChange) => (
            <ModifiedNodeItem key={nodeChange.nodeId} nodeChange={nodeChange} />
          ))}
        </Box>
      )}

      {(diff.addedEdges.length > 0 || diff.removedEdges.length > 0) && (
        <>
          <Divider sx={{ my: 1 }} />
          <Caption
            sx={{ display: "block", mb: 1, fontWeight: 500 }}
          >
            {t("versionDiff.connectionChanges")}
          </Caption>
          <ListGroup compact flush>
            {diff.addedEdges.map((edge) => (
              <EdgeDiffItem key={`added-${edge.source}-${edge.target}`} edge={edge} type="added" />
            ))}
            {diff.removedEdges.map((edge) => (
              <EdgeDiffItem key={`removed-${edge.source}-${edge.target}`} edge={edge} type="removed" />
            ))}
          </ListGroup>
        </>
      )}
    </Box>
  );
};

export default memo(VersionDiff);
