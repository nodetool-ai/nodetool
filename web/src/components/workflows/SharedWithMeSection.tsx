/**
 * "Shared with me" section for the workflow list panel.
 *
 * Lists workflows other users shared with the current user via share links,
 * with the granted role. Rows open the workflow in the editor; management
 * actions (rename, delete) are owner-side and deliberately absent here.
 */
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Chip,
  FlexColumn,
  FlexRow,
  SectionHeader,
  TruncatedText,
  SPACING,
  BORDER_RADIUS
} from "../ui_primitives";
import { useSharedWithMe } from "../../serverState/useWorkflowSharing";
import { usePanelStore } from "../../stores/PanelStore";

const ROLE_LABELS = { viewer: "view", editor: "edit" } as const;

const SharedWithMeSection = () => {
  const navigate = useNavigate();
  const { data } = useSharedWithMe();
  const onOpen = useCallback(
    (workflowId: string) => {
      navigate("/editor/" + workflowId);
      usePanelStore.getState().setVisibility(false);
    },
    [navigate]
  );
  const workflows = data?.workflows ?? [];

  if (workflows.length === 0) return null;

  return (
    <FlexColumn gap={SPACING.xs} sx={{ px: 2, pb: 2 }}>
      <SectionHeader title="Shared with me" />
      {workflows.map((workflow) => (
        <FlexRow
          key={workflow.id}
          role="button"
          tabIndex={0}
          align="center"
          justify="space-between"
          gap={SPACING.sm}
          onClick={() => onOpen(workflow.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(workflow.id);
            }
          }}
          sx={{
            cursor: "pointer",
            borderRadius: BORDER_RADIUS.sm,
            px: 1,
            py: 0.5,
            "&:hover": {
              backgroundColor: "action.hover"
            }
          }}
        >
          <TruncatedText showTooltip>{workflow.name}</TruncatedText>
          <Chip label={ROLE_LABELS[workflow.shared_role]} size="small" />
        </FlexRow>
      ))}
    </FlexColumn>
  );
};

export default memo(SharedWithMeSection);
